import React, { useState, useEffect } from 'react';
import { FTPConnection } from '../types';
import { Edit2, Trash2, Wifi, Server, Folder, Play, Square, Activity, ChevronDown, ChevronUp, FileText, BarChart2 } from 'lucide-react';
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
}

interface UploadProgress {
  filename: string;
  totalBytes: number;
  bytesTransferred: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
}

interface OverallProgress {
  activeUploads: UploadProgress[];
  queueLength: number;
  totalFilesInBatch: number;
  completedFiles: number;
}

const FTPConnectionList: React.FC<Props> = ({ connections, onEdit, onDelete }) => {
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [activeFileManager, setActiveFileManager] = useState<{ connectionId: number; path: string } | null>(null);
  const [activeStats, setActiveStats] = useState<{ connectionId: number; server: string } | null>(null);
  const [activeDiff, setActiveDiff] = useState<{ connectionId: number; server: string } | null>(null);
  const [activeDeployment, setActiveDeployment] = useState<number | null>(null);
  const [syncPausedForDiff, setSyncPausedForDiff] = useState<number | null>(null);

  // Accordion State - track which cards are expanded
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  // Sync State
  const [syncStatuses, setSyncStatuses] = useState<Record<number, SyncStatus>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<number, OverallProgress>>({});

  const [lastNotifiedTime, setLastNotifiedTime] = useState<Record<number, number>>({});

  // Poll sync status for running connections
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
              const lastTime = lastNotifiedTime[conn.id] || 0;

              // Find new important logs
              const newLogs = currentLogs.filter((log: any) => {
                const logTime = new Date(log.timestamp).getTime();
                return logTime > lastTime && (log.type === 'error' || log.type === 'success');
              });

              if (newLogs.length > 0 && Notification.permission === 'granted') {
                newLogs.forEach((log: any) => {
                  // Only notify for errors or specific success events to avoid spam
                  // e.g. "Sync scan complete" with files, or "Uploaded", "Downloaded"
                  // Ignore "Sync scan complete. No new files."
                  if (log.type === 'error' ||
                    (log.type === 'success' && !log.message.includes('No new files') && !log.message.includes('watcher started') && !log.message.includes('polling started'))) {

                    new Notification(`FTP Sync: ${conn.server}`, {
                      body: log.message,
                      // icon: '/favicon.svg' // Optional
                    });
                  }
                });

                // Update last notified time to the most recent log
                const maxTime = Math.max(...newLogs.map((l: any) => new Date(l.timestamp).getTime()));
                setLastNotifiedTime(prevTime => ({
                  ...prevTime,
                  [conn.id]: maxTime
                }));
              } else if (currentLogs.length > 0 && !lastNotifiedTime[conn.id]) {
                // Initialize last time to avoid notifying old logs on first load
                const maxTime = Math.max(...currentLogs.map((l: any) => new Date(l.timestamp).getTime()));
                setLastNotifiedTime(prevTime => ({
                  ...prevTime,
                  [conn.id]: maxTime
                }));
              }

              return {
                ...prev,
                [conn.id]: data
              };
            });
          })
          .catch(() => { });
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [connections, lastNotifiedTime]);

  // Poll upload progress more frequently (500ms) for running connections
  useEffect(() => {
    const progressInterval = setInterval(() => {
      connections.forEach(conn => {
        if (syncStatuses[conn.id]?.running) {
          fetch(`/api/sync/progress/${conn.id}`)
            .then(res => res.json())
            .then(data => {
              setUploadProgress(prev => ({ ...prev, [conn.id]: data }));
            })
            .catch(() => { });
        }
      });
    }, 500);

    return () => clearInterval(progressInterval);
  }, [connections, syncStatuses]);

  const handleTestConnection = async (connection: FTPConnection) => {
    setTestingId(connection.id);
    setTestResult(null);

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
      setTestResult({
        id: connection.id,
        success: data.success,
        message: data.success ? 'Connection successful!' : `Error: ${data.message}`
      });
    } catch (err) {
      setTestResult({
        id: connection.id,
        success: false,
        message: 'Network error or server unavailable'
      });
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

  const toggleLogs = (id: number) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCard = (id: number) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenVisualDiff = async (conn: FTPConnection) => {
    // Check if sync is running
    const isSyncing = syncStatuses[conn.id]?.running;

    if (isSyncing) {
      console.log(`[Auto-Switch] Pausing sync for ${conn.server} to open Visual Diff...`);
      setSyncPausedForDiff(conn.id);
      await toggleSync(conn.id, true); // Stop sync
    } else {
      setSyncPausedForDiff(null);
    }

    setActiveDiff({ connectionId: conn.id, server: conn.server });
  };

  const handleCloseVisualDiff = async () => {
    if (activeDiff) {
      const id = activeDiff.connectionId;
      setActiveDiff(null); // Close modal first

      // Resume if it was paused automatically
      if (syncPausedForDiff === id) {
        console.log(`[Auto-Switch] Resuming sync for ${id}...`);
        await toggleSync(id, false); // Start sync
        setSyncPausedForDiff(null);
      }
    }
  };

  if (connections.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <Server className="mx-auto h-12 w-12 text-gray-400 mb-3" />
        <h3 className="text-lg font-medium text-gray-900">No connections yet</h3>
        <p className="mt-1 text-sm text-gray-500">Get started by creating a new FTP connection.</p>
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
        />
      )}
      {activeDeployment && (
        <DeploymentManager
          connectionId={activeDeployment}
          onClose={() => setActiveDeployment(null)}
        />
      )}
      {/* Accordion Connection List */}
      <div className="space-y-2">
        {connections.map((conn) => {
          const isSyncing = syncStatuses[conn.id]?.running || false;
          const logs = syncStatuses[conn.id]?.logs || [];
          const lastLog = logs.length > 0 ? logs[0] : null;
          const isExpanded = expandedCards[conn.id] || false;

          return (
            <div key={conn.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
              {/* Compact Header - Always Visible */}
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleCard(conn.id)}
              >
                <div className="flex items-center flex-1 min-w-0">
                  {/* Status Indicator */}
                  <div className={`w-3 h-3 rounded-full mr-3 flex-shrink-0 ${isSyncing ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />

                  {/* Server Icon */}
                  <Server className={`h-5 w-5 mr-3 flex-shrink-0 ${isSyncing ? 'text-green-600' : 'text-blue-600'}`} />

                  {/* Name & Server Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-800 truncate" title={conn.name || conn.server}>
                        {conn.name || conn.server}
                      </h4>
                      {isSyncing && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Syncing
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {conn.server}:{conn.port} • {conn.username}
                    </div>
                  </div>
                </div>

                {/* Quick Actions (visible in collapsed state) */}
                <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleSync(conn.id, isSyncing)}
                    className={`p-1.5 rounded-md transition-colors ${isSyncing
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-green-600 hover:bg-green-50'
                      }`}
                    title={isSyncing ? 'Stop Sync' : 'Start Sync'}
                  >
                    {isSyncing ? <Square size={16} className="fill-current" /> : <Play size={16} className="fill-current" />}
                  </button>
                  <button
                    onClick={() => onEdit(conn)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(conn.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>

                  {/* Expand/Collapse Toggle */}
                  <div className="ml-2 text-gray-400">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
              </div>

              {/* Expandable Details */}
              {isExpanded && (
                <div className="border-t border-gray-100 animate-fadeIn">
                  <div className="p-4">
                    {/* Connection Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                      <div>
                        <span className="text-gray-500 block text-xs uppercase tracking-wider mb-1">Server</span>
                        <span className="font-medium text-gray-800">{conn.server}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs uppercase tracking-wider mb-1">Port</span>
                        <span className="font-medium text-gray-800">{conn.port}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs uppercase tracking-wider mb-1">Username</span>
                        <span className="font-medium text-gray-800">{conn.username}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs uppercase tracking-wider mb-1">Target Directory</span>
                        <span className="font-medium text-gray-800 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {conn.target_directory || '/'}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        onClick={() => setActiveStats({ connectionId: conn.id, server: conn.server })}
                        className="flex items-center px-3 py-1.5 text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                      >
                        <BarChart2 size={14} className="mr-1.5" /> Statistics
                      </button>
                      <button
                        onClick={() => setActiveFileManager({ connectionId: conn.id, path: '/' })}
                        className="flex items-center px-3 py-1.5 text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                      >
                        <Folder size={14} className="mr-1.5" /> File Manager
                      </button>
                      <button
                        onClick={() => handleOpenVisualDiff(conn)}
                        className="flex items-center px-3 py-1.5 text-sm text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                      >
                        <GitCompare size={14} className="mr-1.5" /> Visual Diff
                      </button>
                      <button
                        onClick={() => handleTestConnection(conn)}
                        disabled={testingId === conn.id}
                        className={`flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${testResult?.id === conn.id && testResult.success
                            ? 'bg-green-100 text-green-800'
                            : testResult?.id === conn.id && !testResult.success
                              ? 'bg-red-100 text-red-800'
                              : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                          }`}
                      >
                        <Wifi size={14} className="mr-1.5" /> {testingId === conn.id ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>

                    {/* Upload Progress Bar */}
                    {syncStatuses[conn.id]?.running && uploadProgress[conn.id] && (
                      <div className="mb-4">
                        <UploadProgressBar progress={uploadProgress[conn.id]} />
                      </div>
                    )}

                    {/* Activity Log */}
                    <div className="bg-gray-900 rounded-lg p-3 text-sm font-mono border border-gray-700 text-gray-200">
                      <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                        <span className="font-bold text-gray-400 uppercase tracking-wider text-xs">Activity Log</span>
                        {logs.length > 0 && (
                          <button onClick={() => toggleLogs(conn.id)} className="text-blue-400 hover:text-blue-300 flex items-center bg-gray-800 px-2 py-0.5 rounded border border-gray-600 shadow-sm">
                            {expandedLogs[conn.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                      {expandedLogs[conn.id] ? (
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                          {logs.map((log, i) => (
                            <div key={i} className={`truncate ${log.type === 'error' ? 'text-red-400' :
                              log.type === 'success' ? 'text-green-400' : 'text-gray-300'
                              }`}>
                              <span className="text-gray-500 text-xs mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                              {log.message}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`truncate ${lastLog?.type === 'error' ? 'text-red-400' :
                          lastLog?.type === 'success' ? 'text-green-400' : 'text-gray-400'
                          }`}>
                          {lastLog ? (
                            <>
                              <span className="text-gray-500 text-xs mr-2">[{new Date(lastLog.timestamp).toLocaleTimeString()}]</span>
                              {lastLog.message}
                            </>
                          ) : 'No activity yet...'}
                        </div>
                      )}
                    </div>

                    {/* Deploy & Sync Actions */}
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => setActiveDeployment(conn.id)}
                        className="flex-1 flex items-center justify-center px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-md hover:from-purple-700 hover:to-indigo-700 shadow-md transform transition-transform active:scale-95"
                        title="Zero-Downtime Deployment & Rollback"
                      >
                        <Rocket size={16} className="mr-2" /> Deploy & Rollback
                      </button>
                      <button
                        onClick={() => toggleSync(conn.id, isSyncing)}
                        className={`flex-1 flex items-center justify-center px-4 py-2.5 text-sm font-bold rounded-md transition-colors text-white ${isSyncing
                          ? 'bg-red-500 hover:bg-red-600'
                          : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                      >
                        {isSyncing ? (
                          <><Square size={16} className="mr-2 fill-current" /> Stop Sync</>
                        ) : (
                          <><Play size={16} className="mr-2 fill-current" /> Start Sync</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
};

export default FTPConnectionList;
