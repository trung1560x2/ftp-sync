import React, { useState, useEffect, useRef } from 'react';
import { FTPConnection } from '../types';
import { Edit2, Trash2, Server } from 'lucide-react';

import FileManager from './FileManager';
import StatisticsModal from './StatisticsModal';
import VisualDiffModal from './VisualDiffModal';
import DeploymentManager from './DeploymentManager';
import FTPConnectionDetailPanel from './FTPConnectionDetailPanel';

interface Props {
  connections: FTPConnection[];
  onEdit: (connection: FTPConnection) => void;
  onDelete: (id: number) => void;
}

interface SyncStatus {
  running: boolean;
  logs: { timestamp: string; type: string; message: string }[];
  syncStatus?: 'syncing' | 'success' | 'failed' | 'idle';
  lastSyncTime?: number | null;
  lastSyncDuration?: number | null;
  filesUploaded?: number;
  filesSkipped?: number;
  filesDeleted?: number;
  filesFailed?: number;
}

interface UploadProgress {
  filename: string;
  totalBytes: number;
  bytesTransferred: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  type?: 'upload' | 'download';
}

interface OverallProgress {
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

const FTPConnectionList: React.FC<Props> = ({ connections, onEdit, onDelete }) => {
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});
  const [activeFileManager, setActiveFileManager] = useState<{ connectionId: number; path: string } | null>(null);
  const [activeStats, setActiveStats] = useState<{ connectionId: number; server: string } | null>(null);
  const [activeDiff, setActiveDiff] = useState<{ connectionId: number; server: string } | null>(null);
  const [activeDeployment, setActiveDeployment] = useState<number | null>(null);

  // Selected Connection State
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);

  useEffect(() => {
    if (connections.length > 0 && selectedConnectionId === null) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  // Sync State
  const [syncStatuses, setSyncStatuses] = useState<Record<number, SyncStatus>>({});
  const lastNotifiedTimeRef = useRef<Record<number, number>>({});

  // Poll sync status for running connections (relaxed to 5000ms to prevent network congestion)
  useEffect(() => {
    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      connections.forEach(conn => {
        // Simple polling for all connections to get status
        fetch(`/api/sync/status/${conn.id}`)
          .then(res => res.json())
          .then(data => {
            setSyncStatuses(prev => {
              // Check for new logs to notify
              const currentLogs = data.logs || [];
              const lastTime = lastNotifiedTimeRef.current[conn.id] || 0;

              // Find new important logs
              const newLogs = currentLogs.filter((log: any) => {
                const logTime = new Date(log.timestamp).getTime();
                return logTime > lastTime && (log.type === 'error' || log.type === 'success');
              });

              if (newLogs.length > 0 && Notification.permission === 'granted') {
                newLogs.forEach((log: any) => {
                  // Only notify for errors or specific success events to avoid spam
                  if (log.type === 'error' ||
                    (log.type === 'success' && !log.message.includes('No new files') && !log.message.includes('watcher started') && !log.message.includes('polling started'))) {

                    new Notification(`FTP Sync: ${conn.server}`, {
                      body: log.message,
                    });
                  }
                });

                // Update last notified time to the most recent log
                const maxTime = Math.max(...newLogs.map((l: any) => new Date(l.timestamp).getTime()));
                lastNotifiedTimeRef.current[conn.id] = maxTime;
              } else if (currentLogs.length > 0 && !lastNotifiedTimeRef.current[conn.id]) {
                // Initialize last time to avoid notifying old logs on first load
                const maxTime = Math.max(...currentLogs.map((l: any) => new Date(l.timestamp).getTime()));
                lastNotifiedTimeRef.current[conn.id] = maxTime;
              }

              return {
                ...prev,
                [conn.id]: data
              };
            });
          })
          .catch(() => { });
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [connections]);

  const handleTestConnection = async (connection: FTPConnection) => {
    setTestingId(connection.id);
    setTestResults(prev => {
      const copy = { ...prev };
      delete copy[connection.id];
      return copy;
    });

    try {
      const response = await fetch('/api/ftp-connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server: connection.server,
          port: connection.port,
          username: connection.username,
          id: connection.id
        })
      });

      const data = await response.json();
      setTestResults(prev => ({
        ...prev,
        [connection.id]: {
          success: data.success,
          message: data.success ? 'Connection successful!' : `Error: ${data.message}`
        }
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [connection.id]: {
          success: false,
          message: 'Network error or server unavailable'
        }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const toggleSync = async (id: number, isRunning: boolean) => {
    const endpoint = isRunning ? '/api/sync/stop' : '/api/sync/start';
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      // Immediate status refresh
      const res = await fetch(`/api/sync/status/${id}`);
      const data = await res.json();
      setSyncStatuses(prev => ({ ...prev, [id]: data }));
    } catch (error) {
      console.error('Sync toggle failed', error);
    }
  };

  const toggleCard = (id: number) => {
    setSelectedConnectionId(id);
  };

  const handleOpenVisualDiff = (conn: FTPConnection) => {
    setActiveDiff({ connectionId: conn.id, server: conn.server });
  };

  const handleCloseVisualDiff = () => {
    setActiveDiff(null);
  };

  if (connections.length === 0) {
    return (
      <div className="text-center py-16 bg-neutral-900 border border-dashed border-neutral-800 rounded-none">
        <Server className="mx-auto h-10 w-10 text-neutral-600 mb-3" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300">No connections yet</h3>
        <p className="mt-1.5 text-xs text-neutral-500 font-mono">GET STARTED BY CREATING A NEW FTP SERVICE CONNECTION.</p>
      </div>
    );
  }

  return (
    <React.Fragment>
      {activeStats && (
        <StatisticsModal
          onClose={() => setActiveStats(null)}
          connectionId={activeStats.connectionId}
          serverName={activeStats.server}
        />
      )}
      {activeFileManager && (
        <FileManager
          onClose={() => setActiveFileManager(null)}
          connectionId={activeFileManager.connectionId}
          serverName={connections.find(c => c.id === activeFileManager.connectionId)?.server || 'Unknown'}
        />
      )}
      {activeDiff && (
        <VisualDiffModal
          onClose={handleCloseVisualDiff}
          connectionId={activeDiff.connectionId}
          serverName={activeDiff.server}
          isSyncing={syncStatuses[activeDiff.connectionId]?.running || false}
        />
      )}
      {activeDeployment && (
        <DeploymentManager
          connectionId={activeDeployment}
          onClose={() => setActiveDeployment(null)}
        />
      )}

      {/* Split-Pane Chassis Layout */}
      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-6 items-start w-full">
        {/* Left Side: Server Modules Chassis (Connections List) */}
        <div className="col-span-12 md:col-span-5 lg:col-span-4 w-full space-y-3">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-800/40">
            <span className="w-1.5 h-4 bg-orange-500 rounded-full block"></span>
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Active Servers ({connections.length})
            </span>
          </div>

          <div className="space-y-3">
            {connections.map((conn) => {
              const statusInfo = syncStatuses[conn.id];
              const isSyncing = statusInfo?.running || false;
              const syncStatus = statusInfo?.syncStatus || conn.last_sync_status || 'idle';
              const isSelected = selectedConnectionId === conn.id;

              // Determine LED classes based on sync status and verification
              const getLedClass = () => {
                if (isSyncing) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse';
                if (syncStatus === 'failed' || conn.validation_status === 'failed') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse';
                if (syncStatus === 'success' || conn.validation_status === 'verified') return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
                return 'bg-neutral-600';
              };

              return (
                <div
                  key={conn.id}
                  onClick={() => toggleCard(conn.id)}
                  className={`bg-[#161922]/40 border p-4 cursor-pointer transition-all duration-300 rounded-xl relative select-none flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-md ${
                    isSelected
                      ? 'border-orange-500/50 bg-[#161922]/80 shadow-md shadow-orange-500/5'
                      : 'border-neutral-800/60 hover:border-neutral-700/60 hover:bg-[#161922]/60'
                  }`}
                >
                  {/* Highlight vertical strip */}
                  {isSyncing && (
                    <div className="absolute left-0 top-3.5 bottom-3.5 w-1 bg-emerald-500 rounded-r-full shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
                  )}
                  {!isSyncing && isSelected && (
                    <div className="absolute left-0 top-3.5 bottom-3.5 w-1 bg-orange-500 rounded-r-full shadow-[0_0_6px_rgba(249,115,22,0.6)]"></div>
                  )}

                  <div className="flex items-start">
                    {/* Status Indicator LED */}
                    <div className={`w-2 h-2 rounded-full mr-3 mt-1.5 flex-shrink-0 transition-all ${getLedClass()}`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-neutral-200 text-xs tracking-wide truncate max-w-[150px] uppercase" title={conn.name || conn.server}>
                          {conn.name || conn.server}
                        </span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          conn.protocol === 'sftp'
                            ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30'
                            : 'bg-orange-950/30 text-orange-400 border border-orange-900/30'
                        }`}>
                          {conn.protocol ? conn.protocol.toUpperCase() : 'FTP'}
                        </span>
                      </div>

                      <div className="text-[10px] text-neutral-500 font-mono tracking-wider mt-1 truncate">
                        {conn.server}:{conn.port}
                      </div>
                    </div>
                  </div>

                  {/* Card quick actions */}
                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neutral-800/40" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleSync(conn.id, isSyncing)}
                      className={`px-2.5 py-1 text-[9px] font-bold tracking-wider uppercase transition-all rounded-md cursor-pointer border ${
                        isSyncing
                          ? 'text-red-400 border-red-900/40 hover:bg-red-500 hover:text-white hover:border-red-500 bg-red-950/20'
                          : 'text-emerald-400 border-emerald-900/40 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 bg-emerald-950/20'
                      }`}
                    >
                      {isSyncing ? 'Stop' : 'Start'}
                    </button>
                    <button
                      onClick={() => onEdit(conn)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold text-neutral-400 bg-neutral-900/50 border border-neutral-800/60 hover:bg-neutral-800 hover:text-orange-500 rounded-md transition-all uppercase tracking-wider cursor-pointer"
                    >
                      <Edit2 size={10} />
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(conn.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold text-neutral-550 hover:text-red-400 bg-neutral-900/50 border border-neutral-800/60 hover:bg-red-950/20 hover:border-red-900/30 rounded-md transition-all uppercase tracking-wider cursor-pointer"
                    >
                      <Trash2 size={10} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Selected Module Diagnostics & Control Panel (Constant Container) */}
        <div className="col-span-12 md:col-span-7 lg:col-span-8 w-full mt-6 md:mt-0">
          {(() => {
            const conn = connections.find(c => c.id === selectedConnectionId) || connections[0];
            if (!conn) return null;

            const statusInfo = syncStatuses[conn.id];
            const isSyncing = statusInfo?.running || false;
            const syncStatus = statusInfo?.syncStatus || conn.last_sync_status || 'idle';

            return (
              <FTPConnectionDetailPanel
                connection={conn}
                isSyncing={isSyncing}
                syncStatus={syncStatus}
                onOpenStats={() => setActiveStats({ connectionId: conn.id, server: conn.server })}
                onOpenFileManager={() => setActiveFileManager({ connectionId: conn.id, path: '/' })}
                onOpenVisualDiff={() => handleOpenVisualDiff(conn)}
                onOpenDeployment={() => setActiveDeployment(conn.id)}
              />
            );
          })()}
        </div>
      </div>
    </React.Fragment>
  );
};

export default FTPConnectionList;
