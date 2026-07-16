import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
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
  Star,
  Lock,
  Bookmark,
  Clock,
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
  const [previewFile, setPreviewFile] = useState<{ path: string; name: string; content: string | null; loading: boolean } | null>(null);
  const [chmodItem, setChmodItem] = useState<{ item: FileItem; fullPath: string; mode: string } | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [showBookmarksList, setShowBookmarksList] = useState(false);

  // P2 Group 1 States
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [bulkRenameModal, setBulkRenameModal] = useState<{ items: { oldName: string; newName: string }[] } | null>(null);
  const [tagsAndNotes, setTagsAndNotes] = useState<Record<string, { tags: string[]; note: string }>>({});
  const [editTagsNotes, setEditTagsNotes] = useState<{ path: string; name: string; tags: string[]; note: string } | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [showRecentFiles, setShowRecentFiles] = useState(false);

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
        addToRecentFiles(fullPath);
        onOpenFile?.(fullPath);
      }
      return;
    }

    const fullPath = joinPath(currentPath, item.name);
    if (item.isDirectory) {
      navigateTo(fullPath);
    } else {
      addToRecentFiles(fullPath);
      onOpenFile?.(fullPath);
    }
  };

  // Load bookmarks
  useEffect(() => {
    if (!connectionId) {
      setBookmarks([]);
      return;
    }
    const stored = localStorage.getItem(`omnisync_bookmarks_${connectionId}`);
    if (stored) {
      try {
        setBookmarks(JSON.parse(stored));
      } catch (err) {
        setBookmarks([]);
      }
    } else {
      setBookmarks([]);
    }
  }, [connectionId]);

  const handleToggleBookmark = () => {
    if (!connectionId) return;
    let newBookmarks = [...bookmarks];
    if (bookmarks.includes(currentPath)) {
      newBookmarks = newBookmarks.filter(b => b !== currentPath);
    } else {
      newBookmarks.push(currentPath);
    }
    setBookmarks(newBookmarks);
    localStorage.setItem(`omnisync_bookmarks_${connectionId}`, JSON.stringify(newBookmarks));
  };

  const handleDeleteBookmark = (pathToDelete: string) => {
    if (!connectionId) return;
    const newBookmarks = bookmarks.filter(b => b !== pathToDelete);
    setBookmarks(newBookmarks);
    localStorage.setItem(`omnisync_bookmarks_${connectionId}`, JSON.stringify(newBookmarks));
  };

  // Handle file preview
  const handlePreviewFile = async (filePath: string) => {
    const fileName = filePath.split('/').pop() || 'File';
    setPreviewFile({ path: filePath, name: fileName, content: null, loading: true });

    try {
      addToRecentFiles(filePath);
      const res = await fetch(`/api/terminal/sessions/${sessionId}/file?path=${encodeURIComponent(filePath)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setPreviewFile(prev => prev ? { ...prev, content: data.content, loading: false } : null);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to load file preview: ' + err.message);
      setPreviewFile(null);
    }
  };

  // Handle save chmod
  const handleSaveChmod = async () => {
    if (!chmodItem) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/chmod`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          path: chmodItem.fullPath, 
          mode: chmodItem.mode 
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setChmodItem(null);
      fetchDir(currentPath);
    } catch (err: any) {
      setError('Chmod failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load tags and notes
  useEffect(() => {
    if (!connectionId) return;
    const stored = localStorage.getItem(`omnisync_tags_${connectionId}`);
    if (stored) {
      try {
        setTagsAndNotes(JSON.parse(stored));
      } catch {}
    } else {
      setTagsAndNotes({});
    }
  }, [connectionId]);

  const saveTagsAndNotes = (updated: Record<string, { tags: string[]; note: string }>) => {
    setTagsAndNotes(updated);
    if (connectionId) {
      localStorage.setItem(`omnisync_tags_${connectionId}`, JSON.stringify(updated));
    }
  };

  // Load recent files
  useEffect(() => {
    if (!connectionId) return;
    const stored = localStorage.getItem(`omnisync_recent_${connectionId}`);
    if (stored) {
      try {
        setRecentFiles(JSON.parse(stored));
      } catch {}
    } else {
      setRecentFiles([]);
    }
  }, [connectionId]);

  const addToRecentFiles = (filePath: string) => {
    setRecentFiles((prev) => {
      const updated = [
        filePath,
        ...prev.filter((p) => p !== filePath),
      ].slice(0, 10);
      if (connectionId) {
        localStorage.setItem(`omnisync_recent_${connectionId}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleArchiveItem = async (folderPath: string, type: 'zip' | 'tar' = 'zip') => {
    setLoading(true);
    try {
      const archivePath = folderPath + (type === 'tar' ? '.tar.gz' : '.zip');
      const res = await fetch(`/api/terminal/sessions/${sessionId}/archive`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ folderPath, archivePath, type }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      fetchDir(currentPath);
    } catch (err: any) {
      setError('Archive failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractItem = async (archivePath: string) => {
    setLoading(true);
    try {
      const extractPath = currentPath;
      const res = await fetch(`/api/terminal/sessions/${sessionId}/extract`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ archivePath, extractPath }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      fetchDir(currentPath);
    } catch (err: any) {
      setError('Extract failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBulkRename = async () => {
    if (!bulkRenameModal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/bulk-rename`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ dirPath: currentPath, items: bulkRenameModal.items }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setBulkRenameModal(null);
      setSelectedItems([]);
      fetchDir(currentPath);
    } catch (err: any) {
      setError('Bulk rename failed: ' + err.message);
    } finally {
      setLoading(false);
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
          <>
            {/* Bookmark star toggle */}
            <button
              onClick={handleToggleBookmark}
              className={`p-1 transition-colors rounded ${bookmarks.includes(currentPath) ? 'text-amber-500 hover:text-amber-400' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'}`}
              title={bookmarks.includes(currentPath) ? 'Remove Bookmark' : 'Bookmark Current Folder'}
            >
              <Star size={12} fill={bookmarks.includes(currentPath) ? 'currentColor' : 'none'} />
            </button>

            {/* Bookmarks List dropdown trigger */}
            <button
              onClick={() => setShowBookmarksList(prev => !prev)}
              className={`p-1 transition-colors rounded relative ${showBookmarksList ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'}`}
              title="Show Bookmarked Folders"
            >
              <Bookmark size={12} />
              {bookmarks.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-600 text-black font-bold font-mono text-[7px] w-2.5 h-2.5 rounded-full flex items-center justify-center">
                  {bookmarks.length}
                </span>
              )}
            </button>

            {/* Recent Files dropdown trigger */}
            <button
              onClick={() => setShowRecentFiles(prev => !prev)}
              className={`p-1 transition-colors rounded ${showRecentFiles ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'}`}
              title="Recent Files"
            >
              <Clock size={12} />
            </button>

            <button
              onClick={handleReindex}
              disabled={reindexing}
              className={`p-1 transition-colors rounded text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 disabled:opacity-30`}
              title="Rebuild index cache"
            >
              <Database size={12} className={reindexing ? 'animate-spin text-orange-500' : ''} />
            </button>
          </>
        )}
      </div>

      {/* Multi-select Action Panel */}
      {selectedItems.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1 bg-orange-950/20 border-b border-orange-500/20 text-[10px] font-mono text-orange-400 animate-in slide-in-from-top-1 duration-150 flex-shrink-0">
          <span>{selectedItems.length} items selected</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const renameItems = selectedItems.map(name => ({ oldName: name, newName: name }));
                setBulkRenameModal({ items: renameItems });
              }}
              className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 text-black font-bold rounded text-[9px] transition-colors"
            >
              Bulk Rename
            </button>
            <button
              onClick={() => setSelectedItems([])}
              className="px-2 py-0.5 border border-neutral-800 hover:bg-neutral-800 rounded text-[9px] text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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
            
            const itemKey = joinPath(currentPath, item.name);
            const itemTagsNotes = tagsAndNotes[itemKey] || { tags: [], note: '' };

            return (
              <div
                key={item.name}
                className={`group flex items-center gap-1.5 px-2 py-1 hover:bg-neutral-900/80 cursor-default border-b border-neutral-800/20 transition-colors ${
                  selectedItems.includes(item.name) ? 'bg-orange-500/5' : ''
                }`}
                onDoubleClick={() => handleDoubleClick(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                {/* Multi-select Checkbox */}
                {!isRenaming && (
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.name)}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        setSelectedItems(prev => [...prev, item.name]);
                      } else {
                        setSelectedItems(prev => prev.filter(name => name !== item.name));
                      }
                    }}
                    className={`accent-orange-500 mr-0.5 rounded cursor-pointer transition-all ${
                      selectedItems.length > 0 ? 'opacity-100 w-3 h-3' : 'opacity-0 group-hover:opacity-100 w-3 h-3'
                    }`}
                  />
                )}

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

                {/* File tags indicator */}
                {itemTagsNotes.tags.length > 0 && (
                  <div className="flex gap-0.5 ml-1 flex-shrink-0">
                    {itemTagsNotes.tags.map((tagColor, idx) => (
                      <span
                        key={idx}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: tagColor }}
                        title="Tag"
                      />
                    ))}
                  </div>
                )}

                {/* File note indicator */}
                {itemTagsNotes.note && (
                  <span
                    className="text-neutral-500 hover:text-neutral-300 ml-1 cursor-help flex-shrink-0"
                    title={itemTagsNotes.note}
                  >
                    📝
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
                  handlePreviewFile(contextMenu.fullPath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <Eye size={11} />
                Preview File
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
          
          {/* Permissions (CHMOD) */}
          <button
            onClick={() => {
              setChmodItem({ item: contextMenu.item, fullPath: contextMenu.fullPath, mode: contextMenu.item.permissions || '755' });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors border-t border-neutral-800/40"
          >
            <Lock size={11} />
            Permissions (CHMOD)
          </button>
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
          {/* Zip/Unzip & Tags */}
          {contextMenu.item.isDirectory ? (
            <>
              <button
                onClick={() => {
                  handleArchiveItem(contextMenu.fullPath, 'zip');
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <span>📦</span>
                Archive Folder (ZIP)
              </button>
              <button
                onClick={() => {
                  handleArchiveItem(contextMenu.fullPath, 'tar');
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <span>📦</span>
                Archive Folder (TAR.GZ)
              </button>
            </>
          ) : (
            (contextMenu.item.name.endsWith('.zip') ||
             contextMenu.item.name.endsWith('.tar.gz') ||
             contextMenu.item.name.endsWith('.tgz') ||
             contextMenu.item.name.endsWith('.tar') ||
             contextMenu.item.name.endsWith('.gz')) && (
              <button
                onClick={() => {
                  handleExtractItem(contextMenu.fullPath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors"
              >
                <span>📂</span>
                Extract Archive
              </button>
            )
          )}

          <button
            onClick={() => {
              const currentTagsNotes = tagsAndNotes[contextMenu.fullPath] || { tags: [], note: '' };
              setEditTagsNotes({
                path: contextMenu.fullPath,
                name: contextMenu.item.name,
                tags: currentTagsNotes.tags,
                note: currentTagsNotes.note
              });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-neutral-200 hover:bg-orange-500 hover:text-black transition-colors border-t border-neutral-800/40"
          >
            <span>🏷️</span>
            Tags & Notes
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

      {/* Bookmarks dropdown list */}
      {showBookmarksList && (
        <div className="absolute top-8 right-2 bg-neutral-900 border border-neutral-800 backdrop-blur-md rounded-lg shadow-2xl py-1.5 z-40 w-56 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-2.5 py-1 border-b border-neutral-800/80 pb-1.5 mb-1 flex items-center justify-between text-[9px] font-mono text-neutral-500 uppercase">
            <span>Bookmarks</span>
            <button onClick={() => setShowBookmarksList(false)} className="hover:text-neutral-300">
              <X size={10} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto px-1 space-y-0.5">
            {bookmarks.map((path) => (
              <div
                key={path}
                className="flex items-center justify-between gap-1.5 px-2 py-1 hover:bg-neutral-800 rounded font-mono text-[10px] text-neutral-300 group"
              >
                <button
                  onClick={() => {
                    navigateTo(path);
                    setShowBookmarksList(false);
                  }}
                  className="flex-1 truncate text-left hover:text-orange-400 transition-colors"
                  title={path}
                >
                  {path === '/' ? '/' : path.split('/').pop() || path}
                </button>
                <button
                  onClick={() => handleDeleteBookmark(path)}
                  className="text-neutral-600 hover:text-rose-500 p-0.5 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove Bookmark"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
            {bookmarks.length === 0 && (
              <div className="p-3 text-center text-[10px] font-mono text-neutral-600">
                No bookmarks saved
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permissions (CHMOD) Modal */}
      {chmodItem && (() => {
        const perms = getPermissionsFromRights(chmodItem.mode);
        const updatePerm = (role: 'u' | 'g' | 'o', action: 'r' | 'w' | 'x', val: boolean) => {
          const u = { ...perms.u };
          const g = { ...perms.g };
          const o = { ...perms.o };
          if (role === 'u') u[action] = val;
          if (role === 'g') g[action] = val;
          if (role === 'o') o[action] = val;
          
          const octal = getOctalFromPermissions(u, g, o);
          setChmodItem(prev => prev ? { ...prev, mode: octal } : null);
        };

        return (
          <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-xs shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center gap-2">
                <Lock size={13} className="text-orange-500" />
                <span className="text-xs font-mono font-bold uppercase text-neutral-300">Permissions</span>
              </div>
              
              <div className="p-4 space-y-4 font-mono text-[11px] text-neutral-300">
                <div className="truncate">
                  <span className="text-neutral-500">Name:</span> <span className="text-orange-400">{chmodItem.item.name}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center border border-neutral-800 bg-neutral-950/50 p-3 rounded">
                  <div></div>
                  <div className="text-neutral-500 font-bold">R</div>
                  <div className="text-neutral-500 font-bold">W</div>
                  <div className="text-neutral-500 font-bold">X</div>

                  <div className="text-left text-neutral-400 font-bold">Owner</div>
                  <input type="checkbox" checked={perms.u.r} onChange={(e) => updatePerm('u', 'r', e.target.checked)} className="accent-orange-500" />
                  <input type="checkbox" checked={perms.u.w} onChange={(e) => updatePerm('u', 'w', e.target.checked)} className="accent-orange-500" />
                  <input type="checkbox" checked={perms.u.x} onChange={(e) => updatePerm('u', 'x', e.target.checked)} className="accent-orange-500" />

                  <div className="text-left text-neutral-400 font-bold">Group</div>
                  <input type="checkbox" checked={perms.g.r} onChange={(e) => updatePerm('g', 'r', e.target.checked)} className="accent-orange-500" />
                  <input type="checkbox" checked={perms.g.w} onChange={(e) => updatePerm('g', 'w', e.target.checked)} className="accent-orange-500" />
                  <input type="checkbox" checked={perms.g.x} onChange={(e) => updatePerm('g', 'x', e.target.checked)} className="accent-orange-500" />

                  <div className="text-left text-neutral-400 font-bold">Others</div>
                  <input type="checkbox" checked={perms.o.r} onChange={(e) => updatePerm('o', 'r', e.target.checked)} className="accent-orange-500" />
                  <input type="checkbox" checked={perms.o.w} onChange={(e) => updatePerm('o', 'w', e.target.checked)} className="accent-orange-500" />
                  <input type="checkbox" checked={perms.o.x} onChange={(e) => updatePerm('o', 'x', e.target.checked)} className="accent-orange-500" />
                </div>

                <div className="flex items-center justify-between border-t border-neutral-800/80 pt-3">
                  <span className="text-neutral-500 font-bold">Octal Mode:</span>
                  <input
                    type="text"
                    maxLength={3}
                    value={chmodItem.mode.replace(/[^0-7]/g, '') || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.length <= 3 && /^[0-7]*$/.test(val)) {
                        setChmodItem(prev => prev ? { ...prev, mode: val } : null);
                      }
                    }}
                    className="w-16 bg-neutral-950 border border-neutral-800 text-center font-bold text-orange-400 text-xs py-1 rounded focus:outline-none focus:border-neutral-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-900/30">
                <button
                  onClick={() => setChmodItem(null)}
                  className="px-3 py-1.5 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChmod}
                  className="px-4 py-1.5 text-[11px] font-mono font-bold bg-orange-500 hover:bg-orange-400 text-black border border-orange-600 rounded transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full h-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs">
                <Eye size={13} className="text-orange-500" />
                <span className="text-neutral-300 font-bold uppercase">File Preview:</span>
                <span className="text-neutral-400 truncate max-w-[280px]" title={previewFile.path}>
                  {previewFile.name}
                </span>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-neutral-500 hover:text-neutral-300 transition-colors p-1"
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden relative bg-neutral-950">
              {previewFile.loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={24} className="text-orange-500 animate-spin" />
                  <span className="text-[10px] font-mono text-neutral-500">Fetching remote content...</span>
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={getLanguageFromExtension(previewFile.name)}
                  theme="vs-dark"
                  value={previewFile.content || ''}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 11,
                    fontFamily: 'ui-monospace, monospace',
                    lineHeight: 18,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {/* Recent Files Dropdown */}
      {showRecentFiles && (
        <div className="absolute top-8 right-2 bg-neutral-900 border border-neutral-800 backdrop-blur-md rounded-lg shadow-2xl py-1.5 z-40 w-64 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-2.5 py-1 border-b border-neutral-800/80 pb-1.5 mb-1 flex items-center justify-between text-[9px] font-mono text-neutral-500 uppercase">
            <span>Recent Files</span>
            <button onClick={() => setShowRecentFiles(false)} className="hover:text-neutral-300">
              <X size={10} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto px-1 space-y-0.5">
            {recentFiles.map((path) => (
              <button
                key={path}
                onClick={() => {
                  handlePreviewFile(path);
                  setShowRecentFiles(false);
                }}
                className="w-full text-left px-2 py-1 hover:bg-neutral-800 rounded font-mono text-[10px] text-neutral-300 truncate hover:text-orange-400 transition-colors"
                title={path}
              >
                {path.split('/').pop() || path}
                <span className="text-[8px] text-neutral-600 block truncate">{path}</span>
              </button>
            ))}
            {recentFiles.length === 0 && (
              <div className="p-3 text-center text-[10px] font-mono text-neutral-600">
                No recent files
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Rename Modal */}
      {bulkRenameModal && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase text-neutral-300">Bulk Rename Files</span>
              <button onClick={() => setBulkRenameModal(null)} className="text-neutral-500 hover:text-neutral-300">
                <X size={14} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[11px] text-neutral-300">
              {bulkRenameModal.items.map((item, idx) => (
                <div key={idx} className="space-y-1 border-b border-neutral-800/40 pb-2">
                  <div className="text-neutral-500 truncate" title={item.oldName}>
                    Old: <span className="text-neutral-400">{item.oldName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 flex-shrink-0">New:</span>
                    <input
                      type="text"
                      value={item.newName}
                      onChange={(e) => {
                        const updatedItems = [...bulkRenameModal.items];
                        updatedItems[idx].newName = e.target.value;
                        setBulkRenameModal({ items: updatedItems });
                      }}
                      className="flex-1 bg-neutral-950 border border-neutral-800 px-2 py-1 rounded text-neutral-200 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-900/30">
              <button
                onClick={() => setBulkRenameModal(null)}
                className="px-3 py-1.5 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBulkRename}
                className="px-4 py-1.5 text-[11px] font-mono font-bold bg-orange-500 hover:bg-orange-400 text-black border border-orange-600 rounded transition-colors"
              >
                Rename All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tags & Notes Editor Modal */}
      {editTagsNotes && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-xs shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase text-neutral-300">File Tags & Notes</span>
              <button onClick={() => setEditTagsNotes(null)} className="text-neutral-500 hover:text-neutral-300">
                <X size={14} />
              </button>
            </div>
            
            <div className="p-4 space-y-4 font-mono text-[11px] text-neutral-300">
              <div className="truncate">
                <span className="text-neutral-500">File:</span> <span className="text-orange-400">{editTagsNotes.name}</span>
              </div>

              {/* Tag colors selection */}
              <div>
                <span className="block text-neutral-500 mb-1.5">Select Tags:</span>
                <div className="flex gap-2">
                  {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#a855f7'].map((color) => {
                    const active = editTagsNotes.tags.includes(color);
                    return (
                      <button
                        key={color}
                        onClick={() => {
                          const newTags = active
                            ? editTagsNotes.tags.filter(t => t !== color)
                            : [...editTagsNotes.tags, color];
                          setEditTagsNotes(prev => prev ? { ...prev, tags: newTags } : null);
                        }}
                        className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {active && <span className="text-[10px] text-black font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note textarea */}
              <div>
                <span className="block text-neutral-500 mb-1">Add Note:</span>
                <textarea
                  value={editTagsNotes.note}
                  onChange={(e) => setEditTagsNotes(prev => prev ? { ...prev, note: e.target.value } : null)}
                  placeholder="Enter a brief note about this file..."
                  rows={3}
                  className="w-full bg-neutral-950 border border-neutral-800 p-2 text-neutral-200 text-xs rounded focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800 bg-neutral-900/30">
              <button
                onClick={() => setEditTagsNotes(null)}
                className="px-3 py-1.5 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updated = { ...tagsAndNotes };
                  if (editTagsNotes.tags.length === 0 && !editTagsNotes.note.trim()) {
                    delete updated[editTagsNotes.path];
                  } else {
                    updated[editTagsNotes.path] = {
                      tags: editTagsNotes.tags,
                      note: editTagsNotes.note.trim()
                    };
                  }
                  saveTagsAndNotes(updated);
                  setEditTagsNotes(null);
                }}
                className="px-4 py-1.5 text-[11px] font-mono font-bold bg-orange-500 hover:bg-orange-400 text-black border border-orange-600 rounded transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to map file extensions to Monaco Editor languages
const getLanguageFromExtension = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return 'plaintext';
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    html: 'html', css: 'css', json: 'json', md: 'markdown',
    py: 'python', sh: 'shell', bash: 'shell', yaml: 'yaml', yml: 'yaml',
    sql: 'sql', xml: 'xml', c: 'c', cpp: 'cpp', rs: 'rust', go: 'go',
    php: 'php', rb: 'ruby', cs: 'csharp'
  };
  return map[ext] || 'plaintext';
};

// Helper to parse SFTP style rights string (-rwxrwxrwx) to permission flags
const getPermissionsFromRights = (rights: string) => {
  const u = { r: false, w: false, x: false };
  const g = { r: false, w: false, x: false };
  const o = { r: false, w: false, x: false };
  
  if (rights && rights.length >= 3 && /^[0-7]+$/.test(rights)) {
    // It is an octal string (e.g. "755")
    const octVal = parseInt(rights, 8);
    u.r = !!(octVal & 0o400);
    u.w = !!(octVal & 0o200);
    u.x = !!(octVal & 0o100);
    g.r = !!(octVal & 0o040);
    g.w = !!(octVal & 0o020);
    g.x = !!(octVal & 0o010);
    o.r = !!(octVal & 0o004);
    o.w = !!(octVal & 0o002);
    o.x = !!(octVal & 0o001);
  } else if (rights && (rights.length === 9 || rights.length === 10)) {
    // It is a rights string (e.g. "-rwxr-xr-x")
    const str = rights.length === 10 ? rights.substring(1) : rights;
    u.r = str[0] === 'r';
    u.w = str[1] === 'w';
    u.x = str[2] === 'x' || str[2] === 's' || str[2] === 't';
    g.r = str[3] === 'r';
    g.w = str[4] === 'w';
    g.x = str[5] === 'x' || str[5] === 's' || str[5] === 't';
    o.r = str[6] === 'r';
    o.w = str[7] === 'w';
    o.x = str[8] === 'x' || str[8] === 's' || str[8] === 't';
  } else {
    // Default fallback
    u.r = true; u.w = true; u.x = false;
    g.r = true; g.w = false; g.x = false;
    o.r = true; o.w = false; o.x = false;
  }
  return { u, g, o };
};

// Helper to convert permission flags to octal string
const getOctalFromPermissions = (u: any, g: any, o: any) => {
  const getVal = (p: any) => (p.r ? 4 : 0) + (p.w ? 2 : 0) + (p.x ? 1 : 0);
  return `${getVal(u)}${getVal(g)}${getVal(o)}`;
};

export default SftpFileBrowser;
