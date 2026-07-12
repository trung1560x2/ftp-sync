import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import 'xterm/css/xterm.css';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, X, Edit, FileText, Save, Copy, Clipboard, Trash2, Download } from 'lucide-react';
import Editor from '@monaco-editor/react';

interface TerminalPaneProps {
  sessionId: string;
  connectionId: number;
  isActive: boolean;
  onClose?: () => void;
  onTitleChange?: (title: string) => void;
}

const TerminalPane: React.FC<TerminalPaneProps> = ({
  sessionId,
  connectionId,
  isActive,
  onTitleChange,
}) => {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const editorInstanceRef = useRef<any>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnected = useRef(false);
  const reconnectAttempts = useRef(0);
  const isMounted = useRef(true);
  const currentSessionId = useRef(sessionId);

  const [isDragging, setIsDragging] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState<{ paths: string[]; files: File[]; remoteDir: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    transferredBytes: number;
    totalBytes: number;
    status: 'started' | 'progress' | 'completed' | 'failed';
    error?: string;
  } | null>(null);

  const dragCounter = useRef(0);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const [editorFile, setEditorFile] = useState<{
    path: string;
    name: string;
    content: string;
    isSaving: boolean;
    error: string;
    saveSuccess: boolean;
  } | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [useSudo, setUseSudo] = useState(false);

  // Initialize xterm.js terminal
  const initTerminal = useCallback(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10000,
      theme: {
        // Base colors — warm dark bg with high-contrast foreground
        background: '#121212',
        foreground: '#f8f8f2',
        cursor: '#f97316',
        cursorAccent: '#121212',
        selectionBackground: '#f9731650',
        selectionForeground: '#ffffff',
        // Standard ANSI — vivid and distinct
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        // Bright ANSI — even more vivid
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    return term;
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleUploadProgress = useCallback((msg: any) => {
    setUploadProgress({
      fileName: msg.fileName || '',
      transferredBytes: msg.transferredBytes || 0,
      totalBytes: msg.totalBytes || 0,
      status: msg.status,
      error: msg.error,
    });

    if (msg.status === 'completed' || msg.status === 'failed') {
      setTimeout(() => {
        setUploadProgress((prev) => (prev?.status === 'completed' || prev?.status === 'failed' ? null : prev));
      }, 5000);
    }
  }, []);

  // Reconnect SSH by creating a new session
  const reconnectSSH = useCallback(async () => {
    if (!isMounted.current) return;

    const attempt = reconnectAttempts.current;
    const delay = Math.min(3000 * Math.pow(2, attempt), 30000); // 3s, 6s, 12s, ..., max 30s
    reconnectAttempts.current++;

    xtermRef.current?.write(`\r\n\x1b[33m[Reconnecting in ${(delay / 1000).toFixed(0)}s... (attempt ${attempt + 1})]\x1b[0m\r\n`);

    reconnectTimer.current = setTimeout(async () => {
      if (!isMounted.current) return;

      try {
        // Create a new SSH session via REST
        const res = await fetch('/api/terminal/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId }),
        });
        const data = await res.json();

        if (data.success && data.sessionId) {
          currentSessionId.current = data.sessionId;
          xtermRef.current?.write('\r\n\x1b[32m[New session created, connecting...]\x1b[0m\r\n');

          // Close old WS and reconnect with new session
          const oldWs = wsRef.current;
          if (oldWs) {
            oldWs.onclose = null;
            oldWs.onmessage = null;
            try { oldWs.close(); } catch { /* ignore */ }
            wsRef.current = null;
          }

          connectWS();
        } else {
          xtermRef.current?.write(`\r\n\x1b[31m[Failed to create session: ${data.message || 'Unknown error'}]\x1b[0m\r\n`);
          // Retry again
          reconnectSSH();
        }
      } catch (err: any) {
        xtermRef.current?.write(`\r\n\x1b[31m[Reconnect failed: ${err.message}]\x1b[0m\r\n`);
        // Retry again
        reconnectSSH();
      }
    }, delay);
  }, [connectionId]);

  // Connect WebSocket and stream SSH data
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Clear terminal before requesting the session to prevent double-printing history on reconnect
      xtermRef.current?.reset();

      // Request SSH session (use currentSessionId for reconnect support)
      ws.send(JSON.stringify({
        type: 'terminal:open',
        connectionId,
        sessionId: currentSessionId.current,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const raw = event.data as string;

        // Fast-path: shell output uses prefix protocol  "O:<sessionId>:<data>"
        if (raw.charCodeAt(0) === 79 /* 'O' */ && raw.charCodeAt(1) === 58 /* ':' */) {
          const secondColon = raw.indexOf(':', 2);
          if (secondColon !== -1) {
            const msgSessionId = raw.substring(2, secondColon);
            if (msgSessionId === currentSessionId.current && xtermRef.current) {
              xtermRef.current.write(raw.substring(secondColon + 1));
            }
          }
          return;
        }

        const msg = JSON.parse(raw);

        switch (msg.type) {

          case 'terminal:connected':
            if (msg.sessionId === currentSessionId.current) {
              isConnected.current = true;
              reconnectAttempts.current = 0; // Reset backoff on successful connection
              onTitleChange?.(msg.connectionName || 'Terminal');
            }
            break;

          case 'terminal:closed':
            if (msg.sessionId === currentSessionId.current) {
              isConnected.current = false;
              xtermRef.current?.write('\r\n\x1b[33m[SSH connection lost]\x1b[0m');
              // Auto-reconnect SSH
              reconnectSSH();
            }
            break;

          case 'terminal:error':
            if (msg.sessionId === currentSessionId.current || msg.sessionId === sessionId) {
              const isSessionExpired = msg.error?.includes('expired') || msg.error?.includes('not found');
              xtermRef.current?.write(`\r\n\x1b[31m[Error: ${msg.error}]\x1b[0m`);
              if (isSessionExpired) {
                // Session gone — create a new one
                isConnected.current = false;
                reconnectSSH();
              }
            }
            break;

          case 'terminal:upload-progress':
            if (msg.sessionId === currentSessionId.current || msg.sessionId === sessionId) {
              handleUploadProgress(msg);
            }
            break;
        }
      } catch {
        // Ignore non-JSON messages (sync progress etc.)
      }
    };

    ws.onclose = () => {
      isConnected.current = false;
      // Auto-reconnect after 3s if terminal is still mounted
      reconnectTimer.current = setTimeout(() => {
        if (termRef.current) {
          xtermRef.current?.write('\r\n\x1b[33m[Reconnecting...]\x1b[0m\r\n');
          connectWS();
        }
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [connectionId, onTitleChange, handleUploadProgress, reconnectSSH]);

  const startUpload = async () => {
    if (!confirmUpload) return;
    const { paths, files, remoteDir } = confirmUpload;
    setConfirmUpload(null);

    setUploadProgress({
      fileName: 'Initializing...',
      transferredBytes: 0,
      totalBytes: 0,
      status: 'started',
    });

    try {
      let res: Response;

      if (paths.length > 0) {
        // Electron mode: send local absolute paths
        res = await fetch(`/api/terminal/sessions/${currentSessionId.current}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, remoteDir }),
        });
      } else {
        // Browser mode: upload files via FormData
        const formData = new FormData();
        formData.append('remoteDir', remoteDir);
        files.forEach((f) => formData.append('files', f));
        res = await fetch(`/api/terminal/sessions/${currentSessionId.current}/upload-files`, {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();
      if (!data.success) {
        setUploadProgress({
          fileName: '',
          transferredBytes: 0,
          totalBytes: 0,
          status: 'failed',
          error: data.message || 'Failed to start upload',
        });
      }
    } catch (err: any) {
      setUploadProgress({
        fileName: '',
        transferredBytes: 0,
        totalBytes: 0,
        status: 'failed',
        error: err.message,
      });
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    // Electron provides file.path; browser does not
    const fileArr = Array.from(droppedFiles);
    const paths = fileArr
      .map((f: any) => f.path)
      .filter(Boolean) as string[];

    // Fetch the remote CWD of the terminal
    fetch(`/api/terminal/sessions/${currentSessionId.current}/cwd`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfirmUpload({ paths, files: fileArr, remoteDir: data.cwd });
        } else {
          console.error('Failed to get remote CWD:', data.message);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch remote CWD:', err);
      });
  };

  const getLanguageFromExtension = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'php':
        return 'php';
      case 'py':
        return 'python';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'sql':
        return 'sql';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'xml':
        return 'xml';
      default:
        return 'plaintext';
    }
  };

  const handleCopy = useCallback(() => {
    const selection = xtermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
    setContextMenu(null);
  }, []);

  const handlePaste = useCallback(async () => {
    setContextMenu(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        // Normalize line endings to carriage return (\r) to avoid double spacing in the remote PTY
        const normalizedText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
        // Use fast-path prefix protocol
        wsRef.current.send(`D:${currentSessionId.current}:${normalizedText}`);
      }
    } catch (err) {
      const error = err as Error;
      console.error('[Terminal Paste] Failed to read clipboard:', error.message);
    }
    // Re-focus terminal after paste so user doesn't need to click back
    setTimeout(() => xtermRef.current?.focus(), 10);
  }, []);

  const handleClearTerminal = useCallback(() => {
    setContextMenu(null);
    xtermRef.current?.reset();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Fast-path prefix protocol
      wsRef.current.send(`D:${currentSessionId.current}:\x0c`); // Ctrl+L to clear remote screen
    }
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selectedText = xtermRef.current?.getSelection().trim() || '';
    
    // Find local coordinates relative to the terminal element
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setContextMenu({ x, y, selectedText });
  };

  // Close context menu when clicking anywhere else
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleDownloadFile = useCallback(async (filePathOrSelected?: string) => {
    const filePath = filePathOrSelected || contextMenu?.selectedText;
    setContextMenu(null);
    if (!filePath) return;

    try {
      // Resolve relative path via CWD
      const cwdRes = await fetch(`/api/terminal/sessions/${currentSessionId.current}/cwd`);
      const cwdData = await cwdRes.json();
      if (!cwdData.success) throw new Error(cwdData.message || 'Failed to get remote CWD');
      const cwd = cwdData.cwd;

      let remotePath = filePath;
      if (!remotePath.startsWith('/')) {
        remotePath = cwd.endsWith('/') ? cwd + remotePath : cwd + '/' + remotePath;
      }

      // Trigger browser download via hidden anchor
      const url = `/api/terminal/sessions/${currentSessionId.current}/download?path=${encodeURIComponent(remotePath)}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = remotePath.split('/').pop() || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('[Terminal Download] Error:', err.message);
      xtermRef.current?.write(`\r\n\x1b[31m[Download Error: ${err.message}]\x1b[0m\r\n`);
    }
  }, [contextMenu]);

  const handleOpenFile = useCallback(async (filePathInput?: string, useSudoInput?: boolean) => {
    const filePath = filePathInput || contextMenu?.selectedText;
    setContextMenu(null);
    if (!filePath) return;
    setLoadingFile(filePath);

    try {
      const cwdRes = await fetch(`/api/terminal/sessions/${currentSessionId.current}/cwd`);
      const cwdData = await cwdRes.json();
      if (!cwdData.success) throw new Error(cwdData.message || 'Failed to get remote CWD');
      const cwd = cwdData.cwd;

      let remotePath = filePath;
      if (!remotePath.startsWith('/')) {
        remotePath = cwd.endsWith('/') ? cwd + remotePath : cwd + '/' + remotePath;
      }

      const fileRes = await fetch(`/api/terminal/sessions/${currentSessionId.current}/file?path=${encodeURIComponent(remotePath)}&useSudo=${!!useSudoInput}`);
      const fileData = await fileRes.json();
      if (!fileData.success) throw new Error(fileData.message || 'Failed to load file');

      setEditorFile({
        path: remotePath,
        name: remotePath.split('/').pop() || 'file',
        content: fileData.content,
        isSaving: false,
        error: '',
        saveSuccess: false,
      });
    } catch (err: any) {
      console.error('[Terminal Open File] Error:', err.message);
      xtermRef.current?.write(`\r\n\x1b[31m[Open File Error: ${err.message}]\x1b[0m\r\n`);
    } finally {
      setLoadingFile(null);
    }
  }, [contextMenu]);

  const handleEditFile = async () => {
    if (!contextMenu) return;
    const { selectedText } = contextMenu;
    setContextMenu(null);
    setLoadingFile(selectedText);

    try {
      // 1. Fetch remote working directory to resolve relative paths
      const cwdRes = await fetch(`/api/terminal/sessions/${currentSessionId.current}/cwd`);
      const cwdData = await cwdRes.json();
      if (!cwdData.success) throw new Error(cwdData.message || 'Failed to get remote CWD');
      const cwd = cwdData.cwd;

      // 2. Resolve absolute path
      let remotePath = selectedText;
      if (!remotePath.startsWith('/')) {
        remotePath = cwd.endsWith('/') ? cwd + remotePath : cwd + '/' + remotePath;
      }

      // 3. Fetch file content
      const fileRes = await fetch(`/api/terminal/sessions/${currentSessionId.current}/file?path=${encodeURIComponent(remotePath)}`);
      const fileData = await fileRes.json();
      if (!fileData.success) throw new Error(fileData.message || 'Failed to download file');

      setEditorFile({
        path: remotePath,
        name: remotePath.split('/').pop() || 'file',
        content: fileData.content,
        isSaving: false,
        error: '',
        saveSuccess: false
      });
    } catch (err: any) {
      console.error('[Terminal Editor] Load error:', err.message);
      // Print error directly to terminal for feedback
      xtermRef.current?.write(`\r\n\x1b[31m[Inline Editor Error: ${err.message}]\x1b[0m\r\n`);
    } finally {
      setLoadingFile(null);
    }
  };

  const handleSaveFile = async (content: string) => {
    if (!editorFile) return;
    setEditorFile(prev => prev ? { ...prev, isSaving: true, error: '', saveSuccess: false } : null);

    try {
      const res = await fetch(`/api/terminal/sessions/${currentSessionId.current}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: editorFile.path,
          content,
          useSudo,
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to save file');

      setEditorFile(prev => prev ? { ...prev, isSaving: false, saveSuccess: true, content } : null);
      
      // Auto clear success indicator
      setTimeout(() => {
        setEditorFile(prev => prev ? { ...prev, saveSuccess: false } : null);
      }, 3000);
    } catch (err: any) {
      setEditorFile(prev => prev ? { ...prev, isSaving: false, error: err.message } : null);
    }
  };

  // Listen for toolbar open-file events from TerminalView
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId: targetSessionId, remotePath, useSudo: eventUseSudo } = (e as CustomEvent).detail;
      if (targetSessionId === currentSessionId.current) {
        setUseSudo(!!eventUseSudo);
        handleOpenFile(remotePath, !!eventUseSudo);
      }
    };
    window.addEventListener('terminal:open-file', handler);
    return () => window.removeEventListener('terminal:open-file', handler);
  }, [handleOpenFile]);

  // Setup terminal and connect
  useEffect(() => {
    const term = initTerminal();
    if (!term) return;

    // Forward keystrokes to WebSocket using fast-path prefix protocol
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(`D:${currentSessionId.current}:${data}`);
      }
    });

    // Auto-copy on selection
    term.onSelectionChange(() => {
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    });

    // Attach keyboard event handler for copy/paste shortcuts
    term.attachCustomKeyEventHandler((e) => {
      // Ctrl+Shift+C -> Copy
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        if (e.type === 'keydown') {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
          }
        }
        e.preventDefault();
        return false;
      }
      
      // Ctrl+V or Ctrl+Shift+V -> Paste (native Ctrl+V support)
      if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        if (e.type === 'keydown') {
          handlePaste();
        }
        e.preventDefault();
        return false;
      }

      return true;
    });

    // Connect WebSocket
    connectWS();

    // Cleanup: close only the WebSocket, NOT the SSH session. The server detaches
    // and keeps the session alive for reattach (tab switch / page reload); explicit
    // termination happens via DELETE /api/terminal/sessions when a tab is closed.
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // don't trigger auto-reconnect after unmount
        ws.onmessage = null;
        try { ws.close(); } catch { /* CONNECTING state close is still fine */ }
        wsRef.current = null;
      }
      xtermRef.current?.dispose();
      xtermRef.current = null;
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resize
  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = xtermRef.current;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'terminal:resize',
              sessionId: currentSessionId.current,
              cols,
              rows,
            }));
          }
        } catch {
          // Ignore fit errors during transitions
        }
      }
    };

    // Fit on activation
    setTimeout(handleResize, 50);

    const observer = new ResizeObserver(handleResize);
    if (termRef.current) observer.observe(termRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [isActive, sessionId]);

  // Focus terminal when pane becomes active
  useEffect(() => {
    if (isActive && xtermRef.current) {
      setTimeout(() => xtermRef.current?.focus(), 50);
    }
  }, [isActive]);

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#121212]"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {/* xterm.js container */}
      <div
        ref={termRef}
        className="w-full h-full"
        style={{ padding: '4px' }}
      />

      {/* Custom Context Menu */}
      {contextMenu && (() => {
        const fileRegex = /^[\w./-]+\.[a-zA-Z0-9]+$/;
        const isFile = fileRegex.test(contextMenu.selectedText);
        return (
          <div
            className="absolute bg-neutral-900 border border-neutral-800 backdrop-blur-md rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.selectedText && (
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <Copy size={12} />
                Copy
              </button>
            )}
            <button
              onClick={handlePaste}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
            >
              <Clipboard size={12} />
              Paste
            </button>
            <button
              onClick={handleClearTerminal}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
            >
              <Trash2 size={12} />
              Clear Terminal
            </button>
            {isFile && (
              <>
                <button
                  onClick={() => handleOpenFile()}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors border-t border-neutral-800/40"
                >
                  <Edit size={12} />
                  Open File
                </button>
                <button
                  onClick={() => handleDownloadFile()}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
                >
                  <Download size={12} />
                  Download File
                </button>
              </>
            )}
            <button
              onClick={() => setContextMenu(null)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors border-t border-neutral-800/40"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        );
      })()}

      {/* Loading File Overlay */}
      {loadingFile && (
        <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm z-40 flex flex-col items-center justify-center gap-3">
          <Loader2 className="text-orange-500 animate-spin" size={32} />
          <p className="text-xs font-mono text-neutral-400">Loading {loadingFile}...</p>
        </div>
      )}

      {/* Inline Monaco Editor Modal */}
      {editorFile && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex flex-col p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950/50">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-orange-500 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-mono font-bold text-neutral-200 truncate block">
                    {editorFile.name}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-500 truncate block mt-0.5" title={editorFile.path}>
                    {editorFile.path}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditorFile(null)}
                className="text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Editor Container */}
            <div className="flex-1 relative bg-neutral-950">
              <Editor
                height="100%"
                language={getLanguageFromExtension(editorFile.name)}
                theme="vs-dark"
                value={editorFile.content}
                onMount={(editor, monaco) => {
                  editorInstanceRef.current = editor;
                  // Bind Ctrl + S to save
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    handleSaveFile(editor.getValue());
                  });
                }}
                options={{
                  fontSize: 12,
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  minimap: { enabled: false },
                  automaticLayout: true,
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                }}
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800 bg-neutral-950/50">
              <div className="flex items-center gap-2 min-w-0">
                {editorFile.isSaving && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-orange-400">
                    <Loader2 size={12} className="animate-spin" />
                    Saving...
                  </span>
                )}
                {editorFile.saveSuccess && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 animate-fade-in">
                    <CheckCircle2 size={12} />
                    Saved successfully!
                  </span>
                )}
                {editorFile.error && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-rose-400 truncate max-w-xs" title={editorFile.error}>
                    <AlertCircle size={12} />
                    {editorFile.error}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <label className="flex items-center gap-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 cursor-pointer select-none mr-2">
                  <input
                    type="checkbox"
                    checked={useSudo}
                    onChange={(e) => setUseSudo(e.target.checked)}
                    className="accent-orange-500 rounded bg-neutral-950 border-neutral-800 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-orange-500 font-bold uppercase tracking-wider">SUDO</span>
                </label>
                <button
                  onClick={() => setEditorFile(null)}
                  className="px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700 rounded transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleDownloadFile(editorFile.path)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-300 hover:text-neutral-100 border border-neutral-800 hover:border-neutral-600 rounded transition-colors"
                  title="Download this file"
                >
                  <Download size={12} />
                  Download
                </button>
                <button
                  onClick={() => {
                    if (editorInstanceRef.current) {
                      handleSaveFile(editorInstanceRef.current.getValue());
                    }
                  }}
                  disabled={editorFile.isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-bold uppercase bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={12} />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-orange-600/10 border-2 border-dashed border-orange-500/50 backdrop-blur-sm z-40 flex flex-col items-center justify-center pointer-events-none transition-all duration-300">
          <div className="p-6 bg-neutral-900/90 border border-neutral-800 rounded-2xl flex flex-col items-center gap-3 shadow-2xl scale-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-orange-500/10 rounded-full border border-orange-500/20 text-orange-500 animate-pulse">
              <UploadCloud size={32} />
            </div>
            <div className="text-center">
              <p className="text-sm font-mono font-bold uppercase tracking-wider text-orange-400">
                Drop Files to Upload
              </p>
              <p className="text-[10px] font-mono text-neutral-500 mt-1">
                Tải trực tiếp vào thư mục hiện tại của SSH shell
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmUpload && (
        <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 bg-neutral-900/50">
              <UploadCloud size={14} className="text-orange-500" />
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-300">
                Confirm File Upload
              </span>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[300px]">
              <div>
                <span className="text-[10px] font-mono text-neutral-500 uppercase">Target Server Directory</span>
                <div className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs text-orange-400 break-all select-all mt-1">
                  {confirmUpload.remoteDir}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-mono text-neutral-500 uppercase">Files to Upload ({confirmUpload.paths.length > 0 ? confirmUpload.paths.length : confirmUpload.files.length})</span>
                <div className="mt-1 space-y-1 max-h-[150px] overflow-y-auto pr-1">
                  {confirmUpload.paths.length > 0
                    ? confirmUpload.paths.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-mono text-neutral-400 bg-neutral-950/50 px-2 py-1 border border-neutral-800/40 rounded">
                          <span className="truncate max-w-[280px]" title={p}>{p.split('\\').pop()?.split('/').pop()}</span>
                          <span className="text-[10px] text-neutral-600">Local File</span>
                        </div>
                      ))
                    : confirmUpload.files.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs font-mono text-neutral-400 bg-neutral-950/50 px-2 py-1 border border-neutral-800/40 rounded">
                          <span className="truncate max-w-[280px]" title={f.name}>{f.name}</span>
                          <span className="text-[10px] text-neutral-600">{(f.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-900/50">
              <button
                onClick={() => setConfirmUpload(null)}
                className="px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startUpload}
                className="px-4 py-1.5 text-xs font-mono font-bold uppercase bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded transition-colors"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Progress Panel */}
      {uploadProgress && (
        <div className="absolute bottom-4 right-4 w-72 bg-neutral-900/95 border border-neutral-800 backdrop-blur-md rounded-xl shadow-2xl z-40 overflow-hidden flex flex-col p-4 gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {uploadProgress.status === 'completed' && <CheckCircle2 size={14} className="text-emerald-500" />}
              {uploadProgress.status === 'failed' && <AlertCircle size={14} className="text-rose-500" />}
              {(uploadProgress.status === 'started' || uploadProgress.status === 'progress') && (
                <Loader2 size={14} className="text-orange-500 animate-spin" />
              )}
              <span className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider">
                {uploadProgress.status === 'completed' && 'Upload Finished'}
                {uploadProgress.status === 'failed' && 'Upload Failed'}
                {(uploadProgress.status === 'started' || uploadProgress.status === 'progress') && 'Uploading File...'}
              </span>
            </div>
            {uploadProgress.status === 'completed' || uploadProgress.status === 'failed' ? (
              <button onClick={() => setUploadProgress(null)} className="text-neutral-500 hover:text-neutral-300">
                <X size={12} />
              </button>
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-mono text-neutral-400 truncate" title={uploadProgress.fileName}>
              {uploadProgress.fileName || 'Initializing...'}
            </p>
            {uploadProgress.totalBytes > 0 && (
              <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                <span>{formatBytes(uploadProgress.transferredBytes)} / {formatBytes(uploadProgress.totalBytes)}</span>
                <span>{Math.round((uploadProgress.transferredBytes / uploadProgress.totalBytes) * 100)}%</span>
              </div>
            )}
          </div>

          {uploadProgress.totalBytes > 0 && (
            <div className="w-full h-1 bg-neutral-950 border border-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-150"
                style={{ width: `${(uploadProgress.transferredBytes / uploadProgress.totalBytes) * 100}%` }}
              />
            </div>
          )}

          {uploadProgress.error && (
            <p className="text-[10px] font-mono text-rose-400 mt-1 break-all bg-rose-950/20 border border-rose-900/30 p-2 rounded">
              {uploadProgress.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TerminalPane;
