import React, { useEffect, useState } from 'react';
import { FTPConnection } from '../types';
import FTPConnectionList from '../components/FTPConnectionList';
import FTPConnectionForm from '../components/FTPConnectionForm';
import { Plus, RefreshCw } from 'lucide-react';

const ConnectionManager: React.FC = () => {
  const [connections, setConnections] = useState<FTPConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<FTPConnection | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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
    if (!window.confirm('Are you sure you want to delete this connection?')) return;

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

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FTP Connections</h1>
          <p className="text-gray-500 mt-1">Manage your FTP server connections</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={20} className="mr-2" />
          New Connection
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl">
            <FTPConnectionForm
              initialData={editingConnection}
              onSuccess={handleFormSuccess}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <FTPConnectionList
          connections={connections}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};

export default ConnectionManager;
