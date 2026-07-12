import React, { useEffect, useState } from 'react';
import { FTPConnection } from '../types';
import FTPConnectionList from '../components/FTPConnectionList';
import FTPConnectionForm from '../components/FTPConnectionForm';
import BackupModal from '../components/BackupModal';
import { Plus, RefreshCw, Shield } from 'lucide-react';
import { useConfirmModal } from '../components/ConfirmModal';
import InterruptedSyncBanner from '../components/InterruptedSyncBanner';

const ConnectionManager: React.FC = () => {
  const [connections, setConnections] = useState<FTPConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [editingConnection, setEditingConnection] = useState<FTPConnection | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const { showConfirm, ConfirmModalComponent } = useConfirmModal();

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ftp-connections');
      if (response.ok) {
        const data = await response.json();
        setConnections(data);
      }
    } catch (error) {
      console.error('Failed to fetch connections', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleCreate = () => {
    setEditingConnection(undefined);
    setShowForm(true);
  };

  const handleEdit = (connection: FTPConnection) => {
    setEditingConnection(connection);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    const confirmed = await showConfirm({
      title: 'Delete Connection',
      message: 'Are you sure you want to permanently delete this connection configuration? This action cannot be undone.',
      type: 'warning',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;

    try {
      await fetch(`/api/ftp-connections/${id}`, { method: 'DELETE' });
      fetchConnections();
    } catch (error) {
      console.error('Failed to delete connection', error);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    fetchConnections();
  };

  const filteredConnections = React.useMemo(() => {
    return connections.filter(conn =>
      (conn.name && conn.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      conn.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conn.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [connections, searchQuery]);

  return (
    <>
      <InterruptedSyncBanner onStateChange={fetchConnections} />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-neutral-850 pb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-150 font-display flex items-center gap-3">
              <span className="w-1.5 h-6 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full block"></span>
              Server Connections
            </h1>
            <p className="text-xs text-neutral-500 font-mono mt-1.5">Connection Pool // Active Nodes: {connections.length}</p>
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto font-mono">
            <div className="relative flex-1 md:w-60">
              <input
                type="text"
                placeholder="Search connections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-[#161922]/40 border border-neutral-800/50 rounded-lg focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/30 text-xs text-neutral-200 placeholder-neutral-600 transition-all"
              />
            </div>
            <button
              onClick={() => setShowBackup(true)}
              className="flex items-center px-4 py-2 border border-neutral-800/60 text-neutral-400 rounded-lg bg-[#161922]/40 hover:bg-[#161922] hover:text-neutral-100 hover:border-neutral-700 transition-all text-xs whitespace-nowrap uppercase cursor-pointer"
              title="Backup & Restore Configurations"
            >
              <Shield size={14} className="mr-1.5 text-neutral-500" />
              Backup
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold rounded-lg shadow-lg shadow-orange-600/10 hover:shadow-orange-500/20 transition-all text-xs whitespace-nowrap uppercase cursor-pointer"
            >
              <Plus size={14} className="mr-1.5 stroke-[3]" />
              New Connection
            </button>
          </div>
        </div>

      {showForm && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-neutral-800 bg-neutral-900">
            <FTPConnectionForm
              initialData={editingConnection}
              onSuccess={handleFormSuccess}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {showBackup && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg border border-neutral-800 bg-neutral-900">
            <BackupModal
              onClose={() => setShowBackup(false)}
              onSuccess={() => {
                setShowBackup(false);
                fetchConnections();
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="animate-spin text-orange-500" size={24} />
        </div>
      ) : (
        <FTPConnectionList
          connections={filteredConnections}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      <ConfirmModalComponent />
    </div>
    </>
  );
};

export default ConnectionManager;
