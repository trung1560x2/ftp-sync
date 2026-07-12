import React, { useState, useEffect, useRef } from 'react';
import { FTPConnection } from '../types';
import { Wifi, Server, Folder, Play, Square, Activity, ChevronDown, ChevronUp, BarChart2, Terminal, Trash2, Rocket, GitCompare } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';
import UploadProgressBar from './UploadProgressBar';

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

interface Props {
  connection: FTPConnection;
  isSyncing: boolean;
  syncStatus: string;
  onOpenStats: () => void;
  onOpenFileManager: () => void;
  onOpenVisualDiff: () => void;
  onOpenDeployment: () => void;
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

const FTPConnectionDetailPanel: React.FC<Props> = ({
  connection,
  isSyncing,
  syncStatus,
  onOpenStats,
  onOpenFileManager,
  onOpenVisualDiff,
  onOpenDeployment
}) => {
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Real-time progress and logs from SSE / Polling
  const [uploadProgress, setUploadProgress] = useState<OverallProgress | null>(null);
  const [logs, setLogs] = useState<{ timestamp: string; type: string; message: string }[]>([]);
  const [expandedLogs, setExpandedLogs] = useState(false);
  
  // Bandwidth history tracking for charts
  const [bandwidthHistory, setBandwidthHistory] = useState<Array<{ time: string; speed: number; upload: number; download: number }>>([]);

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

  // Reset states on connection change
  useEffect(() => {
    setTestResult(null);
    setUploadProgress(null);
    setLogs([]);
    setExpandedLogs(false);
    setBandwidthHistory(getPrepopulatedHistory());
  }, [connection.id]);

  // 1-second bandwidth history update loop
  useEffect(() => {
    const timer = setInterval(() => {
      setBandwidthHistory(prev => {
        let upload = 0;
        let download = 0;

        if (isSyncing && uploadProgress) {
          if (uploadProgress.uploadSpeedMBps !== undefined || uploadProgress.downloadSpeedMBps !== undefined) {
            upload = uploadProgress.uploadSpeedMBps || 0;
            download = uploadProgress.downloadSpeedMBps || 0;
          } else if (uploadProgress.activeUploads) {
            uploadProgress.activeUploads.forEach((item: any) => {
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

        const history = prev.length > 0 ? [...prev] : getPrepopulatedHistory();
        history.push(newPoint);
        if (history.length > 20) {
          history.shift(); // keep last 20 seconds
        }
        return history;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [connection.id, isSyncing, uploadProgress]);

  // Status & Logs polling (5 seconds interval for this connection)
  useEffect(() => {
    const fetchStatus = () => {
      fetch(`/api/sync/status/${connection.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.logs) {
            setLogs(data.logs);
          }
        })
        .catch(() => {});
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [connection.id]);

  // SSE Stream Setup for real-time progress
  useEffect(() => {
    let es: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    if (isSyncing) {
      console.log(`[FTPConnectionDetailPanel] Starting real-time progress stream for connection ${connection.id}`);
      es = new EventSource(`/api/sync/stream/${connection.id}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setUploadProgress(data);
        } catch (err) {
          console.error('SSE JSON parse error:', err);
        }
      };

      es.onerror = () => {
        console.warn(`SSE stream error for connection ${connection.id}, falling back to polling`);
        if (es) {
          es.close();
          es = null;
        }

        if (!pollInterval) {
          const poll = () => {
            fetch(`/api/sync/progress/${connection.id}`)
              .then(res => res.json())
              .then(data => {
                setUploadProgress(data);
              })
              .catch(() => {});
          };
          poll();
          pollInterval = setInterval(poll, 2000);
        }
      };
    } else {
      setUploadProgress(null);
    }

    return () => {
      if (es) es.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connection.id, isSyncing]);

  const handleTestConnection = async () => {
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
        success: data.success,
        message: data.success ? 'Connection successful!' : `Error: ${data.message}`
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Network error or server unavailable'
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch(`/api/reports/logs/clear/${connection.id}`, {
        method: 'POST'
      });
      if (res.ok) {
        setLogs([]);
      }
    } catch (err) {
      console.error('Failed to clear logs', err);
    }
  };

  const toggleSync = async () => {
    const endpoint = isSyncing ? '/api/sync/stop' : '/api/sync/start';
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connection.id })
      });
    } catch (error) {
      console.error('Sync toggle failed', error);
    }
  };

  const lastLog = logs.length > 0 ? logs[0] : null;
  const currentUploadSpeed = bandwidthHistory.length > 0 ? bandwidthHistory[bandwidthHistory.length - 1].upload : 0;
  const currentDownloadSpeed = bandwidthHistory.length > 0 ? bandwidthHistory[bandwidthHistory.length - 1].download : 0;

  return (
    <div className="bg-[#161922]/30 border border-neutral-800/50 p-6 rounded-2xl shadow-lg animate-fadeIn w-full">
      {/* Details Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3.5 mb-4 border-b border-neutral-800/40">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5 opacity-40 select-none mr-1">
            <div className="w-3.5 h-[2px] bg-neutral-600"></div>
            <div className="w-3.5 h-[2px] bg-neutral-600"></div>
            <div className="w-3.5 h-[2px] bg-neutral-600"></div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-neutral-100 text-base font-display uppercase tracking-wider">
              {connection.name || connection.server}
            </h3>
            {connection.validation_status === 'verified' && (
              <span className="text-[9px] bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center" title={connection.validation_message}>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5 animate-pulse"></span>
                Verified
              </span>
            )}
            {connection.validation_status === 'failed' && (
              <span className="text-[9px] bg-red-950/30 text-red-400 border border-red-900/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center animate-pulse" title={connection.validation_message}>
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5"></span>
                Unreachable
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto font-mono">
          {/* Run Diagnostics Button */}
          <button
            onClick={handleTestConnection}
            disabled={testingId === connection.id}
            className={`flex items-center justify-center px-3.5 py-2 text-xs font-bold rounded-lg border transition-all uppercase tracking-wider flex-1 sm:flex-none cursor-pointer ${
              testResult && testResult.success
                ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40 hover:bg-emerald-900/40'
                : testResult && !testResult.success
                  ? 'bg-red-950/30 text-red-400 border-red-900/40 hover:bg-red-900/40'
                  : 'text-neutral-400 bg-neutral-900/50 border-neutral-800/60 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Wifi size={13} className="mr-1.5" />
            {testingId === connection.id ? 'Testing...' : 'Diagnostics'}
          </button>
        </div>
      </div>

      {/* Hardware parameters grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs font-mono">
        <div className="bg-[#0d0e12]/60 border border-neutral-800/40 p-3 rounded-xl flex flex-col justify-between hover:border-neutral-700/40 transition-colors">
          <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">SERVER HOST</span>
          <span className="font-bold text-neutral-300 break-all select-all">{connection.server}</span>
        </div>
        <div className="bg-[#0d0e12]/60 border border-neutral-800/40 p-3 rounded-xl flex flex-col justify-between hover:border-neutral-700/40 transition-colors">
          <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">SERVICE PORT</span>
          <span className="font-bold text-neutral-300">PORT {connection.port}</span>
        </div>
        <div className="bg-[#0d0e12]/60 border border-neutral-800/40 p-3 rounded-xl flex flex-col justify-between hover:border-neutral-700/40 transition-colors">
          <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">CREDENTIAL USER</span>
          <span className="font-bold text-neutral-300 truncate">{connection.username}</span>
        </div>
        <div className="bg-[#0d0e12]/60 border border-neutral-800/40 p-3 rounded-xl flex flex-col justify-between hover:border-neutral-700/40 transition-colors">
          <span className="text-neutral-500 text-[8px] uppercase tracking-widest block mb-1">TARGET DIR</span>
          <span className="font-bold text-orange-500 truncate">{connection.target_directory || '/'}</span>
        </div>
      </div>

      {/* Metadata Details panel */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 px-3 py-2 bg-[#0d0e12]/40 border border-neutral-800/40 text-[10px] text-neutral-500 tracking-wider uppercase rounded-lg font-mono">
        <div className="flex items-center gap-1">
          <span className="text-neutral-600">Sync Status:</span>
          <span className={`font-bold ${isSyncing ? 'text-emerald-400' : syncStatus === 'success' ? 'text-emerald-400' : syncStatus === 'failed' ? 'text-red-400' : 'text-neutral-400'}`}>
            {isSyncing ? 'SYNCING_ACTIVE' : syncStatus}
          </span>
        </div>
        {connection.last_sync_time && (
          <div className="flex items-center gap-1 border-l border-neutral-800/80 pl-4">
            <span className="text-neutral-600">Last Sync:</span>
            <span className="text-neutral-400">
              {new Date(connection.last_sync_time).toLocaleString()}
              {connection.last_sync_duration !== null && connection.last_sync_duration !== undefined && ` (${(connection.last_sync_duration / 1000).toFixed(1)}s)`}
            </span>
          </div>
        )}
      </div>

      {/* Diagnostics and error report section */}
      {testResult && (
        <div className={`p-3.5 border rounded-xl mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
          testResult.success 
            ? 'bg-emerald-950/10 border-emerald-900/30 text-emerald-400' 
            : 'bg-red-955/10 border-red-900/30 text-red-400'
        }`}>
          <div className="flex-1 min-w-0 font-mono">
            <span className="text-[9px] uppercase tracking-widest block mb-1 font-bold">
              DIAGNOSTICS // CONNECTION RESULT
            </span>
            <span className="text-xs block truncate font-bold">
              {testResult.message}
            </span>
          </div>
        </div>
      )}

      {/* Service Control panel Header */}
      <div className="flex items-center gap-2 mt-4 mb-3 pb-2 border-b border-neutral-800/40">
        <span className="w-1.5 h-3.5 bg-emerald-500 rounded-full block"></span>
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
          Operations & Tools
        </span>
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap gap-2.5 mb-4">
        <button
          onClick={onOpenStats}
          className="flex items-center px-3.5 py-2 text-xs font-bold text-orange-400 bg-orange-950/15 border border-orange-900/40 hover:bg-orange-500 hover:text-white rounded-lg transition-all uppercase tracking-wider cursor-pointer shadow-sm"
        >
          <BarChart2 size={13} className="mr-1.5" /> Statistics
        </button>
        <button
          onClick={onOpenFileManager}
          className="flex items-center px-3.5 py-2 text-xs font-bold text-neutral-300 bg-neutral-900/50 border border-neutral-800/60 hover:bg-neutral-800 hover:text-neutral-100 rounded-lg transition-all uppercase tracking-wider cursor-pointer"
        >
          <Folder size={13} className="mr-1.5" /> File Manager
        </button>
        <button
          onClick={onOpenVisualDiff}
          className="flex items-center px-3.5 py-2 text-xs font-bold text-emerald-400 bg-emerald-950/15 border border-emerald-900/40 hover:bg-emerald-500 hover:text-white rounded-lg transition-all uppercase tracking-wider cursor-pointer shadow-sm"
        >
          <GitCompare size={13} className="mr-1.5" /> Visual Diff
        </button>
      </div>

      {/* Upload Progress Bar */}
      {isSyncing && uploadProgress && (
        <div className="mb-4">
          <UploadProgressBar progress={uploadProgress} />
        </div>
      )}

      {/* Real-time Bandwidth Monitor */}
      <div className="mb-4">
        <div className="flex items-center justify-between mt-2 mb-2 pb-1.5 border-b border-neutral-800/40">
          <div className="flex items-center gap-1.5">
            <Activity size={12} className={`text-orange-500 ${isSyncing ? 'animate-signal' : ''}`} />
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Real-time Bandwidth Monitor
            </span>
          </div>
          {isSyncing && (
            <div className="flex items-center gap-3 text-[9px] font-mono font-bold">
              <span className="text-orange-500">UP: {currentUploadSpeed.toFixed(2)} MB/S</span>
              <span className="text-emerald-400">DOWN: {currentDownloadSpeed.toFixed(2)} MB/S</span>
            </div>
          )}
        </div>
        
        <div className="h-32 w-full bg-[#0d0e12]/60 border border-neutral-800/40 p-2.5 select-none relative rounded-xl">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bandwidthHistory} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradUpload-${connection.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id={`gradDownload-${connection.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c1f26" vertical={false} />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#4b5563', fontSize: 7, fontFamily: 'monospace' }} 
                stroke="#1f2937"
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#4b5563', fontSize: 7, fontFamily: 'monospace' }} 
                stroke="#1f2937"
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
                fill={`url(#gradUpload-${connection.id})`} 
              />
              <Area 
                type="monotone" 
                dataKey="download" 
                name="Download" 
                stroke="#10b981" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill={`url(#gradDownload-${connection.id})`} 
              />
            </AreaChart>
          </ResponsiveContainer>
          {!isSyncing && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0d0e12]/60 pointer-events-none rounded-xl">
              <span className="text-[9px] font-mono font-bold tracking-widest text-neutral-500 uppercase bg-[#161922] px-3 py-1 rounded-lg border border-neutral-800/60">
                STANDBY // WAITING FOR ACTIVE TRANSMISSION
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log Terminal */}
      <div className="bg-[#0d0e12]/60 border border-neutral-800/40 p-4 text-xs text-neutral-350 rounded-xl flex flex-col mb-4">
        <div className="flex justify-between items-center mb-2.5 border-b border-neutral-800/40 pb-2">
          <div className="flex items-center gap-1.5">
            <Terminal size={12} className="text-orange-500 animate-signal" />
            <span className="font-bold text-neutral-400 uppercase tracking-wider text-[9px]">Activity Log</span>
          </div>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="text-neutral-500 hover:text-red-400 flex items-center bg-neutral-900/40 px-2 py-0.5 rounded border border-neutral-800 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                title="Clear Logs"
              >
                <Trash2 size={10} className="mr-1" />
                Clear
              </button>
            )}
            {logs.length > 0 && (
              <button 
                onClick={() => setExpandedLogs(!expandedLogs)} 
                className="text-orange-500 hover:text-orange-400 flex items-center bg-neutral-900/40 px-2 py-0.5 rounded border border-neutral-800 text-[9px] font-bold uppercase cursor-pointer"
              >
                {expandedLogs ? <ChevronUp size={11} className="mr-0.5" /> : <ChevronDown size={11} className="mr-0.5" />}
                Logs
              </button>
            )}
          </div>
        </div>
        {expandedLogs ? (
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar text-[11px] font-mono">
            {logs.map((log, i) => (
              <div key={i} className={`truncate border-l-2 pl-2 py-0.5 rounded-r ${
                log.type === 'error' ? 'text-red-400 border-red-500/50 bg-red-955/5' :
                log.type === 'success' ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/5' : 'text-neutral-400 border-neutral-700/50'
              }`}>
                <span className="text-neutral-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className="mr-2 uppercase text-[9px] font-bold select-none">[{log.type}]</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`truncate border-l-2 pl-2 py-0.5 text-[11px] font-mono rounded-r ${
            lastLog?.type === 'error' ? 'text-red-400 border-red-500/50 bg-red-955/5' :
            lastLog?.type === 'success' ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/5' : 'text-neutral-400 border-neutral-700/50'
          }`}>
            {lastLog ? (
              <>
                <span className="text-neutral-600 mr-2">[{new Date(lastLog.timestamp).toLocaleTimeString()}]</span>
                <span className="mr-2 uppercase text-[9px] font-bold select-none">[{lastLog.type}]</span>
                <span>{lastLog.message}</span>
              </>
            ) : 'No activity logs stored.'}
          </div>
        )}
      </div>

      {/* Deploy & Sync Actions */}
      <div className="flex gap-3">
        <button
          onClick={onOpenDeployment}
          className="flex-1 flex items-center justify-center px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 border-0 rounded-xl transition-all shadow-lg shadow-orange-600/10 hover:shadow-orange-500/20 active:scale-[0.98] uppercase tracking-widest cursor-pointer"
          title="Zero-Downtime Deployment & Rollback"
        >
          <Rocket size={14} className="mr-2" /> Deploy & Rollback
        </button>
        <button
          onClick={toggleSync}
          className={`flex-1 flex items-center justify-center px-4 py-2.5 text-xs font-bold rounded-xl border transition-all active:scale-[0.98] cursor-pointer ${
            isSyncing
              ? 'bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 border-red-500/30'
              : 'bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 border-emerald-500/30'
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
};

export default FTPConnectionDetailPanel;
