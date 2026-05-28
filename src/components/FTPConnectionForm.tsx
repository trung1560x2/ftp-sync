import React, { useState, useEffect } from 'react';
import { FTPConnection, FTPConnectionFormData } from '../types';
import { Save, X, Folder, CheckCircle, AlertCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
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
    backupPath: '',
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
  const [browserTarget, setBrowserTarget] = useState<'local' | 'backup' | null>(null);

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
        backupPath: initialData.backup_path || '',
        syncMode: initialData.sync_mode || 'bi_directional',
        secure: !!initialData.secure,
        syncDeletions: (initialData.sync_deletions as unknown) === true || (initialData.sync_deletions as unknown) === 1 || String(initialData.sync_deletions) === '1' || String(initialData.sync_deletions) === 'true',
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
    } catch {
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
    } catch {
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
    } catch {
      setTestStatus('error');
      setTestMessage('Network error');
    }
  };

  const handleMainKeyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFormData(prev => ({ ...prev, privateKey: content }));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let validationStatus: 'verified' | 'failed' | 'unverified' = 'unverified';
    let validationMessage = '';

    try {
      // 1. Check local path validity
      if (formData.localPath) {
        const pathRes = await fetch('/api/ftp-connections/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: formData.localPath })
        });
        const pathData = await pathRes.json();
        if (!pathData.valid) {
          validationStatus = 'failed';
          validationMessage = `Invalid local path: ${pathData.message}`;
        }
      }

      // 2. If path is valid so far, check host connection
      if (validationStatus !== 'failed') {
        const testRes = await fetch('/api/ftp-connections/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server: formData.server,
            port: formData.port,
            username: formData.username,
            password: formData.password,
            protocol: formData.protocol,
            privateKey: formData.privateKey,
            id: initialData?.id
          })
        });
        const testData = await testRes.json();
        if (testData.success) {
          validationStatus = 'verified';
          validationMessage = 'Credentials and paths verified successfully';
        } else {
          validationStatus = 'failed';
          validationMessage = `Connection check failed: ${testData.message}`;
        }
      }

      // 3. Submit connection with validation results
      const url = initialData
        ? `/api/ftp-connections/${initialData.id}`
        : '/api/ftp-connections';

      const method = initialData ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          validationStatus,
          validationMessage
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save connection');
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <React.Fragment>
      {browserTarget !== null && (
        <LocalFolderBrowser
          onSelect={(path) => {
            if (browserTarget === 'local') {
              setFormData(prev => ({ ...prev, localPath: path }));
              checkPath(path);
            } else if (browserTarget === 'backup') {
              setFormData(prev => ({ ...prev, backupPath: path }));
            }
            setBrowserTarget(null);
          }}
          onClose={() => setBrowserTarget(null)}
        />
      )}

      <div className="bg-neutral-900 p-6 rounded-none border border-neutral-800 text-neutral-200 font-mono shadow-2xl">
        <div className="flex justify-between items-center mb-6 border-b border-neutral-800 pb-4 select-none">
          <h3 className="text-xs font-black text-neutral-100 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-orange-500 block animate-signal"></span>
            {initialData ? 'EDIT_CONNECTION' : 'NEW_CONNECTION'}
          </h3>
          <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-300 transition-colors p-1 border border-neutral-850 bg-neutral-950 hover:bg-neutral-850">
            <X size={14} />
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-950/20 border border-red-900/50 text-red-400 text-xs font-mono uppercase">
            ERROR // SYSTEM_FAULT: {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-5">
            
            {/* Section Headers Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 pb-2 border-b border-neutral-850">
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-3 bg-orange-500 block"></span>
                <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">
                  Server Credentials
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-4 lg:mt-0">
                <span className="w-1 h-3 bg-emerald-500 block"></span>
                <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">
                  Sync Engine Config
                </span>
              </div>
            </div>

            {/* Row 1: Connection Name vs Remote Target Path */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div className="flex flex-col justify-end">
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Connection Name <span className="text-neutral-600 font-normal font-sans">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="E.G. PRODUCTION_NODE_01"
                  className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 placeholder-neutral-750 font-mono transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Remote Target Path
                </label>
                <input
                  type="text"
                  name="targetDirectory"
                  value={formData.targetDirectory}
                  onChange={handleChange}
                  placeholder="/public_html"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none"
                />
              </div>
            </div>

            {/* Row 2: Protocol & Server Host vs Local Folder Path */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Protocol
                  </label>
                  <select
                    name="protocol"
                    value={formData.protocol}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-250 font-mono outline-none cursor-pointer"
                  >
                    <option value="ftp">FTP - FILE TRANSFER PROTOCOL</option>
                    <option value="ftps">FTPS - FTP OVER SSL/TLS</option>
                    <option value="sftp">SFTP - SSH FILE TRANSFER PROTOCOL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Server Host
                  </label>
                  <input
                    type="text"
                    name="server"
                    value={formData.server}
                    onChange={handleChange}
                    required
                    placeholder={formData.protocol === 'sftp' ? 'sftp.example.com' : 'ftp.example.com'}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 placeholder-neutral-750 font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Local Folder Path
                </label>
                <div className="flex">
                  <input
                    type="text"
                    name="localPath"
                    value={formData.localPath}
                    onChange={handleChange}
                    placeholder="E.G. E:\PROJECTS\MYSITE"
                    className={`flex-1 px-3 py-2 bg-neutral-950 border focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none ${
                      pathStatus === 'invalid' ? 'border-red-900 bg-red-955/15' :
                      pathStatus === 'valid' ? 'border-emerald-900 bg-emerald-955/15' : 'border-neutral-850'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setBrowserTarget('local')}
                    className="px-3 py-2 bg-neutral-955 border-t border-b border-r border-neutral-850 hover:bg-neutral-850 text-neutral-400 rounded-none text-xs transition-colors"
                    title="Browse Folder"
                  >
                    <Folder size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => checkPath(formData.localPath)}
                    className="px-3.5 py-2 bg-neutral-955 border-t border-b border-r border-neutral-850 hover:bg-neutral-850 text-neutral-400 hover:text-neutral-250 rounded-none text-xs font-bold uppercase transition-colors"
                    title="Verify Folder Path"
                  >
                    {pathStatus === 'checking' ? '...' : 'Verify'}
                  </button>
                </div>
                {pathStatus === 'invalid' && (
                  <p className="text-[10px] text-red-400 mt-1.5 flex items-center uppercase font-bold tracking-wide">
                    <AlertCircle size={12} className="mr-1 stroke-[2.5]" /> {pathMessage || 'Path does not exist'}
                  </p>
                )}
                {pathStatus === 'valid' && (
                  <p className="text-[10px] text-emerald-450 mt-1.5 flex items-center uppercase font-bold tracking-wide">
                    <CheckCircle size={12} className="mr-1 stroke-[2.5]" /> Valid directory path
                  </p>
                )}

                {/* Backup Directory Path Input */}
                <div className="mt-4 border-t border-neutral-850 pt-4">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Backup Directory Path <span className="text-neutral-600 font-normal font-sans">(Optional)</span>
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      name="backupPath"
                      value={formData.backupPath}
                      onChange={handleChange}
                      placeholder="E.G. D:\FTP_Backup (Defaults to local sync_data/history)"
                      className="flex-1 px-3 py-2 bg-neutral-955 border border-neutral-850 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setBrowserTarget('backup')}
                      className="px-3 py-2 bg-neutral-955 border-t border-b border-r border-neutral-850 hover:bg-neutral-850 text-neutral-400 rounded-none text-xs transition-colors"
                      title="Browse Backup Folder"
                    >
                      <Folder size={14} />
                    </button>
                  </div>
                  <p className="text-[9px] text-neutral-500 mt-1.5 uppercase font-mono tracking-wide leading-relaxed">
                    Stores historical versions outside of system C drive to prevent disk space exhaustion.
                  </p>
                </div>
              </div>
            </div>

            {/* Row 3: Port & SSL vs Sync Mode & Conflict Resolution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Port
                  </label>
                  <input
                    type="number"
                    name="port"
                    value={formData.port}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none"
                  />
                  {formData.protocol !== 'sftp' && (
                    <div className="mt-3 flex items-center">
                       <input
                        id="secure"
                        name="secure"
                        type="checkbox"
                        checked={formData.secure}
                        onChange={handleChange}
                        className="h-4 w-4 bg-neutral-950 border-neutral-800 text-orange-600 focus:ring-0 focus:ring-offset-0 rounded-none cursor-pointer"
                      />
                      <label htmlFor="secure" className="ml-2 block text-xs text-neutral-400 select-none uppercase tracking-wide cursor-pointer font-bold">
                        Use SSL/TLS (FTPS)
                      </label>
                    </div>
                  )}
                </div>
                <div></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Sync Direction Mode
                  </label>
                  <select
                    name="syncMode"
                    value={formData.syncMode}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-250 font-mono outline-none cursor-pointer"
                  >
                    <option value="bi_directional">BI-DIRECTIONAL (2-WAY)</option>
                    <option value="upload_only">UPLOAD ONLY (LOCAL -&gt; FTP)</option>
                    <option value="download_only">DOWNLOAD ONLY (FTP -&gt; LOCAL)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Conflict Resolution
                  </label>
                  <select
                    name="conflictResolution"
                    value={formData.conflictResolution}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-250 font-mono outline-none cursor-pointer"
                  >
                    <option value="overwrite">OVERWRITE (ALWAYS REPLACE)</option>
                    <option value="newer">OVERWRITE IF NEWER (SOURCE IS NEWER)</option>
                    <option value="different_size">OVERWRITE IF DIFFERENT SIZE</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row 4: Username & Password vs Sync Deletions Warning */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    placeholder="USERNAME"
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Password {initialData && <span className="text-neutral-600 font-normal font-sans">(Keep current if blank)</span>}
                    {!initialData && !formData.privateKey && <span className="text-red-500 ml-1 font-sans">*</span>}
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required={!initialData && !formData.privateKey}
                    className={`w-full px-3 py-2 bg-neutral-950 border focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none ${
                      !initialData && !formData.privateKey && !formData.password && error ? 'border-red-955 bg-red-955' : 'border-neutral-850'
                    }`}
                    placeholder={formData.protocol === 'sftp' && formData.privateKey ? 'PASSPHRASE (OPTIONAL)' : 'PASSWORD'}
                  />
                </div>
              </div>

              <div>
                {(formData.syncMode === 'bi_directional' || formData.syncMode === 'upload_only') ? (
                  <div className="flex items-start p-3 bg-red-955/10 border border-red-900/35 rounded-none select-none h-full min-h-[72px]">
                    <div className="flex items-center h-5">
                      <input
                        id="syncDeletions"
                        name="syncDeletions"
                        type="checkbox"
                        checked={formData.syncDeletions}
                        onChange={handleChange}
                        className="h-4 w-4 bg-neutral-950 border-neutral-800 text-red-500 focus:ring-0 rounded-none cursor-pointer"
                      />
                    </div>
                    <div className="ml-3 text-xs">
                      <label htmlFor="syncDeletions" className="font-bold text-red-400 uppercase tracking-wider select-none cursor-pointer">
                        Sync Deletions (Warning)
                      </label>
                      <p className="text-red-500/70 text-[9px] mt-1.5 uppercase leading-relaxed font-bold font-mono">
                        Warning: Deleting files locally will permanently delete them from the FTP remote node.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-[72px] border border-dashed border-neutral-800/40 p-3 flex flex-col justify-center items-center text-center select-none">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mb-0.5">
                      Deletions Inactive
                    </span>
                    <span className="text-[8px] font-mono text-neutral-700 uppercase">
                      Not active in download mode
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 5: Private Key vs Parallel Connections & Buffer Size */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                {formData.protocol === 'sftp' ? (
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500">
                        Private Key <span className="text-neutral-600 font-normal font-sans">(Optional if password is set)</span>
                      </label>
                      <label className="text-[9px] font-bold uppercase tracking-wider text-orange-500 hover:text-orange-400 cursor-pointer transition-colors bg-neutral-900 border border-neutral-850 px-2 py-0.5 select-none">
                        Upload Key File
                        <input
                          type="file"
                          onChange={handleMainKeyUpload}
                          className="hidden"
                          accept=".pem,.key,id_rsa,*"
                        />
                      </label>
                    </div>
                    <textarea
                      name="privateKey"
                      value={formData.privateKey || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, privateKey: e.target.value }))}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none h-24 font-mono text-xs text-neutral-300 outline-none resize-none"
                    />
                    <p className="text-[10px] text-neutral-500 mt-1 uppercase">Paste OpenSSH private key format here.</p>
                  </div>
                ) : (
                  <div className="h-full min-h-[110px] border border-dashed border-neutral-800/40 p-4 flex flex-col justify-center items-center text-center select-none">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mb-1">
                      Key Auth Offline
                    </span>
                    <span className="text-[8px] font-mono text-neutral-700 uppercase">
                      Only active for SFTP connections
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Parallel Connections
                  </label>
                  <input
                    type="number"
                    name="parallelConnections"
                    value={formData.parallelConnections}
                    onChange={handleChange}
                    min={1}
                    max={10}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-200 font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                    Buffer Size
                  </label>
                  <select
                    name="bufferSize"
                    value={formData.bufferSize}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none text-xs text-neutral-250 font-mono outline-none cursor-pointer"
                  >
                    <option value={4}>4 MB (MINIMAL)</option>
                    <option value={8}>8 MB (STANDARD)</option>
                    <option value={16}>16 MB (BALANCED)</option>
                    <option value={32}>32 MB (PERFORMANCE)</option>
                    <option value={64}>64 MB (HIGH LOAD)</option>
                    <option value={128}>128 MB (EXTREME)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row 6: Info placeholder vs Exclude Paths */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              <div className="h-full min-h-[140px] border border-dashed border-neutral-800/40 p-4 flex flex-col justify-center items-center text-center select-none">
                <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mb-1">
                  System Information
                </span>
                <span className="text-[8px] font-mono text-neutral-700 uppercase">
                  All credentials secure and encrypted locally
                </span>
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
                  Exclude Paths (Ignore Patterns)
                </label>
                <textarea
                  name="excludePaths"
                  value={formData.excludePaths}
                  onChange={(e) => setFormData(prev => ({ ...prev, excludePaths: e.target.value }))}
                  placeholder={`vendor\nnode_modules\nstorage\nbuild`}
                  className="w-full h-20 px-3 py-2 bg-neutral-955 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none font-mono text-xs text-neutral-350 outline-none resize-none"
                />
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
                      className="px-2 py-0.5 text-[9px] bg-neutral-955 hover:bg-neutral-850 text-neutral-500 hover:text-neutral-300 rounded-none border border-neutral-850 transition-colors uppercase font-mono font-bold"
                    >
                      + {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>



          {/* Ignore Patterns Section - Only show when editing */}
          {initialData && (
            <div className="border border-neutral-850 rounded-none overflow-hidden mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowIgnoreSection(!showIgnoreSection);
                  if (!showIgnoreSection && !ignorePatterns) {
                    loadIgnorePatterns();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-neutral-955 hover:bg-neutral-900 transition-colors border-b border-neutral-850 select-none"
              >
                <div className="flex items-center space-x-2">
                  <FileText size={14} className="text-neutral-500 animate-signal" />
                  <span className="font-bold text-neutral-400 text-xs uppercase tracking-wider">[MODULE_RULES] // Ignore Patterns (.ftpignore)</span>
                </div>
                {showIgnoreSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showIgnoreSection && (
                <div className="p-4 bg-neutral-950/40">
                  {ignoreLoading ? (
                    <div className="text-center py-4 text-neutral-600 text-xs animate-pulse font-bold uppercase">LOADING_RULES...</div>
                  ) : (
                    <>
                      <p className="text-[9px] text-neutral-500 mb-2 uppercase">
                        Uses gitignore syntax guidelines. One pattern per line.
                      </p>
                      <textarea
                        value={ignorePatterns}
                        onChange={(e) => {
                          setIgnorePatterns(e.target.value);
                          setIgnoreSaveStatus('idle');
                        }}
                        placeholder={`# Example patterns:\n*.log\nnode_modules/\n*.tmp\n.git/`}
                        className="w-full h-32 px-3 py-2 bg-neutral-950 border border-neutral-850 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-none font-mono text-xs text-neutral-300 outline-none resize-none"
                      />
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="text-[9px] text-neutral-600 uppercase font-bold">
                          Supported matches: *.log, node_modules/, *.tmp
                        </div>
                        <button
                          type="button"
                          onClick={saveIgnorePatterns}
                          disabled={ignoreSaveStatus === 'saving'}
                          className={`px-3 py-1.5 text-xs font-bold rounded-none border transition-colors uppercase tracking-wider ${
                            ignoreSaveStatus === 'saved'
                              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800'
                              : ignoreSaveStatus === 'error'
                                ? 'bg-red-950/30 text-red-400 border-red-800'
                                : 'bg-neutral-950 text-neutral-300 border-neutral-850 hover:bg-neutral-900'
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

          {/* Form Actions Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center pt-4 border-t border-neutral-850 gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'testing' || !formData.server}
                className={`px-4 py-2.5 text-xs font-bold rounded-none border transition-colors uppercase tracking-wider text-center ${
                  testStatus === 'testing' ? 'bg-neutral-950 text-neutral-500 border-neutral-850 cursor-not-allowed' :
                  testStatus === 'success' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800 hover:bg-emerald-900/30' :
                  testStatus === 'error' ? 'bg-red-950/30 text-red-400 border-red-800 hover:bg-red-900/30' :
                  'bg-neutral-950 text-neutral-300 border-neutral-850 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testMessage && (
                <span className={`text-[10px] font-bold uppercase font-mono ${
                  testStatus === 'success' ? 'text-emerald-400' : testStatus === 'error' ? 'text-red-400' : 'text-neutral-500'
                }`}>
                  // {testMessage}
                </span>
              )}
            </div>
            <div className="flex space-x-2.5 self-stretch sm:self-auto justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 text-xs font-bold text-neutral-450 bg-neutral-900 border border-neutral-850 rounded-none hover:bg-neutral-800 hover:text-neutral-200 transition-colors uppercase tracking-wider"
              >
                [ABORT_CHANGES]
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center px-4 py-2.5 text-xs font-bold text-black bg-orange-600 border border-orange-700 hover:bg-orange-500 rounded-none transition-colors uppercase tracking-wider disabled:opacity-40"
              >
                <Save size={14} className="mr-2" />
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
