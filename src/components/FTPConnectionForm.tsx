import React, { useState, useEffect, useRef } from 'react';
import { FTPConnection, FTPConnectionFormData } from '../types';
import { Save, X, Folder, CheckCircle, AlertCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import LocalFolderBrowser from './LocalFolderBrowser';

interface Props {
  initialData?: FTPConnection;
  onSuccess: () => void;
  onCancel: () => void;
}
interface CustomSelectProps {
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: any) => void;
  disabled?: boolean;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center px-3.5 py-2.5 bg-[#0d0e12]/60 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 font-mono transition-all outline-none text-left cursor-pointer"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown size={14} className={`text-neutral-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 bg-[#161922] border border-neutral-800/60 rounded-xl shadow-xl py-1 overflow-hidden animate-fadeIn font-mono">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2 text-xs transition-colors cursor-pointer ${
                option.value === value
                  ? 'bg-orange-600 text-white font-semibold'
                  : 'text-neutral-300 hover:bg-[#1f2431] hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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

  const handleSelectChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // Side effects
    if (name === 'protocol') {
      const newProtocol = value as 'ftp' | 'ftps' | 'sftp';
      let newPort = formData.port;

      if (newProtocol === 'sftp') {
        newPort = 22;
      } else if (newProtocol === 'ftp' || newProtocol === 'ftps') {
        if (formData.port === 22) newPort = 21;
      }
      setFormData(prev => ({ ...prev, protocol: newProtocol, port: newPort }));
      
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

      <div className="bg-[#161922]/90 backdrop-blur-md p-6 rounded-2xl border border-neutral-800/50 text-neutral-200 shadow-2xl">
        <div className="flex justify-between items-center mb-6 border-b border-neutral-800/40 pb-4 select-none">
          <h3 className="text-sm font-extrabold text-neutral-100 uppercase font-display tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-4 bg-orange-500 rounded-full block animate-signal"></span>
            {initialData ? 'Edit Connection' : 'New Connection'}
          </h3>
          <button onClick={onCancel} className="text-neutral-450 hover:text-neutral-200 transition-all p-1.5 border border-neutral-800 bg-[#0d0e12]/60 hover:bg-[#161922] rounded-lg cursor-pointer">
            <X size={14} />
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-950/10 border border-red-900/30 text-red-400 text-xs rounded-xl font-mono uppercase">
            SYSTEM_FAULT: {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Main 2-Column Scientific Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            
            {/* COLUMN 1: Server Connection Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 pb-2 border-b border-neutral-800/40">
                <span className="w-1 h-3 bg-orange-500 rounded-full block"></span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Server Connection Credentials
                </span>
              </div>

              {/* Connection Name */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                  Connection Name <span className="text-neutral-600 font-normal font-sans">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="E.G. PRODUCTION_NODE_01"
                  className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 placeholder-neutral-700 font-mono transition-all outline-none"
                />
              </div>

              {/* Protocol & Port */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Protocol
                  </label>
                  <CustomSelect
                    value={formData.protocol}
                    onChange={(val) => handleSelectChange('protocol', val)}
                    options={[
                      { value: 'ftp', label: 'FTP - FTP Protocol' },
                      { value: 'ftps', label: 'FTPS - FTP over SSL/TLS' },
                      { value: 'sftp', label: 'SFTP - SSH SFTP Protocol' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Port
                  </label>
                  <input
                    type="number"
                    name="port"
                    value={formData.port}
                    onChange={handleChange}
                    required
                    className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 font-mono outline-none"
                  />
                </div>
              </div>

              {/* Server Host */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                  Server Host
                </label>
                <input
                  type="text"
                  name="server"
                  value={formData.server}
                  onChange={handleChange}
                  required
                  placeholder={formData.protocol === 'sftp' ? 'sftp.example.com' : 'ftp.example.com'}
                  className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 placeholder-neutral-700 font-mono outline-none"
                />
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Username
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    placeholder="USERNAME"
                    className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Password {initialData && <span className="text-neutral-600 font-normal font-sans">(Keep current if blank)</span>}
                    {!initialData && !formData.privateKey && <span className="text-red-500 ml-1 font-sans">*</span>}
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required={!initialData && !formData.privateKey}
                    className={`w-full px-3.5 py-2 bg-[#0d0e12]/40 border focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 font-mono outline-none ${
                      !initialData && !formData.privateKey && !formData.password && error ? 'border-red-900' : 'border-neutral-800/50'
                    }`}
                    placeholder={formData.protocol === 'sftp' && formData.privateKey ? 'PASSPHRASE (OPTIONAL)' : 'PASSWORD'}
                  />
                </div>
              </div>

              {/* FTPS SSL Option */}
              {formData.protocol !== 'sftp' && (
                <div className="flex items-center pl-1 pt-1">
                  <input
                    id="secure"
                    name="secure"
                    type="checkbox"
                    checked={formData.secure}
                    onChange={handleChange}
                    className="h-4 w-4 bg-[#0d0e12] border-neutral-800 text-orange-600 focus:ring-0 focus:ring-offset-0 rounded cursor-pointer"
                  />
                  <label htmlFor="secure" className="ml-2.5 block text-xs text-neutral-400 select-none uppercase tracking-wide cursor-pointer font-bold font-mono">
                    Use SSL/TLS (FTPS Encryption)
                  </label>
                </div>
              )}

              {/* SFTP Private Key (Conditional) */}
              {formData.protocol === 'sftp' ? (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
                      Private Key <span className="text-neutral-600 font-normal font-sans">(Optional if password is set)</span>
                    </label>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-orange-500 hover:text-orange-400 cursor-pointer transition-colors bg-[#0d0e12]/60 border border-neutral-800/60 hover:border-neutral-700/60 rounded px-2.5 py-1 select-none">
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
                    className="w-full px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg h-28 font-mono text-xs text-neutral-300 outline-none resize-none"
                  />
                  <p className="text-[9px] text-neutral-500 mt-1 uppercase font-mono">Paste OpenSSH private key format here.</p>
                </div>
              ) : (
                <div className="h-28 border border-dashed border-neutral-800/40 p-4 flex flex-col justify-center items-center text-center select-none rounded-xl">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mb-1">
                    Key Auth Offline
                  </span>
                  <span className="text-[8px] font-mono text-neutral-700 uppercase">
                    Only active for SFTP protocol
                  </span>
                </div>
              )}
            </div>

            {/* COLUMN 2: Sync Engine Configuration */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 pb-2 border-b border-neutral-800/40">
                <span className="w-1 h-3 bg-emerald-500 rounded-full block"></span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Sync Engine & Targets
                </span>
              </div>

              {/* Local Folder Path */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                  Local Folder Path
                </label>
                <div className="flex">
                  <input
                    type="text"
                    name="localPath"
                    value={formData.localPath}
                    onChange={handleChange}
                    placeholder="E.G. E:\PROJECTS\MYSITE"
                    className={`flex-1 px-3.5 py-2 bg-[#0d0e12]/40 border focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-l-lg text-xs text-neutral-200 font-mono outline-none ${
                      pathStatus === 'invalid' ? 'border-red-900 bg-red-955/10' :
                      pathStatus === 'valid' ? 'border-emerald-900 bg-emerald-955/10' : 'border-neutral-800/50'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setBrowserTarget('local')}
                    className="px-3.5 py-2 bg-[#0d0e12]/80 border-t border-b border-r border-neutral-800/60 hover:bg-[#161922] hover:text-neutral-100 text-neutral-450 text-xs transition-colors cursor-pointer"
                    title="Browse Folder"
                  >
                    <Folder size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => checkPath(formData.localPath)}
                    className="px-4 py-2 bg-[#0d0e12]/80 border-t border-b border-r border-neutral-800/60 hover:bg-[#161922] hover:text-neutral-100 text-neutral-400 rounded-r-lg text-xs font-bold uppercase transition-colors cursor-pointer"
                    title="Verify Folder Path"
                  >
                    {pathStatus === 'checking' ? '...' : 'Verify'}
                  </button>
                </div>
                {pathStatus === 'invalid' && (
                  <p className="text-[10px] text-red-400 mt-1.5 flex items-center uppercase font-bold tracking-wide font-mono">
                    <AlertCircle size={12} className="mr-1 stroke-[2.5]" /> {pathMessage || 'Path does not exist'}
                  </p>
                )}
                {pathStatus === 'valid' && (
                  <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center uppercase font-bold tracking-wide font-mono">
                    <CheckCircle size={12} className="mr-1 stroke-[2.5]" /> Valid directory path
                  </p>
                )}
              </div>

              {/* Remote Target Path */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                  Remote Target Path
                </label>
                <input
                  type="text"
                  name="targetDirectory"
                  value={formData.targetDirectory}
                  onChange={handleChange}
                  placeholder="/public_html"
                  className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 font-mono outline-none"
                />
              </div>

              {/* Backup Path */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                  Backup Directory Path <span className="text-neutral-600 font-normal font-sans">(Optional)</span>
                </label>
                <div className="flex">
                  <input
                    type="text"
                    name="backupPath"
                    value={formData.backupPath}
                    onChange={handleChange}
                    placeholder="E.G. D:\FTP_Backup (Defaults to sync_data/history)"
                    className="flex-1 px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-l-lg text-xs text-neutral-200 font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setBrowserTarget('backup')}
                    className="px-3.5 py-2 bg-[#0d0e12]/80 border-t border-b border-r border-neutral-800/60 hover:bg-[#161922] hover:text-neutral-100 text-neutral-450 rounded-r-lg text-xs transition-colors cursor-pointer"
                    title="Browse Backup Folder"
                  >
                    <Folder size={14} />
                  </button>
                </div>
                <p className="text-[9px] text-neutral-500 mt-1.5 uppercase font-mono tracking-wide">
                  Stores historical file backups outside of C drive.
                </p>
              </div>

              {/* Sync Mode & Conflict Resolution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Sync Direction Mode
                  </label>
                  <CustomSelect
                    value={formData.syncMode}
                    onChange={(val) => handleSelectChange('syncMode', val)}
                    options={[
                      { value: 'bi_directional', label: 'Bi-Directional (2-Way)' },
                      { value: 'upload_only', label: 'Upload Only (Local -> Remote)' },
                      { value: 'download_only', label: 'Download Only (Remote -> Local)' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Conflict Resolution
                  </label>
                  <CustomSelect
                    value={formData.conflictResolution}
                    onChange={(val) => handleSelectChange('conflictResolution', val)}
                    options={[
                      { value: 'overwrite', label: 'Overwrite (Always Replace)' },
                      { value: 'newer', label: 'Overwrite If Newer' },
                      { value: 'different_size', label: 'Overwrite If Different Size' }
                    ]}
                  />
                </div>
              </div>

              {/* Parallel Connections & Buffer Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Parallel Connections
                  </label>
                  <input
                    type="number"
                    name="parallelConnections"
                    value={formData.parallelConnections}
                    onChange={handleChange}
                    min={1}
                    max={10}
                    className="w-full px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                    Buffer Size
                  </label>
                  <CustomSelect
                    value={formData.bufferSize}
                    onChange={(val) => handleSelectChange('bufferSize', val)}
                    options={[
                      { value: 4, label: '4 MB (Minimal)' },
                      { value: 8, label: '8 MB (Standard)' },
                      { value: 16, label: '16 MB (Balanced)' },
                      { value: 32, label: '32 MB (Performance)' },
                      { value: 64, label: '64 MB (High Load)' },
                      { value: 128, label: '128 MB (Extreme)' }
                    ]}
                  />
                </div>
              </div>

              {/* Sync Deletions Warnings */}
              {(formData.syncMode === 'bi_directional' || formData.syncMode === 'upload_only') ? (
                <div className="flex items-start p-3 bg-red-955/10 border border-red-900/30 rounded-xl select-none">
                  <div className="flex items-center h-5">
                    <input
                      id="syncDeletions"
                      name="syncDeletions"
                      type="checkbox"
                      checked={formData.syncDeletions}
                      onChange={handleChange}
                      className="h-4 w-4 bg-[#0d0e12] border-neutral-800 text-red-500 focus:ring-0 rounded cursor-pointer"
                    />
                  </div>
                  <div className="ml-3 text-xs">
                    <label htmlFor="syncDeletions" className="font-bold text-red-400 uppercase tracking-wider select-none cursor-pointer font-mono">
                      Sync Deletions (Warning)
                    </label>
                    <p className="text-red-500/70 text-[9px] mt-1 uppercase font-semibold font-mono">
                      Warning: Deleting files locally will permanently delete them from remote.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-3 px-4 border border-dashed border-neutral-800/40 flex flex-col justify-center items-center text-center select-none rounded-xl">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mb-0.5">
                    Deletions Inactive
                  </span>
                  <span className="text-[8px] font-mono text-neutral-700 uppercase">
                    Not active in download mode
                  </span>
                </div>
              )}

              {/* Exclude Paths (Ignore patterns) */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 font-mono">
                  Exclude Paths (Ignore Patterns)
                </label>
                <textarea
                  name="excludePaths"
                  value={formData.excludePaths}
                  onChange={(e) => setFormData(prev => ({ ...prev, excludePaths: e.target.value }))}
                  placeholder={`vendor\nnode_modules\nstorage\nbuild`}
                  className="w-full h-20 px-3.5 py-2 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg font-mono text-xs text-neutral-350 outline-none resize-none"
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
                      className="px-2 py-0.5 text-[9px] bg-neutral-900/40 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 rounded border border-neutral-800/65 transition-colors uppercase font-mono cursor-pointer"
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
            <div className="border border-neutral-850 rounded-xl overflow-hidden mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowIgnoreSection(!showIgnoreSection);
                  if (!showIgnoreSection && !ignorePatterns) {
                    loadIgnorePatterns();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0d0e12]/60 hover:bg-[#161922] transition-colors border-b border-neutral-800/40 select-none cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <FileText size={14} className="text-neutral-500 animate-signal" />
                  <span className="font-bold text-neutral-400 text-xs uppercase tracking-wider font-mono">Ignore Patterns (.ftpignore file)</span>
                </div>
                {showIgnoreSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showIgnoreSection && (
                <div className="p-4 bg-[#0d0e12]/20">
                  {ignoreLoading ? (
                    <div className="text-center py-4 text-neutral-600 text-xs animate-pulse font-bold uppercase font-mono">LOADING_RULES...</div>
                  ) : (
                    <>
                      <p className="text-[9px] text-neutral-500 mb-2 uppercase font-mono">
                        Uses gitignore syntax guidelines. One pattern per line.
                      </p>
                      <textarea
                        value={ignorePatterns}
                        onChange={(e) => {
                          setIgnorePatterns(e.target.value);
                          setIgnoreSaveStatus('idle');
                        }}
                        placeholder={`# Example patterns:\n*.log\nnode_modules/\n*.tmp\n.git/`}
                        className="w-full h-32 px-3.5 py-2.5 bg-[#0d0e12]/40 border border-neutral-800/50 hover:border-neutral-700/60 focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/20 rounded-lg font-mono text-xs text-neutral-300 outline-none resize-none"
                      />
                      <div className="flex items-center justify-between mt-2.5 font-mono">
                        <div className="text-[9px] text-neutral-600 uppercase font-bold">
                          Supported matches: *.log, node_modules/, *.tmp
                        </div>
                        <button
                          type="button"
                          onClick={saveIgnorePatterns}
                          disabled={ignoreSaveStatus === 'saving'}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all uppercase tracking-wider cursor-pointer ${
                            ignoreSaveStatus === 'saved'
                              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40'
                              : ignoreSaveStatus === 'error'
                                ? 'bg-red-955/20 text-red-400 border-red-900/40'
                                : 'bg-[#0d0e12]/60 text-neutral-300 border-neutral-800/60 hover:bg-[#161922]'
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
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center pt-4 border-t border-neutral-800/40 gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'testing' || !formData.server}
                className={`px-4 py-2.5 text-xs font-bold rounded-lg border transition-all uppercase tracking-wider text-center cursor-pointer ${
                  testStatus === 'testing' ? 'bg-[#0d0e12]/30 text-neutral-500 border-neutral-800/40 cursor-not-allowed' :
                  testStatus === 'success' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40 hover:bg-emerald-900/40' :
                  testStatus === 'error' ? 'bg-red-955/20 text-red-400 border-red-900/40 hover:bg-red-900/40' :
                  'bg-[#0d0e12]/60 text-neutral-300 border-neutral-800/65 hover:bg-[#161922]'
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
                className="px-4 py-2.5 text-xs font-bold text-neutral-450 bg-[#0d0e12]/60 border border-neutral-800/60 rounded-lg hover:bg-neutral-800 hover:text-neutral-250 transition-all uppercase tracking-wider cursor-pointer"
              >
                Abort Changes
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-lg transition-all active:scale-[0.98] uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-orange-600/10 cursor-pointer border-0"
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
