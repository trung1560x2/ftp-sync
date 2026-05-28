import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  GitCommit, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Trash2, 
  GitCompare, 
  ChevronDown, 
  ChevronUp, 
  Calendar 
} from 'lucide-react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import HeatmapGrid from './HeatmapGrid';
import ContentDiffModal from './ContentDiffModal';

interface Props {
  connectionId: number;
  serverName: string;
  onClose: () => void;
}

interface DailyStat {
  date: string;
  direction: string;
  total_bytes: number;
}

interface LogEntry {
  id: number;
  type: string;
  message: string;
  created_at: string;
}

interface SyncSessionFile {
  name: string;
  path: string;
  size: number;
  direction: 'upload' | 'download' | 'delete';
  status: 'success' | 'failed' | 'skipped';
  message?: string;
}

interface SyncSessionEntry {
  id: string;
  connection_id: number;
  timestamp: string;
  status: 'success' | 'failed';
  duration: number;
  files: SyncSessionFile[];
}

interface HeatmapItem {
  date: string;
  count: number;
  bytes: number;
}

interface ConnectionStats {
  dailyStats: DailyStat[];
  totalStats: {
    total_uploaded: number;
    total_downloaded: number;
  };
}

const StatisticsModal: React.FC<Props> = ({ connectionId, serverName, onClose }) => {
  const [activeTab, setActiveTab] = useState<'charts' | 'history' | 'logs'>('charts');
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sessions, setSessions] = useState<SyncSessionEntry[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [contentDiffFile, setContentDiffFile] = useState<{ remotePath: string; fileName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/stats/${connectionId}?t=${Date.now()}`);
      const data = await res.json();
      if (data.error) {
        setStats({ dailyStats: [], totalStats: { total_uploaded: 0, total_downloaded: 0 } });
      } else {
        setStats(data);
      }
    } catch (err) {
      console.error(err);
      setStats({ dailyStats: [], totalStats: { total_uploaded: 0, total_downloaded: 0 } });
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/sync/status/${connectionId}?t=${Date.now()}`);
      const data = await res.json();
      const transformedLogs = (data.logs || []).map((log: { type: string; message: string; timestamp: string }, index: number) => ({
        id: index,
        type: log.type,
        message: log.message,
        created_at: log.timestamp
      }));
      setLogs(transformedLogs);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/reports/sessions/${connectionId}?t=${Date.now()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchHeatmap = async () => {
    setHeatmapLoading(true);
    try {
      const res = await fetch(`/api/reports/heatmap/${connectionId}?t=${Date.now()}`);
      const data = await res.json();
      setHeatmapData(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setHeatmapLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchLogs();
    fetchSessions();
    fetchHeatmap();

    const interval = setInterval(() => {
      fetchStats();
      fetchLogs();
      if (activeTab === 'history') {
        fetchSessions();
        fetchHeatmap();
      }
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, activeTab]);

  const handleClearSessions = async () => {
    if (!confirm("Are you sure you want to clear sync sessions history? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/reports/sessions/clear/${connectionId}`, {
        method: 'POST'
      });
      if (res.ok) {
        setSessions([]);
        fetchHeatmap();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = async (sessionId: string, filePath: string) => {
    if (!confirm(`Are you sure you want to rollback "${filePath}" to the version from session ${sessionId}? This will overwrite the local file and upload it to the server.`)) {
      return;
    }

    setRestoringFile(filePath);
    try {
      const res = await fetch('/api/reports/sessions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          sessionId,
          relPath: filePath
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Successfully restored and synced "${filePath}"`);
        fetchSessions(); // Refresh sessions list
      } else {
        alert(`Failed to restore: ${data.error || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      console.error(err);
      alert(`Failed to restore: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRestoringFile(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const chartData = React.useMemo(() => {
    if (!stats?.dailyStats) return [];
    const dataMap: Record<string, { date: string; upload: number; download: number }> = {};
    stats.dailyStats.forEach((s: DailyStat) => {
      if (!dataMap[s.date]) {
        dataMap[s.date] = { date: s.date, upload: 0, download: 0 };
      }
      if (s.direction === 'upload') dataMap[s.date].upload = s.total_bytes;
      if (s.direction === 'download') dataMap[s.date].download = s.total_bytes;
    });
    return Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [stats]);

  return (
    <div className="fixed inset-0 bg-neutral-955/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-neutral-900 border border-neutral-850 w-full max-w-5xl h-[85vh] flex flex-col rounded-none text-neutral-200 font-mono">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 bg-neutral-950">
          <div>
            <h2 className="text-xs font-black text-neutral-100 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-orange-500 block animate-signal"></span>
              Statistics & Diagnostics
            </h2>
            <p className="text-[10px] text-neutral-500 font-mono mt-1 uppercase">Node: {serverName}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-950">
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-6 py-3 font-bold text-xs uppercase tracking-wider transition-colors rounded-none ${
              activeTab === 'charts'
                ? 'border-b-2 border-orange-500 text-orange-500 bg-neutral-900/20'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
          >
            Charts & Overview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 font-bold text-xs uppercase tracking-wider transition-colors rounded-none ${
              activeTab === 'history'
                ? 'border-b-2 border-orange-500 text-orange-500 bg-neutral-900/20'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
          >
            Activity & History
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 font-bold text-xs uppercase tracking-wider transition-colors rounded-none ${
              activeTab === 'logs'
                ? 'border-b-2 border-orange-500 text-orange-500 bg-neutral-900/20'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
          >
            Full Log History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-neutral-900/40 custom-scrollbar">
          {activeTab === 'charts' && (
            <div className="h-full flex flex-col space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-950 p-4 border border-neutral-850 rounded-none">
                  <h3 className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Total Uploaded</h3>
                  <p className="text-xl font-bold text-orange-500 mt-1 font-mono">
                    {formatBytes(stats?.totalStats?.total_uploaded || 0)}
                  </p>
                </div>
                <div className="bg-neutral-950 p-4 border border-neutral-850 rounded-none">
                  <h3 className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Total Downloaded</h3>
                  <p className="text-xl font-bold text-emerald-500 mt-1 font-mono">
                    {formatBytes(stats?.totalStats?.total_downloaded || 0)}
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="flex-1 bg-neutral-950 p-4 border border-neutral-850 rounded-none min-h-[300px] flex flex-col">
                <h3 className="text-xs font-bold text-neutral-300 mb-4 uppercase tracking-widest">Daily Data Transfer (Last 7 Days)</h3>
                <div className="flex-1 min-h-[220px]">
                  {loading ? (
                    <div className="flex justify-center items-center h-full">
                      <RefreshCw className="animate-spin text-orange-500" size={20} />
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f1f1f" />
                        <XAxis dataKey="date" stroke="#525252" fontSize={9} />
                        <YAxis tickFormatter={(value) => formatBytes(value)} stroke="#525252" fontSize={9} width={65} />
                        <Tooltip 
                          formatter={(value: number) => formatBytes(value)} 
                          contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', color: '#e5e5e5', fontSize: 10, fontFamily: 'monospace' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                        <Bar dataKey="upload" name="Upload" fill="#ea580c" radius={0} />
                        <Bar dataKey="download" name="Download" fill="#059669" radius={0} />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex justify-center items-center h-full text-neutral-600 text-xs uppercase">
                      No transfer data available yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              {/* Heatmap Grid */}
              <HeatmapGrid data={heatmapData} loading={heatmapLoading} />

              {/* Sync Sessions / Commits */}
              <div className="bg-neutral-950 border border-neutral-850 p-4">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-900">
                  <span className="text-[10px] font-black text-neutral-450 tracking-widest uppercase flex items-center gap-1.5">
                    <Calendar size={12} className="text-orange-500" />
                    Sync Sessions Log History // Commits
                  </span>
                  {sessions.length > 0 && (
                    <button
                      onClick={handleClearSessions}
                      className="text-neutral-500 hover:text-red-500 flex items-center bg-neutral-900 px-2 py-1 border border-neutral-800 text-[9px] font-bold uppercase transition-colors"
                      title="Clear History"
                    >
                      <Trash2 size={10} className="mr-1" />
                      Clear History
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {sessionsLoading && sessions.length === 0 ? (
                    <div className="py-8 text-center text-neutral-600 text-xs uppercase animate-pulse">
                      Loading sync commits...
                    </div>
                  ) : sessions.length > 0 ? (
                    sessions.map((session) => {
                      const isExpanded = expandedSessions[session.id] || false;
                      const successCount = session.files.filter((f: SyncSessionFile) => f.status === 'success').length;
                      const failedCount = session.files.filter((f: SyncSessionFile) => f.status === 'failed').length;
                      const skippedCount = session.files.filter((f: SyncSessionFile) => f.status === 'skipped').length;

                      return (
                        <div key={session.id} className="border border-neutral-850 bg-neutral-900/20 font-mono">
                          {/* Session Header (Commit Line) */}
                          <div 
                            onClick={() => setExpandedSessions(prev => ({ ...prev, [session.id]: !isExpanded }))}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer hover:bg-neutral-900/50 transition-colors gap-2"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <span className={`w-2 h-2 rounded-none flex-shrink-0 ${
                                session.status === 'success' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                              }`} />
                              
                              <div className="flex items-center space-x-1 text-neutral-500 text-[10px] font-bold flex-shrink-0">
                                <GitCommit size={12} className="text-orange-500/80" />
                                <span>{session.id}</span>
                              </div>
                              
                              <span className="text-xs font-bold text-neutral-200 truncate">
                                {session.status === 'success' 
                                  ? `Synced ${successCount} files successfully`
                                  : `Failed sync session (${failedCount} errors)`
                                }
                                {skippedCount > 0 && ` (${skippedCount} skipped)`}
                              </span>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end space-x-4 text-neutral-500 text-[10px] font-bold">
                              <span>{new Date(session.timestamp).toLocaleString()}</span>
                              <span className="bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 text-neutral-400">
                                {(session.duration / 1000).toFixed(1)}s
                              </span>
                              {isExpanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
                            </div>
                          </div>

                          {/* Session Files Details */}
                          {isExpanded && (
                            <div className="border-t border-neutral-900 bg-neutral-950/70 p-3">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="text-[10px] text-neutral-500 uppercase bg-neutral-900/40 border-b border-neutral-900 sticky top-0">
                                    <tr>
                                      <th className="px-3 py-2 font-bold">Action</th>
                                      <th className="px-3 py-2 font-bold">File Path</th>
                                      <th className="px-3 py-2 font-bold">Size</th>
                                      <th className="px-3 py-2 font-bold">Status</th>
                                      <th className="px-3 py-2 font-bold text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-900/40">
                                    {session.files.map((file: SyncSessionFile, fileIdx: number) => (
                                      <tr key={fileIdx} className="hover:bg-neutral-900/30 transition-colors">
                                        <td className="px-3 py-2 font-bold whitespace-nowrap">
                                          <span className="flex items-center space-x-1.5">
                                            {file.direction === 'upload' && <ArrowUpRight size={12} className="text-orange-500" />}
                                            {file.direction === 'download' && <ArrowDownLeft size={12} className="text-emerald-500" />}
                                            {file.direction === 'delete' && <Trash2 size={12} className="text-red-400" />}
                                            <span className="uppercase text-[9px] tracking-wider">{file.direction}</span>
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-neutral-300 break-all select-all font-mono">{file.path}</td>
                                        <td className="px-3 py-2 text-neutral-400 whitespace-nowrap">{formatBytes(file.size)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-[1px] ${
                                            file.status === 'success' ? 'bg-emerald-950/20 text-emerald-450 border border-emerald-900/30' :
                                            file.status === 'skipped' ? 'bg-neutral-900 text-neutral-500 border border-neutral-800' :
                                            'bg-red-950/20 text-red-400 border border-red-900/30 animate-pulse'
                                          }`} title={file.message}>
                                            {file.status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                          {file.status === 'success' && file.direction !== 'delete' && (
                                            <div className="flex items-center justify-end gap-2">
                                              <button
                                                onClick={() => {
                                                  if (file.size > 5 * 1024 * 1024) {
                                                    alert("File is too large to compare code (> 5MB). However, you can still click the Restore button to rollback this file.");
                                                    return;
                                                  }
                                                  const binaryExtensions = ['.zip', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.exe', '.tar', '.gz', '.mp4', '.mp3', '.rar', '.7z', '.dmg', '.iso', '.bin', '.db', '.sqlite', '.woff', '.woff2', '.ttf', '.eot', '.ico'];
                                                  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
                                                  if (binaryExtensions.includes(ext)) {
                                                    alert("Comparing binary files in Monaco Editor is not supported. However, you can still click the Restore button to rollback this file.");
                                                    return;
                                                  }
                                                  setContentDiffFile({ remotePath: file.path, fileName: file.name });
                                                }}
                                                className="px-2 py-1 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-orange-500 text-[9px] font-bold uppercase flex items-center gap-1 transition-colors"
                                              >
                                                <GitCompare size={10} />
                                                Diff Live
                                              </button>
                                              <button
                                                onClick={() => handleRestore(session.id, file.path)}
                                                disabled={restoringFile === file.path}
                                                className="px-2 py-1 bg-orange-950/20 hover:bg-orange-900/30 border border-orange-900/40 text-orange-400 hover:text-orange-300 text-[9px] font-bold uppercase flex items-center gap-1 transition-colors disabled:opacity-50"
                                              >
                                                {restoringFile === file.path ? (
                                                  <RefreshCw size={10} className="animate-spin" />
                                                ) : (
                                                  <RefreshCw size={10} />
                                                )}
                                                Restore
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-neutral-600 text-xs uppercase border border-dashed border-neutral-900">
                      No sync commits recorded yet. Run a sync to populate history.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="h-full bg-neutral-950 border border-neutral-850 flex flex-col rounded-none">
              <div className="p-3 border-b border-neutral-850 flex justify-between items-center bg-neutral-950/80">
                <h3 className="font-bold text-xs text-neutral-400 uppercase tracking-wider">System Logs (Last 200)</h3>
                <button onClick={fetchLogs} className="p-1 hover:bg-neutral-800 border border-neutral-850 text-neutral-400 hover:text-neutral-200 transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs text-left font-mono border-collapse">
                  <thead className="text-[10px] text-neutral-500 uppercase bg-neutral-900 border-b border-neutral-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Time</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-900/40 transition-colors">
                        <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 border text-[10px] font-bold rounded-none ${
                            log.type === 'error' ? 'bg-red-950/30 text-red-400 border-red-900/40' :
                            log.type === 'success' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40' :
                            'bg-neutral-900 text-neutral-400 border-neutral-800'
                          }`}>
                            {log.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-300 break-all">
                          {log.message}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-neutral-600 uppercase text-xs">
                          No logs found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Embedded Monaco Content Diff Modal */}
      {contentDiffFile && (
        <ContentDiffModal
          connectionId={connectionId}
          remotePath={contentDiffFile.remotePath}
          fileName={contentDiffFile.fileName}
          onClose={() => setContentDiffFile(null)}
        />
      )}
    </div>
  );
};

export default StatisticsModal;