import React, { useState, useEffect } from 'react';
import { FTPConnection, FTPConnectionFormData } from '../types';
import { Save, X, Folder, CheckCircle, AlertCircle, HardDrive, Wifi } from 'lucide-react';
import LocalFolderBrowser from './LocalFolderBrowser';

interface Props {
  initialData?: FTPConnection;
  onSuccess: () => void;
  onCancel: () => void;
}

const FTPConnectionForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<FTPConnectionFormData>({
    server: '',
    port: 21,
    username: '',
    password: '',
    targetDirectory: '/',
    localPath: '',
    syncMode: 'bi_directional',
    secure: false,
    syncDeletions: false,
    parallelConnections: 3
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Path Check State
  const [pathStatus, setPathStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [pathMessage, setPathMessage] = useState('');

  // Browser Modal State
  const [showBrowser, setShowBrowser] = useState(false);

  // Test Connection State
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        server: initialData.server,
        port: initialData.port,
        username: initialData.username,
        password: '',
        targetDirectory: initialData.target_directory || '/',
        localPath: initialData.local_path || '',
        syncMode: initialData.sync_mode || 'bi_directional',
        secure: !!initialData.secure,
        syncDeletions: (initialData.sync_deletions as any) === true || (initialData.sync_deletions as any) === 1 || String(initialData.sync_deletions) === '1' || String(initialData.sync_deletions) === 'true',
        parallelConnections: initialData.parallel_connections || 3
      });
      // If editing and localPath exists, assume valid initially or recheck
      if (initialData.local_path) {
        checkPath(initialData.local_path);
      }
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    // Explicitly handle checkboxes
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
      // Side effect for secure checkbox if needed, but [name]: checked handles it.
    }
    // Handle number inputs
    else if (name === 'port') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    }
    else if (name === 'parallelConnections') {
      const numVal = Math.max(1, Math.min(10, parseInt(value) || 3));
      setFormData(prev => ({ ...prev, [name]: numVal }));
    }
    // Default
    else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Side effects
    if (name === 'localPath') {
      setPathStatus('idle');
      setPathMessage('');
    }

    // Reset test status when credentials change
    if (['server', 'port', 'username', 'password'].includes(name)) {
      setTestStatus('idle');
      setTestMessage('');
    }
  };

  const checkPath = async (pathToCheck: string) => {
    if (!pathToCheck) return;
    setPathStatus('checking');
    try {
      const res = await fetch('/api/ftp-connections/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToCheck })
      });
      const data = await res.json();
      if (data.valid) {
        setPathStatus('valid');
      } else {
        setPathStatus('invalid');
        setPathMessage(data.message);
      }
    } catch (err) {
      setPathStatus('invalid');
      setPathMessage('Check failed');
    }
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const res = await fetch('/api/ftp-connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server: formData.server,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          syncMode: formData.syncMode,
          secure: formData.secure,
          syncDeletions: formData.syncDeletions,
          id: initialData?.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus('success');
        setTestMessage('Connection successful!');
      } else {
        setTestStatus('error');
        setTestMessage(data.message || 'Connection failed');
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage('Network error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const url = initialData
        ? `/api/ftp-connections/${initialData.id}`
        : '/api/ftp-connections';

      const method = initialData ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save connection');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <React.Fragment>
      {showBrowser && (
        <LocalFolderBrowser
          onSelect={(path) => {
            setFormData(prev => ({ ...prev, localPath: path }));
            checkPath(path);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            {initialData ? 'Edit Connection' : 'New Connection'}
          </h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">FTP Server</label>
              <input
                type="text"
                name="server"
                value={formData.server}
                onChange={handleChange}
                required
                placeholder="ftp.example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="mt-2 flex items-center">
                <input
                  id="secure"
                  name="secure"
                  type="checkbox"
                  checked={formData.secure}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="secure" className="ml-2 block text-sm text-gray-900">
                  Use SSL/TLS (FTPS)
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {initialData && <span className="text-gray-400 font-normal">(Leave blank to keep current)</span>}
                {!initialData && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!initialData}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!initialData && !formData.password && error ? 'border-red-500' : 'border-gray-300'
                  }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remote Target Directory</label>
            <input
              type="text"
              name="targetDirectory"
              value={formData.targetDirectory}
              onChange={handleChange}
              placeholder="/public_html"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sync Mode</label>
              <select
                name="syncMode"
                value={formData.syncMode}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="bi_directional">Bi-directional (2-Way)</option>
                <option value="upload_only">Upload Only (Local -&gt; FTP)</option>
                <option value="download_only">Download Only (FTP -&gt; Local)</option>
              </select>

              {(formData.syncMode === 'bi_directional' || formData.syncMode === 'upload_only') && (
                <div className="mt-3 flex items-start p-3 bg-red-50 rounded-md border border-red-100">
                  <div className="flex items-center h-5">
                    <input
                      id="syncDeletions"
                      name="syncDeletions"
                      type="checkbox"
                      checked={formData.syncDeletions}
                      onChange={handleChange}
                      className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="syncDeletions" className="font-medium text-red-800">Sync Deletions</label>
                    <p className="text-red-600 text-xs mt-0.5">
                      Warning: Deleting a file locally will PERMANENTLY delete it from the FTP server.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parallel Connections
                  <span className="ml-1 text-xs font-normal text-gray-400" title="Số FTP connections đồng thời. Cao hơn = nhanh hơn nhưng có thể gây quá tải server">
                    (1-10)
                  </span>
                </label>
                <input
                  type="number"
                  name="parallelConnections"
                  value={formData.parallelConnections}
                  onChange={handleChange}
                  min={1}
                  max={10}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Số lượng FTP connections song song khi upload. Giá trị cao tăng tốc độ nhưng có thể gây quá tải server.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Local Folder Path (Optional)
              </label>
              <div className="flex">
                <input
                  type="text"
                  name="localPath"
                  value={formData.localPath}
                  onChange={handleChange}
                  placeholder="E.g. D:\Projects\MySite"
                  className={`flex-1 px-3 py-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${pathStatus === 'invalid' ? 'border-red-300 bg-red-50' :
                    pathStatus === 'valid' ? 'border-green-300 bg-green-50' : 'border-gray-300'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowBrowser(true)}
                  className="px-3 py-2 bg-gray-100 border-t border-b border-gray-300 hover:bg-gray-200 text-gray-600 border-l-0"
                  title="Browse Folder"
                >
                  <Folder size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => checkPath(formData.localPath)}
                  className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-200 text-gray-600"
                  title="Check if path exists"
                >
                  {pathStatus === 'checking' ? '...' : 'Check'}
                </button>
              </div>
              {pathStatus === 'invalid' && (
                <p className="text-xs text-red-500 mt-1 flex items-center">
                  <AlertCircle size={12} className="mr-1" /> {pathMessage || 'Invalid path'}
                </p>
              )}
              {pathStatus === 'valid' && (
                <p className="text-xs text-green-600 mt-1 flex items-center">
                  <CheckCircle size={12} className="mr-1" /> Valid directory
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'testing' || !formData.server}
                className={`px-3 py-2 text-sm font-medium rounded-md border ${testStatus === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
                  testStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testMessage && (
                <span className={`text-xs ${testStatus === 'success' ? 'text-green-600' : testStatus === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                  {testMessage}
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} className="mr-2" />
                {loading ? 'Saving...' : 'Save Connection'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </React.Fragment>
  );
};

export default FTPConnectionForm;
