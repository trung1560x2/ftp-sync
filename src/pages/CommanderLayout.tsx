import React, { useState, useEffect } from 'react';
import LocalPane, { LocalFileItem } from '../components/explorer/LocalPane';
import RemotePane, { RemoteFileItem } from '../components/explorer/RemotePane';
import RemoteFileEditor from '../components/RemoteFileEditor';
import { Server, Loader2, ArrowLeftRight, Check, X, ShieldAlert, Archive } from 'lucide-react';
import { useSyncProgress } from '../hooks/useSyncProgress';

interface Connection {
  id: number;
  name?: string;
  server: string;
  protocol?: 'ftp' | 'ftps' | 'sftp';
  local_path?: string;
  target_directory?: string;
}

// Modal States
interface ChmodModalState {
  isOpen: boolean;
  items: RemoteFileItem[];
  octal: string;
  user: { read: boolean; write: boolean; exec: boolean };
  group: { read: boolean; write: boolean; exec: boolean };
  other: { read: boolean; write: boolean; exec: boolean };
  recursive: boolean;
}

interface ArchiveModalState {
  isOpen: boolean;
  folderPath: string;
  archivePath: string;
  type: 'zip' | 'tar';
}

interface BulkRenameModalState {
  isOpen: boolean;
  dirPath: string;
  isLocal: boolean;
  items: Array<{ name: string; path: string; isDirectory: boolean }>;
  findPattern: string;
  replacePattern: string;
}

interface DeleteModalState {
  isOpen: boolean;
  isLocal: boolean;
  items: Array<{ name: string; path: string; isDirectory: boolean }>;
}

