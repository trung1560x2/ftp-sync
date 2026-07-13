import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, File, ArrowUp, RefreshCw, HardDrive, ChevronRight } from 'lucide-react';

export interface LocalFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

interface DragDropLocalData {
  type: string;
  name: string;
  path: string;
  isDirectory: boolean;
  relPath: string;
}

interface DragDropRemoteData {
  type: string;
  name: string;
  path: string;
  isDirectory: boolean;
  relPath: string;
}

interface Drive {
  name: string;
  description: string;
  path: string;
}

interface LocalPaneProps {
  localRoot: string;
  onDropRemoteItem: (item: DragDropRemoteData) => void;
  onUploadItem: (item: LocalFileItem) => void;
  onUploadMultiple: (items: LocalFileItem[]) => void;
  onBulkRename: (dirPath: string, items: LocalFileItem[]) => void;
  onDeleteMultiple: (items: LocalFileItem[]) => void;
  refreshTrigger: number;
}

interface ContextMenu {
  x: number;
  y: number;
  item: LocalFileItem;
}

const LocalPane: React.FC<LocalPaneProps> = ({
  localRoot,
  onDropRemoteItem,
  onUploadItem,
  onUploadMultiple,
  onBulkRename,
  onDeleteMultiple,
  refreshTrigger
}) => {
  const [currentPath, setCurrentPath] = useState(localRoot);
  const [files, setFiles] = useState<LocalFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState<Drive[]>([]);
  
  // Selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  
  // Calculated directory sizes state
  const [calculatedSizes, setCalculatedSizes] = useState<{ [path: string]: { size: number; count: number } }>({});
  const [calculatingSizePaths, setCalculatingSizePaths] = useState<Set<string>>(new Set());

  const menuRef = useRef<HTMLDivElement>(null);

  const handleCalculateSize = async (item: LocalFileItem) => {
    setCalculatingSizePaths(prev => {
      const next = new Set(prev);
      next.add(item.path);
      return next;
    });
    try {
      const res = await fetch(`/api/system/dir-size?path=${encodeURIComponent(item.path)}`);
      const data = await res.json();
      if (data.success || data.size !== undefined) {
        setCalculatedSizes(prev => ({
          ...prev,
          [item.path]: { size: data.size, count: data.count }
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCalculatingSizePaths(prev => {
        const next = new Set(prev);
        next.delete(item.path);
        return next;
      });
    }
  };

  const fetchDrives = async () => {
    try {
      const res = await fetch('/api/system/drives');
      const data = await res.json();
      setDrives(data.drives || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFiles = useCallback(async (dirPath: string) => {
    if (!dirPath) return;
    setLoading(true);
    setSelectedItems(new Set());
    setContextMenu(null);
    try {
      const res = await fetch('/api/system/list-directory-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath })
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(data.error || 'Failed to list directory');
      
      setFiles(data.files || []);
      setCurrentPath(data.currentPath || dirPath);
    } catch (err) {
      console.error('Failed to load local files:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrives();
  }, []);

  useEffect(() => {
    if (localRoot) {
      setCurrentPath(localRoot);
      fetchFiles(localRoot);
    }
  }, [localRoot, fetchFiles, refreshTrigger]);

  // Click outside to close context menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDriveChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    fetchFiles(e.target.value);
  };

  const navigateTo = (path: string) => {
    fetchFiles(path);
  };

  const goUp = () => {
    const separator = currentPath.includes('\\') ? '\\' : '/';
    if (currentPath.endsWith(':\\') || currentPath === '/' || currentPath.endsWith(':/')) {
      return;
    }
    const parts = currentPath.split(separator).filter(Boolean);
    parts.pop();
    const parent = parts.join(separator) + (currentPath.includes('\\') ? '\\' : '/');
    navigateTo(parent);
  };

  // Drag and Drop
  const handleDragStart = (e: React.DragEvent, item: LocalFileItem) => {
    const dragData: DragDropLocalData = {
      type: 'local',
      name: item.name,
      path: item.path,
      isDirectory: item.isDirectory,
      relPath: item.path.substring(localRoot.length).replace(/\\/g, '/').replace(/^\//, '')
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr) as DragDropRemoteData;
      if (data.type === 'remote') {
        onDropRemoteItem(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Selection handlers
  const handleToggleSelect = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedItems);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedItems(next);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === files.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(files.map(f => f.path)));
    }
  };

  // Context Menu handlers
  const handleRightClick = (e: React.MouseEvent, item: LocalFileItem) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getSelectedObjects = (): LocalFileItem[] => {
    return files.filter(f => selectedItems.has(f.path));
  };

  const pathSegments = currentPath.split(/[\\/]/).filter(Boolean);

  return (
    <div 
      className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden font-mono text-xs select-none relative"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-800 bg-neutral-950/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-orange-500" />
          <span className="font-bold text-neutral-200 uppercase tracking-widest text-[11px]">Local Explorer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={goUp}
            className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 rounded transition-colors"
            title="Go Up"
          >
            <ArrowUp size={13} />
          </button>
          <button 
            onClick={() => fetchFiles(currentPath)}
            className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Path Breadcrumb & Drive selector */}
      <div className="flex items-center gap-2 p-2 border-b border-neutral-800/40 bg-neutral-900/40 flex-shrink-0">
        {drives.length > 0 && (
          <select 
            className="bg-neutral-950 border border-neutral-800 rounded text-[10px] px-1 py-0.5 text-neutral-300 focus:outline-none focus:border-orange-500 cursor-pointer"
            value={drives.find(d => currentPath.startsWith(d.path))?.path || ''}
            onChange={handleDriveChange}
          >
            {drives.map(d => (
              <option key={d.name} value={d.path}>{d.name}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none text-[10px] text-neutral-500 flex-1">
          {pathSegments.map((seg, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={10} className="text-neutral-700" />
              <span className="truncate max-w-[80px]" title={seg}>{seg}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Bulk actions bar (shows when items selected) */}
      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between p-2 bg-orange-600/10 border-b border-orange-500/20 text-[10px] flex-shrink-0">
          <span className="font-bold text-orange-400">{selectedItems.size} selected</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => onUploadMultiple(getSelectedObjects())}
              className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase rounded font-sans cursor-pointer"
            >
              Upload
            </button>
            <button
              onClick={() => onBulkRename(currentPath, getSelectedObjects())}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold uppercase rounded font-sans cursor-pointer"
            >
              Rename
            </button>
            <button
              onClick={() => onDeleteMultiple(getSelectedObjects())}
              className="px-2 py-0.5 bg-red-950/40 hover:bg-red-900/30 text-red-400 font-bold uppercase rounded font-sans cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Files List */}
      <div className="flex-1 overflow-y-auto bg-neutral-950/20">
        {loading ? (
          <div className="flex items-center justify-center h-full text-neutral-650">
            LOADING_LOCAL_FILES...
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-600">
            Empty folder
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-800/40 text-neutral-600 text-[10px] text-left">
                <th className="p-2 w-8 text-center">
                  <input 
                    type="checkbox" 
                    checked={files.length > 0 && selectedItems.size === files.length} 
                    onChange={handleSelectAll} 
                    className="cursor-pointer"
                  />
                </th>
                <th className="p-2">Name</th>
                <th className="p-2 text-right pr-4">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/20">
              {files.map(item => {
                const isSelected = selectedItems.has(item.path);
                return (
                  <tr
                    key={item.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDoubleClick={() => item.isDirectory ? navigateTo(item.path) : onUploadItem(item)}
                    onContextMenu={(e) => handleRightClick(e, item)}
                    className={`group hover:bg-neutral-900/60 transition-colors cursor-default ${
                      isSelected ? 'bg-orange-600/5' : ''
                    }`}
                  >
                    <td className="p-2 text-center" onClick={(e) => handleToggleSelect(item.path, e)}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => {}} // handled by click on cell
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="p-2 flex items-center gap-2 min-w-0">
                      {item.isDirectory ? (
                        <Folder size={13} className="text-orange-500/70 flex-shrink-0" />
                      ) : (
                        <File size={13} className="text-neutral-500 flex-shrink-0" />
                      )}
                      <span className={`truncate text-neutral-300 font-mono ${item.isDirectory ? 'text-neutral-200' : 'text-neutral-400'}`}>
                        {item.name}
                      </span>
                    </td>
                    <td className="p-2 text-right pr-4">
                      {!item.isDirectory ? (
                        <span className="text-[10px] text-neutral-600 font-mono">
                          {formatBytes(item.size)}
                        </span>
                      ) : calculatingSizePaths.has(item.path) ? (
                        <span className="text-[10px] text-orange-500 animate-pulse font-mono">calculating...</span>
                      ) : calculatedSizes[item.path] ? (
                        <span className="text-[10px] text-emerald-400 font-mono" title={`${calculatedSizes[item.path].count} files`}>
                          {formatBytes(calculatedSizes[item.path].size)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-750 font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl p-1 w-36 font-sans text-[11px] text-neutral-300"
        >
          <button
            onClick={() => {
              setContextMenu(null);
              onUploadItem(contextMenu.item);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 hover:text-white rounded transition-colors cursor-pointer"
          >
            Upload
          </button>
          <button
            onClick={() => {
              setContextMenu(null);
              onBulkRename(currentPath, [contextMenu.item]);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 hover:text-white rounded transition-colors border-t border-neutral-800 cursor-pointer"
          >
            Rename
          </button>
          {contextMenu.item.isDirectory && (
            <button
              onClick={() => {
                setContextMenu(null);
                handleCalculateSize(contextMenu.item);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 hover:text-white rounded transition-colors border-t border-neutral-800 cursor-pointer"
            >
              Calculate Size
            </button>
          )}
          <button
            onClick={() => {
              setContextMenu(null);
              onDeleteMultiple([contextMenu.item]);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-red-400 hover:text-red-300 rounded transition-colors border-t border-neutral-800 cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}

      {/* Footer info */}
      <div className="p-2 border-t border-neutral-800 bg-neutral-950/50 text-[10px] text-neutral-600 flex justify-between flex-shrink-0">
        <span className="truncate flex-1 pr-4" title={currentPath}>{currentPath}</span>
        <span>{files.length} items</span>
      </div>
    </div>
  );
};

export default LocalPane;
