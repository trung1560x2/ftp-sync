import React, { useState, useEffect } from 'react';
import { X, RefreshCw, BarChart, FileText } from 'lucide-react';
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

const StatisticsModal: React.FC<Props> = ({ connectionId, serverName, onClose }) => {
  const [activeTab, setActiveTab] = useState<'charts' | 'logs'>('charts');
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchLogs();

    const interval = setInterval(() => {
      fetchStats();
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [connectionId]);

  const fetchStats = async () => {
    try {
      // Try reports/stats first
      const res = await fetch(`/api/reports/stats/${connectionId}?t=${Date.now()}`);
      const data = await res.json();
      // If no data or error, set empty stats
      if (data.error) {
        setStats({ dailyStats: [], totalStats: { total_uploaded: 0, total_downloaded: 0 } });
      } else {
        setStats(data);
      }
    } catch (err) {
      console.error(err);
      setStats({ dailyStats: [], totalStats: { total_uploaded: 0, total_downloaded: 0 } });
    }
  };

  const fetchLogs = async () => {
    try {
      // Use sync status endpoint which has the working in-memory logs
      const res = await fetch(`/api/sync/status/${connectionId}?t=${Date.now()}`);
      const data = await res.json();
      // Transform logs to match expected format
      const transformedLogs = (data.logs || []).map((log: any, index: number) => ({
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Process stats for chart
  const chartData = React.useMemo(() => {
    if (!stats?.dailyStats) return [];

    const dataMap: Record<string, any> = {};

    stats.dailyStats.forEach((s: DailyStat) => {
      if (!dataMap[s.date]) {
        dataMap[s.date] = { date: s.date, upload: 0, download: 0 };
      }
      dataMap[s.date][s.direction] = s.total_bytes;
    });

    return Object.values(dataMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [stats]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center">
              <BarChart className="mr-2" size={24} />
              Statistics & Logs
            </h2>
            <p className="text-sm text-gray-500">Connection: {serverName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'charts'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Charts & Overview
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'logs'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Full Log History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 bg-gray-50">
          {activeTab === 'charts' ? (
            <div className="h-full flex flex-col space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-500 uppercase">Total Uploaded</h3>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {formatBytes(stats?.totalStats?.total_uploaded || 0)}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-500 uppercase">Total Downloaded</h3>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {formatBytes(stats?.totalStats?.total_downloaded || 0)}
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="flex-1 bg-white p-4 rounded-lg shadow-sm border border-gray-200 min-h-[300px]">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Daily Data Transfer (Last 7 Days)</h3>
                {loading ? (
                  <div className="flex justify-center items-center h-64">
                    <RefreshCw className="animate-spin text-gray-400" />
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="90%">
                    <RechartsBarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(value) => formatBytes(value)} width={80} />
                      <Tooltip formatter={(value: number) => formatBytes(value)} />
                      <Legend />
                      <Bar dataKey="upload" name="Upload" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="download" name="Download" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex justify-center items-center h-64 text-gray-400">
                    No transfer data available yet
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-semibold text-gray-800">Recent Logs (Last 200)</h3>
                <button onClick={fetchLogs} className="p-1.5 hover:bg-gray-100 rounded text-gray-500">
                  <RefreshCw size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3">Time</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-gray-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.type === 'error' ? 'bg-red-100 text-red-800' :
                            log.type === 'success' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                            {log.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-700 break-words max-w-lg">
                          {log.message}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
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
    </div>
  );
};

export default StatisticsModal;