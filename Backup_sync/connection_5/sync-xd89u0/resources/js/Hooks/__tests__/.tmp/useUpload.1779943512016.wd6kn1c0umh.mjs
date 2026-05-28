import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Hooks/__tests__/.tmp/axios.queue-persistence.1779943512015.0ssdwpwzt41c.stub.mjs';
import {
  buildUploadFingerprint,
  buildResumeStorageKey,
  loadResumeState,
  loadQueueSnapshot,
  saveResumeState,
  saveQueueSnapshot,
  removeResumeState,
  removeQueueSnapshot,
  isResumeStateValid,
  deserializeChunkIndexes,
  serializeChunkIndexes,
  cleanupStaleResumeStates,
} from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/resumableUploadState.js';
import {
  buildUploadedFileFingerprint,
  hasUploadedFileFingerprint,
  rememberUploadedFileFingerprint,
} from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/uploadedFileFingerprint.js';
import { retryUploadOperation } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/uploadRetry.js';
import { createEtaTracker } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/uploadEta.js';
import { createAutoBandwidthController } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Utils/autoBandwidthController.js';
import { createUploadProgressBuffer, sumUploadedBytes } from 'file:///E:/xampp/htdocs/galleryv2/gallery_v2_19_11_2025/resources/js/Hooks/uploadProgress.js';

/**
 * File upload status enum
 */
export const UploadStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error',
};

const UploadPhase = {
  UPLOADING: 'uploading',
  FINALIZING: 'finalizing',
  PROCESSING: 'processing',
};

function getQueueItemKey(file) {
  return file?.fingerprint || file?.quickHash || file?.id || null;
}

function parseFingerprintMetadata(fingerprint) {
  const match = typeof fingerprint === 'string' ? fingerprint.match(/^(.*)_(\d+)_(\d+)$/) : null;

  if (!match) {
    return {
      name: fingerprint || 'Restored upload',
      size: 0,
    };
  }

  return {
    name: match[1],
    size: Number.parseInt(match[2], 10) || 0,
  };
}

