import React, { useState, useEffect } from 'react';
import { X, Upload, Folder, File, RefreshCw, ArrowLeft, Download, CloudUpload, Play } from 'lucide-react';

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

  useEffect(() => {
    fetchRemoteFiles();
    fetchLocalFiles();
  }, [connectionId]);

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">File Manager</h2>
            <p className="text-sm text-gray-500">Connection: {serverName}</p>
          </div>
          <div className="flex items-center space-x-2">
             <button 
               onClick={handleSyncNow}
               disabled={syncing}
               className={`flex items-center px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors ${syncing ? 'opacity-70 cursor-wait' : ''}`}
             >
               <Play size={14} className="mr-2" />
               {syncing ? 'Syncing...' : 'Sync Now'}
             </button>
             <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
               <X size={24} className="text-gray-500" />
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* FTP Remote Panel */}
          <div className="flex-1 flex flex-col border-r border-gray-200">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold text-gray-700 flex items-center">
                <ServerIcon className="w-4 h-4 mr-2" /> Remote FTP
              </h3>
              <button onClick={() => fetchRemoteFiles(currentRemotePath)} className="p-1 hover:bg-gray-200 rounded">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            {/* Breadcrumb / Path */}
            <div className="px-3 py-2 bg-white border-b border-gray-100 text-sm text-gray-600 flex items-center">
              <button 
                onClick={() => {
                   const parent = currentRemotePath.split('/').slice(0, -1).join('/') || '/';
                   fetchRemoteFiles(parent);
                }}
                disabled={currentRemotePath === '/' || loading}
                className="mr-2 p-1 hover:bg-gray-100 rounded disabled:opacity-30"
              >
                <ArrowLeft size={14} />
              </button>
              <span className="truncate font-mono">{currentRemotePath}</span>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex justify-center items-center h-full text-gray-400">Loading...</div>
              ) : (
                <ul className="space-y-1">
                  {remoteFiles.map((file, i) => (
                    <li key={i}>
                      <button
                        onClick={() => file.isDirectory && fetchRemoteFiles(file.path)}
                        className={`w-full flex items-center p-2 rounded hover:bg-blue-50 text-left group ${!file.isDirectory ? 'cursor-default' : ''}`}
                      >
                        {file.isDirectory ? (
                          <Folder size={18} className="text-yellow-500 mr-3 flex-shrink-0" />
                        ) : (
                          <File size={18} className="text-gray-400 mr-3 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium text-gray-700 group-hover:text-blue-700">
                            {file.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {file.isDirectory ? '-' : formatSize(file.size)} • {new Date(file.modifiedAt).toLocaleDateString()}
                          </div>
                        </div>
                        {!file.isDirectory && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); handleManualDownload(file); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Download to Local"
                          >
                            <Download size={16} />
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                  {remoteFiles.length === 0 && (
                     <div className="text-center py-10 text-gray-400 text-sm">Folder is empty</div>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Local Sync Panel */}
          <div 
            className="flex-1 flex flex-col bg-gray-50/50"
            onDragOver={(e) => {
               e.preventDefault();
               e.stopPropagation();
               e.currentTarget.classList.add('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
            }}
            onDragLeave={(e) => {
               e.preventDefault();
               e.stopPropagation();
               e.currentTarget.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
            }}
            onDrop={async (e) => {
               e.preventDefault();
               e.stopPropagation();
               e.currentTarget.classList.remove('bg-blue-50', 'border-2', 'border-blue-400', 'border-dashed');
               
               if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                 setUploading(true);
                 const formData = new FormData();
                 Array.from(e.dataTransfer.files).forEach(file => {
                   formData.append('files', file);
                 });

                 try {
                   await fetch(`/api/files/upload/${connectionId}`, {
                     method: 'POST',
                     body: formData
                   });
                   fetchLocalFiles();
                 } catch (err) {
                   console.error('Drop upload failed', err);
                 } finally {
                   setUploading(false);
                 }
               }
            }}
          >
            <div className="p-3 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
               <h3 className="font-semibold text-gray-700 flex items-center">
                 <LaptopIcon className="w-4 h-4 mr-2" /> Local Sync Folder
               </h3>
               <div className="flex items-center">
                  <button onClick={fetchLocalFiles} className="p-1 hover:bg-gray-100 rounded mr-2">
                    <RefreshCw size={16} />
                  </button>
                  <label className={`flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded cursor-pointer hover:bg-blue-700 transition-colors ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                    <Upload size={14} className="mr-2" />
                    {uploading ? 'Uploading...' : 'Upload Files'}
                    <input type="file" multiple className="hidden" onChange={handleUpload} />
                  </label>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
               <ul className="space-y-1">
                  {localFiles.map((file, i) => (
                    <li key={i} className="flex items-center p-2 rounded bg-white border border-gray-100 hover:border-blue-200 group">
                        <File size={18} className="text-blue-400 mr-3 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium text-gray-700">
                            {file.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatSize(file.size)} • {new Date(file.modifiedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                           <button 
                              onClick={() => handleManualUpload(file)}
                              className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Upload to FTP"
                           >
                              <CloudUpload size={16} />
                           </button>
                           <div className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                              Synced
                           </div>
                        </div>
                    </li>
                  ))}
                  {localFiles.length === 0 && (
                     <div className="text-center py-12 text-gray-400">
                        <Upload size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No files uploaded yet.</p>
                        <p className="text-xs mt-1">Files uploaded here will auto-sync to FTP</p>
                     </div>
                  )}
               </ul>
            </div>
          </div>

        </div>
      </div>
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
