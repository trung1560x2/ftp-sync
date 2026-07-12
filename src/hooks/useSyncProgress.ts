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
  const socketRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    if (!enabled) {
      setProgress(null);
      cleanup();
      return;
    }

    let isClosed = false;

    function cleanup() {
      if (socketRef.current) {
        // Remove event handlers to prevent trigger during unmount close
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.onmessage = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }

    function startPolling() {
      if (pollingIntervalRef.current) return;
      console.log(`[useSyncProgress] WebSocket unavailable, falling back to polling for connection ${connectionId}`);
      
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
            console.error('[useSyncProgress] Polling error:', err.message);
          });
      };
      
      poll();
      pollingIntervalRef.current = setInterval(poll, 2000);
    }

    function connectWS() {
      cleanup();
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      
      console.log(`[useSyncProgress] Connecting WebSocket to ${wsUrl} for connection ${connectionId}`);
      
      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log(`[useSyncProgress] WebSocket connection established for connection ${connectionId}`);
          reconnectAttemptsRef.current = 0;
          // Subscribe to sync progress for this connection
          ws.send(JSON.stringify({ type: 'subscribe', connectionId }));
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'progress' && payload.connectionId === connectionId) {
              if (!isClosed) {
                setProgress(payload.data);
              }
            }
          } catch (err: any) {
            console.error('[useSyncProgress] WebSocket JSON parse error:', err.message);
          }
        };

        ws.onerror = (err) => {
          console.error('[useSyncProgress] WebSocket error:', err);
          // onerror triggers onclose, so we let onclose handle the fallback/reconnect
        };

        ws.onclose = () => {
          if (isClosed) return;
          
          socketRef.current = null;
          
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            const delay = 1000 * Math.pow(2, reconnectAttemptsRef.current - 1);
            console.log(`[useSyncProgress] WebSocket disconnected. Retrying reconnection in ${delay}ms (Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimeoutRef.current = setTimeout(connectWS, delay);
          } else {
            console.warn('[useSyncProgress] Max WebSocket reconnect attempts reached. Switching to polling...');
            startPolling();
          }
        };
      } catch (err: any) {
        console.error('[useSyncProgress] WebSocket failed to initialize, falling back to polling:', err.message);
        startPolling();
      }
    }

    connectWS();

    return () => {
      isClosed = true;
      cleanup();
    };
  }, [connectionId, enabled]);

  return progress;
}
