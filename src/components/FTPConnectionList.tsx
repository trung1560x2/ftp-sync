import React, { useState, useEffect, useRef } from 'react';
import { FTPConnection } from '../types';
import { Edit2, Trash2, Wifi, Server, Folder, Play, Square, Activity, ChevronDown, ChevronUp, BarChart2, Terminal } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-neutral-950 border border-neutral-850 p-2 font-mono text-[9px] text-neutral-300 rounded-none shadow-md">
        <p className="text-neutral-500 mb-1">TIME: {payload[0].payload.time}</p>
        {payload.map((pld: any) => (
          <p key={pld.name} className="font-bold uppercase" style={{ color: pld.color }}>
            {pld.name}: {pld.value.toFixed(2)} MB/S
          </p>
        ))}
      </div>
    );
  }
  return null;
};

import FileManager from './FileManager';
import StatisticsModal from './StatisticsModal';
import VisualDiffModal from './VisualDiffModal';
import UploadProgressBar from './UploadProgressBar';
import { GitCompare, Rocket } from 'lucide-react';
import DeploymentManager from './DeploymentManager';

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
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<number, OverallProgress>>({});
  // Bandwidth history tracking for charts
  const [bandwidthHistory, setBandwidthHistory] = useState<Record<number, Array<{ time: string; speed: number; upload: number; download: number }>>>({});

  // Helper to pre-populate history with flat 0-lines
  const getPrepopulatedHistory = () => {
    const arr = [];
    const now = Date.now();
    for (let i = 19; i >= 0; i--) {
      const timeStr = new Date(now - i * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      arr.push({
        time: timeStr,
        speed: 0,
        upload: 0,
        download: 0
      });
    }
    return arr;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setBandwidthHistory(prev => {
        const next = { ...prev };
        connections.forEach(conn => {
          const isRunning = syncStatuses[conn.id]?.running || false;
          const progress = uploadProgress[conn.id];
          
          let upload = 0;
          let download = 0;
          
          if (isRunning && progress) {
            if (progress.uploadSpeedMBps !== undefined || progress.downloadSpeedMBps !== undefined) {
              upload = progress.uploadSpeedMBps || 0;
              download = progress.downloadSpeedMBps || 0;
            } else if (progress.activeUploads) {
              progress.activeUploads.forEach((item: any) => {
                if (item.type === 'upload') upload += item.speedMBps || 0;
                if (item.type === 'download') download += item.speedMBps || 0;
              });
            }
          }
          
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const newPoint = {
            time: nowStr,
            speed: Math.round((upload + download) * 100) / 100,
            upload: Math.round(upload * 100) / 100,
            download: Math.round(download * 100) / 100
          };
          
          const history = prev[conn.id] ? [...prev[conn.id]] : getPrepopulatedHistory();
          history.push(newPoint);
          if (history.length > 20) {
            history.shift(); // keep last 20 seconds
          }
          next[conn.id] = history;
        });
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [connections, syncStatuses, uploadProgress]);

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

  const syncStatusesRef = useRef(syncStatuses);
  const selectedConnectionIdRef = useRef(selectedConnectionId);

  useEffect(() => {
    syncStatusesRef.current = syncStatuses;
    selectedConnectionIdRef.current = selectedConnectionId;
  }, [syncStatuses, selectedConnectionId]);

  // Create a stable representation of which connections are currently streaming to prevent SSE recreation on general status updates
  const activeStreamKeys = connections
    .map(conn => {
      const isRunning = syncStatuses[conn.id]?.running || false;
      const isSelected = selectedConnectionId === conn.id;
      return `${conn.id}:${isRunning}:${isSelected}`;
    })
    .join(',');

  // Manage SSE streams or fallback polling for active and expanded connections
  useEffect(() => {
    const activeStreams: Record<number, EventSource> = {};
    const pollIntervals: Record<number, NodeJS.Timeout> = {};

    connections.forEach(conn => {
      const isRunning = syncStatusesRef.current[conn.id]?.running;
      const isSelected = selectedConnectionIdRef.current === conn.id;

      if (isRunning && isSelected) {
        console.log(`[FTPConnectionList] Setting up real-time progress stream for connection ${conn.id}`);
        const es = new EventSource(`/api/sync/stream/${conn.id}`);
        activeStreams[conn.id] = es;

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setUploadProgress(prev => ({ ...prev, [conn.id]: data }));
          } catch (err) {
            console.error('SSE JSON parse error for connection', conn.id, err);
          }
        };

        es.onerror = () => {
          console.warn(`SSE stream error for connection ${conn.id}, falling back to polling`);
          es.close();
          delete activeStreams[conn.id];

          if (!pollIntervals[conn.id]) {
            const poll = () => {
              fetch(`/api/sync/progress/${conn.id}`)
                .then(res => res.json())
                .then(data => {
                  setUploadProgress(prev => ({ ...prev, [conn.id]: data }));
                })
                .catch(() => {});
            };
            poll();
            pollIntervals[conn.id] = setInterval(poll, 2000);
          }
        };
      }
    });

    return () => {
      Object.values(activeStreams).forEach(es => es.close());
      Object.values(pollIntervals).forEach(interval => clearInterval(interval));
    };
  }, [connections, activeStreamKeys]);

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

  const handleClearLogs = async (id: number) => {
    try {
      const res = await fetch(`/api/reports/logs/clear/${id}`, {
        method: 'POST'
      });
      if (res.ok) {
        setSyncStatuses(prev => {
          if (!prev[id]) return prev;
          return {
            ...prev,
            [id]: {
              ...prev[id],
              logs: []
            }
          };
        });
      }
    } catch (err) {
      console.error('Failed to clear logs', err);
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

  const toggleLogs = (id: number) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
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
      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-6 font-mono items-start w-full">
        {/* Left Side: Server Modules Chassis (Connections List) */}
        <div className="col-span-12 md:col-span-5 lg:col-span-4 w-full space-y-3">
          <div className="flex items-center gap-1.5 mb-1 pb-2 border-b border-neutral-850">
            <span className="w-1.5 h-3.5 bg-orange-500 block"></span>
            <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">
              Server Modules ({connections.length})
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
                if (isSyncing) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-signal';
                if (syncStatus === 'failed' || conn.validation_status === 'failed') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse';
                if (syncStatus === 'success' || conn.validation_status === 'verified') return 'bg-emerald-450 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
                return 'bg-neutral-600';
              };

              return (
                <div
                  key={conn.id}
                  onClick={() => toggleCard(conn.id)}
                  className={`bg-neutral-900 border p-3.5 cursor-pointer transition-all duration-205 rounded-none relative select-none flex flex-col justify-between ${
                    isSelected
                      ? 'border-orange-500/80 bg-neutral-850/20 shadow-md shadow-orange-500/5'
                      : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850/5'
                  } ${
                    isSyncing
                      ? 'border-l-2 border-l-emerald-500'
                      : isSelected
                        ? 'border-l-2 border-l-orange-500'
                        : 'border-l-2 border-l-neutral-800 hover:border-l-orange-500'
                  }`}
                >
                  <div className="flex items-start">
                    {/* Status Indicator LED */}
                    <div className={`w-2 h-2 rounded-none mr-3 mt-1.5 flex-shrink-0 transition-all ${getLedClass()}`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-neutral-200 text-xs tracking-wide truncate max-w-[150px] uppercase" title={conn.name || conn.server}>
                          {conn.name || conn.server}
                        </span>
                        <span className={`text-[8px] px-1 py-0.5 rounded-none font-bold uppercase tracking-wider ${
                          conn.protocol === 'sftp'
                            ? 'bg-emerald-950/20 text-emerald-450 border border-emerald-900/40'
                            : 'bg-orange-950/20 text-orange-500 border border-orange-900/40'
                        }`}>
                          {conn.protocol ? conn.protocol.toUpperCase() : 'FTP'}
                        </span>
                      </div>

                      <div className="text-[9px] text-neutral-500 font-mono tracking-wider mt-1 truncate">
                        HOST: {conn.server}:{conn.port}
                      </div>
                    </div>
                  </div>

                  {/* Card quick actions */}
                  <div className="flex justify-end gap-2 mt-3 pt-2.5 border-t border-neutral-850/40" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleSync(conn.id, isSyncing)}
                      className={`px-2 py-1 border text-[9px] font-bold tracking-wider uppercase transition-colors rounded-none cursor-pointer ${
                        isSyncing
                          ? 'text-red-500 border-red-900/40 hover:bg-red-955 hover:border-red-500 bg-red-955/5'
                          : 'text-emerald-500 border-emerald-900/40 hover:bg-emerald-950/20 bg-emerald-950/5'
                      }`}
                    >
                      {isSyncing ? 'Stop' : 'Start'}
                    </button>
                    <button
                      onClick={() => onEdit(conn)}
                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-neutral-400 bg-neutral-955 border border-neutral-850 hover:bg-neutral-850 hover:text-orange-500 rounded-none transition-colors uppercase tracking-wider cursor-pointer"
                    >
                      <Edit2 size={10} />
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(conn.id)}
                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-neutral-550 hover:text-red-500 bg-neutral-955 border border-neutral-850 hover:bg-neutral-850 hover:border-red-900/30 rounded-none transition-colors uppercase tracking-wider cursor-pointer"
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
            const lastSyncTime = statusInfo?.lastSyncTime || conn.last_sync_time;
            const lastSyncDuration = statusInfo?.lastSyncDuration || conn.last_sync_duration;

            const logs = statusInfo?.logs || [];
            const lastLog = logs.length > 0 ? logs[0] : null;
            const testRes = testResults[conn.id];

            const historyData = bandwidthHistory[conn.id] || getPrepopulatedHistory();
            const currentUploadSpeed = historyData.length > 0 ? historyData[historyData.length - 1].upload : 0;
            const currentDownloadSpeed = historyData.length > 0 ? historyData[historyData.length - 1].download : 0;

            return (
              <div className="bg-neutral-900 border border-neutral-800 p-4 shadow-md animate-fadeIn w-full">
                {/* Details Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3.5 mb-4 border-b border-neutral-805">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5 opacity-45 select-none">
                      <div className="w-3.5 h-[2px] bg-neutral-700"></div>
                      <div className="w-3.5 h-[2px] bg-neutral-700"></div>
                      <div className="w-3.5 h-[2px] bg-neutral-700"></div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-neutral-100 text-sm tracking-widest uppercase">
                        {conn.name || conn.server}
                      </h3>
                      {conn.validation_status === 'verified' && (
                        <span className="text-[9px] bg-emerald-950/20 text-emerald-400 border border-emerald-900/40 px-1.5 py-0.5 rounded-none font-bold uppercase tracking-wider flex items-center" title={conn.validation_message}>
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-none mr-1.5"></span>
                          Verified
                        </span>
                      )}
                      {conn.validation_status === 'failed' && (
                        <span className="text-[9px] bg-red-950/20 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded-none font-bold uppercase tracking-wider flex items-center animate-pulse" title={conn.validation_message}>
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-none mr-1.5"></span>
                          Unreachable
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Run Diagnostics Button */}
                    <button
                      onClick={() => handleTestConnection(conn)}
                      disabled={testingId === conn.id}
                      className={`flex items-center justify-center px-3 py-1.5 text-xs font-bold rounded-none border transition-colors uppercase tracking-wider flex-1 sm:flex-none cursor-pointer ${
                        testRes && testRes.success
                          ? 'bg-emerald-955/20 text-emerald-450 border-emerald-800 hover:bg-emerald-900/30'
                          : testRes && !testRes.success
                            ? 'bg-red-950/20 text-red-400 border-red-805 hover:bg-red-900/30'
                            : 'text-neutral-450 bg-neutral-955 border-neutral-850 hover:bg-neutral-900 hover:text-neutral-200'
                      }`}
                    >
                      <Wifi size={13} className="mr-1.5" />
                      {testingId === conn.id ? 'Testing...' : 'Diagnostics'}
                    </button>
                  </div>
                </div>

                {/* Hardware parameters grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs font-mono">
                  <div className="bg-neutral-950 border border-neutral-850 p-2.5 rounded-none flex flex-col justify-between">
                    <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">MODULE // SERVER HOST</span>
                    <span className="font-bold text-neutral-300 break-all select-all">{conn.server}</span>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-850 p-2.5 rounded-none flex flex-col justify-between">
                    <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">MODULE // SERVICE PORT</span>
                    <span className="font-bold text-neutral-300">PORT {conn.port}</span>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-850 p-2.5 rounded-none flex flex-col justify-between">
                    <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">MODULE // CREDENTIAL USER</span>
                    <span className="font-bold text-neutral-300 truncate">{conn.username}</span>
                  </div>
                  <div className="bg-neutral-955 border border-neutral-850 p-2.5 rounded-none flex flex-col justify-between">
                    <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">MODULE // TARGET DIRECTORY</span>
                    <span className="font-bold text-orange-500 truncate">{conn.target_directory || '/'}</span>
                  </div>
                </div>

                {/* Metadata Details panel */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 px-2.5 py-2 bg-neutral-950/40 border border-neutral-850 text-[10px] text-neutral-500 font-mono tracking-wider uppercase">
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-600">Sync Status:</span>
                    <span className={`font-bold ${isSyncing ? 'text-emerald-450' : syncStatus === 'success' ? 'text-emerald-400' : syncStatus === 'failed' ? 'text-red-400' : 'text-neutral-400'}`}>
                      {isSyncing ? 'SYNCING_ACTIVE' : syncStatus}
                    </span>
                  </div>
                  {lastSyncTime && (
                    <div className="flex items-center gap-1">
                      <span className="text-neutral-600">Last Sync:</span>
                      <span className="text-neutral-400">
                        {new Date(lastSyncTime).toLocaleString()}
                        {lastSyncDuration !== null && lastSyncDuration !== undefined && ` (${(lastSyncDuration / 1000).toFixed(1)}s)`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Diagnostics and error report section */}
                {testRes && (
                  <div className={`p-3 border rounded-none mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                    testRes.success 
                      ? 'bg-emerald-950/15 border-emerald-900/30 text-emerald-440' 
                      : 'bg-red-950/15 border-red-900/30 text-red-400'
                  }`}>
                    <div className="flex-1 min-w-0 font-mono">
                      <span className="text-[9px] uppercase tracking-widest block mb-1 font-bold">
                        DIAGNOSTICS // CONNECTION RESULT
                      </span>
                      <span className="text-xs block truncate font-bold uppercase">
                        {testRes.message}
                      </span>
                    </div>
                  </div>
                )}

                {/* Service Control panel Header */}
                <div className="flex items-center gap-1.5 mt-4 mb-3 pb-2 border-b border-neutral-850">
                  <span className="w-1.5 h-3.5 bg-emerald-500 block"></span>
                  <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">
                    BLADE CONTROL PANEL // OPERATIONS
                  </span>
                </div>

                {/* Action Buttons Row */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setActiveStats({ connectionId: conn.id, server: conn.server })}
                    className="flex items-center px-3 py-1.5 text-xs font-bold text-orange-500 bg-orange-950/10 border border-orange-900/40 hover:bg-orange-900/25 rounded-none transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    <BarChart2 size={13} className="mr-1.5" /> Statistics
                  </button>
                  <button
                    onClick={() => setActiveFileManager({ connectionId: conn.id, path: '/' })}
                    className="flex items-center px-3 py-1.5 text-xs font-bold text-neutral-400 bg-neutral-955 border border-neutral-850 hover:bg-neutral-900 hover:text-neutral-200 rounded-none transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    <Folder size={13} className="mr-1.5" /> File Manager
                  </button>
                  <button
                    onClick={() => handleOpenVisualDiff(conn)}
                    className="flex items-center px-3 py-1.5 text-xs font-bold text-emerald-500 bg-emerald-950/10 border border-emerald-900/40 hover:bg-emerald-900/25 rounded-none transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    <GitCompare size={13} className="mr-1.5" /> Visual Diff
                  </button>
                </div>

                {/* Upload Progress Bar */}
                {syncStatuses[conn.id]?.running && uploadProgress[conn.id] && (
                  <div className="mb-4">
                    <UploadProgressBar progress={uploadProgress[conn.id]} />
                  </div>
                )}

                {/* Real-time Bandwidth Monitor */}
                <div className="mb-4 font-mono">
                  <div className="flex items-center justify-between mt-2 mb-2 pb-1.5 border-b border-neutral-850">
                    <div className="flex items-center gap-1.5">
                      <Activity size={12} className={`text-orange-500 ${isSyncing ? 'animate-signal' : ''}`} />
                      <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">
                        REAL-TIME BANDWIDTH MONITOR // NETWORK
                      </span>
                    </div>
                    {isSyncing && (
                      <div className="flex items-center gap-3 text-[9px] font-bold">
                        <span className="text-orange-500 uppercase">UP: {currentUploadSpeed.toFixed(2)} MB/S</span>
                        <span className="text-emerald-450 uppercase">DOWN: {currentDownloadSpeed.toFixed(2)} MB/S</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="h-32 w-full bg-neutral-950 border border-neutral-850 p-2 select-none relative rounded-none">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`gradUpload-${conn.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id={`gradDownload-${conn.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#171717" vertical={false} />
                        <XAxis 
                          dataKey="time" 
                          tick={{ fill: '#525252', fontSize: 7, fontFamily: 'monospace' }} 
                          stroke="#262626"
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fill: '#525252', fontSize: 7, fontFamily: 'monospace' }} 
                          stroke="#262626"
                          tickLine={false}
                          axisLine={false}
                          unit=" MB"
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="upload" 
                          name="Upload" 
                          stroke="#f97316" 
                          strokeWidth={1.5}
                          fillOpacity={1} 
                          fill={`url(#gradUpload-${conn.id})`} 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="download" 
                          name="Download" 
                          stroke="#10b981" 
                          strokeWidth={1.5}
                          fillOpacity={1} 
                          fill={`url(#gradDownload-${conn.id})`} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    {!isSyncing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/45 pointer-events-none">
                        <span className="text-[9px] font-mono font-bold tracking-widest text-neutral-600 uppercase bg-neutral-955 px-2 py-0.5 border border-neutral-900/60">
                          STANDBY // WAITING FOR ACTIVE TRANSMISSION
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity Log Terminal */}
                <div className="bg-neutral-950 border border-neutral-850 p-3 text-xs text-neutral-300 rounded-none flex flex-col mb-4">
                  <div className="flex justify-between items-center mb-2.5 border-b border-neutral-900 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Terminal size={11} className="text-orange-500 animate-signal" />
                      <span className="font-bold text-neutral-450 uppercase tracking-widest text-[9px]">Activity Log</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {logs.length > 0 && (
                        <button
                          onClick={() => handleClearLogs(conn.id)}
                          className="text-neutral-500 hover:text-red-500 flex items-center bg-neutral-900 px-2 py-0.5 rounded-none border border-neutral-800 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                          title="Clear Logs"
                        >
                          <Trash2 size={10} className="mr-1" />
                          Clear
                        </button>
                      )}
                      {logs.length > 0 && (
                        <button 
                          onClick={() => toggleLogs(conn.id)} 
                          className="text-orange-500 hover:text-orange-400 flex items-center bg-neutral-900 px-2 py-0.5 rounded-none border border-neutral-800 text-[9px] font-bold uppercase cursor-pointer"
                        >
                          {expandedLogs[conn.id] ? <ChevronUp size={11} className="mr-0.5" /> : <ChevronDown size={11} className="mr-0.5" />}
                          Logs
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedLogs[conn.id] ? (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar text-[11px] font-mono">
                      {logs.map((log, i) => (
                        <div key={i} className={`truncate border-l-2 pl-2 py-0.5 ${
                          log.type === 'error' ? 'text-red-400 border-red-500 bg-red-950/5' :
                          log.type === 'success' ? 'text-emerald-450 border-emerald-500 bg-emerald-950/5' : 'text-neutral-450 border-neutral-700'
                        }`}>
                          <span className="text-neutral-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className="mr-2 uppercase text-[9px] font-bold select-none">[{log.type}]</span>
                          <span className="uppercase">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`truncate border-l-2 pl-2 py-0.5 text-[11px] font-mono ${
                      lastLog?.type === 'error' ? 'text-red-400 border-red-500 bg-red-950/5' :
                      lastLog?.type === 'success' ? 'text-emerald-450 border-emerald-500 bg-emerald-950/5' : 'text-neutral-500 border-neutral-700'
                    }`}>
                      {lastLog ? (
                        <>
                          <span className="text-neutral-600 mr-2">[{new Date(lastLog.timestamp).toLocaleTimeString()}]</span>
                          <span className="mr-2 uppercase text-[9px] font-bold select-none">[{lastLog.type}]</span>
                          <span className="uppercase">{lastLog.message}</span>
                        </>
                      ) : 'No activity logs stored.'}
                    </div>
                  )}
                </div>

                {/* Deploy & Sync Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setActiveDeployment(conn.id)}
                    className="flex-1 flex items-center justify-center px-4 py-2.5 text-xs font-bold text-black bg-orange-600 border border-orange-700 hover:bg-orange-500 rounded-none transition-all active:scale-[0.98] uppercase tracking-widest cursor-pointer"
                    title="Zero-Downtime Deployment & Rollback"
                  >
                    <Rocket size={14} className="mr-2" /> Deploy & Rollback
                  </button>
                  <button
                    onClick={() => toggleSync(conn.id, isSyncing)}
                    className={`flex-1 flex items-center justify-center px-4 py-2.5 text-xs font-bold rounded-none border transition-colors cursor-pointer ${
                      isSyncing
                        ? 'bg-red-950/45 hover:bg-red-900/30 text-red-500 border-red-900/50'
                        : 'bg-neutral-900 hover:bg-neutral-850 text-emerald-500 border-emerald-900/50'
                    } uppercase tracking-widest`}
                  >
                    {isSyncing ? (
                      <><Square size={13} className="mr-2 fill-current" /> Stop Sync</>
                    ) : (
                      <><Play size={13} className="mr-2 fill-current" /> Start Sync</>
                    )}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </React.Fragment>
  );
};

export default FTPConnectionList;
