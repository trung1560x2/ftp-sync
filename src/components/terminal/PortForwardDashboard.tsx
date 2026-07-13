import React, { useState, useEffect } from 'react';
import { FTPConnection } from '../../types';

interface PortForward {
  id: number;
  connectionId: number;
  type: 'local' | 'remote' | 'dynamic';
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  description: string;
  autoStart: boolean;
  status: 'active' | 'connecting' | 'disconnected' | 'error';
  errorMessage?: string;
}

export const PortForwardDashboard: React.FC = () => {
  const [forwards, setForwards] = useState<PortForward[]>([]);
  const [connections, setConnections] = useState<FTPConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingForward, setEditingForward] = useState<PortForward | null>(null);

  // Form states
  const [connectionId, setConnectionId] = useState('');
  const [type, setType] = useState<'local' | 'remote' | 'dynamic'>('local');
  const [localHost, setLocalHost] = useState('127.0.0.1');
  const [localPort, setLocalPort] = useState('8080');
  const [remoteHost, setRemoteHost] = useState('127.0.0.1');
  const [remotePort, setRemotePort] = useState('80');
  const [description, setDescription] = useState('');
  const [autoStart, setAutoStart] = useState(false);

  const fetchForwards = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/port-forwards');
      const data = await res.json();
      if (data.success) {
        setForwards(data.forwards);
      }
    } catch (err: any) {
      setError('Failed to fetch port forwards: ' + err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/ftp-connections');
      const data = await res.json();
      // Only include SSH/SFTP connections
      setConnections(data.filter((c: any) => c.protocol === 'sftp'));
    } catch (err: any) {
      console.error('Failed to load connections:', err);
    }
  };

  useEffect(() => {
    fetchForwards();
    fetchConnections();

    // Poll status every 5 seconds
    const interval = setInterval(() => {
      fetchForwards(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleStartStop = async (forward: PortForward) => {
    setError('');
    setSuccess('');
    const action = (forward.status === 'active' || forward.status === 'connecting') ? 'stop' : 'start';
    try {
      const res = await fetch(`/api/port-forwards/${forward.id}/${action}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Tunnel ${action === 'start' ? 'started' : 'stopped'} successfully`);
        fetchForwards(true);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(`Failed to toggle tunnel: ${err.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const payload = {
      connectionId: parseInt(connectionId),
      type,
      localHost,
      localPort: parseInt(localPort),
      remoteHost: type !== 'dynamic' ? remoteHost : '',
      remotePort: type !== 'dynamic' ? parseInt(remotePort) : 0,
      description,
      autoStart
    };

    try {
      const url = editingForward ? `/api/port-forwards/${editingForward.id}` : '/api/port-forwards';
      const method = editingForward ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(editingForward ? 'Tunnel config updated' : 'New tunnel created');
        setShowConfigModal(false);
        resetForm();
        fetchForwards();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Failed to save tunnel config: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (forward: PortForward) => {
    setEditingForward(forward);
    setConnectionId(String(forward.connectionId));
    setType(forward.type);
    setLocalHost(forward.localHost);
    setLocalPort(String(forward.localPort));
    setRemoteHost(forward.remoteHost);
    setRemotePort(String(forward.remotePort));
    setDescription(forward.description);
    setAutoStart(forward.autoStart);
    setShowConfigModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this port forward tunnel?')) return;
    setError('');
    try {
      const res = await fetch(`/api/port-forwards/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSuccess('Tunnel configuration deleted');
        fetchForwards();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Deletion failed: ' + err.message);
    }
  };

  const resetForm = () => {
    setEditingForward(null);
    setConnectionId('');
    setType('local');
    setLocalHost('127.0.0.1');
    setLocalPort('8080');
    setRemoteHost('127.0.0.1');
    setRemotePort('80');
    setDescription('');
    setAutoStart(false);
  };

  const getConnectionLabel = (connId: number) => {
    const conn = connections.find(c => c.id === connId);
    return conn ? `${conn.name || conn.server} (${conn.username}@${conn.server})` : `Connection #${connId}`;
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex justify-between items-center bg-[#11131c]/60 p-4 border border-neutral-800/40 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest font-mono">
            SSH Port Forwarding & Tunnels
          </h2>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono mt-1">
            Establish Local (-L), Remote (-R), and Dynamic SOCKS5 (-D) tunnels through remote SSH connections
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowConfigModal(true); }}
          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 transition-colors text-white text-[10px] font-bold uppercase tracking-widest rounded-lg font-mono"
        >
          Add Tunnel
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-lg text-xs text-red-400 font-mono">
          [ERROR] {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-lg text-xs text-emerald-400 font-mono">
          [SUCCESS] {success}
        </div>
      )}

      {/* Tunnels Table */}
      <div className="bg-[#11131c]/40 border border-neutral-800/40 rounded-xl overflow-hidden">
        {loading && forwards.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 font-mono uppercase select-none">
            Loading tunnels...
          </div>
        ) : forwards.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 font-mono uppercase select-none">
            No tunnels configured. Click "Add Tunnel" to start port forwarding.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-neutral-800/60 bg-[#0d0e12]/40 text-neutral-400 uppercase text-[9px] font-bold tracking-wider">
                <th className="p-3.5">Server</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Local Address</th>
                <th className="p-3.5">Remote Target</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {forwards.map((forward) => (
                <tr key={forward.id} className="hover:bg-[#0d0e12]/20 transition-colors text-neutral-300">
                  <td className="p-3.5">
                    <div className="font-bold text-neutral-200 select-none">
                      {getConnectionLabel(forward.connectionId)}
                    </div>
                    {forward.description && (
                      <div className="text-[10px] text-neutral-500 mt-0.5 uppercase tracking-wide">
                        {forward.description}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 select-none">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                      forward.type === 'local' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      forward.type === 'remote' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {forward.type === 'local' ? 'Local (-L)' : forward.type === 'remote' ? 'Remote (-R)' : 'Dynamic SOCKS5 (-D)'}
                    </span>
                  </td>
                  <td className="p-3.5 text-neutral-400 select-all">
                    {forward.localHost}:{forward.localPort}
                  </td>
                  <td className="p-3.5 text-neutral-400 select-all">
                    {forward.type === 'dynamic' ? (
                      <span className="text-neutral-500 text-[10px] uppercase select-none">TUNNEL ALL TCP TRAFFIC</span>
                    ) : (
                      `${forward.remoteHost}:${forward.remotePort}`
                    )}
                  </td>
                  <td className="p-3.5 select-none">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full animate-pulse ${
                        forward.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
                        forward.status === 'connecting' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
                        forward.status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
                        'bg-neutral-600'
                      }`}></span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        forward.status === 'active' ? 'text-emerald-400' :
                        forward.status === 'connecting' ? 'text-amber-400' :
                        forward.status === 'error' ? 'text-red-400' :
                        'text-neutral-500'
                      }`}>
                        {forward.status}
                      </span>
                      {forward.errorMessage && (
                        <span className="text-[8px] text-red-500 border border-red-500/10 bg-red-950/20 px-1 py-0.5 rounded ml-1" title={forward.errorMessage}>
                          ERR
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5 text-right flex justify-end gap-2.5">
                    <button
                      onClick={() => handleStartStop(forward)}
                      className={`px-2 py-1 text-[9px] uppercase font-bold tracking-wider rounded transition-colors ${
                        (forward.status === 'active' || forward.status === 'connecting')
                          ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                          : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/25'
                      }`}
                    >
                      {(forward.status === 'active' || forward.status === 'connecting') ? 'Stop' : 'Start'}
                    </button>
                    <button
                      onClick={() => handleEdit(forward)}
                      className="px-2 py-1 bg-[#0f111a] border border-neutral-800 hover:border-neutral-700 transition-colors text-[9px] uppercase font-bold tracking-wider text-neutral-400 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(forward.id)}
                      className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[9px] uppercase font-bold tracking-wider rounded transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New/Edit Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#11131c] border border-neutral-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-widest font-mono">
              {editingForward ? 'Edit Tunnel Configuration' : 'Add Port Forward Tunnel'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Select SSH Server
                  </label>
                  <select
                    required
                    value={connectionId}
                    onChange={(e) => setConnectionId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none cursor-pointer"
                  >
                    <option value="" className="bg-[#0f111a]">-- SELECT SSH SERVER --</option>
                    {connections.map(c => (
                      <option key={c.id} value={c.id} className="bg-[#0f111a]">
                        {c.name || c.server} ({c.username}@{c.server})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Tunnel Type
                  </label>
                  <div className="flex bg-[#0d0e12]/60 p-0.5 border border-neutral-800/50 rounded-lg gap-0.5">
                    <button
                      type="button"
                      onClick={() => setType('local')}
                      className={`flex-1 text-center py-1 rounded text-[9px] font-bold uppercase tracking-wider transitions-all ${
                        type === 'local' ? 'bg-orange-500 text-white' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      Local (-L)
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('remote')}
                      className={`flex-1 text-center py-1 rounded text-[9px] font-bold uppercase tracking-wider transitions-all ${
                        type === 'remote' ? 'bg-orange-500 text-white' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      Remote (-R)
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('dynamic')}
                      className={`flex-1 text-center py-1 rounded text-[9px] font-bold uppercase tracking-wider transitions-all ${
                        type === 'dynamic' ? 'bg-orange-500 text-white' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      Dynamic SOCKS5 (-D)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Local Bind Host
                  </label>
                  <input
                    type="text"
                    required
                    value={localHost}
                    onChange={(e) => setLocalHost(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Local Bind Port
                  </label>
                  <input
                    type="number"
                    required
                    value={localPort}
                    onChange={(e) => setLocalPort(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                  />
                </div>

                {type !== 'dynamic' && (
                  <>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                        Remote Host Target
                      </label>
                      <input
                        type="text"
                        required
                        value={remoteHost}
                        onChange={(e) => setRemoteHost(e.target.value)}
                        className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                        Remote Port Target
                      </label>
                      <input
                        type="number"
                        required
                        value={remotePort}
                        onChange={(e) => setRemotePort(e.target.value)}
                        className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                      />
                    </div>
                  </>
                )}

                <div className="col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Description / Comment
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. tunneling postgres or dev proxy"
                    className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                  />
                </div>

                <div className="col-span-2 flex items-center pl-1">
                  <input
                    id="autoStart"
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                    className="h-4 w-4 bg-[#0d0e12] border-neutral-800 text-orange-600 focus:ring-0 rounded cursor-pointer"
                  />
                  <label htmlFor="autoStart" className="ml-2.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-400 select-none cursor-pointer">
                    Auto-start on app startup
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowConfigModal(false); resetForm(); }}
                  className="px-4 py-2 bg-[#0f111a] hover:bg-[#0f111a]/80 border border-neutral-800 text-neutral-400 text-[10px] font-bold uppercase tracking-wider rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !connectionId}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-850 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default PortForwardDashboard;
