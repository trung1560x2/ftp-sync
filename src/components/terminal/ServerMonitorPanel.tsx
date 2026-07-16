import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Cpu,
  Clock,
  Trash2,
  Search,
  Plus,
  Edit2,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Sliders,
} from 'lucide-react';

interface ProcessItem {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  name: string;
}

interface ProcessNode extends ProcessItem {
  children: ProcessNode[];
}

interface EnvVarItem {
  key: string;
  value: string;
}

interface ServerMonitorPanelProps {
  sessionId: string;
  connectionId?: number;
}

const ServerMonitorPanel: React.FC<ServerMonitorPanelProps> = ({ sessionId }) => {
  const [activeTab, setActiveTab] = useState<'system' | 'processes' | 'env'>('system');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uptime & Load Avg States
  const [uptime, setUptime] = useState<string>('Loading...');
  const [loadAvg, setLoadAvg] = useState<number[]>([0, 0, 0]);
  const [loadHistory, setLoadHistory] = useState<{ time: string; loads: number[] }[]>([]);

  // Processes States
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [processSearch, setProcessSearch] = useState('');
  const [expandedPids, setExpandedPids] = useState<Record<number, boolean>>({});
  const [confirmKillPid, setConfirmKillPid] = useState<number | null>(null);

  // Env Vars States
  const [envVars, setEnvVars] = useState<EnvVarItem[]>([]);
  const [envSearch, setEnvSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingVal, setEditingVal] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Token helper
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });

  // Fetch System Uptime & Load
  const fetchUptime = useCallback(async () => {
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/uptime`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setUptime(data.uptime);
        setLoadAvg(data.loadAverage);
        
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLoadHistory(prev => {
          const updated = [...prev, { time: now, loads: data.loadAverage }];
          return updated.slice(-12); // Keep last 12 points (2 minutes of 10s polling)
        });
        setError(null);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      setError('Failed to fetch system load: ' + err.message);
    }
  }, [sessionId]);

  // Fetch Processes list
  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/processes`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setProcesses(data.processes);
        setError(null);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      setError('Failed to fetch running processes: ' + err.message);
    }
  }, [sessionId]);

  // Fetch Env Variables
  const fetchEnvVars = useCallback(async () => {
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/env-vars`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setEnvVars(data.envVars);
        setError(null);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      setError('Failed to fetch environment variables: ' + err.message);
    }
  }, [sessionId]);

  // Live polling effect (every 10s)
  useEffect(() => {
    fetchUptime();
    fetchProcesses();
    fetchEnvVars();

    const interval = setInterval(() => {
      fetchUptime();
      fetchProcesses();
    }, 10000);

    return () => clearInterval(interval);
  }, [sessionId, fetchUptime, fetchProcesses, fetchEnvVars]);

  // Kill Process Action
  const handleKillProcess = async (pid: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/terminal/sessions/${sessionId}/processes/kill`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ pid })
      });
      const data = await res.json();
      if (data.success) {
        setConfirmKillPid(null);
        fetchProcesses();
        
        // Also write a friendly note to active terminal pane
        window.dispatchEvent(new CustomEvent('terminal:run-command', {
          detail: { sessionId, command: `echo -e "\\n\\x1b[31m[System Monitor] Process ${pid} killed\\x1b[0m"` }
        }));
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to kill process: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add Env Variable Action
  const handleAddEnv = async () => {
    if (!newKey.trim()) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/terminal/sessions/${sessionId}/env-vars`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ key: newKey.trim(), value: newVal })
      });
      const data = await res.json();
      if (data.success) {
        // Run export command immediately in active terminal
        window.dispatchEvent(new CustomEvent('terminal:run-command', {
          detail: { sessionId, command: `export ${newKey.trim()}="${newVal.replace(/"/g, '\\"')}"` }
        }));

        setNewKey('');
        setNewVal('');
        setShowAddForm(false);
        fetchEnvVars();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to add environment variable: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Edit Env Variable Action
  const handleSaveEnvEdit = async (key: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/terminal/sessions/${sessionId}/env-vars`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ key, value: editingVal })
      });
      const data = await res.json();
      if (data.success) {
        // Run export command immediately in active terminal
        window.dispatchEvent(new CustomEvent('terminal:run-command', {
          detail: { sessionId, command: `export ${key}="${editingVal.replace(/"/g, '\\"')}"` }
        }));

        setEditingKey(null);
        fetchEnvVars();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to save environment variable: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete Env Variable Action
  const handleDeleteEnv = async (key: string) => {
    if (!confirm(`Are you sure you want to delete ${key}?`)) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/terminal/sessions/${sessionId}/env-vars/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        // Run unset command immediately in active terminal
        window.dispatchEvent(new CustomEvent('terminal:run-command', {
          detail: { sessionId, command: `unset ${key}` }
        }));

        fetchEnvVars();
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert('Failed to delete environment variable: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Compute Process Tree Nodes
  const processTree = useMemo(() => {
    const map: Record<number, ProcessNode> = {};
    const roots: ProcessNode[] = [];

    processes.forEach(p => {
      map[p.pid] = { ...p, children: [] };
    });

    processes.forEach(p => {
      const node = map[p.pid];
      if (p.ppid && map[p.ppid]) {
        map[p.ppid].children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [processes]);

  // Filter processes (handles both tree and flat view)
  const filteredProcessesFlat = useMemo(() => {
    if (!processSearch.trim()) return [];
    const query = processSearch.toLowerCase();
    return processes.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.pid.toString().includes(query) || 
      p.user.toLowerCase().includes(query)
    );
  }, [processes, processSearch]);

  const toggleExpand = (pid: number) => {
    setExpandedPids(prev => ({ ...prev, [pid]: !prev[pid] }));
  };

  // Recursively render process tree node
  const renderTreeNode = (node: ProcessNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = !!expandedPids[node.pid];

    return (
      <div key={node.pid} className="select-none">
        <div 
          className="flex items-center gap-1.5 py-1 px-2 hover:bg-neutral-900 border-b border-neutral-800/10 text-[10px] font-mono text-neutral-300 group"
          style={{ paddingLeft: `${Math.max(8, depth * 12)}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.pid)} className="text-neutral-500 hover:text-orange-500">
              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          ) : (
            <span className="w-2.5" />
          )}

          <span className="text-neutral-400 font-bold w-12 truncate">{node.pid}</span>
          <span className="text-neutral-500 w-12 truncate">{node.user}</span>
          <span className="text-orange-500/80 w-8 text-right">{node.cpu.toFixed(1)}%</span>
          <span className="text-neutral-500 w-22 flex-1 truncate ml-2" title={node.name}>{node.name}</span>

          <button 
            onClick={() => setConfirmKillPid(node.pid)}
            className="text-neutral-600 hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-neutral-800 rounded transition-all flex-shrink-0"
            title="Kill Process"
          >
            <Trash2 size={10} />
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="border-l border-neutral-850 ml-2">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Filtered Environment Variables
  const filteredEnvVars = useMemo(() => {
    const query = envSearch.toLowerCase();
    return envVars.filter(v => v.key.toLowerCase().includes(query) || v.value.toLowerCase().includes(query));
  }, [envVars, envSearch]);

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-300 border-l border-neutral-800 flex-shrink-0 w-80 relative select-none animate-in slide-in-from-right duration-200">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 flex-shrink-0 px-2">
        <div className="flex gap-1 py-1">
          <button
            onClick={() => setActiveTab('system')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
              activeTab === 'system' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Activity size={10} />
            System
          </button>
          <button
            onClick={() => setActiveTab('processes')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
              activeTab === 'processes' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Cpu size={10} />
            Processes
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
              activeTab === 'env' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Sliders size={10} />
            Env
          </button>
        </div>

        <button
          onClick={() => {
            if (activeTab === 'system') fetchUptime();
            if (activeTab === 'processes') fetchProcesses();
            if (activeTab === 'env') fetchEnvVars();
          }}
          className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-orange-400 transition-colors"
          title="Refresh statistics"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-3 bg-red-950/20 border-b border-red-900/20 text-[10px] font-mono text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Tab 1: System Dashboard */}
        {activeTab === 'system' && (
          <div className="p-3 space-y-4">
            {/* Uptime Box */}
            <div className="bg-neutral-900/40 border border-neutral-800/80 p-3 rounded-lg flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400">
                <Clock size={16} />
              </div>
              <div className="font-mono">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider">Uptime</div>
                <div className="text-[11px] text-neutral-200 font-bold">{uptime}</div>
              </div>
            </div>

            {/* CPU Load Averages */}
            <div className="space-y-2.5 bg-neutral-900/20 border border-neutral-800/40 p-3 rounded-lg">
              <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider border-b border-neutral-800/50 pb-1 mb-2 flex items-center gap-1.5">
                <Cpu size={11} className="text-orange-500/70" />
                CPU Load Average (10s poll)
              </div>
              
              {/* Load bars */}
              {['1 min', '5 min', '15 min'].map((label, idx) => {
                const val = loadAvg[idx] || 0;
                // Standardize percentage relative to 4 cores max for visual display
                const percent = Math.min(100, (val / 4) * 100);
                return (
                  <div key={label} className="font-mono text-[10px] space-y-1">
                    <div className="flex items-center justify-between text-neutral-400">
                      <span>{label}</span>
                      <span className="font-bold text-orange-400">{val.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden border border-neutral-800/30">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          val > 3 ? 'bg-red-500' : val > 1.5 ? 'bg-yellow-500' : 'bg-orange-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load History chart visualization */}
            {loadHistory.length > 0 && (
              <div className="bg-neutral-900/20 border border-neutral-800/40 p-3 rounded-lg">
                <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider border-b border-neutral-800/50 pb-1 mb-2">
                  CPU Load Trend (1m Avg)
                </div>
                <div className="h-20 flex items-end gap-1.5 pt-4 px-1 border-b border-neutral-800">
                  {loadHistory.map((item, idx) => {
                    const val = item.loads[0] || 0;
                    // Max height scaling
                    const height = Math.min(90, (val / 4) * 100);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        <div 
                          className="w-full bg-orange-600/40 hover:bg-orange-500 transition-colors rounded-t"
                          style={{ height: `${Math.max(4, height)}%` }}
                        />
                        {/* Hover load tooltip */}
                        <div className="absolute bottom-full mb-1 bg-black text-orange-400 font-mono text-[8px] px-1 py-0.5 rounded border border-orange-500/20 opacity-0 group-hover:opacity-100 pointer-events-none transition-all">
                          {val.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] font-mono text-neutral-600 mt-1">
                  <span>{loadHistory[0]?.time}</span>
                  <span>{loadHistory[loadHistory.length - 1]?.time}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Processes */}
        {activeTab === 'processes' && (
          <div className="flex flex-col h-full">
            {/* Search processes */}
            <div className="p-2 border-b border-neutral-850 flex items-center gap-1.5 flex-shrink-0">
              <Search size={11} className="text-neutral-500" />
              <input
                type="text"
                placeholder="Search processes..."
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                className="flex-1 bg-neutral-900/50 border border-neutral-800 px-2 py-0.5 rounded text-[10px] font-mono text-neutral-300 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Process Header columns */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900/30 text-[9px] font-mono text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-800 flex-shrink-0">
              <span className="w-12">PID</span>
              <span className="w-12">USER</span>
              <span className="w-8 text-right">CPU</span>
              <span className="flex-1 ml-2">NAME</span>
            </div>

            {/* Process Rows List */}
            <div className="flex-1 overflow-y-auto px-1 py-1">
              {processSearch.trim() ? (
                // Flat filtered list
                filteredProcessesFlat.map(p => (
                  <div 
                    key={p.pid} 
                    className="group flex items-center gap-1.5 py-1 px-2 hover:bg-neutral-900 border-b border-neutral-800/10 text-[10px] font-mono text-neutral-300"
                  >
                    <span className="text-neutral-400 font-bold w-12 truncate">{p.pid}</span>
                    <span className="text-neutral-500 w-12 truncate">{p.user}</span>
                    <span className="text-orange-500/80 w-8 text-right">{p.cpu.toFixed(1)}%</span>
                    <span className="text-neutral-500 w-22 flex-1 truncate ml-2" title={p.name}>{p.name}</span>
                    
                    <button 
                      onClick={() => setConfirmKillPid(p.pid)}
                      className="text-neutral-600 hover:text-red-500 p-0.5 hover:bg-neutral-800 rounded transition-all flex-shrink-0"
                      title="Kill Process"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))
              ) : (
                // Hierarchical tree list
                processTree.map(node => renderTreeNode(node))
              )}

              {processes.length === 0 && (
                <div className="p-4 text-center text-[10px] font-mono text-neutral-600">
                  Loading running processes...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Environment Variables */}
        {activeTab === 'env' && (
          <div className="flex flex-col h-full p-2.5 space-y-3">
            {/* Search environment variables */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Search size={11} className="text-neutral-500" />
              <input
                type="text"
                placeholder="Search env vars..."
                value={envSearch}
                onChange={(e) => setEnvSearch(e.target.value)}
                className="flex-1 bg-neutral-900/50 border border-neutral-800 px-2 py-0.5 rounded text-[10px] font-mono text-neutral-300 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`p-1 border rounded transition-all ${
                  showAddForm ? 'text-orange-500 border-orange-500/20 bg-neutral-900' : 'text-neutral-400 border-neutral-800 hover:text-orange-400'
                }`}
                title="Add Environment Variable"
              >
                <Plus size={11} />
              </button>
            </div>

            {/* Add Env Variable Form */}
            {showAddForm && (
              <div className="p-2 border border-orange-500/10 bg-orange-950/5 rounded-lg space-y-2 animate-in slide-in-from-top-1 duration-150 flex-shrink-0 font-mono text-[10px]">
                <div className="text-[9px] uppercase tracking-wider text-orange-400 font-bold mb-1">Add Env Variable</div>
                <input
                  type="text"
                  placeholder="KEY"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  className="w-full bg-neutral-950 border border-neutral-800 px-2 py-1 rounded text-neutral-200 focus:outline-none focus:border-orange-500"
                />
                <input
                  type="text"
                  placeholder="VALUE"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 px-2 py-1 rounded text-neutral-200 focus:outline-none focus:border-orange-500"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-2 py-0.5 border border-neutral-800 hover:bg-neutral-800 rounded text-neutral-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddEnv}
                    disabled={!newKey}
                    className="px-2.5 py-0.5 bg-orange-600 hover:bg-orange-500 text-black font-bold rounded disabled:opacity-30"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Env List */}
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-0.5">
              {filteredEnvVars.map(v => {
                const isEditing = editingKey === v.key;
                return (
                  <div 
                    key={v.key}
                    className="p-2 bg-neutral-900/30 hover:bg-neutral-900 border border-neutral-800/40 hover:border-neutral-800/80 rounded-lg flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[10px] text-orange-400 font-mono truncate max-w-[200px]" title={v.key}>
                        {v.key}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveEnvEdit(v.key)}
                              className="text-emerald-500 hover:text-emerald-400 p-0.5 rounded hover:bg-neutral-800"
                              title="Save Changes"
                            >
                              <Check size={10} />
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="text-neutral-500 hover:text-neutral-300 p-0.5 rounded hover:bg-neutral-800"
                              title="Cancel"
                            >
                              <X size={10} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingKey(v.key);
                                setEditingVal(v.value);
                              }}
                              className="text-neutral-500 hover:text-orange-400 p-0.5 rounded hover:bg-neutral-800 transition-colors"
                              title="Edit Variable"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button
                              onClick={() => handleDeleteEnv(v.key)}
                              className="text-neutral-500 hover:text-red-500 p-0.5 rounded hover:bg-neutral-800 transition-colors"
                              title="Delete Variable"
                            >
                              <Trash2 size={10} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <input
                        type="text"
                        value={editingVal}
                        onChange={(e) => setEditingVal(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded text-[10px] font-mono text-neutral-200 focus:outline-none focus:border-orange-500"
                      />
                    ) : (
                      <span className="text-[10px] font-mono text-neutral-400 truncate max-w-[260px]" title={v.value}>
                        {v.value || <span className="opacity-30 italic">empty</span>}
                      </span>
                    )}
                  </div>
                );
              })}

              {envVars.length === 0 && (
                <div className="p-4 text-center text-[10px] font-mono text-neutral-600">
                  Loading environment variables...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal to Kill Process */}
      {confirmKillPid !== null && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-[240px] shadow-2xl p-4 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200 font-mono text-[11px]">
            <span className="text-2xl mb-2">⚠️</span>
            <div className="font-bold text-neutral-200 mb-1">Kill Process?</div>
            <div className="text-neutral-500 mb-4">
              Are you sure you want to kill PID <span className="text-red-400 font-bold">{confirmKillPid}</span>?
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setConfirmKillPid(null)}
                className="flex-1 px-3 py-1.5 border border-neutral-800 hover:bg-neutral-800 rounded text-neutral-400 transition-colors"
              >
                No
              </button>
              <button
                onClick={() => handleKillProcess(confirmKillPid)}
                className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-colors"
              >
                Yes, Kill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerMonitorPanel;
