import React, { useState, useEffect } from 'react';
import { Server, Activity, Database, ArrowUpRight, ArrowDownLeft, Terminal, CheckCircle2, XCircle, Search, Clock, Cpu, ShieldAlert } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';

interface Props {
  isActive: boolean;
}

interface SummaryData {
  totalConnections: number;
  activeConnections: number;
  sftpCount: number;
  ftpCount: number;
  activeConnectionIds: number[];
  stats: {
    dailyStats: Array<{ date: string; direction: 'upload' | 'download'; total_bytes: number }>;
    totalStats: { total_uploaded: number; total_downloaded: number };
  };
  logs: Array<{
    id: number;
    connection_id: number;
    connection_name: string;
    type: 'info' | 'error' | 'success';
    message: string;
    created_at: string;
  }>;
  sessions: Array<{
    id: string;
    connection_id: number;
    connection_name: string;
    timestamp: string;
    status: 'success' | 'failed';
    duration: number;
    files: Array<{
      name: string;
      path: string;
      size: number;
      direction: 'upload' | 'download' | 'delete';
      status: 'success' | 'failed' | 'skipped';
    }>;
  }>;
}

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const OverviewDashboard: React.FC<Props> = ({ isActive }) => {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [logSearch, setLogSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/reports/dashboard/summary');
        if (res.ok) {
          const data = await res.json();
          setSummaryData(data);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard summary:', err);
      }
    };

    fetchSummary();
    const interval = setInterval(fetchSummary, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [isActive]);

  if (!summaryData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] text-neutral-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mb-4"></div>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">Loading Cockpit Overview...</p>
      </div>
    );
  }

  // Pre-process daily chart data
  const chartDataMap: Record<string, { date: string; upload: number; download: number }> = {};
  
  // Prepopulate last 7 days with zeros
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    chartDataMap[dateStr] = { date: dateStr, upload: 0, download: 0 };
  }

  (summaryData.stats?.dailyStats || []).forEach((item) => {
    const dateStr = item.date;
    if (chartDataMap[dateStr]) {
      if (item.direction === 'upload') {
        chartDataMap[dateStr].upload = Math.round(item.total_bytes / (1024 * 1024) * 100) / 100; // MB
      } else if (item.direction === 'download') {
        chartDataMap[dateStr].download = Math.round(item.total_bytes / (1024 * 1024) * 100) / 100; // MB
      }
    }
  });

  const chartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));

  // Format date display for chart X-axis
  const formatChartDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    return `${parts[2]}/${parts[1]}`;
  };

  // Filter global logs
  const filteredLogs = summaryData.logs.filter(log => 
    log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
    log.connection_name.toLowerCase().includes(logSearch.toLowerCase()) ||
    log.type.toLowerCase().includes(logSearch.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-h-[calc(100vh-80px)] overflow-y-auto custom-scrollbar select-none text-neutral-200">
      {/* Cockpit Overview Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-outfit tracking-tight text-white flex items-center gap-2">
            Cockpit Dashboard
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
              OmniSync v4.0
            </span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono mt-1">Real-time multi-server synchronization engine telemetry dashboard.</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono bg-neutral-900/40 border border-neutral-800/80 px-3 py-1.5 rounded-lg">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>Telemetry:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-400 font-bold uppercase">ONLINE</span>
          </div>
        </div>
      </div>

      {/* Widget Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Servers */}
        <div className="bg-[#161922]/40 backdrop-blur-md border border-neutral-800/60 rounded-xl p-5 hover:border-amber-500/30 transition-all duration-300 group hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-neutral-500 tracking-wider">Synchronizers</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-outfit text-white group-hover:text-amber-400 transition-colors">
                  {summaryData.totalConnections}
                </span>
                <span className="text-xs text-neutral-400 font-mono">SERVERS</span>
              </div>
            </div>
            <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-amber-500 group-hover:bg-amber-500/10 transition-colors">
              <Server className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-neutral-800/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                <span className="text-neutral-400">SFTP:</span>
                <span className="text-cyan-400 font-bold">{summaryData.sftpCount}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                <span className="text-neutral-400">FTP:</span>
                <span className="text-yellow-500 font-bold">{summaryData.ftpCount}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">ACTIVE:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                {summaryData.activeConnections > 0 && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                )}
                {summaryData.activeConnections}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Global Bandwidth */}
        <div className="bg-[#161922]/40 backdrop-blur-md border border-neutral-800/60 rounded-xl p-5 hover:border-amber-500/30 transition-all duration-300 group hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-neutral-500 tracking-wider">Telemetry Bandwidth</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold font-outfit text-white group-hover:text-amber-400 transition-colors">
                  {formatBytes(summaryData.stats?.totalStats?.total_uploaded + summaryData.stats?.totalStats?.total_downloaded)}
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">TOTAL SYNCED</span>
              </div>
            </div>
            <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-amber-500 group-hover:bg-amber-500/10 transition-colors">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-neutral-800/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-neutral-400">UP:</span>
              <span className="text-neutral-300">{formatBytes(summaryData.stats?.totalStats?.total_uploaded || 0)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-neutral-400">DOWN:</span>
              <span className="text-neutral-300">{formatBytes(summaryData.stats?.totalStats?.total_downloaded || 0)}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Sync Tasks */}
        <div className="bg-[#161922]/40 backdrop-blur-md border border-neutral-800/60 rounded-xl p-5 hover:border-amber-500/30 transition-all duration-300 group hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-neutral-500 tracking-wider">Sync Sessions</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold font-outfit text-white group-hover:text-amber-400 transition-colors">
                  {summaryData.sessions.length}
                </span>
                <span className="text-xs text-neutral-400 font-mono">COMPLETED</span>
              </div>
            </div>
            <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-amber-500 group-hover:bg-amber-500/10 transition-colors">
              <Database className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-neutral-800/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-neutral-400">SUCCESS:</span>
              <span className="text-emerald-400 font-bold">{summaryData.sessions.filter(s => s.status === 'success').length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-neutral-400">FAILED:</span>
              <span className="text-rose-500 font-bold">{summaryData.sessions.filter(s => s.status === 'failed').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-[#161922]/40 backdrop-blur-md border border-neutral-800/60 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold font-outfit text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            Global Transfer History (Last 7 Days)
          </h2>
          <span className="text-[10px] font-mono text-neutral-500 uppercase">Values in Megabytes (MB)</span>
        </div>
        
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatChartDate} 
                stroke="#525252" 
                fontSize={9} 
                fontFamily="Courier New"
              />
              <YAxis 
                stroke="#525252" 
                fontSize={9} 
                fontFamily="Courier New"
                tickFormatter={(val) => `${val} MB`}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#0a0a0c',
                  border: '1px solid #262626',
                  borderRadius: '6px',
                  fontFamily: 'Courier New',
                  fontSize: '10px'
                }}
                itemStyle={{ color: '#d4d4d8' }}
                labelStyle={{ color: '#71717a', fontWeight: 'bold' }}
                labelFormatter={(label) => `DATE: ${label}`}
              />
              <Area 
                type="monotone" 
                name="Upload" 
                dataKey="upload" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorUpload)" 
              />
              <Area 
                type="monotone" 
                name="Download" 
                dataKey="download" 
                stroke="#06b6d4" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorDownload)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Split section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sync Sessions */}
        <div className="bg-[#161922]/40 backdrop-blur-md border border-neutral-800/60 rounded-xl p-5 flex flex-col h-[400px]">
          <h2 className="text-sm font-semibold font-outfit text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Recent Sync Sessions
          </h2>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 text-xs">
            {summaryData.sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500 font-mono py-8">
                <ShieldAlert className="w-8 h-8 text-neutral-600 mb-2" />
                <span>NO RECENT SESSIONS</span>
              </div>
            ) : (
              summaryData.sessions.map((session) => (
                <div 
                  key={session.id} 
                  onClick={() => setSelectedSession(session)}
                  className="p-3 bg-[#0d0e12]/60 hover:bg-[#0d0e12]/90 border border-neutral-800/50 hover:border-neutral-700/60 rounded-lg cursor-pointer transition-all duration-200 flex items-center justify-between"
                >
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-300 font-outfit">{session.connection_name}</span>
                      <span className="text-[9px] font-mono text-neutral-500">ID: {session.id.substring(0, 8)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      {new Date(session.timestamp).toLocaleString()} • Duration: {(session.duration / 1000).toFixed(2)}s
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 font-mono text-[10px] shrink-0">
                    <div className="text-right">
                      <div className="text-neutral-400">{session.files.length} files</div>
                      <div className="text-neutral-500 font-bold">{formatBytes(session.files.reduce((acc, f) => acc + f.size, 0))}</div>
                    </div>
                    
                    {session.status === 'success' ? (
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full font-bold">
                        SUCCESS
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full font-bold">
                        FAILED
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Global Activity Terminal */}
        <div className="bg-[#161922]/40 backdrop-blur-md border border-neutral-800/60 rounded-xl p-5 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-sm font-semibold font-outfit text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              Global Activity Terminal
            </h2>
            
            {/* Terminal search */}
            <div className="relative w-48">
              <input 
                type="text" 
                placeholder="Filter logs..." 
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-850 hover:border-neutral-750 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none rounded-lg px-2.5 py-1 text-[10px] font-mono text-neutral-300 placeholder-neutral-600 transition-all duration-150"
              />
              <Search className="w-3 h-3 text-neutral-600 absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Terminal Box */}
          <div className="flex-1 bg-black/70 border border-neutral-900 rounded-lg p-3 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-1.5 select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-neutral-600 italic py-4">No matching activity logs...</div>
            ) : (
              filteredLogs.map((log) => {
                let colorClass = 'text-neutral-400';
                let typeSymbol = '[INFO]';
                if (log.type === 'success') {
                  colorClass = 'text-emerald-400';
                  typeSymbol = '[OK]  ';
                } else if (log.type === 'error') {
                  colorClass = 'text-rose-500 font-bold';
                  typeSymbol = '[ERR] ';
                }

                return (
                  <div key={log.id} className="leading-relaxed hover:bg-neutral-900/30 px-1 py-0.5 rounded transition-colors flex items-start gap-1">
                    <span className="text-neutral-600 shrink-0 select-none">
                      [{new Date(log.created_at).toLocaleTimeString([], { hour12: false })}]
                    </span>
                    <span className="text-amber-500/70 font-bold shrink-0 select-none">
                      [{log.connection_name}]
                    </span>
                    <span className={`${colorClass} shrink-0 select-none`}>
                      {typeSymbol}
                    </span>
                    <span className="text-neutral-300 whitespace-pre-wrap break-all">
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-[#161922] border border-neutral-800 rounded-xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-800/80 flex items-center justify-between shrink-0 bg-[#0d0e12]/60">
              <div>
                <h3 className="font-bold text-white font-outfit flex items-center gap-2">
                  Session details for {selectedSession.connection_name}
                </h3>
                <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                  ID: {selectedSession.id} • {new Date(selectedSession.timestamp).toLocaleString()}
                </p>
              </div>
              <button 
                onClick={() => setSelectedSession(null)}
                className="text-neutral-500 hover:text-white font-mono text-xs hover:bg-neutral-800/80 px-2.5 py-1 rounded transition-colors"
              >
                CLOSE
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {/* Quick info row */}
              <div className="grid grid-cols-3 gap-4 font-mono text-[11px] bg-neutral-900/40 p-3 rounded-lg border border-neutral-850">
                <div>
                  <div className="text-neutral-500">STATUS</div>
                  <div className={`font-bold ${selectedSession.status === 'success' ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {selectedSession.status.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500">DURATION</div>
                  <div className="font-bold text-neutral-200">
                    {(selectedSession.duration / 1000).toFixed(2)} SECONDS
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500">TRANSFERRED</div>
                  <div className="font-bold text-neutral-200">
                    {formatBytes(selectedSession.files.reduce((acc: number, f: any) => acc + f.size, 0))}
                  </div>
                </div>
              </div>

              {/* Files list */}
              <div>
                <h4 className="text-xs font-semibold text-neutral-400 font-mono uppercase mb-2">Transferred Files ({selectedSession.files.length})</h4>
                <div className="border border-neutral-850 rounded-lg overflow-hidden bg-neutral-900/10">
                  <table className="w-full text-left font-mono text-[10px]">
                    <thead>
                      <tr className="bg-neutral-950 text-neutral-500 border-b border-neutral-850">
                        <th className="px-3 py-2">DIRECTION</th>
                        <th className="px-3 py-2">FILE PATH</th>
                        <th className="px-3 py-2">SIZE</th>
                        <th className="px-3 py-2 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-850">
                      {selectedSession.files.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-neutral-600 italic">No files changed.</td>
                        </tr>
                      ) : (
                        selectedSession.files.map((file: any, idx: number) => (
                          <tr key={idx} className="hover:bg-neutral-900/20">
                            <td className="px-3 py-2">
                              {file.direction === 'upload' && <span className="text-emerald-400 font-bold">▲ UPLOAD</span>}
                              {file.direction === 'download' && <span className="text-cyan-400 font-bold">▼ DOWNLOAD</span>}
                              {file.direction === 'delete' && <span className="text-rose-500 font-bold">✖ DELETE</span>}
                            </td>
                            <td className="px-3 py-2 text-neutral-300 break-all select-text">{file.path}</td>
                            <td className="px-3 py-2 text-neutral-400">{formatBytes(file.size)}</td>
                            <td className="px-3 py-2 text-right">
                              {file.status === 'success' ? (
                                <span className="text-emerald-400 font-bold">SUCCESS</span>
                              ) : file.status === 'skipped' ? (
                                <span className="text-yellow-600">SKIPPED</span>
                              ) : (
                                <span className="text-rose-500 font-bold">FAILED</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewDashboard;
