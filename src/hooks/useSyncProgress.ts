import { useState, useEffect, useRef } from 'react';

export interface UploadProgress {
  type: 'upload' | 'download';
  filename: string;
  totalBytes: number;
  bytesTransferred: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  startTime: number;
}

export interface OverallProgress {
  activeUploads: UploadProgress[];
  queueLength: number;
  totalFilesInBatch: number;
  completedFiles: number;
  filesUploaded?: number;
  filesSkipped?: number;
  filesDeleted?: number;
  filesFailed?: number;
  uploadSpeedMBps?: number;
  downloadSpeedMBps?: number;
}

export function useSyncProgress(connectionId: number, enabled: boolean) {
  const [progress, setProgress] = useState<OverallProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProgress(null);
      cleanup();
      return;
    }

    let isClosed = false;

    function cleanup() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    function startPolling() {
      if (pollingIntervalRef.current) return;
      console.log(`[useSyncProgress] Falling back to polling for connection ${connectionId}`);
      
      const poll = () => {
        fetch(`/api/sync/progress/${connectionId}`)
          .then(res => {
            if (!res.ok) throw new Error('Progress fetch failed');
            return res.json();
          })
          .then(data => {
            if (!isClosed) setProgress(data);
          })
          .catch(err => {
            console.error('[useSyncProgress] Polling error:', err);
          });
      };
      
      poll();
      pollingIntervalRef.current = setInterval(poll, 2000);
    }

    function connectSSE() {
      cleanup();
      
      console.log(`[useSyncProgress] Connecting SSE stream for connection ${connectionId}`);
      const es = new EventSource(`/api/sync/stream/${connectionId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!isClosed) {
            setProgress(data);
          }
        } catch (err) {
          console.error('[useSyncProgress] SSE parse error:', err);
        }
      };

      es.onerror = (err) => {
        console.error('[useSyncProgress] SSE stream error, falling back to polling:', err);
        es.close();
        if (!isClosed) {
          startPolling();
        }
      };
    }

    connectSSE();

    return () => {
      isClosed = true;
      cleanup();
    };
  }, [connectionId, enabled]);

  return progress;
}
