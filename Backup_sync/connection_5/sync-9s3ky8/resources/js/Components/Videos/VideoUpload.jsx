import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { router } from '@inertiajs/react';
import axios from 'axios';
import Button from '@/Components/UI/Button';
import Input from '@/Components/UI/Input';
import { useVideoUpload, SUPPORTED_VIDEO_FORMATS } from '@/Hooks/useVideoUpload';
import { hasUploadedFileFingerprint } from '@/Utils/uploadedFileFingerprint';

function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '--';
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 'Dang uoc luong...';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

/**
 * VideoUpload Component
 * Dedicated video upload interface with drag & drop, chunked upload, and progress tracking
 * Requirements: 1.1, 1.2, 1.6, 6.5
 *
 * @param {Object} props
 * @param {Function} props.onUploadComplete - Callback when upload completes
 * @param {Function} props.onCancel - Callback when user cancels
 * @param {Object} props.storageProviders - Available storage providers
 * @param {string} props.className - Additional CSS classes
 */
export default function VideoUpload({
  onUploadComplete,
  onCancel,
  storageProviders = {},
  availableTags = [],
  captionProvider = 'gemini',
  className = '',
}) {
  const MAX_AI_VIDEO_THUMBNAILS = 8;

  // File state
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [codecWarning, setCodecWarning] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbnailTime, setThumbnailTime] = useState(1);
  const [videoDuration, setVideoDuration] = useState(0);

  // Pre-generated thumbnails for quick selection
  const [previewThumbnails, setPreviewThumbnails] = useState([]); // Array of { time, blob, url }
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState(0);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [thumbnailProgress, setThumbnailProgress] = useState(0);
  const [showCustomSlider, setShowCustomSlider] = useState(false);
  const [isCapturingCustom, setIsCapturingCustom] = useState(false);
  const [customThumbnailUrl, setCustomThumbnailUrl] = useState(null); // URL for custom slider preview

  // Normalize availableTags - handle both array and object from Inertia
  const normalizedTags = useMemo(
    () =>
      Array.isArray(availableTags)
        ? availableTags
        : availableTags && typeof availableTags === 'object'
          ? Object.values(availableTags)
          : [],
    [availableTags]
  );
  const [tagOptions, setTagOptions] = useState(normalizedTags);

  useEffect(() => {
    setTagOptions((prev) => {
      const merged = [...prev];
      const seenIds = new Set(prev.map((tag) => tag.id));
      let hasNew = false;

      normalizedTags.forEach((tag) => {
        if (!seenIds.has(tag.id)) {
          merged.push(tag);
          seenIds.add(tag.id);
          hasNew = true;
        }
      });

      return hasNew ? merged : prev;
    });
  }, [normalizedTags]);

  // Form state
  const [title, setTitle] = useState('');
  const [isTitleAutoFilled, setIsTitleAutoFilled] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [isGeneratingJoyCaption, setIsGeneratingJoyCaption] = useState(false);
  const [isSavingCaptionProvider, setIsSavingCaptionProvider] = useState(false);
  const [aiTitleResult, setAiTitleResult] = useState(null);
  const [aiTagsResult, setAiTagsResult] = useState(null);
  const [aiTitleError, setAiTitleError] = useState(null);
  const [aiTagsError, setAiTagsError] = useState(null);
  const [joyCaptionText, setJoyCaptionText] = useState('');
  const [joyCaptionError, setJoyCaptionError] = useState(null);
  const [aiTone, setAiTone] = useState('tu_nhien');
  const [titleCooldownUntil, setTitleCooldownUntil] = useState(0);
  const [titleCooldownRemaining, setTitleCooldownRemaining] = useState(0);
  const [tagsCooldownUntil, setTagsCooldownUntil] = useState(0);
  const [tagsCooldownRemaining, setTagsCooldownRemaining] = useState(0);
  const [currentCaptionProvider, setCurrentCaptionProvider] = useState(captionProvider);
  const [storageProvider, setStorageProvider] = useState(() => {
    // Find default provider
    const defaultKey = Object.entries(storageProviders).find(([_, p]) => p.is_default)?.[0];
    return defaultKey || 'local';
  });
  const isJoyCaptionProvider = currentCaptionProvider === 'joycaption';

  useEffect(() => {
    setCurrentCaptionProvider(captionProvider);
  }, [captionProvider]);

  // Refs
  const fileInputRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const canvasRef = useRef(null);
  const sliderDebounceRef = useRef(null);
  const thumbnailGenStartedRef = useRef(false);

  // Upload hook
  const {
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
    isProcessing,
    isSuccess,
    isError,
    isInProgress,
    upload,
    cancel,
    reset,
    retry,
    validateVideo,
  } = useVideoUpload({
    onUploadComplete: (data) => {
      if (onUploadComplete) {
        onUploadComplete(data);
      }
      // Don't auto-redirect - let user decide what to do next
    },
  });

  /**
   * Validate and set selected file
   */
  const handleFileSelect = useCallback(
    (file) => {
      setValidationError(null);

      // Validate file
      const validation = validateVideo(file);
      if (!validation.valid) {
        setValidationError(validation.message);
        return;
      }

      if (hasUploadedFileFingerprint(file)) {
        setValidationError('Video nay da duoc upload truoc do.');
        return;
      }

      setSelectedFile(file);
      setCodecWarning(null);
      setThumbnail(null); // Reset thumbnail for new file
      setThumbnailTime(1);
      setVideoDuration(0);

      // Reset preview thumbnails
      thumbnailGenStartedRef.current = false;
      previewThumbnails.forEach((t) => {
        if (t.url) URL.revokeObjectURL(t.url);
      });
      setPreviewThumbnails([]);
      setSelectedThumbnailIndex(0);
      setIsGeneratingThumbnails(false);
      setThumbnailProgress(0);
      setShowCustomSlider(false);
      setAiTitleResult(null);
      setAiTagsResult(null);
      setAiTitleError(null);
      setAiTagsError(null);
      setJoyCaptionText('');
      setJoyCaptionError(null);
      setAiTone('tu_nhien');
      setTitleCooldownUntil(0);
      setTitleCooldownRemaining(0);
      setTagsCooldownUntil(0);
      setTagsCooldownRemaining(0);
      setSelectedTags([]);
      if (customThumbnailUrl) {
        URL.revokeObjectURL(customThumbnailUrl);
      }
      setCustomThumbnailUrl(null);

      // Create video preview URL
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);

      // Auto-fill title from filename (without extension)
      if (!title) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setTitle(nameWithoutExt);
        setIsTitleAutoFilled(true);
      }
    },
    [validateVideo, title]
  );

  /**
   * Generate multiple preview thumbnails at different timestamps
   * This runs once when video loads, so user can quickly pick from pre-generated options
   */
  const generatePreviewThumbnails = useCallback(async (videoElement, duration) => {
    if (!videoElement || duration <= 0) return;

    setIsGeneratingThumbnails(true);
    setThumbnailProgress(0);

    const canvas = canvasRef.current;
    if (!canvas) {
      setIsGeneratingThumbnails(false);
      return;
    }

    // Wait for video to have enough data before seeking
    if (videoElement.readyState < 2) {
      await new Promise((resolve) => {
        const onCanPlay = () => {
          videoElement.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        videoElement.addEventListener('canplay', onCanPlay);
        // Fallback timeout
        setTimeout(() => {
          videoElement.removeEventListener('canplay', onCanPlay);
          resolve();
        }, 10000);
      });
    }

    // Generate thumbnails at different points - cap seek range for very long videos
    // because browsers may not buffer distant timestamps
    const isLongVideo = duration > 300; // > 5 minutes
    const isVeryLongVideo = duration > 1200; // > 20 minutes

    // For very long videos, only seek within first 3 minutes to ensure buffer availability
    const maxSeekTime = isVeryLongVideo ? 180 : isLongVideo ? 300 : duration;

    const timestamps = isVeryLongVideo
      ? [0.5, 5, 15, 30, 60, 120].filter((t) => t < duration && t >= 0)
      : isLongVideo
        ? [0.5, 3, 10, 30, 60, 120, 180, 240].filter((t) => t < duration && t >= 0)
        : [
            0.5,
            duration * 0.1,
            duration * 0.2,
            duration * 0.35,
            duration * 0.5,
            duration * 0.65,
            duration * 0.8,
            duration * 0.95,
          ].filter((t) => t < duration && t >= 0);

    console.log('[Thumbnail] Starting generation', {
      duration,
      isLongVideo,
      isVeryLongVideo,
      maxSeekTime,
      timestamps,
      readyState: videoElement.readyState,
      videoSize: { w: videoElement.videoWidth, h: videoElement.videoHeight },
    });

    // Early check: if video dimensions are 0 after ready, try play/pause trick
    // Some codecs (HEVC/H.265) need actual playback to initialize decoder for canvas
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.warn('[Thumbnail] videoWidth/Height is 0 at start, trying play/pause trick', {
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight,
        readyState: videoElement.readyState,
      });

      // Save original state
      const wasMuted = videoElement.muted;
      const wasPaused = videoElement.paused;

      try {
        // Trick 1: Mute + play briefly to force decoder initialization
        videoElement.muted = true;
        const playPromise = videoElement.play();
        if (playPromise) {
          await playPromise.catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 300));
        videoElement.pause();
        await new Promise((r) => setTimeout(r, 200));

        console.log('[Thumbnail] After play/pause', {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
        });
      } finally {
        videoElement.muted = wasMuted;
        if (!wasPaused) {
          videoElement.play().catch(() => {});
        }
      }

      // Trick 2: If still 0, try seeking to a small non-zero time
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        console.warn('[Thumbnail] Still 0 after play/pause, trying seek to 0.1');
        videoElement.currentTime = 0.1;
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        console.error(
          '[Thumbnail] Canvas capture not possible for this video codec. User must upload thumbnail manually.'
        );
        setCodecWarning(
          'Trình duyệt không hỗ trợ codec video của file này (ví dụ H.265/HEVC). Hệ thống sẽ tự động chuyển sang H.264 khi upload để phát được trên mọi trình duyệt. Việc này có thể mất thêm một chút thời gian.'
        );
        setIsGeneratingThumbnails(false);
        thumbnailGenStartedRef.current = false;
        // Do NOT return - let the rest of the flow continue so user can upload manually
        return;
      }
    }

    const thumbnails = [];
    const ctx = canvas.getContext('2d');
    const startTime = performance.now();

    for (let i = 0; i < timestamps.length; i++) {
      const time = Math.min(timestamps[i], maxSeekTime);
      const loopStart = performance.now();

      try {
        // Ensure video is still ready
        if (videoElement.readyState < 2) {
          console.log(`[Thumbnail] Waiting for readyState before seek to ${time}s`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Seek to timestamp
        videoElement.currentTime = time;

        // Wait for seek to complete - longer timeout for long videos
        const seekTimeout = isLongVideo ? 20000 : 8000;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Seek timeout'));
          }, seekTimeout);

          const onSeeked = () => {
            clearTimeout(timeout);
            videoElement.removeEventListener('seeked', onSeeked);
            // Small delay to ensure frame is rendered
            setTimeout(resolve, 150);
          };

          videoElement.addEventListener('seeked', onSeeked);
        });

        // Capture frame
        if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          ctx.drawImage(videoElement, 0, 0);

          const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.8);
          });

          if (blob && blob.size > 0) {
            const url = URL.createObjectURL(blob);
            thumbnails.push({ time, blob, url });
            console.log(`[Thumbnail] Captured at ${time}s`, {
              blobSize: blob.size,
              seekMs: Math.round(performance.now() - loopStart),
            });
          } else {
            console.warn(`[Thumbnail] Empty blob at ${time}s`);
          }
        } else {
          console.warn(`[Thumbnail] videoWidth/Height is 0 at ${time}s`, {
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
            readyState: videoElement.readyState,
          });
        }
      } catch (err) {
        console.warn(`[Thumbnail] Failed at ${time}s:`, err.message);
      }

      setThumbnailProgress(Math.round(((i + 1) / timestamps.length) * 100));

      // Longer pause between seeks for long videos to let video buffer
      if (i < timestamps.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, isLongVideo ? 500 : 200));
      }
    }

    const totalMs = Math.round(performance.now() - startTime);
    console.log('[Thumbnail] Generation complete', {
      totalMs,
      captured: thumbnails.length,
      of: timestamps.length,
      selectedTime: thumbnails[0]?.time ?? null,
    });

    setPreviewThumbnails(thumbnails);
    setIsGeneratingThumbnails(false);
    // Do NOT reset thumbnailGenStartedRef here — if the video element fires
    // canplay again (e.g. after a re-render or seek) we must not restart
    // generation, otherwise we get an infinite generate->render->reload loop.

    // Auto-select first thumbnail (prefer one at ~1s, not the very first frame)
    if (thumbnails.length > 0) {
      const preferredIndex = thumbnails.findIndex((t) => t.time >= 0.5) ?? 0;
      const selectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
      setSelectedThumbnailIndex(selectedIndex);
      setThumbnail(thumbnails[selectedIndex].blob);
      setThumbnailTime(thumbnails[selectedIndex].time);
    }

    // Reset video to start
    videoElement.currentTime = 0;
  }, []);

  /**
   * Capture thumbnail from video at specific time
   */
  const captureThumbnail = useCallback((time = 1) => {
    const video = videoPreviewRef.current;
    if (!video) return;

    // Set the time - this will trigger onSeeked when ready
    video.currentTime = time;
  }, []);

  /**
   * Actually capture the frame from video
   */
  const captureFrame = useCallback(() => {
    const video = videoPreviewRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Check video readiness
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('Video not ready for capture, readyState:', video.readyState);
      return;
    }

    try {
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Check if canvas has content (not blank)
      const imageData = ctx.getImageData(0, 0, 1, 1);
      const hasContent = imageData.data.some((val, idx) => idx < 3 && val > 0);

      if (!hasContent) {
        console.warn('Canvas appears blank, video frame may not be rendered yet');
        return;
      }

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            setThumbnail(blob);
            // Update custom thumbnail URL for preview
            if (customThumbnailUrl) {
              URL.revokeObjectURL(customThumbnailUrl);
            }
            setCustomThumbnailUrl(URL.createObjectURL(blob));
          } else {
            console.warn('Failed to create thumbnail blob');
          }
        },
        'image/jpeg',
        0.9
      );
    } catch (err) {
      // This can happen with cross-origin videos or certain codecs
      console.error('Failed to capture thumbnail:', err.message);
    }
  }, []);

  /**
   * Handle video metadata loaded - start generating thumbnails
   */
  const handleVideoLoadedMetadata = useCallback(() => {
    const video = videoPreviewRef.current;
    if (!video) return;

    setVideoDuration(video.duration);
  }, []);

  /**
   * Handle video can play - generate preview thumbnails
   */
  const handleVideoCanPlay = useCallback(() => {
    const video = videoPreviewRef.current;
    if (!video || thumbnailGenStartedRef.current) return;

    thumbnailGenStartedRef.current = true;
    // Start generating preview thumbnails
    generatePreviewThumbnails(video, video.duration);
  }, [generatePreviewThumbnails]);

  /**
   * Handle video seeked - capture frame (for manual slider)
   */
  const handleVideoSeeked = useCallback(() => {
    // Only capture if using manual slider (not during thumbnail generation)
    if (isGeneratingThumbnails) return;

    const video = videoPreviewRef.current;
    if (!video) return;

    // Wait for frame to be ready, with multiple attempts
    const attemptCapture = (attempts = 0) => {
      if (attempts > 15) {
        console.warn('Failed to capture thumbnail after 15 attempts');
        setIsCapturingCustom(false);
        return;
      }

      // Check if video is ready
      if (video.readyState >= 2 && video.videoWidth > 0) {
        captureFrame();
        setIsCapturingCustom(false);
      } else {
        // Retry after a short delay - increase delay for longer videos
        const delay = attempts < 5 ? 100 : attempts < 10 ? 300 : 500;
        setTimeout(() => attemptCapture(attempts + 1), delay);
      }
    };

    // Start capture attempts after a small delay
    setTimeout(() => attemptCapture(0), 100);
  }, [captureFrame, isGeneratingThumbnails]);

  /**
   * Handle video loaded data - backup capture trigger
   */
  const handleVideoLoadedData = useCallback(() => {
    // No longer needed - we use generatePreviewThumbnails instead
  }, []);

  /**
   * Effect to cleanup thumbnail URLs on unmount
   */
  useEffect(() => {
    return () => {
      // Cleanup preview thumbnail URLs
      previewThumbnails.forEach((t) => {
        if (t.url) URL.revokeObjectURL(t.url);
      });
      // Cleanup custom thumbnail URL
      if (customThumbnailUrl) {
        URL.revokeObjectURL(customThumbnailUrl);
      }
    };
  }, [previewThumbnails, customThumbnailUrl]);

  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    },
    [handleFileSelect]
  );

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  /**
   * Open file dialog
   */
  const openFileDialog = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  /**
   * Handle upload submit
   */
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (!selectedFile) {
        setValidationError('Vui lòng chọn một video để tải lên.');
        return;
      }

      await upload(selectedFile, {
        title: title.trim() || null,
        description: description.trim() || null,
        storage_provider: storageProvider,
        thumbnail: thumbnail, // Include captured thumbnail
        tags: selectedTags.map((t) => t.id), // Include selected tag IDs
      });
    },
    [selectedFile, title, description, storageProvider, thumbnail, selectedTags, upload]
  );

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    if (isInProgress) {
      cancel();
    }

    // Clean up preview URL
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setSelectedFile(null);
    setCodecWarning(null);
    setPreview(null);
    setTitle('');
    setIsTitleAutoFilled(false);
    setDescription('');
    setAiTitleResult(null);
    setAiTagsResult(null);
    setAiTitleError(null);
    setAiTagsError(null);
    setJoyCaptionText('');
    setJoyCaptionError(null);
    setAiTone('tu_nhien');
    setTitleCooldownUntil(0);
    setTitleCooldownRemaining(0);
    setTagsCooldownUntil(0);
    setTagsCooldownRemaining(0);
    setSelectedTags([]);
    setValidationError(null);
    reset();

    if (onCancel) {
      onCancel();
    }
  }, [isInProgress, cancel, preview, reset, onCancel]);

  /**
   * Handle retry
   */
  const handleRetry = useCallback(() => {
    if (selectedFile) {
      setValidationError(null);
      retry(selectedFile, {
        title: title.trim() || null,
        description: description.trim() || null,
        storage_provider: storageProvider,
        thumbnail: thumbnail,
        tags: selectedTags.map((t) => t.id),
      });
    }
  }, [selectedFile, title, description, storageProvider, thumbnail, selectedTags, retry]);

  const blobToDataUrl = useCallback(
    (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read thumbnail data.'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to convert thumbnail.'));
        reader.readAsDataURL(blob);
      }),
    []
  );

  const normalizeTagName = useCallback(
    (value) =>
      String(value || '')
        .replace(/^#/, '')
        .trim()
        .toLowerCase(),
    []
  );

  const ensureTagsAvailable = useCallback(
    async (candidateNames = []) => {
      const uniqueNames = [];
      const seen = new Set();

      candidateNames.forEach((name) => {
        const normalized = normalizeTagName(name);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        uniqueNames.push(String(name).replace(/^#/, '').trim());
      });

      if (uniqueNames.length === 0) {
        return [];
      }

      const existingByName = new Map(
        tagOptions
          .map((tag) => [normalizeTagName(tag?.name), tag])
          .filter(([name]) => Boolean(name))
      );

      const resolved = [];
      const missing = [];

      uniqueNames.forEach((rawName) => {
        const normalized = normalizeTagName(rawName);
        const existing = existingByName.get(normalized);
        if (existing) {
          resolved.push(existing);
        } else {
          missing.push(rawName);
        }
      });

      if (missing.length === 0) {
        return resolved;
      }

      const created = [];
      for (const name of missing.slice(0, 10)) {
        try {
          const resp = await axios.post('/tags/quick-create', { name });
          if (resp?.data?.success && resp?.data?.tag?.id) {
            created.push(resp.data.tag);
          }
        } catch (err) {
          console.warn('Quick create tag failed:', name, err?.message);
        }
      }

      if (created.length > 0) {
        setTagOptions((prev) => {
          const merged = [...prev];
          const seenIds = new Set(prev.map((tag) => tag.id));
          created.forEach((tag) => {
            if (!seenIds.has(tag.id)) {
              merged.push(tag);
              seenIds.add(tag.id);
            }
          });
          return merged;
        });
      }

      return [...resolved, ...created];
    },
    [normalizeTagName, tagOptions]
  );

  const handleCaptionProviderChange = useCallback(
    async (event) => {
      const nextProvider = event.target.value;
      const previousProvider = currentCaptionProvider;

      if (nextProvider === previousProvider || isSavingCaptionProvider) {
        return;
      }

      setCurrentCaptionProvider(nextProvider);
      setIsSavingCaptionProvider(true);
      setAiTitleError(null);
      setAiTagsError(null);

      try {
        await axios.post('/api/user/caption-provider', {
          provider: nextProvider,
        });
      } catch (err) {
        console.error('Failed to save caption provider preference:', err);
        setCurrentCaptionProvider(previousProvider);
        setAiTitleError('Khong the luu caption provider. Thu lai sau.');
      } finally {
        setIsSavingCaptionProvider(false);
      }
    },
    [currentCaptionProvider, isSavingCaptionProvider]
  );

  const handleGenerateJoyCaption = useCallback(async () => {
    if (isGeneratingJoyCaption || isInProgress) {
      return;
    }

    setJoyCaptionError(null);
    setIsGeneratingJoyCaption(true);

    try {
      if (!(thumbnail instanceof Blob)) {
        throw new Error('Chua co frame dai dien de tao JoyCaption. Hay chon anh bia truoc.');
      }

      const formData = new FormData();
      formData.append('file', thumbnail, 'video-frame.jpg');

      const response = await axios.post('/api/ai/generate-joycaption-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const generatedPrimary = response.data?.data?.captions?.primary;

      if (!response.data?.success || !generatedPrimary) {
        throw new Error('Khong the tao JoyCaption luc nay.');
      }

      setJoyCaptionText(generatedPrimary);
      setDescription(generatedPrimary);
    } catch (err) {
      console.error('Generate JoyCaption failed:', err);
      const responseErrors = err?.response?.data?.errors;
      const firstValidationError = responseErrors
        ? Object.values(responseErrors).flat().find(Boolean)
        : null;
      const responseMessage = err?.response?.data?.message;

      setJoyCaptionError(
        firstValidationError ||
          responseMessage ||
          err?.message ||
          'Khong the tao JoyCaption. Thu lai sau.'
      );
    } finally {
      setIsGeneratingJoyCaption(false);
    }
  }, [thumbnail, isGeneratingJoyCaption, isInProgress]);

  const collectAiThumbnailData = useCallback(async () => {
    const thumbnailBlobs = [];

    if (thumbnail instanceof Blob) {
      thumbnailBlobs.push(thumbnail);
    }

    const candidateThumbs = previewThumbnails
      .filter((item) => item?.blob instanceof Blob)
      .sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

    if (candidateThumbs.length > 0 && thumbnailBlobs.length < MAX_AI_VIDEO_THUMBNAILS) {
      const picks = [];
      const desiredCount = Math.min(MAX_AI_VIDEO_THUMBNAILS, candidateThumbs.length);

      if (desiredCount === 1) {
        picks.push(candidateThumbs[0]);
      } else {
        for (let i = 0; i < desiredCount; i++) {
          const ratio = i / (desiredCount - 1);
          const index = Math.round(ratio * (candidateThumbs.length - 1));
          picks.push(candidateThumbs[index]);
        }
      }

      for (const pick of picks) {
        const currentBlob = pick?.blob;
        if (!(currentBlob instanceof Blob)) continue;
        if (thumbnailBlobs.length >= MAX_AI_VIDEO_THUMBNAILS) break;
        if (thumbnailBlobs.includes(currentBlob)) continue;
        thumbnailBlobs.push(currentBlob);
      }
    }

    for (
      let i = 0;
      i < candidateThumbs.length && thumbnailBlobs.length < MAX_AI_VIDEO_THUMBNAILS;
      i++
    ) {
      const currentBlob = candidateThumbs[i]?.blob;
      if (!(currentBlob instanceof Blob)) continue;
      if (thumbnailBlobs.includes(currentBlob)) continue;
      thumbnailBlobs.push(currentBlob);
    }

    if (thumbnailBlobs.length === 0) {
      throw new Error('Chua co thumbnail de phan tich AI.');
    }

    const limitedBlobs = thumbnailBlobs.slice(0, MAX_AI_VIDEO_THUMBNAILS);
    return Promise.all(limitedBlobs.map(blobToDataUrl));
  }, [MAX_AI_VIDEO_THUMBNAILS, blobToDataUrl, previewThumbnails, thumbnail]);

  const requestVideoAiIntent = useCallback(
    async (intent) => {
      const thumbnails = await collectAiThumbnailData();
      const requestData = new FormData();

      requestData.append('media_type', 'video');
      requestData.append('video_ai_intent', intent);
      requestData.append('tone', aiTone);

      if (title.trim()) {
        requestData.append('title', title.trim());
      }

      if (description.trim()) {
        requestData.append('description', description.trim());
      }

      thumbnails.forEach((thumb, index) => {
        requestData.append(`thumbnails[${index}]`, thumb);
      });

      const response = await axios.post('/api/ai/analyze', requestData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'AI generation failed.');
      }

      return response.data?.data || {};
    },
    [aiTone, collectAiThumbnailData, description, title]
  );

  const handleGenerateAITitle = useCallback(async () => {
    if (isGeneratingTitle || isInProgress) return;

    const now = Date.now();
    if (titleCooldownUntil > now) {
      const secondsLeft = Math.ceil((titleCooldownUntil - now) / 1000);
      setAiTitleError(`Vui long doi ${secondsLeft}s truoc khi generate lai title.`);
      return;
    }

    setAiTitleError(null);
    setIsGeneratingTitle(true);

    try {
      const payload = await requestVideoAiIntent('title');
      setAiTitleResult(payload);

      const suggestedTitle =
        Array.isArray(payload.title_options) && payload.title_options.length > 0
          ? payload.title_options[0]
          : payload.title;

      if (suggestedTitle) {
        setTitle(suggestedTitle);
        setIsTitleAutoFilled(false);
      }
    } catch (err) {
      setAiTitleError(err?.message || 'Khong the tao title AI.');
    } finally {
      setTitleCooldownUntil(Date.now() + 10000);
      setIsGeneratingTitle(false);
    }
  }, [isGeneratingTitle, isInProgress, requestVideoAiIntent, titleCooldownUntil]);

  const handleGenerateAITags = useCallback(async () => {
    if (isGeneratingTags || isInProgress) return;

    const now = Date.now();
    if (tagsCooldownUntil > now) {
      const secondsLeft = Math.ceil((tagsCooldownUntil - now) / 1000);
      setAiTagsError(`Vui long doi ${secondsLeft}s truoc khi generate lai tags.`);
      return;
    }

    setAiTagsError(null);
    setIsGeneratingTags(true);

    try {
      const payload = await requestVideoAiIntent('tags');
      setAiTagsResult(payload);

      const candidateTagNames = [
        ...(Array.isArray(payload.tags) ? payload.tags : []),
        ...(Array.isArray(payload.hashtags?.core) && payload.hashtags.core.length > 0
          ? payload.hashtags.core
          : Array.isArray(payload.hashtags?.all)
            ? payload.hashtags.all
            : []),
      ];

      if (candidateTagNames.length > 0) {
        const ensuredTags = await ensureTagsAvailable(candidateTagNames);
        if (ensuredTags.length > 0) {
          setSelectedTags((prev) => {
            const currentIds = new Set(prev.map((t) => t.id));
            const merged = [...prev];
            ensuredTags.forEach((tag) => {
              if (!currentIds.has(tag.id)) {
                merged.push(tag);
                currentIds.add(tag.id);
              }
            });
            return merged;
          });
        }
      }
    } catch (err) {
      setAiTagsError(err?.message || 'Khong the tao tags AI.');
    } finally {
      setTagsCooldownUntil(Date.now() + 10000);
      setIsGeneratingTags(false);
    }
  }, [
    ensureTagsAvailable,
    isGeneratingTags,
    isInProgress,
    requestVideoAiIntent,
    tagsCooldownUntil,
  ]);

  useEffect(() => {
    if (!titleCooldownUntil) {
      setTitleCooldownRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const diffMs = titleCooldownUntil - Date.now();
      setTitleCooldownRemaining(diffMs > 0 ? Math.ceil(diffMs / 1000) : 0);
    };

    updateRemaining();
    if (titleCooldownUntil <= Date.now()) {
      return;
    }

    const timer = setInterval(updateRemaining, 500);
    return () => clearInterval(timer);
  }, [titleCooldownUntil]);

  useEffect(() => {
    if (!tagsCooldownUntil) {
      setTagsCooldownRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const diffMs = tagsCooldownUntil - Date.now();
      setTagsCooldownRemaining(diffMs > 0 ? Math.ceil(diffMs / 1000) : 0);
    };

    updateRemaining();
    if (tagsCooldownUntil <= Date.now()) {
      return;
    }

    const timer = setInterval(updateRemaining, 500);
    return () => clearInterval(timer);
  }, [tagsCooldownUntil]);

  /**
   * Format file size
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * Format duration
   */
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Build accept string for file input
  const acceptString = SUPPORTED_VIDEO_FORMATS.map((ext) => `.${ext}`).join(',') + ',video/*';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptString}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={isInProgress}
      />

      {isSuccess && video ? (
        /* Success Message */
        <div className="p-6 text-center space-y-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Tải lên thành công!
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Video "{video.title || selectedFile?.name}" đã được tải lên hệ thống.
            </p>
            {video.storage_driver === 'google_drive' && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center justify-center gap-1">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Google Drive đang xử lý video, có thể mất 1-2 phút để phát được.
              </p>
            )}
          </div>

          {/* Action buttons after success */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                // Reload the page to get fresh quota info and reset all component states completely
                window.location.reload();
              }}
              className="w-full sm:w-auto"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload thêm video
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.visit(`/shorts/${video.id}`)}
              className="w-full sm:w-auto"
            >
              Xem video
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.visit('/shorts')}
              className="w-full sm:w-auto"
            >
              Về trang Shorts
            </Button>
          </div>
        </div>
      ) : (
        /* Upload Form */
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Dropzone / Preview Area */}
          {!selectedFile ? (
          /* Dropzone */
          <div
            onClick={openFileDialog}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`
              relative p-8 border-2 border-dashed rounded-xl text-center cursor-pointer
              transition-all duration-300 ease-in-out
              ${
                isDragActive
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.02]'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:border-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }
            `}
          >
            {/* Icon */}
            <div
              className={`
              w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center
              transition-transform duration-300
              ${
                isDragActive
                  ? 'bg-primary-100 dark:bg-primary-800 rotate-12 scale-110'
                  : 'bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/50 dark:to-purple-900/50'
              }
            `}
            >
              <svg
                className={`w-10 h-10 ${isDragActive ? 'text-primary-600' : 'text-primary-500'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>

            {/* Text */}
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">
              {isDragActive ? 'Thả video vào đây' : 'Kéo thả video vào đây'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">hoặc nhấp để chọn từ máy tính</p>

            {/* Meta info */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-600 rounded-full text-sm text-gray-600 dark:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Hỗ trợ: {SUPPORTED_VIDEO_FORMATS.map((f) => f.toUpperCase()).join(', ')}</span>
            </div>
          </div>
        ) : (
          /* Video Preview */
          <div className="space-y-4">
            {/* Hidden canvas for thumbnail capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Preview Container */}
            <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
              <video
                ref={videoPreviewRef}
                src={preview}
                className="w-full h-full object-contain"
                controls
                preload="auto"
                onLoadedMetadata={handleVideoLoadedMetadata}
                onLoadedData={handleVideoLoadedData}
                onCanPlay={handleVideoCanPlay}
                onSeeked={handleVideoSeeked}
              />

              {/* Remove button */}
              {!isInProgress && !isSuccess && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* File Info */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary-600 dark:text-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>

            {/* Thumbnail Preview & Selector */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ảnh bìa
              </label>

              {/* Loading state */}
              {isGeneratingThumbnails && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Đang tạo ảnh bìa... {thumbnailProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                    <div
                      className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${thumbnailProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Thumbnail grid - quick selection */}
              {previewThumbnails.length > 0 && !isGeneratingThumbnails && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Chọn một khung hình làm ảnh bìa
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {previewThumbnails.map((thumb, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setSelectedThumbnailIndex(index);
                          setThumbnail(thumb.blob);
                          setThumbnailTime(thumb.time);
                          setShowCustomSlider(false);
                        }}
                        disabled={isInProgress}
                        className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                          selectedThumbnailIndex === index && !showCustomSlider
                            ? 'border-primary-500 ring-2 ring-primary-500/30 scale-105'
                            : 'border-transparent hover:border-gray-300 dark:hover:border-gray-500'
                        }`}
                      >
                        <img
                          src={thumb.url}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Time badge */}
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                          {formatDuration(thumb.time)}
                        </span>
                        {/* Selected indicator */}
                        {selectedThumbnailIndex === index && !showCustomSlider && (
                          <div className="absolute top-1 left-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Custom time picker toggle */}
                  <button
                    type="button"
                    onClick={() => setShowCustomSlider(!showCustomSlider)}
                    disabled={isInProgress}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    {showCustomSlider ? 'Ẩn tùy chỉnh' : 'Chọn thời điểm khác'}
                  </button>

                  {/* Custom slider */}
                  {showCustomSlider && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-600 space-y-3">
                      <div className="flex items-start gap-3">
                        {/* Current thumbnail preview */}
                        <div className="w-28 h-16 rounded-lg overflow-hidden bg-black flex-shrink-0 relative">
                          {customThumbnailUrl ? (
                            <img
                              src={customThumbnailUrl}
                              alt="Custom thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : thumbnail ? (
                            <img
                              src={URL.createObjectURL(thumbnail)}
                              alt="Custom thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <svg
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                          )}
                          {isCapturingCustom && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-white animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Slider */}
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Kéo để chọn thời điểm bất kỳ
                          </p>
                          <input
                            type="range"
                            min="0"
                            max={videoDuration || 100}
                            step="0.1"
                            value={thumbnailTime}
                            onChange={(e) => {
                              const time = parseFloat(e.target.value);
                              setThumbnailTime(time);
                              setSelectedThumbnailIndex(-1); // Deselect grid thumbnails

                              // Debounce the actual capture
                              if (sliderDebounceRef.current) {
                                clearTimeout(sliderDebounceRef.current);
                              }
                              setIsCapturingCustom(true);
                              sliderDebounceRef.current = setTimeout(() => {
                                captureThumbnail(time);
                              }, 200);
                            }}
                            disabled={isInProgress}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-primary-500"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0:00</span>
                            <span className="font-medium text-primary-600 dark:text-primary-400">
                              {formatDuration(thumbnailTime)}
                            </span>
                            <span>{formatDuration(videoDuration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fallback: No thumbnails generated */}
              {!isGeneratingThumbnails && previewThumbnails.length === 0 && !thumbnail && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Không thể tạo ảnh bìa tự động. Bạn có thể tải lên ảnh thủ công hoặc để hệ thống
                    tạo sau.
                  </p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 cursor-pointer transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    Chọn ảnh bìa
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          alert('Ảnh bìa phải nhỏ hơn 5MB');
                          return;
                        }
                        setThumbnail(file);
                        const url = URL.createObjectURL(file);
                        setCustomThumbnailUrl(url);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
            </div>
          </div>
        )}

        {/* Codec Warning */}
        {codecWarning && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-amber-700 dark:text-amber-300">{codecWarning}</p>
            </div>
          </div>
        )}

        {/* Upload Error */}
        {isError && error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Upload thất bại
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
                Thử lại
              </Button>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isInProgress && (
          <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
            {/* Subtle animated gradient background */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
              <div
                className="absolute inset-0 animate-pulse"
                style={{
                  background: 'radial-gradient(circle at 20% 50%, #6366f1 0%, transparent 50%), radial-gradient(circle at 80% 50%, #a855f7 0%, transparent 50%)',
                }}
              />
            </div>

            <div className="relative">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="relative w-5 h-5">
                    <svg className="w-5 h-5 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {uploadStatusDetail || (isProcessing ? 'Đang xử lý video...' : 'Đang tải lên...')}
                  </span>
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
                  {progress}%
                </span>
              </div>

              {/* Circular + Bar combined progress */}
              <div className="flex items-center gap-4 mb-4">
                {/* Circular progress */}
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-100 dark:text-gray-700" />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="url(#progressGradient)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
                      className="transition-all duration-500 ease-out"
                    />
                    <defs>
                      <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                </div>

                {/* Linear progress with segments */}
                <div className="flex-1">
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full relative transition-all duration-300 ease-out"
                      style={{
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #6366f1 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'progressShimmer 2s linear infinite',
                      }}
                    >
                      <div className="absolute inset-0 bg-white/20" style={{ animation: 'progressPulse 1.5s ease-in-out infinite' }} />
                    </div>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {totalChunks > 1 ? `Chunk ${uploadedChunks} / ${totalChunks}` : 'Đang upload'}
                    </span>
                    {isResumedSession && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Đã khôi phục
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                  <svg className="w-4 h-4 text-primary-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">Tốc độ</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">{formatSpeed(speedBps)}</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                  <svg className="w-4 h-4 text-purple-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">Còn lại</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">{formatEta(etaSeconds)}</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                  <svg className="w-4 h-4 text-emerald-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">Auto BW</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">
                    {autoBandwidthProfile?.concurrency ?? '-'}
                  </span>
                </div>
              </div>

              {/* Bandwidth detail */}
              <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                <span className={`inline-block w-2 h-2 rounded-full ${autoBandwidthState === 'stable' ? 'bg-emerald-400' : autoBandwidthState === 'recovering' ? 'bg-amber-400' : 'bg-red-400'} animate-pulse`} />
                <span>Bandwidth {String(autoBandwidthState || 'stable').toLowerCase()}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>Chunk {autoBandwidthProfile?.chunkSizeMB ?? '-'}MB</span>
              </div>
            </div>
          </div>
        )}



        {/* Title & Description Form */}
        {selectedFile && !isSuccess && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Caption AI
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    JoyCaption tao caption, Gemini xu ly title va tags
                  </p>
                </div>

                <div className="relative shrink-0">
                  <select
                    value={currentCaptionProvider}
                    onChange={handleCaptionProviderChange}
                    disabled={isSavingCaptionProvider || isInProgress}
                    className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 pr-9 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="joycaption">JoyCaption</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                    {isSavingCaptionProvider ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Input
              label="Tiêu đề"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsTitleAutoFilled(false);
              }}
              placeholder="Nhập tiêu đề video"
              maxLength={255}
              disabled={isInProgress}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mô tả
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nhập mô tả video (tùy chọn)"
                maxLength={2000}
                rows={3}
                disabled={isInProgress}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white transition-colors duration-200 resize-none"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {description.length}/2000 ký tự
              </p>
            </div>

            <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {isJoyCaptionProvider ? 'JoyCaption + AI Metadata' : 'AI Video Tools'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isJoyCaptionProvider
                      ? 'JoyCaption dung anh bia/frame dang chon de tao caption. Title va tags AI duoc tach thanh 2 nut rieng.'
                      : 'Video chi dung cac thumbnail/frame dai dien de tao AI title hoac tags, khong gui lai file video goc.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isJoyCaptionProvider && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateJoyCaption}
                      loading={isGeneratingJoyCaption}
                      disabled={isInProgress || isGeneratingJoyCaption || !selectedFile}
                    >
                      {isGeneratingJoyCaption ? 'Dang tao JoyCaption...' : 'Generate JoyCaption'}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateAITitle}
                    loading={isGeneratingTitle}
                    disabled={
                      isInProgress ||
                      isGeneratingTitle ||
                      !selectedFile ||
                      titleCooldownRemaining > 0
                    }
                  >
                    {isGeneratingTitle
                      ? 'Dang gen title...'
                      : titleCooldownRemaining > 0
                        ? `Cooldown ${titleCooldownRemaining}s`
                        : 'Gen title'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateAITags}
                    loading={isGeneratingTags}
                    disabled={
                      isInProgress || isGeneratingTags || !selectedFile || tagsCooldownRemaining > 0
                    }
                  >
                    {isGeneratingTags
                      ? 'Dang gen tags...'
                      : tagsCooldownRemaining > 0
                        ? `Cooldown ${tagsCooldownRemaining}s`
                        : 'Gen tags'}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tone</label>
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                  disabled={isInProgress || isGeneratingTitle || isGeneratingTags}
                  className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="tu_nhien">Tu nhien</option>
                  <option value="viral">Viral</option>
                  <option value="chuyen_nghiep">Chuyen nghiep</option>
                  <option value="hai_huoc">Hai huoc</option>
                  <option value="cam_xuc">Cam xuc</option>
                  <option value="goi_cam">Goi cam</option>
                </select>
              </div>

              {aiTitleError && (
                <p className="text-xs text-red-600 dark:text-red-400">{aiTitleError}</p>
              )}

              {aiTagsError && (
                <p className="text-xs text-red-600 dark:text-red-400">{aiTagsError}</p>
              )}

              {joyCaptionError && (
                <p className="text-xs text-red-600 dark:text-red-400">{joyCaptionError}</p>
              )}

              {isJoyCaptionProvider && joyCaptionText && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900/40 rounded border border-gray-200 dark:border-gray-700 p-2">
                    {joyCaptionText}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDescription(joyCaptionText)}
                    disabled={isInProgress}
                  >
                    Apply JoyCaption
                  </Button>
                </div>
              )}

              {Array.isArray(aiTitleResult?.title_options) &&
                aiTitleResult.title_options.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Title goi y
                      {aiTitleResult?.title_angle ? ` (${aiTitleResult.title_angle})` : ''}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {aiTitleResult.title_options.map((candidate, index) => (
                        <Button
                          key={`title-option-${index}`}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setTitle(candidate)}
                          disabled={isInProgress}
                          title={(() => {
                            const row = Array.isArray(aiTitleResult?.title_scores)
                              ? aiTitleResult.title_scores[index]
                              : null;
                            return row
                              ? `score ${row.score} | clarity ${row.clarity} | hook ${row.hook} | relevance ${row.relevance}`
                              : '';
                          })()}
                        >
                          {index === 0
                            ? `Apply Title #${index + 1} (Best)`
                            : `Apply Title #${index + 1}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

              {Array.isArray(aiTagsResult?.hashtags?.all) &&
                aiTagsResult.hashtags.all.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-primary-700 dark:text-primary-300 break-words">
                      {aiTagsResult.hashtags.all.join(' ')}
                    </div>
                  </div>
                )}
            </div>

            {/* Tag Selector */}
            {tagOptions.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-md text-sm"
                    >
                      #{tag.name}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTags((prev) => prev.filter((t) => t.id !== tag.id))
                        }
                        disabled={isInProgress}
                        className="ml-1 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    const tagId = parseInt(e.target.value);
                    const tag = tagOptions.find((t) => t.id === tagId);
                    if (tag && !selectedTags.find((t) => t.id === tagId)) {
                      setSelectedTags((prev) => [...prev, tag]);
                    }
                  }}
                  disabled={isInProgress}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                >
                  <option value="">Chọn tag để thêm...</option>
                  {tagOptions
                    .filter((t) => !selectedTags.find((st) => st.id === t.id))
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Thêm tags để người xem dễ tìm thấy video của bạn
                </p>
              </div>
            )}

            {/* Storage Provider Selector */}
            {Object.keys(storageProviders).length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nơi lưu trữ
                </label>
                <select
                  value={storageProvider}
                  onChange={(e) => setStorageProvider(e.target.value)}
                  disabled={isInProgress}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                >
                  {Object.entries(storageProviders).map(([key, provider]) => (
                    <option key={key} value={key}>
                      {provider.name}
                      {provider.is_default ? ' (Mặc định)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Chọn nơi lưu trữ video của bạn
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {selectedFile && !isSuccess && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={isInProgress}>
              {isInProgress ? 'Hủy upload' : 'Hủy'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isInProgress}
              disabled={isInProgress || !selectedFile}
            >
              {isInProgress ? 'Đang tải lên...' : 'Tải lên video'}
            </Button>
          </div>
        )}
      </form>
      )}
    </div>
  );
}
