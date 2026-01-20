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

  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredConnections = connections.filter(conn =>
    (conn.name && conn.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    conn.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conn.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FTP Connections</h1>
          <p className="text-gray-500 mt-1">Manage your FTP server connections</p>
        </div>

        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Search connections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            />
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={20} className="mr-2" />
            New Connection
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
          connections={filteredConnections}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};

export default ConnectionManager;
