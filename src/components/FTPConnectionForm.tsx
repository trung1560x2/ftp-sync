import React, { useState, useEffect } from 'react';
import { FTPConnection, FTPConnectionFormData } from '../types';
import { Save, X, Folder, CheckCircle, AlertCircle, HardDrive, Wifi, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import LocalFolderBrowser from './LocalFolderBrowser';

interface Props {
  initialData?: FTPConnection;
  onSuccess: () => void;
  onCancel: () => void;
}

const FTPConnectionForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<FTPConnectionFormData>({
    name: '',
    server: '',
    port: 21,
    username: '',
    password: '',
    targetDirectory: '/',
    localPath: '',
    syncMode: 'bi_directional',
    secure: false,
    syncDeletions: false,
    parallelConnections: 3,
    bufferSize: 16,
    protocol: 'ftp',
    privateKey: '',
    conflictResolution: 'overwrite',
    excludePaths: ''
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

  // Ignore Patterns State
  const [showIgnoreSection, setShowIgnoreSection] = useState(false);
  const [ignorePatterns, setIgnorePatterns] = useState('');
  const [ignoreLoading, setIgnoreLoading] = useState(false);
  const [ignoreSaveStatus, setIgnoreSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        server: initialData.server,
        port: initialData.port,
        username: initialData.username,
        password: '',
        targetDirectory: initialData.target_directory || '/',
        localPath: initialData.local_path || '',
        syncMode: initialData.sync_mode || 'bi_directional',
        secure: !!initialData.secure,
        syncDeletions: (initialData.sync_deletions as any) === true || (initialData.sync_deletions as any) === 1 || String(initialData.sync_deletions) === '1' || String(initialData.sync_deletions) === 'true',
        parallelConnections: initialData.parallel_connections || 3,
        bufferSize: initialData.buffer_size || 16,
        protocol: initialData.protocol || 'ftp',
        privateKey: initialData.private_key || '',
        conflictResolution: initialData.conflict_resolution || 'overwrite',
        excludePaths: initialData.exclude_paths || ''
      });
      // If editing and localPath exists, assume valid initially or recheck
      if (initialData.local_path) {
        checkPath(initialData.local_path);
      }
    }
  }, [initialData]);

  // Load ignore patterns when editing existing connection
  const loadIgnorePatterns = async () => {
    if (!initialData?.id) return;
    setIgnoreLoading(true);
    try {
      const res = await fetch(`/api/ftp-connections/${initialData.id}/ignore`);
      const data = await res.json();
      if (data.content) {
        setIgnorePatterns(data.content);
      }
    } catch (err) {
      console.error('Failed to load ignore patterns', err);
    } finally {
      setIgnoreLoading(false);
    }
  };

  const saveIgnorePatterns = async () => {
    if (!initialData?.id) return;
    setIgnoreSaveStatus('saving');
    try {
      const res = await fetch(`/api/ftp-connections/${initialData.id}/ignore`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: ignorePatterns })
      });
      if (res.ok) {
        setIgnoreSaveStatus('saved');
        setTimeout(() => setIgnoreSaveStatus('idle'), 2000);
      } else {
        setIgnoreSaveStatus('error');
      }
    } catch (err) {
      setIgnoreSaveStatus('error');
    }
  };

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
    else if (name === 'bufferSize') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 16 }));
    }
    // Default
    else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Side effects
    if (name === 'protocol') {
      const newProtocol = value as 'ftp' | 'ftps' | 'sftp';
      let newPort = formData.port;

      if (newProtocol === 'sftp') {
        newPort = 22;
      } else if (newProtocol === 'ftp' || newProtocol === 'ftps') {
        // Only reset to 21 if it was 22, otherwise keep user selection? 
        // Or just strictly defaults? Let's use defaults if matches known ports.
        if (formData.port === 22) newPort = 21;
      }
      setFormData(prev => ({ ...prev, protocol: newProtocol, port: newPort }));
    }
    else if (name === 'localPath') {
      setPathStatus('idle');
      setPathMessage('');
    }

    // Reset test status when credentials change
    if (['server', 'port', 'username', 'password', 'protocol', 'privateKey'].includes(name)) {
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
          protocol: formData.protocol,
          privateKey: formData.privateKey,
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Connection Name <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="My Production Server"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
              <select
                name="protocol"
                value={formData.protocol}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ftp">FTP - File Transfer Protocol</option>
                <option value="ftps">FTPS - FTP over SSL/TLS</option>
                <option value="sftp">SFTP - SSH File Transfer Protocol</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">FTP Server</label>
              <input
                type="text"
                name="server"
                value={formData.server}
                onChange={handleChange}
                required
                placeholder={formData.protocol === 'sftp' ? 'sftp.example.com' : 'ftp.example.com'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {formData.protocol !== 'sftp' && (
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
              )}
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
                {!initialData && !formData.privateKey && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!initialData && !formData.privateKey}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!initialData && !formData.privateKey && !formData.password && error ? 'border-red-500' : 'border-gray-300'
                  }`}
                placeholder={formData.protocol === 'sftp' && formData.privateKey ? 'Passphrase (optional)' : ''}
              />
            </div>
          </div>

          {formData.protocol === 'sftp' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Private Key (Content or Path) <span className="text-gray-400 text-xs">(Optional if using password)</span>
              </label>
              <textarea
                name="privateKey"
                value={formData.privateKey || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, privateKey: e.target.value }))}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 font-mono text-xs"
              />
              <p className="text-xs text-gray-500 mt-1">Paste your Private Key content here. If using path, server must be running locally or have access.</p>
            </div>
          )}

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

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buffer Size
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    (MB)
                  </span>
                </label>
                <select
                  name="bufferSize"
                  value={formData.bufferSize}
                  onChange={handleChange}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={4}>4 MB</option>
                  <option value={8}>8 MB</option>
                  <option value={16}>16 MB</option>
                  <option value={32}>32 MB</option>
                  <option value={64}>64 MB</option>
                  <option value={128}>128 MB</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Buffer lớn hơn = tốc độ cao hơn, nhưng sử dụng nhiều RAM hơn.
                </p>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Conflict Resolution
                </label>
                <select
                  name="conflictResolution"
                  value={formData.conflictResolution}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="overwrite">Overwrite (Always replace)</option>
                  <option value="newer">Overwrite if newer (Source is newer)</option>
                  <option value="different_size">Overwrite if different size</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Xử lý khi file đã tồn tại trên server.
                </p>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exclude Paths
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    (Visual Diff & Deep Scan)
                  </span>
                </label>
                <textarea
                  name="excludePaths"
                  value={formData.excludePaths}
                  onChange={(e) => setFormData(prev => ({ ...prev, excludePaths: e.target.value }))}
                  placeholder={`vendor
node_modules
storage
build`}
                  className="w-full h-24 px-3 py-2 text-sm font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Các folder sẽ bị bỏ qua khi Visual Diff quét. Mỗi pattern một dòng hoặc ngăn cách bằng dấu phẩy.
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {['vendor', 'node_modules', 'storage', '.git', 'dist', 'build'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const current = formData.excludePaths.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                        if (!current.includes(p)) {
                          setFormData(prev => ({
                            ...prev,
                            excludePaths: prev.excludePaths ? `${prev.excludePaths}\n${p}` : p
                          }));
                        }
                      }}
                      className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border"
                    >
                      + {p}
                    </button>
                  ))}
                </div>
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

          {/* Ignore Patterns Section - Only show when editing */}
          {initialData && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setShowIgnoreSection(!showIgnoreSection);
                  if (!showIgnoreSection && !ignorePatterns) {
                    loadIgnorePatterns();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <FileText size={16} className="text-gray-500" />
                  <span className="font-medium text-gray-700">Ignore Patterns (.ftpignore)</span>
                </div>
                {showIgnoreSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showIgnoreSection && (
                <div className="p-4 border-t border-gray-200 bg-white">
                  {ignoreLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading...</div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-2">
                        Syntax giống .gitignore. Mỗi pattern một dòng. Dòng bắt đầu # là comment.
                      </p>
                      <textarea
                        value={ignorePatterns}
                        onChange={(e) => {
                          setIgnorePatterns(e.target.value);
                          setIgnoreSaveStatus('idle');
                        }}
                        placeholder={`# Example patterns:\n*.log\nnode_modules/\n*.tmp\n.git/`}
                        className="w-full h-40 px-3 py-2 font-mono text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-gray-400">
                          Patterns: *.log, node_modules/, *.tmp, !important.log
                        </div>
                        <button
                          type="button"
                          onClick={saveIgnorePatterns}
                          disabled={ignoreSaveStatus === 'saving'}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md ${ignoreSaveStatus === 'saved'
                            ? 'bg-green-100 text-green-700'
                            : ignoreSaveStatus === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                          {ignoreSaveStatus === 'saving' ? 'Saving...' :
                            ignoreSaveStatus === 'saved' ? 'Saved!' :
                              ignoreSaveStatus === 'error' ? 'Error!' : 'Save Patterns'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
