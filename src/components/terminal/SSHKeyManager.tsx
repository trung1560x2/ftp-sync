import React, { useState, useEffect } from 'react';
import { FTPConnection } from '../../types';

interface SSHKey {
  id: number;
  name: string;
  type: string;
  publicKey: string;
  createdAt: string;
}

export const SSHKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<SSHKey[]>([]);
  const [connections, setConnections] = useState<FTPConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState<SSHKey | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'rsa' | 'ed25519'>('ed25519');
  const [importName, setImportName] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ssh-keys');
      const data = await res.json();
      if (data.success) {
        setKeys(data.keys);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Failed to fetch keys: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/ftp-connections');
      const data = await res.json();
      setConnections(data);
    } catch (err: any) {
      console.error('Failed to load connections:', err);
    }
  };

  useEffect(() => {
    fetchKeys();
    fetchConnections();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/ssh-keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, type: newType })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Successfully generated key pair "${newName}"`);
        setShowGenerateModal(false);
        setNewName('');
        fetchKeys();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Key generation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importName.trim() || !importPrivateKey.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/ssh-keys/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: importName, privateKey: importPrivateKey })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Successfully imported key pair "${importName}"`);
        setShowImportModal(false);
        setImportName('');
        setImportPrivateKey('');
        fetchKeys();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Import failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete SSH key "${name}"?`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/ssh-keys/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Deleted key "${name}"`);
        fetchKeys();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Deletion failed: ' + err.message);
    }
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showInstallModal || !selectedConnectionId) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch(`/api/ssh-keys/${showInstallModal.id}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: selectedConnectionId })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`SSH public key installed successfully on remote server`);
        setShowInstallModal(null);
        setSelectedConnectionId('');
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Failed to install key: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Public key copied to clipboard!');
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex justify-between items-center bg-[#11131c]/60 p-4 border border-neutral-800/40 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest font-mono">
            SSH Key Manager
          </h2>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono mt-1">
            Generate and manage cryptographic key pairs for SFTP and SSH Terminal
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGenerateModal(true)}
            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 transition-colors text-white text-[10px] font-bold uppercase tracking-widest rounded-lg font-mono"
          >
            Generate Key
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 bg-[#0f111a] border border-neutral-800 hover:border-neutral-700 transition-all text-neutral-300 text-[10px] font-bold uppercase tracking-widest rounded-lg font-mono"
          >
            Import Key
          </button>
        </div>
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

      {/* Keys Table */}
      <div className="bg-[#11131c]/40 border border-neutral-800/40 rounded-xl overflow-hidden">
        {loading && keys.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 font-mono uppercase select-none">
            Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 font-mono uppercase select-none">
            No SSH keys configured. Click "Generate Key" to create one.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-neutral-800/60 bg-[#0d0e12]/40 text-neutral-400 uppercase text-[9px] font-bold tracking-wider">
                <th className="p-3.5">Name</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Public Key</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {keys.map((key) => {
                const pubKeySnippet = key.publicKey.length > 50 
                  ? key.publicKey.substring(0, 35) + '...' + key.publicKey.substring(key.publicKey.length - 20)
                  : key.publicKey;
                return (
                  <tr key={key.id} className="hover:bg-[#0d0e12]/20 transition-colors text-neutral-300">
                    <td className="p-3.5 font-bold">{key.name}</td>
                    <td className="p-3.5 uppercase">{key.type}</td>
                    <td className="p-3.5 text-neutral-500 text-[10px] select-all cursor-pointer" onClick={() => copyToClipboard(key.publicKey)}>
                      {pubKeySnippet}
                    </td>
                    <td className="p-3.5 text-right flex justify-end gap-2.5">
                      <button
                        onClick={() => copyToClipboard(key.publicKey)}
                        className="px-2 py-1 bg-[#0f111a] border border-neutral-800/60 hover:border-neutral-700/60 transition-colors text-[9px] uppercase font-bold tracking-wider text-neutral-300 rounded"
                        title="Copy Public Key"
                      >
                        Copy Pub
                      </button>
                      <button
                        onClick={() => setShowInstallModal(key)}
                        className="px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-500 text-[9px] uppercase font-bold tracking-wider rounded transition-colors"
                        title="Install public key directly on remote host authorized_keys"
                      >
                        Install Remote
                      </button>
                      <button
                        onClick={() => handleDelete(key.id, key.name)}
                        className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[9px] uppercase font-bold tracking-wider rounded transition-colors"
                        title="Delete Key Pair"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#11131c] border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-widest font-mono">
              Generate New Key Pair
            </h3>
            <form onSubmit={handleGenerate} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Key Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. staging-server-key"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Key Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none cursor-pointer"
                >
                  <option value="ed25519" className="bg-[#0f111a]">Ed25519 (Fast & Secure - Recommended)</option>
                  <option value="rsa" className="bg-[#0f111a]">RSA 2048 (Legacy compatibility)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 bg-[#0f111a] hover:bg-[#0f111a]/80 border border-neutral-800 text-neutral-400 text-[10px] font-bold uppercase tracking-wider rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-800 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                >
                  {loading ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#11131c] border border-neutral-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-widest font-mono">
              Import Existing Private Key
            </h3>
            <form onSubmit={handleImport} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Key Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. personal-git-key"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  PEM Private Key
                </label>
                <textarea
                  required
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                  value={importPrivateKey}
                  onChange={(e) => setImportPrivateKey(e.target.value)}
                  className="w-full h-40 px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 font-mono outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-[#0f111a] hover:bg-[#0f111a]/80 border border-neutral-800 text-neutral-400 text-[10px] font-bold uppercase tracking-wider rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-800 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                >
                  {loading ? 'Importing...' : 'Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Install Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#11131c] border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-widest font-mono">
              Install Key on Remote Host
            </h3>
            <p className="text-[10px] text-neutral-500 font-mono uppercase">
              Key: {showInstallModal.name}
            </p>
            <form onSubmit={handleInstall} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Select Target Server
                </label>
                <select
                  required
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800 hover:border-neutral-700/60 focus:border-orange-500 rounded-lg text-xs text-neutral-200 outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#0f111a]">-- SELECT SERVER --</option>
                  {connections.map(c => (
                    <option key={c.id} value={c.id} className="bg-[#0f111a]">
                      {c.name || c.server} ({c.username}@{c.server})
                    </option>
                  ))}
                </select>
                <p className="text-[8px] text-neutral-600 uppercase mt-1">
                  Note: The server must be configured with a password or credentials first. We will use those to log in once, create ~/.ssh/authorized_keys, append this public key, and set permissions.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInstallModal(null)}
                  className="px-4 py-2 bg-[#0f111a] hover:bg-[#0f111a]/80 border border-neutral-800 text-neutral-400 text-[10px] font-bold uppercase tracking-wider rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedConnectionId}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-850 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                >
                  {loading ? 'Installing...' : 'Install Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SSHKeyManager;
