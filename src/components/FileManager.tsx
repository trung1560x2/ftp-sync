import React, { useState, useEffect } from 'react';
import { X, Upload, Folder, File as FileIcon, RefreshCw, ArrowLeft, Download, CloudUpload, Play } from 'lucide-react';
import ConflictResolverModal from './ConflictResolverModal';

interface Props {
  connectionId: number;
  serverName: string;
  onClose: () => void;
}

interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  path?: string;
}

const FileManager: React.FC<Props> = ({ connectionId, serverName, onClose }) => {
  const [remoteFiles, setRemoteFiles] = useState<FileItem[]>([]);
  const [localFiles, setLocalFiles] = useState<FileItem[]>([]);
  const [currentRemotePath, setCurrentRemotePath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Drag & drop state
  const [dragOverRemote, setDragOverRemote] = useState(false);
  const [dragOverLocal, setDragOverLocal] = useState(false);
  
  // Conflict resolver state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [pendingDropItems, setPendingDropItems] = useState<{ name: string; path: string; isDirectory: boolean; file?: File }[]>([]);
  const [dropTargetPanel, setDropTargetPanel] = useState<'remote' | 'local'>('local');

  useEffect(() => {
    fetchRemoteFiles();
    fetchLocalFiles();
  }, [connectionId]);

  const parseDroppedItems = async (dataTransfer: DataTransfer): Promise<{ name: string; path: string; isDirectory: boolean; file?: File }[]> => {
    const items = Array.from(dataTransfer.items || []);
    const parsed: { name: string; path: string; isDirectory: boolean; file?: File }[] = [];

    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry();
      if (entry) {
        const fileObj = item.getAsFile();
        parsed.push({
          name: entry.name,
          path: (fileObj as any)?.path || entry.name, // Electron has .path
          isDirectory: entry.isDirectory,
          file: fileObj || undefined
        });
      }
    }
    return parsed;
  };

  const handleDropToPanel = async (e: React.DragEvent, target: 'local' | 'remote') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (target === 'local') setDragOverLocal(false);
    else setDragOverRemote(false);

    // 1. Check if this is an internal drag from the other panel
    const dragDataRaw = e.dataTransfer.getData('application/json');
    if (dragDataRaw) {
      try {
        const dragData = JSON.parse(dragDataRaw);
        if (dragData.source && dragData.file) {
          const { source, file } = dragData;
          if (source === 'remote' && target === 'local') {
            // Dragged remote file to local!
            const hasConflict = localFiles.some(f => f.name.toLowerCase() === file.name.toLowerCase());
            if (hasConflict) {
              setPendingDropItems([{ name: file.name, path: file.path || '', isDirectory: file.isDirectory }]);
              setConflicts([file.name]);
              setDropTargetPanel('local');
              setShowConflictModal(true);
            } else {
              handleManualDownload(file);
            }
            return;
          } else if (source === 'local' && target === 'remote') {
            // Dragged local file to remote!
            const hasConflict = remoteFiles.some(f => f.name.toLowerCase() === file.name.toLowerCase());
            if (hasConflict) {
              setPendingDropItems([{ name: file.name, path: file.path || '', isDirectory: file.isDirectory }]);
              setConflicts([file.name]);
              setDropTargetPanel('remote');
              setShowConflictModal(true);
            } else {
              handleManualUpload(file);
              setTimeout(() => fetchRemoteFiles(currentRemotePath), 1000);
            }
            return;
          }
        }
      } catch (err) {
        console.error('Error parsing drag data', err);
      }
    }

    // 2. Drop from OS
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const parsedItems = await parseDroppedItems(e.dataTransfer);
      if (parsedItems.length === 0) return;

      const targetFiles = target === 'local' ? localFiles : remoteFiles;
      const conflictingNames: string[] = [];
      
      parsedItems.forEach(item => {
        const conflictExists = targetFiles.some(tf => tf.name.toLowerCase() === item.name.toLowerCase());
        if (conflictExists) {
          conflictingNames.push(item.name);
        }
      });

      if (conflictingNames.length > 0) {
        setPendingDropItems(parsedItems);
        setConflicts(conflictingNames);
        setDropTargetPanel(target);
        setShowConflictModal(true);
      } else {
        const emptyResolutions = {};
        executeTransfer(parsedItems, emptyResolutions, target);
      }
    }
  };

  const handleResolveConflicts = (resolutions: { [filename: string]: 'overwrite' | 'skip' | 'rename' }) => {
    setShowConflictModal(false);
    executeTransfer(pendingDropItems, resolutions, dropTargetPanel);
    setPendingDropItems([]);
    setConflicts([]);
  };

  const executeTransfer = async (
    itemsToTransfer: { name: string; path: string; isDirectory: boolean; file?: File }[],
    resolutions: { [filename: string]: 'overwrite' | 'skip' | 'rename' },
    target: 'remote' | 'local'
  ) => {
    const finalItems = itemsToTransfer
      .map(item => {
        const resolution = resolutions[item.name];
        if (resolution === 'skip') return null;

        let destName = item.name;
        if (resolution === 'rename') {
          const lastDot = item.name.lastIndexOf('.');
          if (lastDot > 0 && !item.isDirectory) {
            const base = item.name.substring(0, lastDot);
            const ext = item.name.substring(lastDot);
            destName = `${base}_copy${ext}`;
          } else {
            destName = `${item.name}_copy`;
          }
        }

        return { ...item, destName };
      })
      .filter((item): item is { name: string; path: string; isDirectory: boolean; destName: string; file?: File } => item !== null);

    if (finalItems.length === 0) return;

    if (target === 'local') {
      setUploading(true);

      const internalDragFromRemote = finalItems.some(i => !i.file && i.path.startsWith('/'));

      if (internalDragFromRemote) {
        try {
          for (const item of finalItems) {
            await fetch('/api/sync/download-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: connectionId, remotePath: item.path })
            });
          }
          fetchLocalFiles();
        } catch (err) {
          console.error('Remote-to-local drop failed', err);
        } finally {
          setUploading(false);
        }
        return;
      }

      const hasPaths = finalItems.every(item => item.path && item.path !== item.name);

      if (hasPaths) {
        try {
          await fetch(`/api/files/import-local/${connectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: finalItems.map(i => ({ srcPath: i.path, destName: i.destName })),
              subDir: ''
            })
          });
          fetchLocalFiles();
        } catch (err) {
          console.error('Local import failed', err);
        } finally {
          setUploading(false);
        }
      } else {
        const formData = new FormData();
        finalItems.forEach(item => {
          if (item.file) {
            const renamedFile = new File([item.file], item.destName, { type: item.file.type });
            formData.append('files', renamedFile);
          }
        });

        try {
          await fetch(`/api/files/upload/${connectionId}`, {
            method: 'POST',
            body: formData
          });
          fetchLocalFiles();
        } catch (err) {
          console.error('Browser upload failed', err);
        } finally {
          setUploading(false);
        }
      }

    } else {
      setUploading(true);

      const internalDragFromLocal = finalItems.some(i => !i.file && !i.path.includes('\\') && !i.path.includes('/'));

      if (internalDragFromLocal) {
        try {
          for (const item of finalItems) {
            await fetch('/api/sync/upload-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: connectionId,
                filename: item.name,
                remoteName: item.destName !== item.name ? item.destName : undefined
              })
            });
          }
          setTimeout(() => fetchRemoteFiles(currentRemotePath), 1000);
        } catch (err) {
          console.error('Local-to-remote drop failed', err);
        } finally {
          setUploading(false);
        }
        return;
      }

      const hasPaths = finalItems.every(item => item.path && item.path !== item.name);

      if (hasPaths) {
        try {
          const importRes = await fetch(`/api/files/import-local/${connectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: finalItems.map(i => ({ srcPath: i.path, destName: i.destName })),
              remoteDir: currentRemotePath
            })
          });
          const importData = await importRes.json();
          
          if (importData.success) {
            await fetch('/api/sync/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: connectionId,
                basePath: importData.relativePath,
                items: finalItems.map(i => ({
                  path: i.destName,
                  localName: i.destName,
                  direction: 'upload',
                  isDirectory: i.isDirectory
                }))
              })
            });

            fetchLocalFiles();
            setTimeout(() => fetchRemoteFiles(currentRemotePath), 1500);
          }
        } catch (err) {
          console.error('Remote drop upload failed', err);
        } finally {
          setUploading(false);
        }
      } else {
        const formData = new FormData();
        finalItems.forEach(item => {
          if (item.file) {
            const renamedFile = new File([item.file], item.destName, { type: item.file.type });
            formData.append('files', renamedFile);
          }
        });

        try {
          const getRelRes = await fetch(`/api/files/import-local/${connectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [], remoteDir: currentRemotePath })
          });
          const getRelData = await getRelRes.json();
          const relativePath = getRelData.relativePath || '';

          await fetch(`/api/files/upload/${connectionId}?subDir=${encodeURIComponent(relativePath)}`, {
            method: 'POST',
            body: formData
          });

          await fetch('/api/sync/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: connectionId,
              basePath: relativePath,
              items: finalItems.map(i => ({
                path: i.destName,
                localName: i.destName,
                direction: 'upload',
                isDirectory: i.isDirectory
              }))
            })
          });

          fetchLocalFiles();
          setTimeout(() => fetchRemoteFiles(currentRemotePath), 1500);
        } catch (err) {
          console.error('Browser remote upload failed', err);
        } finally {
          setUploading(false);
        }
      }
    }
  };

  const fetchRemoteFiles = async (path?: string) => {
    setLoading(true);
    try {
      const url = path 
        ? `/api/files/ftp/${connectionId}?path=${encodeURIComponent(path)}`
        : `/api/files/ftp/${connectionId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.files) {
        setRemoteFiles(data.files);
        setCurrentRemotePath(data.currentPath);
      }
    } catch (err) {
      console.error('Failed to fetch remote files', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocalFiles = async () => {
    try {
      const res = await fetch(`/api/files/local/${connectionId}`);
      const data = await res.json();
      if (data.files) {
        setLocalFiles(data.files);
      }
    } catch (err) {
      console.error('Failed to fetch local files', err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => {
      formData.append('files', file);
    });

    try {
      await fetch(`/api/files/upload/${connectionId}`, {
        method: 'POST',
        body: formData
      });
      fetchLocalFiles(); // Refresh local list
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleManualDownload = async (file: FileItem) => {
    if (file.isDirectory || !file.path) return;
    try {
      await fetch('/api/sync/download-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, remotePath: file.path })
      });
      fetchLocalFiles();
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  const handleManualUpload = async (file: FileItem) => {
    if (file.isDirectory) return;
    try {
      await fetch('/api/sync/upload-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, filename: file.name })
      });
    } catch (err) {
      console.error('Upload failed', err);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await fetch('/api/sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId })
      });
      setTimeout(() => {
        fetchRemoteFiles(currentRemotePath);
        fetchLocalFiles();
        setSyncing(false);
      }, 2000);
    } catch (err) {
      setSyncing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-[#0d0e12]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#161922]/95 backdrop-blur-md border border-neutral-800/80 w-full max-w-5xl h-[80vh] flex flex-col rounded-2xl text-neutral-200 font-sans shadow-2xl overflow-hidden select-none">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-neutral-800/60 bg-[#0d0e12]/60 shrink-0">
          <div>
            <h2 className="text-sm font-bold font-outfit text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-orange-500 block animate-signal"></span>
              File Explorer
            </h2>
            <p className="text-[10px] text-neutral-500 font-mono mt-1 uppercase">Node: {serverName}</p>
          </div>
          <div className="flex items-center space-x-2">
             <button 
                onClick={handleSyncNow}
                disabled={syncing}
                className={`flex items-center px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 text-xs font-semibold rounded-lg uppercase transition-all duration-150 ${syncing ? 'opacity-70 cursor-wait' : ''}`}
             >
               <Play size={12} className="mr-2 fill-current" />
               {syncing ? 'Sync_Active...' : 'Sync Now'}
             </button>
             <button onClick={onClose} className="p-1.5 hover:bg-neutral-850 text-neutral-400 hover:text-white rounded-lg transition-colors">
               <X size={18} />
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden bg-neutral-900/10">
          
          {/* FTP Remote Panel */}
          <div 
            className={`flex-1 flex flex-col border-r border-neutral-800/60 transition-all duration-300 relative ${
              dragOverRemote ? 'bg-orange-500/5' : ''
            }`}
            onDragOver={(e) => {
               e.preventDefault();
               e.stopPropagation();
               setDragOverRemote(true);
            }}
            onDragLeave={(e) => {
               e.preventDefault();
               e.stopPropagation();
               setDragOverRemote(false);
            }}
            onDrop={(e) => handleDropToPanel(e, 'remote')}
          >
            {dragOverRemote && (
              <div className="absolute inset-0 bg-orange-950/20 backdrop-blur-[2px] border-2 border-dashed border-orange-500/60 flex flex-col justify-center items-center z-20 pointer-events-none animate-pulse">
                <CloudUpload className="text-orange-500 w-12 h-12 mb-3 stroke-[1.5]" />
                <span className="text-orange-500 text-xs font-bold tracking-widest uppercase">DROP_TO_UPLOAD_TO_REMOTE</span>
                <span className="text-[10px] text-orange-600 mt-1 uppercase font-mono">NODE: {currentRemotePath}</span>
              </div>
            )}
            <div className="p-3 bg-[#0d0e12]/40 border-b border-neutral-800/60 flex justify-between items-center shrink-0">
              <h3 className="font-semibold font-outfit text-xs uppercase tracking-wider text-neutral-300 flex items-center">
                <ServerIcon className="w-3.5 h-3.5 mr-2 text-amber-500" /> Remote FTP
              </h3>
              <button onClick={() => fetchRemoteFiles(currentRemotePath)} className="p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors rounded-md shrink-0">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            {/* Breadcrumb / Path */}
            <div className="px-3 py-2 bg-[#0d0e12]/20 border-b border-neutral-800/60 text-xs text-neutral-400 flex items-center shrink-0">
              <button 
                onClick={() => {
                   const parent = currentRemotePath.split('/').slice(0, -1).join('/') || '/';
                   fetchRemoteFiles(parent);
                }}
                disabled={currentRemotePath === '/' || loading}
                className="mr-2 p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 disabled:opacity-30 rounded-md shrink-0 transition-colors"
              >
                <ArrowLeft size={12} />
              </button>
              <span className="truncate font-mono text-[11px] uppercase text-neutral-300">// {currentRemotePath}</span>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-3 bg-[#0d0e12]/10 custom-scrollbar space-y-1">
              {loading ? (
                <div className="flex flex-col justify-center items-center h-full text-neutral-500 text-xs uppercase font-mono tracking-wider">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500 mb-2"></div>
                  LOADING_REMOTE_FILES...
                </div>
              ) : (
                <ul className="space-y-1">
                  {remoteFiles.map((file, i) => (
                    <li key={i}>
                      <button
                        onClick={() => file.isDirectory && fetchRemoteFiles(file.path)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            source: 'remote',
                            file
                          }));
                        }}
                        className={`w-full flex items-center p-2.5 rounded-xl hover:bg-[#161922]/50 hover:border-neutral-800/40 border border-transparent text-left group hover:cursor-grab active:cursor-grabbing transition-all duration-150 ${
                          !file.isDirectory ? 'cursor-default' : ''
                        }`}
                      >
                        {file.isDirectory ? (
                          <Folder size={14} className="text-amber-500 mr-3 flex-shrink-0" />
                        ) : (
                          <FileIcon size={14} className="text-neutral-500 mr-3 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors uppercase">
                            {file.name}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                            {file.isDirectory ? 'DIRECTORY' : formatSize(file.size)} // {new Date(file.modifiedAt).toLocaleDateString()}
                          </div>
                        </div>
                        {!file.isDirectory && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleManualDownload(file); }}
                            className="p-1.5 border border-neutral-850 bg-neutral-950 text-neutral-400 hover:text-orange-400 hover:bg-neutral-900 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0"
                            title="Download to Local"
                          >
                            <Download size={14} />
                          </button>
                        )}
                      </button>
                    </li>
                  ))}
                  {remoteFiles.length === 0 && (
                     <div className="text-center py-12 text-neutral-500 text-xs uppercase font-mono tracking-wider">DIRECTORY_EMPTY</div>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Local Sync Panel */}
          <div 
            className={`flex-1 flex flex-col bg-neutral-900/10 transition-all duration-300 relative ${
              dragOverLocal ? 'bg-orange-500/5' : ''
            }`}
            onDragOver={(e) => {
               e.preventDefault();
               e.stopPropagation();
               setDragOverLocal(true);
            }}
            onDragLeave={(e) => {
               e.preventDefault();
               e.stopPropagation();
               setDragOverLocal(false);
            }}
            onDrop={(e) => handleDropToPanel(e, 'local')}
          >
            {dragOverLocal && (
              <div className="absolute inset-0 bg-orange-950/20 backdrop-blur-[2px] border-2 border-dashed border-orange-500/60 flex flex-col justify-center items-center z-20 pointer-events-none animate-pulse">
                <CloudUpload className="text-orange-500 w-12 h-12 mb-3 stroke-[1.5]" />
                <span className="text-orange-500 text-xs font-bold tracking-widest uppercase">DROP_TO_IMPORT_TO_LOCAL</span>
                <span className="text-[10px] text-orange-600 mt-1 uppercase font-mono">DEST: LOCAL_SYNC_ROOT</span>
              </div>
            )}
            <div className="p-3 bg-[#0d0e12]/40 border-b border-neutral-800/60 flex justify-between items-center shadow-sm z-10 shrink-0">
               <h3 className="font-semibold font-outfit text-xs uppercase tracking-wider text-neutral-300 flex items-center">
                 <LaptopIcon className="w-3.5 h-3.5 mr-2 text-amber-500" /> Local Sync Folder
               </h3>
               <div className="flex items-center">
                  <button onClick={fetchLocalFiles} className="p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors rounded-md mr-2 shrink-0">
                    <RefreshCw size={12} />
                  </button>
                  <label className={`flex items-center px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-neutral-950 text-xs font-bold rounded-lg cursor-pointer uppercase transition-all duration-150 shrink-0 ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                    <Upload size={12} className="mr-1.5 stroke-[2.5]" />
                    {uploading ? 'Uploading...' : 'Upload Files'}
                    <input type="file" multiple className="hidden" onChange={handleUpload} />
                  </label>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-[#0d0e12]/10 space-y-1">
               <ul className="space-y-1">
                  {localFiles.map((file, i) => (
                    <li 
                      key={i} 
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          source: 'local',
                          file
                        }));
                      }}
                      className="flex items-center p-2.5 rounded-xl bg-[#161922]/30 border border-neutral-800/40 hover:border-neutral-700/60 hover:bg-[#161922]/60 hover:cursor-grab active:cursor-grabbing group transition-all duration-150 mb-1.5"
                    >
                        <FileIcon size={14} className="text-neutral-500 mr-3 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs font-semibold text-neutral-200 uppercase">
                            {file.name}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                            {formatSize(file.size)} // {new Date(file.modifiedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2.5 shrink-0">
                           <button 
                              onClick={() => handleManualUpload(file)}
                              className="p-1.5 text-neutral-400 border border-neutral-850 bg-neutral-950 hover:text-orange-400 hover:bg-neutral-900 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150"
                              title="Upload to FTP"
                           >
                              <CloudUpload size={14} />
                           </button>
                           <div className="text-[9px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 px-2.5 py-0.5 rounded-full uppercase font-mono">
                              Synced
                           </div>
                        </div>
                    </li>
                  ))}
                  {localFiles.length === 0 && (
                     <div className="text-center py-12 text-neutral-500 font-mono">
                        <Upload size={24} className="mx-auto mb-2 opacity-20 text-neutral-400" />
                        <p className="text-xs uppercase font-bold tracking-wider">No local files detected</p>
                        <p className="text-[9px] mt-1 text-neutral-600 uppercase font-mono max-w-[250px] mx-auto leading-relaxed">FILES PLACED IN LOCAL_SYNC WILL SYNC AUTOMATICALLY.</p>
                     </div>
                  )}
               </ul>
            </div>
          </div>

        </div>
      </div>
      
      <ConflictResolverModal
        isOpen={showConflictModal}
        conflicts={conflicts}
        onResolve={handleResolveConflicts}
        onClose={() => {
          setShowConflictModal(false);
          setPendingDropItems([]);
          setConflicts([]);
        }}
      />
    </div>
  );
};

// Simple Icons
const ServerIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
);

const LaptopIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="16" x="2" y="3" rx="2"/><path d="M12 19v2"/><path d="M8 21h8"/><path d="M2 15h20"/></svg>
);

export default FileManager;
