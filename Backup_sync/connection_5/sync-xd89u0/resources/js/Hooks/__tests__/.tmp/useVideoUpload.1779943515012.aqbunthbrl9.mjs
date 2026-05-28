import { useState, useCallback, useRef, useEffect } from 'react';
import { usePage } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Hooks/__tests__/.tmp/inertia.video-delete-source.1779943515008.j09v0bd8mqg.stub.mjs';
import axios from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Hooks/__tests__/.tmp/axios.video-delete-source.1779943515008.25ig9cfw0a4.stub.mjs';
import {
  loadResumeState,
  saveResumeState,
  removeResumeState,
  isResumeStateValid,
  deserializeChunkIndexes,
  serializeChunkIndexes,
  cleanupStaleResumeStates,
} from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/resumableUploadState.js';
import {
  buildUploadedFileFingerprint,
  hasUploadedFileFingerprint,
  rememberUploadedFileFingerprint,
  forgetUploadedFileFingerprint,
} from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/uploadedFileFingerprint.js';
import { retryUploadOperation } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/uploadRetry.js';
import { createEtaTracker } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/uploadEta.js';
import { createAutoBandwidthController } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/autoBandwidthController.js';

/**
 * Video upload status enum
 */
export const VideoUploadStatus = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Supported video formats (case-insensitive)
 */
export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

/**
 * Supported MIME types for videos
 */
export const SUPPORTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/avi',
  'video/msvideo',
];

function appendMetadataValue(formData, key, value) {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => appendMetadataValue(formData, `${key}[]`, item));
    return;
  }

  if (typeof value === 'boolean') {
    formData.append(key, value ? '1' : '0');
    return;
  }

  formData.append(key, value);
}

async function generateVideoContentHash(file) {
  const chunkSize = 64 * 1024;

  if (file.size <= chunkSize * 2) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  const [first, last] = await Promise.all([
    file.slice(0, chunkSize).arrayBuffer(),
    file.slice(-chunkSize).arrayBuffer(),
  ]);

  const combined = new Uint8Array(first.byteLength + last.byteLength + 8);
  combined.set(new Uint8Array(first), 0);
  combined.set(new Uint8Array(last), first.byteLength);
  new DataView(combined.buffer, first.byteLength + last.byteLength, 8).setBigUint64(
    0,
    BigInt(file.size),
    true
  );

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Custom hook for handling video uploads with chunked upload support
 * Requirements: 1.6, 1.7, 1.9
 *
 * @param {Object} options - Configuration options
 * @param {string} options.uploadUrl - URL for single file upload (default: '/videos/upload')
 * @param {string} options.chunkUrl - URL for chunk upload (default: '/videos/upload/chunk')
 * @param {string} options.finalizeUrl - URL for finalizing chunked upload (default: '/videos/upload/finalize')
 * @param {number} options.chunkSize - Chunk size in MB for large files (default: 2)
 * @param {Function} options.onUploadComplete - Callback when upload completes successfully
 * @param {Function} options.onError - Callback when an error occurs
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Object} Upload state and handlers
 */