const CommanderLayout: React.FC = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<number | null>(null);
  const [selectedConn, setSelectedConn] = useState<Connection | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  
  // Refresh triggers to refresh file listings after sync operations
  const [localRefresh, setLocalRefresh] = useState(0);
  const [remoteRefresh, setRemoteRefresh] = useState(0);

  // Load connection progress indicators
  const progressData = useSyncProgress(selectedConnId || 0, !!selectedConnId);

  // Modals state
  const [chmodModal, setChmodModal] = useState<ChmodModalState>({
    isOpen: false,
    items: [],
    octal: '644',
    user: { read: true, write: true, exec: false },
    group: { read: true, write: false, exec: false },
    other: { read: true, write: false, exec: false },
    recursive: false
  });

  const [archiveModal, setArchiveModal] = useState<ArchiveModalState>({
    isOpen: false,
    folderPath: '',
    archivePath: '',
    type: 'zip'
  });

  const [renameModal, setRenameModal] = useState<BulkRenameModalState>({
    isOpen: false,
    dirPath: '',
    isLocal: false,
    items: [],
    findPattern: '',
    replacePattern: ''
  });

  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    isLocal: false,
    items: []
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/ftp-connections');
      const data = await res.json();
      setConnections(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load connections', err);
    }
  };

  const handleSelectConnection = async (connId: number) => {
    const conn = connections.find(c => c.id === connId) || null;
    setSelectedConn(conn);
    setSelectedConnId(connId);
    
    if (conn) {
      setLoadingSession(true);
      setSessionId(null);
      try {
        // Find existing session or create a new one
        const res = await fetch('/api/terminal/sessions');
        const data = await res.json();
        let activeSessionId = null;
        
        if (data.success && data.sessions) {
          const found = data.sessions.find((s: { connectionId: number; sessionId: string }) => s.connectionId === connId);
          if (found) activeSessionId = found.sessionId;
        }

        if (!activeSessionId) {
          const createRes = await fetch('/api/terminal/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: connId })
          });
          const createData = await createRes.json();
          if (createData.success) {
            activeSessionId = createData.sessionId;
          }
        }
        
        setSessionId(activeSessionId);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSession(false);
      }
    }
  };

  // --- Sync Operations ---
  const handleDropLocalItemOnRemote = async (item: { relPath: string; isDirectory: boolean }) => {
    if (!selectedConnId) return;
    try {
      const res = await fetch('/api/sync/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedConnId,
          items: [{ path: item.relPath, direction: 'upload', isDirectory: item.isDirectory }],
          basePath: '/'
        })
      });
      const data = await res.json();
      if (data.success) {
        setTimeout(() => setRemoteRefresh(p => p + 1), 1000);
      } else {
        alert('Sync failed: ' + data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDropRemoteItemOnLocal = async (item: { relPath: string; isDirectory: boolean }) => {
    if (!selectedConnId) return;
    try {
      const res = await fetch('/api/sync/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedConnId,
          items: [{ path: item.relPath, direction: 'download', isDirectory: item.isDirectory }],
          basePath: '/'
        })
      });
      const data = await res.json();
      if (data.success) {
        setTimeout(() => setLocalRefresh(p => p + 1), 1000);
      } else {
        alert('Sync failed: ' + data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadLocalItem = async (item: LocalFileItem) => {
    const relPath = item.path.substring((selectedConn?.local_path || '').length).replace(/\\/g, '/').replace(/^\//, '');
    await handleDropLocalItemOnRemote({ relPath, isDirectory: item.isDirectory });
  };

  const handleDownloadRemoteItem = async (item: RemoteFileItem) => {
    const relPath = item.path.substring((selectedConn?.target_directory || '').length).replace(/^\//, '');
    await handleDropRemoteItemOnLocal({ relPath, isDirectory: item.isDirectory });
  };

  const handleUploadMultiple = async (items: LocalFileItem[]) => {
    if (!selectedConnId) return;
    try {
      const syncItems = items.map(item => ({
        path: item.path.substring((selectedConn?.local_path || '').length).replace(/\\/g, '/').replace(/^\//, ''),
        direction: 'upload' as const,
        isDirectory: item.isDirectory
      }));

      const res = await fetch('/api/sync/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedConnId,
          items: syncItems,
          basePath: '/'
        })
      });
      const data = await res.json();
      if (data.success) {
        setTimeout(() => setRemoteRefresh(p => p + 1), 1000);
      } else {
        alert('Bulk upload failed: ' + data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadMultiple = async (items: RemoteFileItem[]) => {
    if (!selectedConnId) return;
    try {
      const syncItems = items.map(item => ({
        path: item.path.substring((selectedConn?.target_directory || '').length).replace(/^\//, ''),
        direction: 'download' as const,
        isDirectory: item.isDirectory
      }));

      const res = await fetch('/api/sync/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedConnId,
          items: syncItems,
          basePath: '/'
        })
      });
      const data = await res.json();
      if (data.success) {
        setTimeout(() => setLocalRefresh(p => p + 1), 1000);
      } else {
        alert('Bulk download failed: ' + data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Modal Launchers ---
  const launchChmodModal = (items: RemoteFileItem[]) => {
    setChmodModal({
      isOpen: true,
      items,
      octal: '644',
      user: { read: true, write: true, exec: false },
      group: { read: true, write: false, exec: false },
      other: { read: true, write: false, exec: false },
      recursive: false
    });
  };

  const launchArchiveModal = (folderPath: string) => {
    const defaultArchive = folderPath.endsWith('/') ? folderPath.slice(0, -1) + '.zip' : folderPath + '.zip';
    setArchiveModal({
      isOpen: true,
      folderPath,
      archivePath: defaultArchive,
      type: 'zip'
    });
  };

  const launchBulkRenameModal = (dirPath: string, isLocal: boolean, items: Array<{ name: string; path: string; isDirectory: boolean }>) => {
    setRenameModal({
      isOpen: true,
      dirPath,
      isLocal,
      items,
      findPattern: '',
      replacePattern: ''
    });
  };

  const launchDeleteModal = (isLocal: boolean, items: Array<{ name: string; path: string; isDirectory: boolean }>) => {
    setDeleteModal({
      isOpen: true,
      isLocal,
      items
    });
  };

  // --- Modal Apply Actions ---
  const applyChmod = async () => {
    if (!sessionId) return;
    try {
      for (const item of chmodModal.items) {
        await fetch(`/api/terminal/sessions/${sessionId}/chmod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: item.path,
            mode: chmodModal.octal,
            recursive: chmodModal.recursive
          })
        });
      }
      setChmodModal(prev => ({ ...prev, isOpen: false }));
      setRemoteRefresh(p => p + 1);
    } catch (err) {
      console.error(err);
      alert('Chmod failed');
    }
  };

  const applyArchive = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: archiveModal.folderPath,
          archivePath: archiveModal.archivePath,
          type: archiveModal.type
        })
      });
      const data = await res.json();
      if (data.success) {
        setArchiveModal(prev => ({ ...prev, isOpen: false }));
        setRemoteRefresh(p => p + 1);
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const applyExtract = async (archivePath: string) => {
    if (!sessionId) return;
    const extractPath = archivePath.substring(0, archivePath.lastIndexOf('/'));
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archivePath,
          extractPath
        })
      });
      const data = await res.json();
      if (data.success) {
        setRemoteRefresh(p => p + 1);
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const applyBulkRename = async () => {
    const endpoint = renameModal.isLocal
      ? '/api/system/bulk-rename'
      : `/api/terminal/sessions/${sessionId}/bulk-rename`;

    const renamedItems = renameModal.items.map(item => {
      let newName = item.name;
      if (renameModal.findPattern) {
        newName = item.name.replace(new RegExp(renameModal.findPattern, 'g'), renameModal.replacePattern);
      }
      return { oldName: item.name, newName };
    });

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dirPath: renameModal.dirPath,
          items: renamedItems
        })
      });
      const data = await res.json();
      if (data.success || data.success === undefined) {
        setRenameModal(prev => ({ ...prev, isOpen: false }));
        if (renameModal.isLocal) setLocalRefresh(p => p + 1);
        else setRemoteRefresh(p => p + 1);
      } else {
        alert('Rename failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const applyDelete = async () => {
    try {
      if (deleteModal.isLocal) {
        for (const item of deleteModal.items) {
          await fetch('/api/system/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: item.path })
          });
        }
        setLocalRefresh(p => p + 1);
      } else {
        if (!sessionId) return;
        for (const item of deleteModal.items) {
          const endpoint = item.isDirectory ? 'rmdir' : 'rm';
          await fetch(`/api/terminal/sessions/${sessionId}/${endpoint}?path=${encodeURIComponent(item.path)}`, {
            method: 'DELETE'
          });
        }
        setRemoteRefresh(p => p + 1);
      }
      setDeleteModal(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error(err);
    }
  };

  // Helper: calculate octal from chmod state
  const updateChmodPermissions = (role: 'user' | 'group' | 'other', action: 'read' | 'write' | 'exec', value: boolean) => {
    setChmodModal(prev => {
      const updated = {
        ...prev,
        [role]: { ...prev[role], [action]: value }
      };
      
      const calcVal = (perm: { read: boolean; write: boolean; exec: boolean }): number => {
        return (perm.read ? 4 : 0) + (perm.write ? 2 : 0) + (perm.exec ? 1 : 0);
      };
      
      const u = calcVal(updated.user);
      const g = calcVal(updated.group);
      const o = calcVal(updated.other);
      updated.octal = `${u}${g}${o}`;
      
      return updated;
    });
  };

  const handleOctalChange = (octalStr: string) => {
    if (octalStr.length > 3) return;
    setChmodModal(prev => {
      const updated = { ...prev, octal: octalStr };
      if (octalStr.length === 3) {
        const u = parseInt(octalStr[0], 10) || 0;
        const g = parseInt(octalStr[1], 10) || 0;
        const o = parseInt(octalStr[2], 10) || 0;
        
        updated.user = { read: (u & 4) !== 0, write: (u & 2) !== 0, exec: (u & 1) !== 0 };
        updated.group = { read: (g & 4) !== 0, write: (g & 2) !== 0, exec: (g & 1) !== 0 };
        updated.other = { read: (o & 4) !== 0, write: (o & 2) !== 0, exec: (o & 1) !== 0 };
      }
      return updated;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-52px)] bg-neutral-950 text-neutral-300 font-mono text-xs select-none relative p-4">
      {!selectedConnId ? (
        <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-orange-600/10 border border-orange-500/30 flex items-center justify-center mx-auto mb-4">
              <ArrowLeftRight size={32} className="text-orange-500" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">Select Connection for Commander View</h2>
            <p className="text-[10px] text-neutral-500 mt-2 uppercase">Please choose a connection to start the dual-pane file manager</p>
          </div>

          <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 divide-y divide-neutral-800/40">
            {connections.length === 0 ? (
              <div className="text-center py-6 text-neutral-600 uppercase">No connections found</div>
            ) : (
              connections.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectConnection(c.id)}
                  className="w-full flex items-center justify-between py-3 hover:text-orange-400 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Server size={14} className="text-neutral-500" />
                    <div>
                      <span className="font-bold text-neutral-300">{c.name || 'Unnamed'}</span>
                      <span className="text-[10px] text-neutral-600 ml-2">({c.server}:{c.protocol})</span>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded">Connect</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full gap-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800/50 pb-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedConnId(null);
                  setSelectedConn(null);
                  setSessionId(null);
                }}
                className="px-2.5 py-1 text-[10px] font-bold bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200 rounded transition-all cursor-pointer"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <span className="font-bold text-neutral-200 text-sm">{selectedConn?.name}</span>
                <span className="text-[10px] text-neutral-600">({selectedConn?.server})</span>
              </div>
            </div>
            {progressData && progressData.activeUploads && progressData.activeUploads.length > 0 && (
              <div className="flex items-center gap-2 text-orange-500 text-[10px]">
                <Loader2 size={12} className="animate-spin" />
                <span>
                  Syncing {progressData.activeUploads[0].filename} ({Math.round(progressData.activeUploads[0].percent)}%)
                  {progressData.queueLength > 0 && ` + ${progressData.queueLength} in queue`}
                </span>
              </div>
            )}
          </div>

          {/* Commander Panes Grid */}
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
            {loadingSession ? (
              <div className="col-span-2 flex flex-col items-center justify-center gap-3">
                <Loader2 size={24} className="text-orange-500 animate-spin" />
                <span className="text-neutral-500 uppercase text-[10px]">Establishing secure connection pool...</span>
              </div>
            ) : (
              <>
                <LocalPane
                  localRoot={selectedConn?.local_path || ''}
                  onDropRemoteItem={handleDropRemoteItemOnLocal}
                  onUploadItem={handleUploadLocalItem}
                  onUploadMultiple={handleUploadMultiple}
                  onBulkRename={(dir, items) => launchBulkRenameModal(dir, true, items)}
                  onDeleteMultiple={(items) => launchDeleteModal(true, items)}
                  refreshTrigger={localRefresh}
                />
                <RemotePane
                  sessionId={sessionId || ''}
                  targetDirectory={selectedConn?.target_directory || '/'}
                  onDropLocalItem={handleDropLocalItemOnRemote}
                  onDownloadItem={handleDownloadRemoteItem}
                  onDownloadMultiple={handleDownloadMultiple}
                  onBulkRename={(dir, items) => launchBulkRenameModal(dir, false, items)}
                  onChmod={launchChmodModal}
                  onArchive={launchArchiveModal}
                  onExtract={applyExtract}
                  onDeleteMultiple={(items) => launchDeleteModal(false, items)}
                  onOpenFile={(remotePath) => setEditingFile(remotePath)}
                  refreshTrigger={remoteRefresh}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Monaco Remote File Editor Overlay */}
      {editingFile && sessionId && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full h-full max-w-6xl max-h-[85vh] bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl relative">
            <RemoteFileEditor
              connectionId={selectedConnId!}
              remotePath={editingFile}
              onClose={() => {
                setEditingFile(null);
                setRemoteRefresh(p => p + 1);
              }}
            />
          </div>
        </div>
      )}

      {/* CHMOD Modal */}
      {chmodModal.isOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl text-neutral-300">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <span className="font-bold text-xs uppercase tracking-widest text-neutral-100 flex items-center gap-2">
                <Check size={14} className="text-orange-500" />
                Change Permissions (CHMOD)
              </span>
              <button onClick={() => setChmodModal(prev => ({ ...prev, isOpen: false }))}>
                <X size={14} className="text-neutral-500 hover:text-neutral-300" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr className="text-neutral-500">
                    <th>Group</th>
                    <th>Read (4)</th>
                    <th>Write (2)</th>
                    <th>Execute (1)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850">
                  <tr className="h-10">
                    <td className="font-bold text-neutral-300 text-left">Owner</td>
                    <td><input type="checkbox" checked={chmodModal.user.read} onChange={(e) => updateChmodPermissions('user', 'read', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={chmodModal.user.write} onChange={(e) => updateChmodPermissions('user', 'write', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={chmodModal.user.exec} onChange={(e) => updateChmodPermissions('user', 'exec', e.target.checked)} /></td>
                  </tr>
                  <tr className="h-10">
                    <td className="font-bold text-neutral-300 text-left">Group</td>
                    <td><input type="checkbox" checked={chmodModal.group.read} onChange={(e) => updateChmodPermissions('group', 'read', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={chmodModal.group.write} onChange={(e) => updateChmodPermissions('group', 'write', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={chmodModal.group.exec} onChange={(e) => updateChmodPermissions('group', 'exec', e.target.checked)} /></td>
                  </tr>
                  <tr className="h-10">
                    <td className="font-bold text-neutral-300 text-left">Public</td>
                    <td><input type="checkbox" checked={chmodModal.other.read} onChange={(e) => updateChmodPermissions('other', 'read', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={chmodModal.other.write} onChange={(e) => updateChmodPermissions('other', 'write', e.target.checked)} /></td>
                    <td><input type="checkbox" checked={chmodModal.other.exec} onChange={(e) => updateChmodPermissions('other', 'exec', e.target.checked)} /></td>
                  </tr>
                </tbody>
              </table>

              <div className="flex items-center justify-between border-t border-neutral-850 pt-3">
                <span className="text-neutral-500">Octal permissions:</span>
                <input
                  type="text"
                  value={chmodModal.octal}
                  onChange={(e) => handleOctalChange(e.target.value)}
                  className="w-16 bg-neutral-950 border border-neutral-850 px-2 py-1 text-center font-bold text-orange-500 focus:outline-none focus:border-orange-500 rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Recursive:</span>
                <input
                  type="checkbox"
                  checked={chmodModal.recursive}
                  onChange={(e) => setChmodModal(prev => ({ ...prev, recursive: e.target.checked }))}
                />
              </div>
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-2">
              <button onClick={() => setChmodModal(prev => ({ ...prev, isOpen: false }))} className="px-3 py-1.5 hover:text-white text-neutral-400">Cancel</button>
              <button onClick={applyChmod} className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase rounded">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive (Zip/Tar) Modal */}
      {archiveModal.isOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl text-neutral-300">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <span className="font-bold text-xs uppercase tracking-widest text-neutral-100 flex items-center gap-2">
                <Archive size={14} className="text-orange-500" />
                Archive Folder
              </span>
              <button onClick={() => setArchiveModal(prev => ({ ...prev, isOpen: false }))}>
                <X size={14} className="text-neutral-500 hover:text-neutral-300" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-neutral-500">Archive Destination Path:</span>
                <input
                  type="text"
                  value={archiveModal.archivePath}
                  onChange={(e) => setArchiveModal(prev => ({ ...prev, archivePath: e.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-850 px-2 py-1.5 rounded focus:outline-none focus:border-orange-500 text-neutral-200"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Archive Type:</span>
                <select
                  value={archiveModal.type}
                  onChange={(e) => setArchiveModal(prev => ({ ...prev, type: e.target.value as 'zip' | 'tar' }))}
                  className="bg-neutral-950 border border-neutral-850 px-2 py-1 rounded text-neutral-200 cursor-pointer focus:outline-none"
                >
                  <option value="zip">ZIP Archive (.zip)</option>
                  <option value="tar">TAR GZ Archive (.tar.gz)</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-2">
              <button onClick={() => setArchiveModal(prev => ({ ...prev, isOpen: false }))} className="px-3 py-1.5 hover:text-white text-neutral-400">Cancel</button>
              <button onClick={applyArchive} className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase rounded">Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Rename Modal */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-xl overflow-hidden shadow-2xl text-neutral-300">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <span className="font-bold text-xs uppercase tracking-widest text-neutral-100">
                Bulk Rename ({renameModal.items.length} items)
              </span>
              <button onClick={() => setRenameModal(prev => ({ ...prev, isOpen: false }))}>
                <X size={14} className="text-neutral-500 hover:text-neutral-300" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-neutral-500">Find:</span>
                  <input
                    type="text"
                    value={renameModal.findPattern}
                    onChange={(e) => setRenameModal(prev => ({ ...prev, findPattern: e.target.value }))}
                    className="w-full bg-neutral-950 border border-neutral-850 px-2 py-1.5 rounded focus:outline-none focus:border-orange-500 text-neutral-200"
                    placeholder="Search string..."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-neutral-500">Replace:</span>
                  <input
                    type="text"
                    value={renameModal.replacePattern}
                    onChange={(e) => setRenameModal(prev => ({ ...prev, replacePattern: e.target.value }))}
                    className="w-full bg-neutral-950 border border-neutral-850 px-2 py-1.5 rounded focus:outline-none focus:border-orange-500 text-neutral-200"
                    placeholder="Replacement..."
                  />
                </div>
              </div>

              {/* Side-by-Side Preview */}
              <div className="flex flex-col gap-1.5">
                <span className="text-neutral-500">Preview:</span>
                <div className="bg-neutral-950/80 border border-neutral-850 rounded max-h-40 overflow-y-auto p-2 space-y-1.5">
                  {renameModal.items.map((item, idx) => {
                    let newName = item.name;
                    if (renameModal.findPattern) {
                      newName = item.name.replace(new RegExp(renameModal.findPattern, 'g'), renameModal.replacePattern);
                    }
                    return (
                      <div key={idx} className="flex items-center justify-between text-[10px] gap-2 border-b border-neutral-900 pb-1">
                        <span className="text-neutral-500 truncate max-w-[170px]" title={item.name}>{item.name}</span>
                        <span className="text-neutral-600 font-sans">→</span>
                        <span className="text-orange-400 truncate max-w-[170px]" title={newName}>{newName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-2">
              <button onClick={() => setRenameModal(prev => ({ ...prev, isOpen: false }))} className="px-3 py-1.5 hover:text-white text-neutral-400">Cancel</button>
              <button onClick={applyBulkRename} className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-black font-bold uppercase rounded">Rename All</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl text-neutral-300">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <span className="font-bold text-xs uppercase tracking-widest text-neutral-100 flex items-center gap-2">
                <ShieldAlert size={14} className="text-red-500" />
                Confirm Delete
              </span>
              <button onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}>
                <X size={14} className="text-neutral-500 hover:text-neutral-300" />
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              <span className="text-neutral-400">Bạn có chắc chắn muốn xóa {deleteModal.items.length} đối tượng sau đây?</span>
              <div className="bg-neutral-950/60 border border-neutral-850 p-2 rounded max-h-36 overflow-y-auto space-y-1">
                {deleteModal.items.map((item, idx) => (
                  <div key={idx} className="text-neutral-500 text-[10px] truncate" title={item.name}>
                    • {item.name} {item.isDirectory ? '(Directory)' : ''}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Hành động này không thể hoàn tác!</p>
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex justify-end gap-2">
              <button onClick={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))} className="px-3 py-1.5 hover:text-white text-neutral-400">Cancel</button>
              <button onClick={applyDelete} className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold uppercase rounded">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommanderLayout;
