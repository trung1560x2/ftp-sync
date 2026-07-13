import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Save, X, RotateCw, AlertTriangle, FileText, CheckCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useEditorStore, EditorTab } from '../stores/editorStore';

interface RemoteFileEditorProps {
  connectionId: number;
  remotePath: string;
  onClose: () => void;
  useSudo?: boolean;
}

const RemoteFileEditor: React.FC<RemoteFileEditorProps> = ({
  connectionId,
  remotePath,
  onClose,
  useSudo = false
}) => {
  const {
    openTabs,
    activeTab,
    openTab,
    closeTab,
    setActiveTab,
    updateTabContent,
    setTabOriginalContent,
    setTabClean
  } = useEditorStore();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [lastModifiedAt, setLastModifiedAt] = useState<{ [path: string]: string }>({});

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Open the initial path passed in props
  useEffect(() => {
    if (remotePath && connectionId) {
      openTab(connectionId, remotePath);
    }
  }, [remotePath, connectionId, openTab]);

  // Find currently active tab info
  const currentTab = openTabs.find(
    (t) => activeTab && t.connectionId === activeTab.connectionId && t.path === activeTab.path
  );

  // Load active tab content if empty
  const loadTabFile = useCallback(async (tab: EditorTab) => {
    if (tab.content || tab.originalContent) return; // already loaded
    setLoading(true);
    setError('');
    setSaveSuccess(false);

    try {
      const isMedia = isMediaFile(tab.path);
      if (isMedia) {
        // For images/media, we just mark loaded without content
        setTabOriginalContent(tab.connectionId, tab.path, 'binary_preview');
        setLoading(false);
        return;
      }

      const url = `/api/files/remote-content/${tab.connectionId}?path=${encodeURIComponent(tab.path)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load file content.');
      }
      setTabOriginalContent(tab.connectionId, tab.path, data.content || '');
      setLastModifiedAt(prev => ({ ...prev, [tab.path]: data.modifiedAt || '' }));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg || 'Lỗi tải file.');
    } finally {
      setLoading(false);
    }
  }, [setTabOriginalContent]);

  useEffect(() => {
    if (currentTab) {
      loadTabFile(currentTab);
    }
  }, [currentTab, loadTabFile]);

  // Handle Save
  const handleSave = useCallback(async (force = false) => {
    if (saving || !currentTab || isMediaFile(currentTab.path)) return;
    setSaving(true);
    setError('');
    setSaveSuccess(false);

    try {
      const tabPath = currentTab.path;
      const res = await fetch(`/api/files/remote-content/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: tabPath,
          content: currentTab.content,
          lastModifiedAt: force ? undefined : lastModifiedAt[tabPath],
          useSudo
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save file.');
      }

      setTabClean(connectionId, tabPath);
      setLastModifiedAt(prev => ({ ...prev, [tabPath]: data.modifiedAt || '' }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg || 'Lỗi lưu file.');
    } finally {
      setSaving(false);
    }
  }, [connectionId, currentTab, saving, lastModifiedAt, useSudo, setTabClean]);

  // Setup save hotkey (Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleCloseTab = (tab: EditorTab) => {
    if (tab.isDirty) {
      const confirm = window.confirm(`File "${tab.name}" có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng?`);
      if (!confirm) return;
    }
    closeTab(tab.connectionId, tab.path);
    // If no tabs left, call onClose
    if (openTabs.length <= 1) {
      onClose();
    }
  };

  // Helper functions
  const isMediaFile = (filePath: string): boolean => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'mp4', 'webm', 'mp3', 'wav'].includes(ext);
  };

  const getMediaType = (filePath: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav'].includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    return 'text';
  };

  const getLanguageFromExtension = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
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
      case 'htm':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'php':
        return 'php';
      case 'sql':
        return 'sql';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'xml':
        return 'xml';
      case 'yaml':
      case 'yml':
        return 'yaml';
      default:
        return 'plaintext';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0e12] border border-neutral-800 rounded-2xl overflow-hidden font-mono text-xs text-neutral-300">
      {/* Top Tabs Bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/80 px-2 overflow-x-auto scrollbar-none flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 py-1.5">
          {openTabs.map((tab) => {
            const isActive = activeTab && activeTab.connectionId === tab.connectionId && activeTab.path === tab.path;
            return (
              <div
                key={tab.path}
                onClick={() => setActiveTab(tab.connectionId, tab.path)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer select-none max-w-[150px] ${
                  isActive
                    ? 'bg-neutral-900 border-neutral-800 text-neutral-100 shadow-sm'
                    : 'bg-transparent border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/30'
                }`}
              >
                <FileText size={12} className={tab.isDirty ? 'text-orange-500' : 'text-neutral-500'} />
                <span className="truncate max-w-[90px]">{tab.name}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 bg-orange-500 rounded-full flex-shrink-0"></span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab);
                  }}
                  className="p-0.5 rounded-full hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2 px-2 flex-shrink-0">
          {currentTab && !isMediaFile(currentTab.path) && (
            <button
              onClick={() => handleSave()}
              disabled={saving || !currentTab.isDirty}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                currentTab.isDirty && !saving
                  ? 'bg-orange-600 hover:bg-orange-500 text-black shadow-lg shadow-orange-600/10 cursor-pointer'
                  : 'bg-neutral-900 text-neutral-600 border border-neutral-850 cursor-default'
              }`}
            >
              <Save size={12} />
              {saving ? 'Saving...' : 'Save (Ctrl+S)'}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-900 text-neutral-500 hover:text-neutral-300 rounded-lg transition-colors"
            title="Close Editor"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex-1 min-h-0 bg-neutral-950/20 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <RotateCw size={24} className="text-orange-500 animate-spin" />
            <span className="text-neutral-500 uppercase text-[10px]">Loading file from server...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center max-w-md mx-auto">
            <AlertTriangle size={32} className="text-red-500 mb-2" />
            <span className="text-neutral-200 font-bold uppercase text-[11px] mb-1">Failed to read file</span>
            <p className="text-[10px] text-neutral-500 font-mono mb-4">{error}</p>
            <button
              onClick={() => currentTab && loadTabFile(currentTab)}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-neutral-300 font-bold uppercase tracking-wider text-[10px]"
            >
              Retry Load
            </button>
          </div>
        ) : currentTab ? (
          <div className="w-full h-full flex flex-col">
            {/* File Viewer Switcher */}
            {getMediaType(currentTab.path) === 'text' ? (
              <Editor
                height="100%"
                theme="vs-dark"
                language={getLanguageFromExtension(currentTab.path)}
                value={currentTab.content}
                onChange={(val) => updateTabContent(connectionId, currentTab.path, val || '')}
                options={{
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  fontSize: 12,
                  lineHeight: 18,
                  minimap: { enabled: true },
                  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                  automaticLayout: true,
                  tabSize: 2,
                  insertSpaces: true
                }}
              />
            ) : getMediaType(currentTab.path) === 'image' ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4 bg-neutral-950 relative overflow-hidden select-none">
                <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-neutral-900/80 backdrop-blur border border-neutral-800 p-1 rounded-lg">
                  <button
                    onClick={() => setImageZoom(p => Math.max(0.2, p - 0.2))}
                    className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded"
                    title="Zoom Out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="text-[10px] text-neutral-400 w-12 text-center">{Math.round(imageZoom * 100)}%</span>
                  <button
                    onClick={() => setImageZoom(p => Math.min(3, p + 0.2))}
                    className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded"
                    title="Zoom In"
                  >
                    <ZoomIn size={13} />
                  </button>
                  <button
                    onClick={() => setImageZoom(1)}
                    className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded border-l border-neutral-800 ml-1"
                    title="Reset Zoom"
                  >
                    <Maximize2 size={13} />
                  </button>
                </div>
                <img
                  src={`/api/files/remote-preview/${connectionId}?path=${encodeURIComponent(currentTab.path)}&t=${Date.now()}`}
                  alt={currentTab.name}
                  style={{ transform: `scale(${imageZoom})`, transition: 'transform 0.15s ease' }}
                  className="max-w-full max-h-[70vh] object-contain shadow-2xl pointer-events-none rounded border border-neutral-900"
                />
              </div>
            ) : getMediaType(currentTab.path) === 'video' ? (
              <div className="flex-1 flex items-center justify-center bg-neutral-950 p-4">
                <video
                  src={`/api/files/remote-preview/${connectionId}?path=${encodeURIComponent(currentTab.path)}`}
                  controls
                  className="max-w-full max-h-[75vh] shadow-2xl rounded"
                />
              </div>
            ) : getMediaType(currentTab.path) === 'audio' ? (
              <div className="flex-1 flex items-center justify-center bg-neutral-950 p-4">
                <audio
                  src={`/api/files/remote-preview/${connectionId}?path=${encodeURIComponent(currentTab.path)}`}
                  controls
                  className="w-full max-w-md shadow-lg"
                />
              </div>
            ) : getMediaType(currentTab.path) === 'pdf' ? (
              <iframe
                src={`/api/files/remote-preview/${connectionId}?path=${encodeURIComponent(currentTab.path)}`}
                className="w-full h-full border-0 bg-neutral-900"
                title={currentTab.name}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-600">
                Unsupported file type
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-600">
            Select a file to edit
          </div>
        )}

        {/* Save success badge */}
        {saveSuccess && (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg text-[10px] font-bold shadow-lg animate-fade-in-up">
            <CheckCircle size={12} />
            <span>FILE SAVED SUCCESSFULLY</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemoteFileEditor;