export function useVideoUpload(options = {}) {
  const { settings } = usePage().props;

  const {
    uploadUrl = '/videos/upload',
    chunkUrl = '/videos/upload/chunk',
    finalizeUrl = '/videos/upload/finalize',
    chunkSize = settings?.video_upload_chunk_size || 1, // From database settings
    concurrentChunks = settings?.video_upload_concurrent_chunks || 4, // From database settings
    onUploadComplete,
    onError,
    onProgress,
  } = options;

  // State
  const [status, setStatus] = useState(VideoUploadStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [video, setVideo] = useState(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [speedBps, setSpeedBps] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [uploadStatusDetail, setUploadStatusDetail] = useState('');
  const [isResumedSession, setIsResumedSession] = useState(false);
  const [autoBandwidthMode] = useState('speed');
  const [autoBandwidthState, setAutoBandwidthState] = useState('stable');
  const [autoBandwidthProfile, setAutoBandwidthProfile] = useState(() => ({
    concurrency: Math.max(1, concurrentChunks),
    chunkSizeMB: chunkSize,
    reason: 'Initialized',
  }));

  // Refs
  const abortControllerRef = useRef(null);
  const uploadIdRef = useRef(null);
  const etaTrackerRef = useRef(createEtaTracker({ totalBytes: 0, alpha: 0.2 }));
  const autoBandwidthRef = useRef(
    createAutoBandwidthController({
      mode: 'speed',
      minConcurrency: 1,
      maxConcurrency: 8,
      initialConcurrency: Math.max(1, concurrentChunks),
      minChunkSizeMB: 1,
      maxChunkSizeMB: 8,
      initialChunkSizeMB: chunkSize,
      cooldownMs: 12000,
    })
  );
  const dynamicChunkConcurrencyRef = useRef(Math.max(1, concurrentChunks));
  const chunkProgressRef = useRef({});

  const applyAutoBandwidth = useCallback((metrics) => {
    const next = autoBandwidthRef.current.evaluate({ metrics, nowMs: Date.now() });
    dynamicChunkConcurrencyRef.current = next.targetConcurrency;

    setAutoBandwidthState(next.modeState);
    setAutoBandwidthProfile({
      concurrency: next.targetConcurrency,
      chunkSizeMB: next.targetChunkSizeMB,
      reason: next.reason,
    });

    return next;
  }, []);

  useEffect(() => {
    cleanupStaleResumeStates();
  }, []);

  /**
   * Generate a unique upload ID
   */
  const generateUploadId = useCallback(() => {
    return `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * Validate video file format
   * Requirements: 1.2
   */
  const validateVideo = useCallback((file) => {
    // Check if file exists
    if (!file) {
      return {
        valid: false,
        error: 'INVALID_FILE',
        message: 'Vui lòng chọn một tệp video.',
      };
    }

    // Get file extension (case-insensitive)
    const extension = file.name.split('.').pop()?.toLowerCase();

    // Validate extension
    if (!extension || !SUPPORTED_VIDEO_FORMATS.includes(extension)) {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        message:
          'Định dạng video không được hỗ trợ. Vui lòng sử dụng MP4, WebM, MOV, AVI hoặc MKV.',
      };
    }

    // Validate MIME type (if available)
    if (file.type && !file.type.startsWith('video/')) {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        message:
          'Định dạng video không được hỗ trợ. Vui lòng sử dụng MP4, WebM, MOV, AVI hoặc MKV.',
      };
    }

    return { valid: true };
  }, []);

  /**
   * Update progress and call callback
   */
  const updateProgress = useCallback(
    (newProgress) => {
      setProgress(newProgress);
      if (onProgress) {
        onProgress(newProgress);
      }
    },
    [onProgress]
  );

  const checkServerDuplicate = useCallback(async (file) => {
    const hash = await generateVideoContentHash(file);
    const response = await axios.post('/videos/upload/check-duplicates', {
      hashes: [
        {
          id: buildUploadedFileFingerprint(file) || file.name,
          hash,
          fileName: file.name,
        },
      ],
    });

    return (response.data?.duplicates || []).length > 0;
  }, []);

  /**
   * Upload a single file (for smaller files)
   */
  const uploadSingleFile = useCallback(
    async (file, metadata) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const formData = new FormData();
      formData.append('video', file);

      if (metadata.title) {
        formData.append('title', metadata.title);
      }
      if (metadata.description) {
        formData.append('description', metadata.description);
      }
      if (metadata.storage_provider) {
        formData.append('storage_provider', metadata.storage_provider);
      }
      if (metadata.thumbnail) {
        formData.append('thumbnail', metadata.thumbnail, 'thumbnail.jpg');
      }
      if (metadata.tags && metadata.tags.length > 0) {
        metadata.tags.forEach((tagId) => formData.append('tags[]', tagId));
      }

      try {
        etaTrackerRef.current.reset(file.size);
        setUploadStatusDetail('Dang tai len...');

        const response = await axios.post(uploadUrl, formData, {
          signal: controller.signal,
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 300000, // 5 minutes timeout
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            updateProgress(percentCompleted);

            const etaOutput = etaTrackerRef.current.update(progressEvent.loaded);
            setSpeedBps(etaOutput.speedBps || 0);
            setEtaSeconds(etaOutput.etaSeconds);
          },
        });

        return { success: true, data: response.data };
      } catch (err) {
        if (axios.isCancel(err)) {
          return { success: false, error: 'Upload cancelled' };
        }

        // Handle different error types
        let errorMessage = 'Upload thất bại. Vui lòng thử lại.';

        if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
          errorMessage = 'Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.';
        } else if (err.response?.status === 413) {
          errorMessage = 'File quá lớn. Vui lòng chọn file nhỏ hơn.';
        } else if (err.response?.status === 419) {
          errorMessage = 'Phiên làm việc đã hết hạn. Đang tải lại trang...';
          // Page will be reloaded by axios interceptor
        } else if (err.response?.status === 500) {
          errorMessage = 'Lỗi server. Vui lòng thử lại sau.';
        } else if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        } else if (err.response?.data?.error) {
          errorMessage = err.response.data.error;
        }

        console.error('Upload error:', err);
        return { success: false, error: errorMessage };
      }
    },
    [uploadUrl, updateProgress]
  );

  /**
   * Upload a file using chunked upload (for large files)
   * Requirements: 1.7
   */
  const uploadChunkedFile = useCallback(
    async (file, metadata) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const chunkSizeBytes = chunkSize * 1024 * 1024;
      const chunks = Math.ceil(file.size / chunkSizeBytes);
      const existing = loadResumeState('video', file);
      let uploadId = generateUploadId();
      let uploadedChunkSet = new Set();

      if (
        existing?.state &&
        isResumeStateValid(existing.state, { file, chunkSizeBytes, totalChunks: chunks })
      ) {
        uploadId = existing.state.uploadId || uploadId;
        uploadedChunkSet = deserializeChunkIndexes(existing.state.uploadedChunkIndexes);
        setIsResumedSession(uploadedChunkSet.size > 0);
      }

      uploadIdRef.current = uploadId;
      chunkProgressRef.current = {};

      setTotalChunks(chunks);
      setUploadedChunks(uploadedChunkSet.size);
      etaTrackerRef.current.reset(file.size);
      setUploadStatusDetail(
        uploadedChunkSet.size > 0 ? 'Da khoi phuc upload truoc do' : 'Dang tai len...'
      );

      let completedChunks = uploadedChunkSet.size;
      const bytesForChunk = (index) => {
        const start = index * chunkSizeBytes;
        const end = Math.min(start + chunkSizeBytes, file.size);
        return end - start;
      };
      let uploadedBytes = 0;
      uploadedChunkSet.forEach((index) => {
        uploadedBytes += bytesForChunk(index);
      });

      const calculateRealtimeBytes = () => {
        let total = uploadedBytes;
        Object.values(chunkProgressRef.current).forEach((bytes) => {
          total += bytes;
        });
        return total;
      };

      const updateChunkProgress = () => {
        setUploadedChunks(completedChunks);
        const totalUploaded = calculateRealtimeBytes();
        const percentCompleted = Math.min(90, Math.round((totalUploaded / file.size) * 100));
        updateProgress(percentCompleted);
        const etaOutput = etaTrackerRef.current.update(totalUploaded);
        setSpeedBps(etaOutput.speedBps || 0);
        setEtaSeconds(etaOutput.etaSeconds);
      };

      updateChunkProgress();

      try {
        // Process chunks in batches
        const pendingIndexes = [];
        for (let i = 0; i < chunks; i++) {
          if (!uploadedChunkSet.has(i)) {
            pendingIndexes.push(i);
          }
        }

        let batchStart = 0;
        while (batchStart < pendingIndexes.length) {
          if (controller.signal.aborted) {
            return { success: false, error: 'Upload cancelled' };
          }

          const concurrentForBatch = Math.max(1, dynamicChunkConcurrencyRef.current);
          const batchEnd = Math.min(batchStart + concurrentForBatch, pendingIndexes.length);
          const batchPromises = [];

          for (let chunkIndex = batchStart; chunkIndex < batchEnd; chunkIndex++) {
            const realChunkIndex = pendingIndexes[chunkIndex];

            let retryAttempts = 0;
            const chunkStartedAt = Date.now();

            const uploadPromise = retryUploadOperation(
              async () => {
                const start = realChunkIndex * chunkSizeBytes;
                const end = Math.min(start + chunkSizeBytes, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk, 'chunk.bin');
                formData.append('upload_id', uploadId);
                formData.append('chunk_index', realChunkIndex);
                formData.append('total_chunks', chunks);
                formData.append('filename', file.name);

                const csrfToken = document.querySelector?.('meta[name="csrf-token"]')?.getAttribute('content') || '';

                await axios.post(chunkUrl, formData, {
                  signal: controller.signal,
                  headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': csrfToken,
                  },
                  timeout: 120000,
                  onUploadProgress: (progressEvent) => {
                    chunkProgressRef.current[realChunkIndex] = progressEvent.loaded;
                    updateChunkProgress();
                  },
                });
              },
              {
                maxAttempts: 5,
                signal: controller.signal,
                onOffline: () => setUploadStatusDetail('Mat mang, dang cho ket noi lai...'),
                onRecovered: () => setUploadStatusDetail('Da ket noi lai, tiep tuc upload...'),
                onRetry: ({ attempt }) => {
                  retryAttempts = attempt;
                  setUploadStatusDetail(
                    `Dang thu lai chunk ${realChunkIndex + 1}/${chunks} (lan ${attempt})`
                  );
                },
              }
            ).then(() => {
              uploadedChunkSet.add(realChunkIndex);
              completedChunks++;
              uploadedBytes += bytesForChunk(realChunkIndex);
              delete chunkProgressRef.current[realChunkIndex];

              const durationMs = Date.now() - chunkStartedAt;
              applyAutoBandwidth({
                avgMbps:
                  durationMs > 0
                    ? (bytesForChunk(realChunkIndex) * 8) / 1000000 / (durationMs / 1000)
                    : 0,
                retryRate: retryAttempts > 0 ? 1 : 0,
                timeoutCount: 0,
                failureCount: 0,
                p95ChunkTimeMs: durationMs,
              });

              saveResumeState('video', file, {
                uploadId,
                type: 'video',
                chunkSizeBytes,
                totalChunks: chunks,
                uploadedChunkIndexes: serializeChunkIndexes(uploadedChunkSet),
                bytesUploaded: uploadedBytes,
                status: 'uploading',
              });

              setUploadStatusDetail('Dang tai len...');
              updateChunkProgress();
            });

            batchPromises.push(uploadPromise);
          }

          // Wait for batch to complete
          await Promise.all(batchPromises);
          batchStart = batchEnd;
        }

        // Finalize the upload
        setStatus(VideoUploadStatus.PROCESSING);
        updateProgress(92);

        const finalizeData = new FormData();
        finalizeData.append('upload_id', uploadId);
        finalizeData.append('filename', file.name);
        finalizeData.append('total_chunks', chunks);

        if (metadata.title) {
          finalizeData.append('title', metadata.title);
        }
        if (metadata.description) {
          finalizeData.append('description', metadata.description);
        }
        if (metadata.storage_provider) {
          finalizeData.append('storage_provider', metadata.storage_provider);
        }
        if (metadata.thumbnail) {
          finalizeData.append('thumbnail', metadata.thumbnail, 'thumbnail.jpg');
        }
        if (metadata.tags && metadata.tags.length > 0) {
          metadata.tags.forEach((tagId) => finalizeData.append('tags[]', tagId));
        }

        const csrfToken = document.querySelector?.('meta[name="csrf-token"]')?.getAttribute('content') || '';

        const response = await axios.post(finalizeUrl, finalizeData, {
          signal: controller.signal,
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': csrfToken,
          },
          timeout: 600000, // 10 minutes for finalization (includes GDrive upload)
        });

        removeResumeState('video', file);
        updateProgress(100);
        setUploadStatusDetail('Hoàn tất');
        setEtaSeconds(0);
        return { success: true, data: response.data };
      } catch (err) {
        if (axios.isCancel(err)) {
          return { success: false, error: 'Upload cancelled' };
        }

        // Handle different error types
        let errorMessage = 'Upload thất bại. Vui lòng thử lại.';

        if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
          errorMessage =
            'Lỗi kết nối mạng. Có thể do file quá lớn hoặc server timeout. Vui lòng thử lại.';
        } else if (err.response?.status === 413) {
          errorMessage = 'File quá lớn. Vui lòng chọn file nhỏ hơn.';
        } else if (err.response?.status === 419) {
          errorMessage = 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang và thử lại.';
        } else if (err.response?.status === 500) {
          errorMessage = 'Lỗi server. Vui lòng thử lại sau.';
        } else if (err.response?.status === 400) {
          errorMessage = err.response?.data?.message || err.response?.data?.error || 'Lỗi 400: Dữ liệu không hợp lệ.';
        } else if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        } else if (err.response?.data?.error) {
          errorMessage = err.response.data.error;
        }

        console.error('Chunked upload error:', {
          status: err.response?.status,
          data: err.response?.data,
          message: err.message,
          code: err.code,
        });
        applyAutoBandwidth({
          avgMbps: 0,
          retryRate: 1,
          timeoutCount: err?.code === 'ECONNABORTED' ? 2 : 0,
          failureCount: 1,
          p95ChunkTimeMs: 0,
        });
        saveResumeState('video', file, {
          uploadId,
          type: 'video',
          chunkSizeBytes,
          totalChunks: chunks,
          uploadedChunkIndexes: serializeChunkIndexes(uploadedChunkSet),
          bytesUploaded: uploadedBytes,
          status: 'failed',
          lastError: errorMessage,
        });
        return { success: false, error: errorMessage };
      }
    },
    [chunkSize, chunkUrl, finalizeUrl, generateUploadId, updateProgress, applyAutoBandwidth]
  );

  /**
   * Start video upload
   * @param {File} file - Video file to upload
   * @param {Object} metadata - Video metadata (title, description)
   */
  const upload = useCallback(
    async (file, metadata = {}) => {
      // Reset state
      setStatus(VideoUploadStatus.VALIDATING);
      setProgress(0);
      setError(null);
      setVideo(null);
      setUploadedChunks(0);
      setTotalChunks(0);
      setSpeedBps(0);
      setEtaSeconds(null);
      setUploadStatusDetail('');
      setIsResumedSession(false);
      dynamicChunkConcurrencyRef.current = Math.max(1, concurrentChunks);

      // Validate video
      const validation = validateVideo(file);
      if (!validation.valid) {
        setStatus(VideoUploadStatus.ERROR);
        setError(validation.message);
        if (onError) {
          onError(validation.message);
        }
        return { success: false, error: validation.message };
      }

      const uploadedFingerprint = buildUploadedFileFingerprint(file);
      if (uploadedFingerprint && hasUploadedFileFingerprint(uploadedFingerprint)) {
        const duplicateMessage = 'Video này đã được upload trước đó, vui lòng chọn video khác.';
        setStatus(VideoUploadStatus.ERROR);
        setError(duplicateMessage);
        if (onError) {
          onError(duplicateMessage);
        }
        return { success: false, error: duplicateMessage };
      }

      try {
        const hasServerDuplicate = await checkServerDuplicate(file);
        if (hasServerDuplicate) {
          const duplicateMessage = 'Video này đã tồn tại trong gallery nên không thể upload lại.';
          setStatus(VideoUploadStatus.ERROR);
          setError(duplicateMessage);
          if (onError) {
            onError(duplicateMessage);
          }
          return { success: false, error: duplicateMessage };
        }
      } catch (duplicateError) {
        console.warn('Failed to check video duplicate hashes before upload', duplicateError);
      }

      // Start upload
      setStatus(VideoUploadStatus.UPLOADING);

      // Determine upload method based on file size
      const chunkSizeBytes = chunkSize * 1024 * 1024;
      const useChunkedUpload = file.size > chunkSizeBytes;

      let result;
      if (useChunkedUpload) {
        result = await uploadChunkedFile(file, metadata);
      } else {
        result = await uploadSingleFile(file, metadata);
      }

      if (result.success) {
        updateProgress(100);
        setUploadStatusDetail('Hoàn tất');
        setEtaSeconds(0);
        rememberUploadedFileFingerprint(file);

        // Wait 1.5 seconds so the user can visually see 100% completion state
        await new Promise((resolve) => setTimeout(resolve, 1500));

        setStatus(VideoUploadStatus.SUCCESS);
        setVideo(result.data.video);
        if (onUploadComplete) {
          onUploadComplete(result.data);
        }
      } else {
        // Remove fingerprint so user can retry the same file
        forgetUploadedFileFingerprint(file);
        setStatus(VideoUploadStatus.ERROR);
        setError(result.error);
        if (onError) {
          onError(result.error);
        }
      }

      return result;
    },
    [
      chunkSize,
      concurrentChunks,
      validateVideo,
      uploadSingleFile,
      uploadChunkedFile,
      onUploadComplete,
      onError,
      checkServerDuplicate,
    ]
  );

  /**
   * Cancel ongoing upload
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    chunkProgressRef.current = {};
    setStatus(VideoUploadStatus.IDLE);
    setProgress(0);
    setError(null);
    setUploadedChunks(0);
    setTotalChunks(0);
    setSpeedBps(0);
    setEtaSeconds(null);
    setUploadStatusDetail('');
    setIsResumedSession(false);
  }, []);

  /**
   * Reset upload state
   */
  const reset = useCallback(() => {
    cancel();
    setVideo(null);
  }, [cancel]);

  /**
   * Retry failed upload
   * @param {File} file - Video file to retry
   * @param {Object} metadata - Video metadata
   */
  const retry = useCallback(
    async (file, metadata = {}) => {
      return upload(file, metadata);
    },
    [upload]
  );

  return {
    // State
    status,
    progress,
    error,
    video,
    uploadedChunks,
    totalChunks,
    speedBps,
    etaSeconds,
    uploadStatusDetail,
    isResumedSession,
    autoBandwidthMode,
    autoBandwidthState,
    autoBandwidthProfile,

    // Computed
    isIdle: status === VideoUploadStatus.IDLE,
    isValidating: status === VideoUploadStatus.VALIDATING,
    isUploading: status === VideoUploadStatus.UPLOADING,
    isProcessing: status === VideoUploadStatus.PROCESSING,
    isSuccess: status === VideoUploadStatus.SUCCESS,
    isError: status === VideoUploadStatus.ERROR,
    isInProgress: status === VideoUploadStatus.UPLOADING || status === VideoUploadStatus.PROCESSING,

    // Actions
    upload,
    cancel,
    reset,
    retry,
    validateVideo,
  };
}

export default useVideoUpload;
