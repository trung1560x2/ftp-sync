import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder,
  File,
  ChevronRight,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Loader2,
  Download,
  Edit,
  Trash2,
  Copy,
  X,
  MoreVertical,
  Eye,
  EyeOff,
  AlertCircle,
  Search,
  Database,
} from 'lucide-react';

interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  permissions: string;
}

interface SftpFileBrowserProps {
  sessionId: string;
  connectionId?: number;
  onOpenFile?: (remotePath: string, useSudo?: boolean) => void;
  onDownloadFile?: (remotePath: string) => void;
}

const SftpFileBrowser: React.FC<SftpFileBrowserProps> = ({
  sessionId,
  connectionId,
  onOpenFile,
  onDownloadFile,
}) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileItem;
    fullPath: string;
  } | null>(null);

  // New folder state
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderLoading, setNewFolderLoading] = useState(false);

  // Rename state
  const [renaming, setRenaming] = useState<{ item: FileItem; fullPath: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ item: FileItem; fullPath: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Drag & drop upload
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const dragCounter = useRef(0);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchContent, setSearchContent] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [targetDirectory, setTargetDirectory] = useState('/');

  const containerRef = useRef<HTMLDivElement>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const joinPath = (base: string, name: string): string => {
    return base.endsWith('/') ? base + name : base + '/' + name;
  };

  // Fetch directory listing
  const fetchDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/ls?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to list directory');
      setItems(data.items || []);
      setCurrentPath(data.path || dirPath);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
      return false;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Fetch target directory configuration
  useEffect(() => {
    if (!connectionId) return;
    fetch(`/api/ftp-connections`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const conn = data.find((c: { id: number; target_directory?: string }) => c.id === connectionId);
          if (conn && conn.target_directory) {
            setTargetDirectory(conn.target_directory);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch connection config', err));
  }, [connectionId]);

  // Initial load — start from home/CWD
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const res = await fetch(`/api/terminal/sessions/${sessionId}/cwd`);
        const data = await res.json();
        if (data.success && data.cwd) {
          fetchDir(data.cwd);
        } else {
          fetchDir('/');
        }
      } catch {
        fetchDir('/');
      }
    };
    loadInitial();
  }, [sessionId, fetchDir]);

  // Navigate to directory
  const navigateTo = (dirPath: string) => {
    return fetchDir(dirPath);
  };

  // Go up one level
  const goUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    navigateTo(parent);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !connectionId) return;
    setSearchLoading(true);
    setError('');
    setIsSearching(true);
    try {
      const res = await fetch(`/api/files/search/${connectionId}?q=${encodeURIComponent(searchQuery.trim())}&content=${searchContent}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to search files');
      
      const mappedResults: FileItem[] = (data.results || []).map((r: { relPath: string; isDirectory: number | boolean; size?: number; modifiedAt?: string }) => ({
        name: r.relPath,
        isDirectory: r.isDirectory === 1 || r.isDirectory === true,
        size: r.size || 0,
        modifiedAt: r.modifiedAt || '',
        permissions: ''
      }));
      setSearchResults(mappedResults);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleReindex = async () => {
    if (!connectionId) return;
    setReindexing(true);
    setError('');
    try {
      const res = await fetch(`/api/files/search/reindex/${connectionId}`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to reindex files');
      alert(`Đã lập chỉ mục xong ${data.count} file remote!`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReindexing(false);
    }
  };

  const clearSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Double-click handler
  const handleDoubleClick = (item: FileItem) => {
    if (isSearching) {
      const fullPath = targetDirectory.endsWith('/') 
        ? targetDirectory + item.name 
        : targetDirectory + '/' + item.name;
      if (item.isDirectory) {
        navigateTo(fullPath);
        clearSearch();
      } else {
        onOpenFile?.(fullPath);
      }
      return;
    }

    const fullPath = joinPath(currentPath, item.name);
    if (item.isDirectory) {
      navigateTo(fullPath);
    } else {
      onOpenFile?.(fullPath);
    }
  };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Estimate context menu size for boundary checks
    const menuWidth = 160;
    const menuHeight = item.isDirectory ? 150 : 180;

    let x = rawX;
    // Shift menu left if it would clip off the right edge
    if (x + menuWidth > rect.width) {
      x = Math.max(8, rect.width - menuWidth - 8);
    }

    let y = rawY;
    // Shift menu up if it would clip off the bottom edge
    if (y + menuHeight > rect.height) {
      y = Math.max(8, rect.height - menuHeight - 8);
    }

    setContextMenu({ x, y, item, fullPath: joinPath(currentPath, item.name) });
  };

  // Close context menu on click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setNewFolderLoading(true);
    try {
      const fullPath = joinPath(currentPath, newFolderName.trim());
      const res = await fetch(`/api/terminal/sessions/${sessionId}/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setShowNewFolder(false);
      setNewFolderName('');
      fetchDir(currentPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNewFolderLoading(false);
    }
  };

  // Rename
  const handleRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    try {
      const newPath = joinPath(currentPath, renameValue.trim());
      const res = await fetch(`/api/terminal/sessions/${sessionId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: renaming.fullPath, newPath }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setRenaming(null);
      setRenameValue('');
      fetchDir(currentPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      const endpoint = deleteConfirm.item.isDirectory ? 'rmdir' : 'rm';
      const res = await fetch(
        `/api/terminal/sessions/${sessionId}/${endpoint}?path=${encodeURIComponent(deleteConfirm.fullPath)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setDeleteConfirm(null);
      fetchDir(currentPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Copy path to clipboard
  const handleCopyPath = (fullPath: string) => {
    navigator.clipboard.writeText(fullPath);
    setContextMenu(null);
  };

  // Drag & drop upload
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    setUploadProgress(`Uploading ${files.length} file(s)...`);
    try {
      const formData = new FormData();
      formData.append('remoteDir', currentPath);
      Array.from(files).forEach((f) => formData.append('files', f));

      const res = await fetch(`/api/terminal/sessions/${sessionId}/upload-files`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // Wait a moment for upload to complete then refresh
      setTimeout(() => {
        fetchDir(currentPath);
        setUploadProgress(null);
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setUploadProgress(null);
    }
  };

  // Filter items (always exclude Unix relative path entries '.' and '..')
  const filteredItems = items
    .filter((i) => i.name !== '.' && i.name !== '..')
    .filter((i) => showHidden || !i.name.startsWith('.'));

  const displayItems = isSearching ? searchResults : filteredItems;

  // Breadcrumb segments
  const pathSegments = currentPath.split('/').filter(Boolean);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-neutral-950 text-neutral-300 select-none relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header — Breadcrumb + Actions */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-800/50 bg-neutral-900/50 flex-shrink-0">
        <button
          onClick={goUp}
          disabled={currentPath === '/'}
          className="p-1 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded animate-duration-100"
          title="Go up"
        >
          <ArrowUp size={13} />
        </button>
        <button
          onClick={() => fetchDir(currentPath)}
          className="p-1 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors rounded"
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={() => { setShowNewFolder(true); setNewFolderName(''); }}
          className="p-1 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors rounded"
          title="New Folder"
        >
          <FolderPlus size={13} />
        </button>
        <button
          onClick={() => setShowHidden(!showHidden)}
          className={`p-1 transition-colors rounded ${showHidden ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'}`}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
        >
          {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`p-1 transition-colors rounded ${showSearch ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'}`}
          title={showSearch ? 'Close search' : 'Search files'}
        >
          <Search size={12} />
        </button>
        {connectionId && (
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className={`p-1 transition-colors rounded text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 disabled:opacity-30`}
            title="Rebuild index cache"
          >
            <Database size={12} className={reindexing ? 'animate-spin text-orange-500' : ''} />
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      {isEditingPath ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const targetPath = pathInput.trim();
            if (targetPath) {
              const success = await navigateTo(targetPath);
              if (success) {
                setIsEditingPath(false);
              }
            } else {
              setIsEditingPath(false);
            }
          }}
          className="flex items-center gap-1.5 px-2 py-1 border-b border-neutral-800/30 flex-shrink-0 bg-neutral-950/80"
        >
          <input
            autoFocus
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsEditingPath(false);
            }}
            className="flex-1 min-w-0 bg-[#0d0e12]/60 border border-neutral-800 focus:border-orange-500 rounded px-2 py-0.5 text-[10px] font-mono text-neutral-200 focus:outline-none"
            placeholder="Go to remote path..."
          />
          <button
            type="submit"
            className="px-2 py-0.5 text-[10px] font-mono font-bold bg-orange-600 hover:bg-orange-500 text-black rounded transition-colors cursor-pointer"
          >
            Go
          </button>
          <button
            type="button"
            onClick={() => setIsEditingPath(false)}
            className="p-0.5 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </form>
      ) : (
        <div
          onDoubleClick={() => {
            setPathInput(currentPath);
            setIsEditingPath(true);
          }}
          className="flex items-center justify-between px-2 py-1 border-b border-neutral-800/30 flex-shrink-0 group cursor-pointer hover:bg-neutral-900/30 transition-colors"
          title="Double click to edit path"
        >
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('/');
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              className="text-[10px] font-mono text-neutral-500 hover:text-orange-400 transition-colors px-1 flex-shrink-0"
            >
              /
            </button>
            {pathSegments.map((seg, i) => {
              const segPath = '/' + pathSegments.slice(0, i + 1).join('/');
              const isLast = i === pathSegments.length - 1;
              return (
                <React.Fragment key={segPath}>
                  <ChevronRight size={10} className="text-neutral-700 flex-shrink-0" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isLast) navigateTo(segPath);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className={`text-[10px] font-mono transition-colors px-0.5 truncate max-w-[80px] flex-shrink-0 ${
                      isLast
                        ? 'text-orange-400 cursor-default'
                        : 'text-neutral-500 hover:text-orange-400'
                    }`}
                    title={seg}
                  >
                    {seg}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPathInput(currentPath);
              setIsEditingPath(true);
            }}
            className="p-0.5 text-neutral-600 hover:text-orange-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1.5"
            title="Edit path"
          >
            <Edit size={10} />
          </button>
        </div>
      )}

      {/* Search Bar Panel */}
      {showSearch && (
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-1.5 p-2 border-b border-neutral-800/50 bg-neutral-900/30 flex-shrink-0"
        >
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search remote files..."
                className="w-full pl-6 pr-2 py-0.5 bg-neutral-950 border border-neutral-800 rounded text-[10px] font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-orange-600 hover:bg-orange-500 text-black rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
            >
              {searchLoading ? <Loader2 size={10} className="animate-spin" /> : 'Search'}
            </button>
            {isSearching && (
              <button
                type="button"
                onClick={clearSearch}
                className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors rounded border border-neutral-800 bg-neutral-900 flex-shrink-0"
                title="Clear search results"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-neutral-500 font-sans">
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={searchContent}
                onChange={(e) => setSearchContent(e.target.checked)}
                className="rounded border-neutral-800 bg-neutral-950 text-orange-500 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer"
              />
              Search content (Slow for FTP)
            </label>
          </div>
        </form>
      )}

      {/* New Folder Inline Input */}
      {showNewFolder && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-800/50 bg-neutral-900/80">
          <FolderPlus size={12} className="text-orange-500 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') setShowNewFolder(false);
            }}
            placeholder="Folder name..."
            className="flex-1 min-w-0 px-2 py-0.5 bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim() || newFolderLoading}
            className="px-2 py-0.5 text-[10px] font-mono font-bold bg-orange-600 hover:bg-orange-500 text-black disabled:opacity-50"
          >
            {newFolderLoading ? <Loader2 size={10} className="animate-spin" /> : 'Create'}
          </button>
          <button
            onClick={() => setShowNewFolder(false)}
            className="p-0.5 text-neutral-500 hover:text-neutral-300"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-950/30 border-b border-red-900/30 text-[10px] font-mono text-red-400">
          <AlertCircle size={11} />
          <span className="truncate">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-600 hover:text-red-400 flex-shrink-0">
            <X size={10} />
          </button>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="text-orange-500 animate-spin" />
          </div>
        ) : searchLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="text-orange-500 animate-spin" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-600 text-[11px] font-mono">
            {isSearching ? 'No search results found' : 'Empty directory'}
          </div>
        ) : (
          displayItems.map((item) => {
            const isRenaming = renaming?.item.name === item.name;
            const displayName = isSearching ? item.name.split('/').pop() || item.name : item.name;
            const subPath = isSearching ? item.name.substring(0, item.name.lastIndexOf('/')) : '';
            return (
              <div
                key={item.name}
                className="group flex items-center gap-1.5 px-2 py-1 hover:bg-neutral-900/80 cursor-default border-b border-neutral-800/20 transition-colors"
                onDoubleClick={() => handleDoubleClick(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                {/* Icon */}
                {item.isDirectory ? (
                  <Folder size={13} className="text-orange-500/70 flex-shrink-0" />
                ) : (
                  <File size={13} className="text-neutral-600 flex-shrink-0" />
                )}

                {/* Name */}
                {isRenaming ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={() => setRenaming(null)}
                    className="flex-1 min-w-0 px-1 py-0 bg-neutral-950 border border-orange-500 text-[11px] font-mono text-neutral-200 focus:outline-none"
                  />
                ) : (
                  <span
                    className={`flex-1 min-w-0 text-[11px] font-mono truncate ${
                      item.isDirectory ? 'text-neutral-200' : 'text-neutral-400'
                    } ${!isSearching && item.name.startsWith('.') ? 'opacity-60' : ''}`}
                    title={item.name}
                  >
                    {displayName}
                    {subPath && (
                      <span className="text-[9px] text-neutral-600 ml-2 font-sans font-normal">
                        in {subPath}
                      </span>
                    )}
                  </span>
                )}

                {/* Size */}
                {!item.isDirectory && (
                  <span className="text-[9px] font-mono text-neutral-600 flex-shrink-0 w-14 text-right">
                    {formatBytes(item.size)}
                  </span>
                )}

                {/* Actions on hover */}
                {!isSearching && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContextMenu(e as unknown as React.MouseEvent, item);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-600 hover:text-orange-500 transition-all flex-shrink-0"
                  >
                    <MoreVertical size={11} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-neutral-800/50 bg-neutral-900/30 flex-shrink-0">
        <span className="text-[9px] font-mono text-neutral-600 truncate" title={currentPath}>
          {isSearching ? 'Search results' : currentPath}
        </span>
        <span className="text-[9px] font-mono text-neutral-600 flex-shrink-0">
          {displayItems.length} items
        </span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="absolute bg-neutral-900 border border-neutral-800 backdrop-blur-md rounded-lg shadow-2xl py-1 z-50 min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.item.isDirectory && (
            <>
              <button
                onClick={() => {
                  onOpenFile?.(contextMenu.fullPath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <Edit size={11} />
                Open File
              </button>
              <button
                onClick={() => {
                  onOpenFile?.(contextMenu.fullPath, true);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-orange-400 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <Edit size={11} className="text-orange-500" />
                Open as SUDO
              </button>
              <button
                onClick={() => {
                  onDownloadFile?.(contextMenu.fullPath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <Download size={11} />
                Download
              </button>
            </>
          )}
          {contextMenu.item.isDirectory && (
            <button
              onClick={() => {
                navigateTo(contextMenu.fullPath);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
            >
              <Folder size={11} />
              Open Folder
            </button>
          )}
          <button
            onClick={() => {
              setRenaming({ item: contextMenu.item, fullPath: contextMenu.fullPath });
              setRenameValue(contextMenu.item.name);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors border-t border-neutral-800/40"
          >
            <Edit size={11} />
            Rename
          </button>
          <button
            onClick={() => {
              setDeleteConfirm({ item: contextMenu.item, fullPath: contextMenu.fullPath });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-red-400 hover:bg-red-600 hover:text-white transition-colors"
          >
            <Trash2 size={11} />
            Delete
          </button>
          <button
            onClick={() => handleCopyPath(contextMenu.fullPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors border-t border-neutral-800/40"
          >
            <Copy size={11} />
            Copy Path
          </button>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg w-full max-w-xs shadow-2xl">
            <div className="px-3 py-2 border-b border-neutral-800">
              <span className="text-xs font-mono uppercase text-red-400">Confirm Delete</span>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-mono text-neutral-300">
                Delete <span className="text-orange-400">{deleteConfirm.item.name}</span>?
              </p>
              <p className="text-[10px] font-mono text-neutral-600 mt-1 break-all">{deleteConfirm.fullPath}</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-neutral-800">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-1 px-3 py-1 text-[11px] font-mono font-bold bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-orange-600/10 border-2 border-dashed border-orange-500/50 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 p-4">
            <Download size={24} className="text-orange-500 animate-pulse" />
            <span className="text-[11px] font-mono font-bold text-orange-400 uppercase">
              Drop to Upload
            </span>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress && (
        <div className="absolute bottom-8 left-2 right-2 bg-neutral-900/95 border border-neutral-800 rounded-lg p-2 z-40 flex items-center gap-2">
          <Loader2 size={12} className="text-orange-500 animate-spin flex-shrink-0" />
          <span className="text-[10px] font-mono text-neutral-400 truncate">{uploadProgress}</span>
        </div>
      )}
    </div>
  );
};

export default SftpFileBrowser;