function loadResumeStateByFingerprint(fingerprint) {
  try {
    const key = buildResumeStorageKey('image', fingerprint);
    const raw = localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

function buildQueueSnapshotItem(file) {
  const fingerprint =
    file?.fingerprint || file?.quickHash || (file?.file ? buildUploadFingerprint(file.file) : null);

  if (!file?.id || !fingerprint) {
    return null;
  }

  if (file.status === UploadStatus.SUCCESS) {
    return null;
  }

  if (
    file.status === UploadStatus.ERROR &&
    file.needsManualRetry !== true &&
    file.canResume !== true
  ) {
    return null;
  }

  return {
    id: file.id,
    fingerprint,
    phase: file.phase || file.status || UploadStatus.PENDING,
    storageDriver: file.storageDriver,
    retryCount: file.retryCount,
    needsManualRetry: file.needsManualRetry,
    lastErrorSummary:
      file.lastErrorSummary ?? (typeof file.error === 'string' ? file.error : undefined),
  };
}

function restoreQueueSnapshotItem(snapshotItem) {
  if (!snapshotItem?.id || !snapshotItem?.fingerprint) {
    return null;
  }

  const persistedResumeState = loadResumeStateByFingerprint(snapshotItem.fingerprint);
  const fallbackMetadata = parseFingerprintMetadata(snapshotItem.fingerprint);
  const phase = snapshotItem.phase || UploadStatus.PENDING;
  const hasPersistedResumeState = Boolean(persistedResumeState);
  const needsManualRetry =
    snapshotItem.needsManualRetry === true ||
    !hasPersistedResumeState ||
    persistedResumeState?.status === 'failed';
  const canResume = hasPersistedResumeState && !needsManualRetry;
  const lastErrorSummary = snapshotItem.lastErrorSummary ?? persistedResumeState?.lastError ?? null;

  const restoredFile = {
    id: snapshotItem.id,
    file: null,
    name: persistedResumeState?.filename || fallbackMetadata.name,
    customName: '',
    size: persistedResumeState?.fileSize || fallbackMetadata.size,
    type: '',
    preview: null,
    progress: 0,
    status: needsManualRetry ? UploadStatus.ERROR : UploadStatus.PENDING,
    error: needsManualRetry ? lastErrorSummary || 'Re-select this file to retry the upload.' : null,
    response: null,
    quickHash: snapshotItem.fingerprint,
    fullHash: null,
    fingerprint: snapshotItem.fingerprint,
    phase,
    isRestored: true,
    canResume,
    needsManualRetry,
    lastErrorSummary,
  };

  if (needsManualRetry) {
    restoredFile.failurePhase = phase;
  }

  if (snapshotItem.retryCount !== undefined) {
    restoredFile.retryCount = snapshotItem.retryCount;
  }

  if (snapshotItem.storageDriver !== undefined) {
    restoredFile.storageDriver = snapshotItem.storageDriver;
  }

  return restoredFile;
}

function matchesAcceptedMimeType(fileType, acceptedMimeType) {
  if (typeof acceptedMimeType !== 'string' || acceptedMimeType.length === 0) {
    return false;
  }

  if (acceptedMimeType.endsWith('/*')) {
    return fileType.startsWith(`${acceptedMimeType.slice(0, -1)}`);
  }

  return fileType === acceptedMimeType;
}

function buildPreflightErrorMessage(kind, details = {}) {
  switch (kind) {
    case 'missing-file':
      return 'Re-select this file before uploading.';
    case 'size':
      return `File exceeds the maximum size of ${details.maxFileSize}MB.`;
    case 'mime':
      return 'File type is not supported for this upload.';
    case 'storage-driver':
      return `Selected storage driver "${details.storageDriver}" is unavailable.`;
    case 'quota':
      return 'Selected files exceed the remaining storage quota.';
    default:
      return 'Upload preflight validation failed.';
  }
}

function isProcessingUploadResponse(responseData) {
  if (!responseData || typeof responseData !== 'object') {
    return false;
  }

  return responseData.processing === true || responseData.status === UploadPhase.PROCESSING;
}

/**
 * Custom hook for handling file uploads with progress tracking
 * Supports multiple file uploads, chunked uploads, and error handling
 *
 * @param {Object} options - Configuration options
 * @param {string} options.uploadUrl - URL for file upload (default: '/upload')
 * @param {string} options.chunkUrl - URL for chunk upload (default: '/upload/chunk')
 * @param {string} options.finalizeUrl - URL for finalizing chunked upload (default: '/upload/finalize')
 * @param {number} options.chunkSize - Chunk size in MB for large files (default: 2)
 * @param {number} options.maxConcurrent - Max concurrent uploads (default: 3)
 * @param {Function} options.onUploadComplete - Callback when all uploads complete
 * @param {Function} options.onAllComplete - Callback with success count when all uploads finish (for auto-incrementing)
 * @param {Function} options.onFileComplete - Callback when a single file completes
 * @param {Function} options.onError - Callback when an error occurs
 * @returns {Object} Upload state and handlers
 */
export function useUpload(options = {}) {
  const {
    uploadUrl = '/upload',
    chunkUrl = '/upload/chunk',
    finalizeUrl = '/upload/finalize',
    chunkSize = 2,
    maxConcurrent = 3,
    maxFileSize = 0,
    acceptedMimeTypes = [],
    storageProviders = {},
    storageQuota = null,
    onUploadComplete,
    onAllComplete,
    onFileComplete,
    onError,
  } = options;

  // State
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [autoBandwidthMode] = useState('speed');
  const [autoBandwidthState, setAutoBandwidthState] = useState('stable');
  const [autoBandwidthProfile, setAutoBandwidthProfile] = useState(() => ({
    concurrency: Math.max(1, maxConcurrent),
    chunkSizeMB: chunkSize,
    reason: 'Initialized',
  }));

  // Upload statistics state
  const [uploadStats, setUploadStats] = useState({
    startTime: null,
    bytesUploaded: 0,
    speed: 0, // bytes per second
    estimatedTimeRemaining: 0, // seconds
    statusDetail: '',
    retryAttempt: 0,
    retryingChunk: null,
    isResumedSession: false,
  });

  // Refs for managing upload state
  const abortControllersRef = useRef(new Map());
  const uploadQueueRef = useRef([]);
  const statsIntervalRef = useRef(null);
  const bytesUploadedRef = useRef(0);
  const lastBytesRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const fileHashMapRef = useRef(new Map()); // Store quick hashes for duplicate detection
  const etaTrackerRef = useRef(createEtaTracker({ totalBytes: 0, alpha: 0.2 }));
  const speedEmaRef = useRef(0);
  const autoBandwidthRef = useRef(
    createAutoBandwidthController({
      mode: 'speed',
      minConcurrency: 1,
      maxConcurrency: 6,
      initialConcurrency: Math.max(1, maxConcurrent),
      minChunkSizeMB: 1,
      maxChunkSizeMB: 8,
      initialChunkSizeMB: chunkSize,
      cooldownMs: 12000,
    })
  );
  const dynamicConcurrencyRef = useRef(Math.max(1, maxConcurrent));
  const hasHydratedQueueRef = useRef(false);
  const filesRef = useRef([]);
  const uploadProgressFlushTimeoutRef = useRef(null);
  const uploadProgressFlushDetailsRef = useRef(null);
  const uploadedBytesByFileRef = useRef(new Map());
  const fileSizesByFileRef = useRef(new Map());
  const uploadProgressBufferApplyRef = useRef(() => {});
  const uploadProgressBufferRef = useRef(null);
  const activeQueueItemsRef = useRef(new Set());
  const finalizeRequestsRef = useRef(new Map());

  const applyAutoBandwidth = useCallback((metrics) => {
    const next = autoBandwidthRef.current.evaluate({ metrics, nowMs: Date.now() });
    dynamicConcurrencyRef.current = next.targetConcurrency;

    setAutoBandwidthState(next.modeState);
    setAutoBandwidthProfile({
      concurrency: next.targetConcurrency,
      chunkSizeMB: next.targetChunkSizeMB,
      reason: next.reason,
    });

    return next;
  }, []);

  /**
   * Generate quick hash for duplicate detection (instant)
   * Combines file name, size, and lastModified for fast comparison
   */
  const generateQuickHash = useCallback((file) => {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }, []);

  useEffect(() => {
    cleanupStaleResumeStates();

    const snapshot = loadQueueSnapshot();
    const restoredFiles =
      snapshot?.items?.map((item) => restoreQueueSnapshotItem(item)).filter(Boolean) || [];

    if (restoredFiles.length > 0) {
      restoredFiles.forEach((file) => {
        if (file.quickHash) {
          fileHashMapRef.current.set(file.quickHash, file.id);
        }
      });

      setFiles(restoredFiles);
    }

    hasHydratedQueueRef.current = true;

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }

      if (uploadProgressFlushTimeoutRef.current) {
        clearTimeout(uploadProgressFlushTimeoutRef.current);
      }

      uploadProgressBufferRef.current?.reset();
    };
  }, []);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (!hasHydratedQueueRef.current) {
      return;
    }

    const snapshotItems = files.map((file) => buildQueueSnapshotItem(file)).filter(Boolean);

    if (snapshotItems.length === 0) {
      removeQueueSnapshot();
      return;
    }

    saveQueueSnapshot({ items: snapshotItems });
  }, [files]);

  /**
   * Generate full hash using file content (slower but accurate)
   * Reads first 64KB + last 64KB + file size for efficient hashing
   */
  const generateFullHash = useCallback(async (file) => {
    const CHUNK_SIZE = 64 * 1024; // 64KB

    return new Promise((resolve) => {
      const reader = new FileReader();

      // For small files, read entire content
      if (file.size <= CHUNK_SIZE * 2) {
        reader.onload = async (e) => {
          const buffer = e.target.result;
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          resolve(hashHex);
        };
        reader.readAsArrayBuffer(file);
        return;
      }

      // For large files, read first + last chunks
      const firstChunk = file.slice(0, CHUNK_SIZE);
      const lastChunk = file.slice(-CHUNK_SIZE);

      Promise.all([firstChunk.arrayBuffer(), lastChunk.arrayBuffer()])
        .then(async ([first, last]) => {
          // Combine chunks with file size
          const combined = new Uint8Array(first.byteLength + last.byteLength + 8);
          combined.set(new Uint8Array(first), 0);
          combined.set(new Uint8Array(last), first.byteLength);
          // Add file size as bytes
          const sizeView = new DataView(combined.buffer, first.byteLength + last.byteLength, 8);
          sizeView.setBigUint64(0, BigInt(file.size), true);

          const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          resolve(hashHex);
        })
        .catch(() => {
          // Fallback to quick hash on error
          resolve(`fallback_${file.name}_${file.size}_${file.lastModified}`);
        });
    });
  }, []);

  /**
   * Check for duplicates in current queue using quick hash
   */
  const checkDuplicateInQueue = useCallback(
    (file) => {
      const quickHash = generateQuickHash(file);
      return fileHashMapRef.current.has(quickHash);
    },
    [generateQuickHash]
  );

  const checkServerDuplicateHashes = useCallback(async (entries) => {
    if (entries.length === 0) {
      return new Map();
    }

    try {
      const response = await axios.post('/upload/check-duplicates', {
        hashes: entries.map((entry) => ({
          id: entry.id,
          hash: entry.hash,
          fileName: entry.file.name,
        })),
      });

      return new Map(
        (response.data?.duplicates || []).map((duplicate) => [duplicate.fileId, duplicate])
      );
    } catch (error) {
      console.warn('Failed to check image duplicate hashes before queueing', error);
      return new Map();
    }
  }, []);

  /**
   * Start/stop statistics tracking
   */
  const startStatsTracking = useCallback((totalBytes) => {
    bytesUploadedRef.current = 0;
    lastBytesRef.current = 0;
    lastTimeRef.current = Date.now();
    speedEmaRef.current = 0;
    etaTrackerRef.current.reset(totalBytes);

    setUploadStats({
      startTime: Date.now(),
      bytesUploaded: 0,
      speed: 0,
      estimatedTimeRemaining: 0,
      statusDetail: 'Dang tai len...',
      retryAttempt: 0,
      retryingChunk: null,
      isResumedSession: false,
    });

    // Update stats every 500ms
    statsIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - lastTimeRef.current) / 1000; // seconds
      const bytesDiff = bytesUploadedRef.current - lastBytesRef.current;

      if (timeDiff > 0) {
        const instantSpeed = bytesDiff / timeDiff;
        speedEmaRef.current =
          speedEmaRef.current === 0 ? instantSpeed : 0.2 * instantSpeed + 0.8 * speedEmaRef.current;

        const etaOutput = etaTrackerRef.current.update(bytesUploadedRef.current, now);
        const estimatedTimeRemaining = etaOutput.etaSeconds ?? 0;

        setUploadStats((prev) => ({
          ...prev,
          bytesUploaded: bytesUploadedRef.current,
          speed: speedEmaRef.current,
          estimatedTimeRemaining: estimatedTimeRemaining,
        }));

        lastBytesRef.current = bytesUploadedRef.current;
        lastTimeRef.current = now;
      }
    }, 500);
  }, []);

  const stopStatsTracking = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  /**
   * Update bytes uploaded for statistics
   */
  const updateBytesUploaded = useCallback((bytes, details = {}) => {
    bytesUploadedRef.current = bytes;

    const etaOutput = etaTrackerRef.current.update(bytes);
    setUploadStats((prev) => ({
      ...prev,
      bytesUploaded: bytes,
      speed: etaOutput.speedBps || prev.speed,
      estimatedTimeRemaining: etaOutput.etaSeconds ?? prev.estimatedTimeRemaining,
      ...details,
    }));
  }, []);

  /**
   * Calculate overall progress
   */
  const calculateOverallProgress = useCallback((filesList) => {
    if (filesList.length === 0) return 0;

    const totalProgress = filesList.reduce((sum, f) => sum + f.progress, 0);
    return Math.round(totalProgress / filesList.length);
  }, []);

  const syncTrackedUploadedBytes = useCallback(
    (details = {}) => {
      const uploadedBytes = sumUploadedBytes(
        Object.fromEntries(uploadedBytesByFileRef.current.entries()),
        Object.fromEntries(fileSizesByFileRef.current.entries())
      );

      updateBytesUploaded(uploadedBytes, details);
    },
    [updateBytesUploaded]
  );

  const applyBufferedProgressSnapshot = useCallback(
    (snapshot, details = {}) => {
      if (!snapshot) {
        return;
      }

      Object.entries(snapshot.uploadedBytesByFile ?? {}).forEach(([fileId, uploadedBytes]) => {
        uploadedBytesByFileRef.current.set(fileId, uploadedBytes ?? 0);
      });

      syncTrackedUploadedBytes(details);

      setFiles((prev) => {
        const updated = prev.map((file) => {
          const nextState = snapshot.files?.[file.id];
          return nextState ? { ...file, ...nextState } : file;
        });

        setOverallProgress(calculateOverallProgress(updated));
        return updated;
      });
    },
    [calculateOverallProgress, syncTrackedUploadedBytes]
  );

  uploadProgressBufferApplyRef.current = applyBufferedProgressSnapshot;

  if (!uploadProgressBufferRef.current) {
    uploadProgressBufferRef.current = createUploadProgressBuffer({
      onFlush: (snapshot) => {
        const details = uploadProgressFlushDetailsRef.current ?? {};
        uploadProgressFlushDetailsRef.current = null;
        uploadProgressBufferApplyRef.current(snapshot, details);
      },
      shouldFlushNow: (event) =>
        event.type === 'status' &&
        [UploadStatus.PENDING, UploadStatus.SUCCESS, UploadStatus.ERROR].includes(event.status),
    });
  }

  const flushUploadProgressBuffer = useCallback((details = null) => {
    if (uploadProgressFlushTimeoutRef.current) {
      clearTimeout(uploadProgressFlushTimeoutRef.current);
      uploadProgressFlushTimeoutRef.current = null;
    }

    uploadProgressFlushDetailsRef.current = details ?? null;
    uploadProgressBufferRef.current?.flush();
  }, []);

  const scheduleUploadProgressFlush = useCallback((details = null) => {
    if (details) {
      uploadProgressFlushDetailsRef.current = details;
    }

    if (uploadProgressFlushTimeoutRef.current) {
      return;
    }

    uploadProgressFlushTimeoutRef.current = setTimeout(() => {
      uploadProgressFlushTimeoutRef.current = null;
      uploadProgressBufferRef.current?.flush();
    }, 16);
  }, []);

  const bufferUploadProgress = useCallback(
    (fileId, nextState, details = null) => {
      uploadProgressBufferRef.current?.updateProgress(fileId, nextState);
      scheduleUploadProgressFlush(details);
    },
    [scheduleUploadProgressFlush]
  );

  const flushBufferedUploadProgress = useCallback(
    (fileId, nextState, details = null) => {
      uploadProgressBufferRef.current?.updateProgress(fileId, nextState);
      flushUploadProgressBuffer(details);
    },
    [flushUploadProgressBuffer]
  );

  const updateBufferedUploadStatus = useCallback((fileId, nextState, details = null) => {
    if (uploadProgressFlushTimeoutRef.current) {
      clearTimeout(uploadProgressFlushTimeoutRef.current);
      uploadProgressFlushTimeoutRef.current = null;
    }

    uploadProgressFlushDetailsRef.current = details ?? null;
    uploadProgressBufferRef.current?.updateStatus(fileId, nextState);
  }, []);

  /**
   * Generate a unique ID for a file
   */
  const generateFileId = useCallback(() => {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * Create a preview URL for an image file
   */
  const createPreview = useCallback((file) => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('video/')) {
        // Generate video thumbnail
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        video.onloadeddata = () => {
          // Seek to 1 second (or midpoint if shorter)
          video.currentTime = Math.min(1, video.duration / 2);
        };

        video.onseeked = () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL();
          URL.revokeObjectURL(video.src);
          resolve(dataUrl);
        };

        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          resolve(null);
        };

        video.src = URL.createObjectURL(file);
        video.load();
      } else {
        resolve(null);
      }
    });
  }, []);

  /**
   * Add files to the upload queue
   * Returns { added: [], duplicates: [] }
   */
  const addFiles = useCallback(
    async (newFiles) => {
      const fileArray = Array.from(newFiles);
      const added = [];
      const duplicates = [];
      const queuedFingerprints = new Map(fileHashMapRef.current);
      const serverHashCandidates = [];

      files.forEach((existingFile) => {
        const queueKey = existingFile.quickHash || existingFile.fingerprint;

        if (queueKey && !queuedFingerprints.has(queueKey)) {
          queuedFingerprints.set(queueKey, existingFile.id);
        }
      });

      const processedFiles = await Promise.all(
        fileArray.map(async (file) => {
          const uploadedFingerprint = buildUploadedFileFingerprint(file);

          if (uploadedFingerprint && hasUploadedFileFingerprint(uploadedFingerprint)) {
            duplicates.push({
              file,
              existingId: uploadedFingerprint,
              source: 'uploaded-history',
            });
            return null;
          }

          // Check for duplicate using quick hash
          const quickHash = generateQuickHash(file);
          const restoredMatch = files.find((existingFile) => {
            return (
              existingFile.isRestored === true &&
              !existingFile.file &&
              (existingFile.quickHash === quickHash || existingFile.fingerprint === quickHash)
            );
          });

          if (restoredMatch) {
            queuedFingerprints.set(quickHash, restoredMatch.id);

            const preview = await createPreview(file);
            const restoredFile = {
              ...restoredMatch,
              file,
              name: file.name,
              size: file.size,
              type: file.type,
              preview,
              progress: 0,
              status: restoredMatch.needsManualRetry ? UploadStatus.ERROR : UploadStatus.PENDING,
              error: restoredMatch.needsManualRetry ? restoredMatch.error : null,
              quickHash,
              phase: UploadStatus.PENDING,
              isRestored: false,
            };

            added.push(restoredFile);
            return { mode: 'replace', file: restoredFile };
          }

          if (queuedFingerprints.has(quickHash)) {
            duplicates.push({
              file,
              existingId: queuedFingerprints.get(quickHash),
              source: 'queue',
            });
            return null;
          }

          const fileId = generateFileId();
          queuedFingerprints.set(quickHash, fileId);

          const fullHash = await generateFullHash(file);
          serverHashCandidates.push({ id: fileId, file, hash: fullHash });

          const preview = await createPreview(file);

          // Store quick hash for future duplicate detection
          fileHashMapRef.current.set(quickHash, fileId);

          const processedFile = {
            id: fileId,
            file,
            name: file.name,
            customName: '',
            size: file.size,
            type: file.type,
            preview,
            progress: 0,
            status: UploadStatus.PENDING,
            error: null,
            response: null,
            quickHash,
            fullHash,
          };

          fileSizesByFileRef.current.set(fileId, file.size);
          added.push(processedFile);
          return { mode: 'append', file: processedFile };
        })
      );

      const replacementFiles = processedFiles
        .filter((result) => result?.mode === 'replace')
        .map((result) => result.file);
      const appendedFiles = processedFiles
        .filter((result) => result?.mode === 'append')
        .map((result) => result.file);

      const serverDuplicates = await checkServerDuplicateHashes(serverHashCandidates);
      const serverDuplicateIds = new Set(serverDuplicates.keys());

      serverDuplicateIds.forEach((fileId) => {
        const candidate = serverHashCandidates.find((entry) => entry.id === fileId);
        if (!candidate) {
          return;
        }

        duplicates.push({
          file: candidate.file,
          existingId: serverDuplicates.get(fileId)?.existingId ?? null,
          source: 'server-hash',
        });
        fileHashMapRef.current.delete(generateQuickHash(candidate.file));
        fileSizesByFileRef.current.delete(fileId);
      });

      const filteredAppendedFiles = appendedFiles.filter(
        (file) => !serverDuplicateIds.has(file.id)
      );

      const filteredAdded = added.filter((file) => !serverDuplicateIds.has(file.id));

      if (replacementFiles.length > 0 || filteredAppendedFiles.length > 0) {
        setFiles((prev) => {
          const replacementMap = new Map(replacementFiles.map((item) => [item.id, item]));
          const nextFiles = prev.map(
            (existingFile) => replacementMap.get(existingFile.id) || existingFile
          );

          if (filteredAppendedFiles.length === 0) {
            return nextFiles;
          }

          return [...nextFiles, ...filteredAppendedFiles];
        });
      }

      return { added: filteredAdded, duplicates };
    },
    [
      files,
      generateFileId,
      createPreview,
      generateFullHash,
      generateQuickHash,
      checkServerDuplicateHashes,
    ]
  );

  /**
   * Remove a file from the queue
   */
  const removeFile = useCallback(
    (fileId) => {
      // Cancel upload if in progress
      const controller = abortControllersRef.current.get(fileId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(fileId);
      }

      uploadProgressBufferRef.current?.removeFile(fileId);
      uploadedBytesByFileRef.current.delete(fileId);
      fileSizesByFileRef.current.delete(fileId);
      flushUploadProgressBuffer();

      // Remove from hash map
      setFiles((prev) => {
        const fileToRemove = prev.find((f) => f.id === fileId);
        if (fileToRemove?.quickHash) {
          fileHashMapRef.current.delete(fileToRemove.quickHash);
        }
        activeQueueItemsRef.current.delete(getQueueItemKey(fileToRemove));
        finalizeRequestsRef.current.delete(getQueueItemKey(fileToRemove));
        const updated = prev.filter((f) => f.id !== fileId);
        setOverallProgress(calculateOverallProgress(updated));
        return updated;
      });
    },
    [calculateOverallProgress, flushUploadProgressBuffer]
  );

  /**
   * Clear all files from the queue
   */
  const clearFiles = useCallback(() => {
    // Cancel all uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();

    // Clear hash map
    fileHashMapRef.current.clear();
    activeQueueItemsRef.current.clear();
    finalizeRequestsRef.current.clear();
    uploadedBytesByFileRef.current.clear();
    fileSizesByFileRef.current.clear();
    uploadProgressBufferRef.current?.reset();

    if (uploadProgressFlushTimeoutRef.current) {
      clearTimeout(uploadProgressFlushTimeoutRef.current);
      uploadProgressFlushTimeoutRef.current = null;
    }

    uploadProgressFlushDetailsRef.current = null;

    setFiles([]);
    setOverallProgress(0);
    setCurrentUploadIndex(0);
    setIsUploading(false);
    updateBytesUploaded(0);
  }, [updateBytesUploaded]);

  /**
   * Update a file's state
   */
  const updateFile = useCallback(
    (fileId, updates) => {
      setFiles((prev) => {
        const updated = prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f));
        setOverallProgress(calculateOverallProgress(updated));
        return updated;
      });
    },
    [calculateOverallProgress]
  );

  const applyPreflightFailures = useCallback(
    (failures = []) => {
      if (failures.length === 0) {
        return;
      }

      const failureMap = new Map(failures.map(({ fileItem, error }) => [fileItem.id, error]));

      setFiles((prev) => {
        const updated = prev.map((file) => {
          const error = failureMap.get(file.id);

          if (!error) {
            return file;
          }

          return {
            ...file,
            status: UploadStatus.ERROR,
            error,
            phase: file.phase || UploadStatus.PENDING,
            progress: 0,
            response: null,
          };
        });

        setOverallProgress(calculateOverallProgress(updated));
        return updated;
      });

      failures.forEach(({ fileItem, error }) => {
        onError?.(fileItem, error);
      });
    },
    [calculateOverallProgress, onError]
  );

  const runUploadPreflight = useCallback(
    (pendingFiles, metadata = {}) => {
      if (!Array.isArray(pendingFiles) || pendingFiles.length === 0) {
        return { validFiles: [], failures: [] };
      }

      const failures = [];
      const validFiles = [];
      const selectedStorageDriver = metadata.storage_driver;
      const hasStorageProviders = storageProviders && Object.keys(storageProviders).length > 0;

      if (
        selectedStorageDriver &&
        hasStorageProviders &&
        !storageProviders[selectedStorageDriver]
      ) {
        const error = buildPreflightErrorMessage('storage-driver', {
          storageDriver: selectedStorageDriver,
        });

        return {
          validFiles: [],
          failures: pendingFiles.map((fileItem) => ({ fileItem, error })),
        };
      }

      pendingFiles.forEach((fileItem) => {
        if (!fileItem?.file) {
          failures.push({ fileItem, error: buildPreflightErrorMessage('missing-file') });
          return;
        }

        if (
          Number.isFinite(maxFileSize) &&
          maxFileSize > 0 &&
          fileItem.size > maxFileSize * 1024 * 1024
        ) {
          failures.push({
            fileItem,
            error: buildPreflightErrorMessage('size', { maxFileSize }),
          });
          return;
        }

        if (acceptedMimeTypes.length > 0) {
          const fileType = typeof fileItem.type === 'string' ? fileItem.type : '';
          const isAccepted = acceptedMimeTypes.some((acceptedMimeType) => {
            return matchesAcceptedMimeType(fileType, acceptedMimeType);
          });

          if (!isAccepted) {
            failures.push({ fileItem, error: buildPreflightErrorMessage('mime') });
            return;
          }
        }

        validFiles.push(fileItem);
      });

      const hasQuota = Number.isFinite(storageQuota?.used) && Number.isFinite(storageQuota?.total);
      if (hasQuota && validFiles.length > 0) {
        const pendingBytes = validFiles.reduce((sum, file) => sum + (file.size || 0), 0);

        if (storageQuota.used + pendingBytes > storageQuota.total) {
          const error = buildPreflightErrorMessage('quota');

          return {
            validFiles: [],
            failures: [...failures, ...validFiles.map((fileItem) => ({ fileItem, error }))],
          };
        }
      }

      return { validFiles, failures };
    },
    [acceptedMimeTypes, maxFileSize, storageProviders, storageQuota]
  );

  /**
   * Upload a single file (simple upload for small files)
   */
  const uploadSingleFile = useCallback(
    async (fileItem, formData, cumulativeBytes = 0) => {
      const controller = new AbortController();
      abortControllersRef.current.set(fileItem.id, controller);

      try {
        const response = await axios.post(uploadUrl, formData, {
          signal: controller.signal,
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-Requested-With': 'XMLHttpRequest',
          },
          onUploadProgress: (progressEvent) => {
            const loadedBytes = Number.isFinite(progressEvent.loaded) ? progressEvent.loaded : 0;
            const totalBytes =
              Number.isFinite(progressEvent.total) && progressEvent.total > 0
                ? progressEvent.total
                : fileItem.size;
            const progress = Math.round((loadedBytes * 100) / totalBytes);

            bufferUploadProgress(fileItem.id, {
              loadedBytes,
              progress,
              status: UploadStatus.UPLOADING,
            });
          },
        });

        return { success: true, data: response.data };
      } catch (error) {
        if (axios.isCancel(error)) {
          return { success: false, error: 'Upload cancelled', errorPhase: UploadPhase.UPLOADING };
        }

        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          'Upload failed';

        return { success: false, error: errorMessage, errorPhase: UploadPhase.UPLOADING };
      } finally {
        abortControllersRef.current.delete(fileItem.id);
      }
    },
    [uploadUrl, bufferUploadProgress]
  );

  /**
   * Upload a file using chunked upload (for large files)
   */
  const uploadChunkedFile = useCallback(
    async (fileItem, metadata, cumulativeBytes = 0) => {
      const controller = new AbortController();
      abortControllersRef.current.set(fileItem.id, controller);

      const file = fileItem.file;
      const chunkSizeBytes = chunkSize * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / chunkSizeBytes);
      const fingerprint = buildUploadFingerprint(file);
      const existing = loadResumeState('image', file);

      let uniqueId = fileItem.id;
      let uploadedChunkSet = new Set();
      let resumedSession = false;
      let currentPhase = UploadPhase.UPLOADING;

      if (
        existing?.state &&
        isResumeStateValid(existing.state, { file, chunkSizeBytes, totalChunks })
      ) {
        uniqueId = existing.state.uploadId || fileItem.id;
        uploadedChunkSet = deserializeChunkIndexes(existing.state.uploadedChunkIndexes);
        resumedSession = uploadedChunkSet.size > 0;
      }

      if (resumedSession) {
        const resumedBytes = Math.min(file.size, uploadedChunkSet.size * chunkSizeBytes);
        const resumedProgress = Math.round((resumedBytes * 100) / file.size);

        uploadedBytesByFileRef.current.set(fileItem.id, resumedBytes);
        flushBufferedUploadProgress(
          fileItem.id,
          {
            loadedBytes: resumedBytes,
            progress: resumedProgress,
            status: UploadStatus.UPLOADING,
            phase: UploadPhase.UPLOADING,
          },
          {
            statusDetail: 'Da khoi phuc phien upload truoc do',
            isResumedSession: true,
          }
        );
      }

      try {
        const pendingChunkIndexes = [];
        for (let i = 0; i < totalChunks; i++) {
          if (!uploadedChunkSet.has(i)) {
            pendingChunkIndexes.push(i);
          }
        }

        for (const chunkIndex of pendingChunkIndexes) {
          if (controller.signal.aborted) {
            return {
              success: false,
              error: 'Upload cancelled',
              errorPhase: currentPhase,
              canResume: true,
            };
          }

          let retryAttempts = 0;
          const chunkStartedAt = Date.now();

          const start = chunkIndex * chunkSizeBytes;
          const end = Math.min(start + chunkSizeBytes, file.size);
          const chunk = file.slice(start, end);

          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('file_name', file.name);
          formData.append('unique_id', uniqueId);
          formData.append('chunk_index', chunkIndex);
          formData.append('total_chunks', totalChunks);

          // Add metadata
          Object.entries(metadata).forEach(([key, value]) => {
            appendMetadataValue(formData, key, value);
          });

          await retryUploadOperation(
            async () => {
              await axios.post(chunkUrl, formData, {
                signal: controller.signal,
                headers: {
                  'Content-Type': 'multipart/form-data',
                  'X-Requested-With': 'XMLHttpRequest',
                },
                timeout: 120000,
              });
            },
            {
              maxAttempts: 5,
              signal: controller.signal,
              onOffline: () =>
                updateBytesUploaded(bytesUploadedRef.current, {
                  statusDetail: 'Mat mang, dang cho ket noi lai...',
                }),
              onRecovered: () =>
                updateBytesUploaded(bytesUploadedRef.current, {
                  statusDetail: 'Da ket noi lai, tiep tuc upload...',
                }),
              onRetry: ({ attempt }) => {
                retryAttempts = attempt;
                updateBytesUploaded(bytesUploadedRef.current, {
                  statusDetail: `Dang thu lai chunk ${chunkIndex + 1}/${totalChunks}`,
                  retryAttempt: attempt,
                  retryingChunk: chunkIndex + 1,
                });
              },
            }
          );

          const durationMs = Date.now() - chunkStartedAt;
          applyAutoBandwidth({
            avgMbps: durationMs > 0 ? (chunk.size * 8) / 1000000 / (durationMs / 1000) : 0,
            retryRate: retryAttempts > 0 ? 1 : 0,
            timeoutCount: 0,
            failureCount: 0,
            p95ChunkTimeMs: durationMs,
          });

          uploadedChunkSet.add(chunkIndex);

          saveResumeState('image', file, {
            uploadId: uniqueId,
            type: 'image',
            fingerprint,
            chunkSizeBytes,
            totalChunks,
            uploadedChunkIndexes: serializeChunkIndexes(uploadedChunkSet),
            bytesUploaded: Math.min(file.size, uploadedChunkSet.size * chunkSizeBytes),
            status: 'uploading',
          });

          // Update progress
          const loadedBytes = Math.min(file.size, uploadedChunkSet.size * chunkSizeBytes);
          const progress = Math.round((uploadedChunkSet.size / totalChunks) * 100);

          bufferUploadProgress(
            fileItem.id,
            {
              loadedBytes,
              progress,
              status: UploadStatus.UPLOADING,
              phase: UploadPhase.UPLOADING,
            },
            {
              statusDetail: 'Dang tai len...',
              retryAttempt: 0,
              retryingChunk: null,
              isResumedSession: resumedSession,
            }
          );
        }

        // Finalize the upload
        currentPhase = UploadPhase.FINALIZING;
        flushBufferedUploadProgress(
          fileItem.id,
          {
            loadedBytes: file.size,
            progress: 100,
            status: UploadStatus.UPLOADING,
            phase: UploadPhase.FINALIZING,
          },
          {
            statusDetail: 'Dang hoan tat upload...',
            retryAttempt: 0,
            retryingChunk: null,
            isResumedSession: resumedSession,
          }
        );

        const finalizeData = new FormData();
        finalizeData.append('unique_id', uniqueId);
        finalizeData.append('file_name', file.name);
        finalizeData.append('total_chunks', totalChunks);

        Object.entries(metadata).forEach(([key, value]) => {
          appendMetadataValue(finalizeData, key, value);
        });

        const finalizeKey = getQueueItemKey(fileItem) || uniqueId;
        let finalizePromise = finalizeRequestsRef.current.get(finalizeKey);

        if (!finalizePromise) {
          finalizePromise = axios.post(finalizeUrl, finalizeData, {
            signal: controller.signal,
            headers: {
              'Content-Type': 'multipart/form-data',
              'X-Requested-With': 'XMLHttpRequest',
            },
          });
          finalizeRequestsRef.current.set(finalizeKey, finalizePromise);
        }

        let response;

        try {
          response = await finalizePromise;
        } finally {
          if (finalizeRequestsRef.current.get(finalizeKey) === finalizePromise) {
            finalizeRequestsRef.current.delete(finalizeKey);
          }
        }

        removeResumeState('image', file);

        return { success: true, data: response.data };
      } catch (error) {
        if (axios.isCancel(error)) {
          return {
            success: false,
            error: 'Upload cancelled',
            errorPhase: currentPhase,
            canResume: true,
          };
        }

        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          'Upload failed';

        saveResumeState('image', file, {
          uploadId: uniqueId,
          type: 'image',
          fingerprint,
          chunkSizeBytes,
          totalChunks,
          uploadedChunkIndexes: serializeChunkIndexes(uploadedChunkSet),
          status: 'failed',
          lastError: errorMessage,
        });

        applyAutoBandwidth({
          avgMbps: 0,
          retryRate: 1,
          timeoutCount: error?.code === 'ECONNABORTED' ? 2 : 0,
          failureCount: 1,
          p95ChunkTimeMs: 0,
        });

        return {
          success: false,
          error: errorMessage,
          errorPhase: currentPhase,
          canResume: true,
        };
      } finally {
        abortControllersRef.current.delete(fileItem.id);
      }
    },
    [
      chunkUrl,
      finalizeUrl,
      chunkSize,
      updateBytesUploaded,
      applyAutoBandwidth,
      flushBufferedUploadProgress,
      bufferUploadProgress,
    ]
  );

  /**
   * Start uploading all pending files
   * @param {Object} metadata - Global metadata for all files
   * @param {Object} perFileMetadata - Per-file metadata overrides { fileId: { key: value } }
   */
  const startUpload = useCallback(
    async (metadata = {}, perFileMetadata = {}) => {
      cleanupStaleResumeStates();

      const pendingFiles = filesRef.current.filter((f) => f.status === UploadStatus.PENDING);

      const queuedFiles = pendingFiles.filter((file) => {
        const queueKey = getQueueItemKey(file);

        if (!queueKey) {
          return true;
        }

        if (activeQueueItemsRef.current.has(queueKey)) {
          return false;
        }

        activeQueueItemsRef.current.add(queueKey);
        return true;
      });

      if (queuedFiles.length === 0) return;

      const { validFiles, failures } = runUploadPreflight(queuedFiles, metadata);
      applyPreflightFailures(failures);

      failures.forEach(({ fileItem }) => {
        const failedFile = queuedFiles.find((file) => file.id === fileItem.id);
        activeQueueItemsRef.current.delete(getQueueItemKey(failedFile));
      });

      if (validFiles.length === 0) {
        return [];
      }

      setIsUploading(true);
      setCurrentUploadIndex(0);

      uploadedBytesByFileRef.current = new Map(validFiles.map((file) => [file.id, 0]));
      fileSizesByFileRef.current = new Map(validFiles.map((file) => [file.id, file.size]));
      uploadProgressBufferRef.current?.reset();

      if (uploadProgressFlushTimeoutRef.current) {
        clearTimeout(uploadProgressFlushTimeoutRef.current);
        uploadProgressFlushTimeoutRef.current = null;
      }

      uploadProgressFlushDetailsRef.current = null;

      // Calculate total bytes and start stats tracking
      const totalBytes = validFiles.reduce((sum, f) => sum + f.size, 0);
      startStatsTracking(totalBytes);
      updateBytesUploaded(0, {
        statusDetail: 'Dang tai len...',
        retryAttempt: 0,
        retryingChunk: null,
        isResumedSession: false,
      });

      const chunkSizeBytes = chunkSize * 1024 * 1024;
      const results = [];
      let cumulativeBytes = 0;
      let queueIndex = 0;

      // Process files in adaptive batches based on auto bandwidth profile
      while (queueIndex < validFiles.length) {
        const adaptiveConcurrency = Math.max(
          1,
          Math.min(dynamicConcurrencyRef.current, maxConcurrent)
        );
        const batch = validFiles.slice(queueIndex, queueIndex + adaptiveConcurrency);
        queueIndex += adaptiveConcurrency;

        const batchPromises = batch.map(async (fileItem, batchIndex) => {
          try {
            updateFile(fileItem.id, {
              status: UploadStatus.UPLOADING,
              phase: UploadPhase.UPLOADING,
              failurePhase: null,
              error: null,
              response: null,
              canResume: false,
              needsManualRetry: false,
              lastErrorSummary: null,
            });
            setCurrentUploadIndex((prev) => prev + 1);

            // Merge global metadata with per-file metadata
            const fileMetadata = {
              ...metadata,
              ...(perFileMetadata[fileItem.id] || {}),
            };

            let result;

            // Get the display name (custom name or original name)
            const displayName = fileItem.customName?.trim() || fileItem.name;

            // Calculate cumulative bytes for this file
            const fileStartBytes = cumulativeBytes;

            // Use chunked upload for large files
            if (fileItem.size > chunkSizeBytes) {
              result = await uploadChunkedFile(
                fileItem,
                { ...fileMetadata, custom_name: displayName },
                fileStartBytes
              );
            } else {
              // Simple upload for small files
              const formData = new FormData();
              formData.append('images[]', fileItem.file);
              formData.append('custom_name', displayName);

              Object.entries(fileMetadata).forEach(([key, value]) => {
                appendMetadataValue(formData, key, value);
              });

              result = await uploadSingleFile(fileItem, formData, fileStartBytes);
            }

            // Update cumulative bytes after file completes
            cumulativeBytes += fileItem.size;

            if (result.success) {
              rememberUploadedFileFingerprint(fileItem.file);
              const processingResponse = isProcessingUploadResponse(result.data);

              updateBufferedUploadStatus(fileItem.id, {
                loadedBytes: fileItem.size,
                status: UploadStatus.SUCCESS,
                phase: processingResponse ? UploadPhase.PROCESSING : UploadStatus.SUCCESS,
                failurePhase: null,
                progress: 100,
                response: result.data,
                canResume: false,
                needsManualRetry: false,
                lastErrorSummary: null,
              });
              uploadProgressBufferRef.current?.removeFile(fileItem.id);

              // Keep the completed files in the queue state at 100% so the user can verify completion.

              if (!processingResponse && onFileComplete) {
                onFileComplete(fileItem, result.data);
              }
            } else {
              updateBufferedUploadStatus(fileItem.id, {
                status: UploadStatus.ERROR,
                phase: result.errorPhase || fileItem.phase || UploadPhase.UPLOADING,
                failurePhase: result.errorPhase || fileItem.phase || UploadPhase.UPLOADING,
                error: result.error,
                canResume: result.canResume === true,
                lastErrorSummary: result.error,
              });
              uploadProgressBufferRef.current?.removeFile(fileItem.id);

              if (onError) {
                onError(fileItem, result.error);
              }
            }

            return {
              fileItem,
              result,
              processingResponse: result.success && isProcessingUploadResponse(result.data),
            };
          } finally {
            activeQueueItemsRef.current.delete(getQueueItemKey(fileItem));
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      // Stop stats tracking
      stopStatsTracking();

      setIsUploading(false);
      setOverallProgress(100);

      const completedSuccessful = results.filter((r) => r.result.success && !r.processingResponse);
      const processing = results.filter((r) => r.processingResponse);
      const failed = results.filter((r) => !r.result.success);
      const successfulCount = completedSuccessful.length;

      // Call onAllComplete with success count for auto-incrementing batch numbers
      if (onAllComplete && successfulCount > 0) {
        onAllComplete(successfulCount);
      }

      if (onUploadComplete) {
        onUploadComplete({
          successful: completedSuccessful,
          failed,
          processing,
          total: results.length,
        });
      }

      // Auto-clear successfully uploaded files after 5 seconds to prevent lag/accumulation
      if (completedSuccessful.length > 0) {
        setTimeout(() => {
          setFiles((prev) =>
            prev.filter((f) => {
              const wasSuccessful = completedSuccessful.some((r) => r.fileItem.id === f.id);
              return !wasSuccessful;
            })
          );
        }, 5000);
      }

      return results;
    },
    [
      applyPreflightFailures,
      chunkSize,
      maxConcurrent,
      runUploadPreflight,
      updateFile,
      uploadSingleFile,
      uploadChunkedFile,
      onFileComplete,
      onError,
      onUploadComplete,
      onAllComplete,
      startStatsTracking,
      stopStatsTracking,
      updateBytesUploaded,
      updateBufferedUploadStatus,
    ]
  );

  /**
   * Cancel all uploads
   */
  const cancelUpload = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();

    const uploadingFileIds = files
      .filter((file) => file.status === UploadStatus.UPLOADING)
      .map((file) => file.id);

    uploadingFileIds.forEach((fileId) => {
      uploadedBytesByFileRef.current.set(fileId, 0);
      uploadProgressBufferRef.current?.removeFile(fileId);
    });

    setFiles((prev) =>
      prev.map((f) =>
        f.status === UploadStatus.UPLOADING
          ? {
              ...f,
              status: UploadStatus.PENDING,
              phase: UploadStatus.PENDING,
              failurePhase: null,
              progress: 0,
            }
          : f
      )
    );

    setIsUploading(false);
    syncTrackedUploadedBytes({
      statusDetail: 'Da tam dung. Bam upload de tiep tuc.',
      retryAttempt: 0,
      retryingChunk: null,
      isResumedSession: false,
    });
  }, [files, syncTrackedUploadedBytes]);

  /**
   * Retry failed uploads
   */
  const retryFailed = useCallback(
    async (metadata = {}, perFileMetadata = {}) => {
      setFiles((prev) => {
        const updated = prev.map((f) =>
          f.status === UploadStatus.ERROR
            ? {
                ...f,
                status: UploadStatus.PENDING,
                phase:
                  f.failurePhase === UploadPhase.FINALIZING
                    ? UploadPhase.FINALIZING
                    : UploadStatus.PENDING,
                failurePhase: null,
                progress: 0,
                error: null,
                lastErrorSummary: null,
              }
            : f
        );

        setOverallProgress(calculateOverallProgress(updated));
        return updated;
      });

      // Wait for state update then start upload
      setTimeout(() => startUpload(metadata, perFileMetadata), 0);
    },
    [calculateOverallProgress, startUpload]
  );

  /**
   * Compute full hash for specific files (for deep duplicate check)
   */
  const computeFullHashes = useCallback(
    async (fileIds = null) => {
      const targetFiles = fileIds ? files.filter((f) => fileIds.includes(f.id)) : files;

      const results = await Promise.all(
        targetFiles.map(async (fileItem) => {
          if (fileItem.fullHash) {
            return { id: fileItem.id, hash: fileItem.fullHash };
          }

          const hash = await generateFullHash(fileItem.file);
          updateFile(fileItem.id, { fullHash: hash });
          return { id: fileItem.id, hash };
        })
      );

      return results;
    },
    [files, generateFullHash, updateFile]
  );

  // Computed values
  const pendingCount = files.filter((f) => f.status === UploadStatus.PENDING).length;
  const uploadingCount = files.filter((f) => f.status === UploadStatus.UPLOADING).length;
  const successCount = files.filter((f) => f.status === UploadStatus.SUCCESS).length;
  const errorCount = files.filter((f) => f.status === UploadStatus.ERROR).length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    // State
    files,
    isUploading,
    overallProgress,
    currentUploadIndex,
    uploadStats,
    autoBandwidthMode,
    autoBandwidthState,
    autoBandwidthProfile,

    // Computed
    pendingCount,
    uploadingCount,
    successCount,
    errorCount,
    totalSize,
    hasFiles: files.length > 0,
    hasPending: pendingCount > 0,
    hasErrors: errorCount > 0,

    // Actions
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
    cancelUpload,
    retryFailed,
    updateFile,

    // Duplicate detection
    checkDuplicateInQueue,
    computeFullHashes,
    generateFullHash,
  };
}

export default useUpload;
