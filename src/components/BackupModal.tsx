import React, { useState, useRef } from 'react';
import { X, Download, Upload, Shield, AlertCircle, CheckCircle, FileJson } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const BackupModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 4) {
      setError('Backup password must be at least 4 characters long');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await fetch('/api/ftp-connections/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to export connections');
      }

      // Trigger download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ftp_sync_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setSuccessMsg('Connections exported successfully!');
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setError('');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setError('Please select a backup file to import');
      return;
    }
    if (!password) {
      setError('Please enter the backup password used during export');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result as string;
        const backupData = JSON.parse(fileContent);

        const response = await fetch('/api/ftp-connections/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connections: backupData.connections,
            verification: backupData.verification,
            password
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to import connections');
        }

        if (data.warnings && data.warnings.length > 0) {
          setSuccessMsg(`Successfully imported ${data.count} connection(s). Warning: The following connections are missing passwords/keys and must be updated manually: ${data.warnings.join(', ')}`);
        } else {
          setSuccessMsg(`Successfully imported ${data.count} connection(s)!`);
        }
        setImportFile(null);
        setPassword('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Refresh connection list after 1.5s
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } catch (err: any) {
        setError(err.message || 'Invalid backup file structure');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read the backup file');
      setLoading(false);
    };

    reader.readAsText(importFile);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden max-w-md w-full font-mono text-neutral-200 rounded-none">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 bg-neutral-950 border-b border-neutral-805">
        <div className="flex items-center space-x-2.5">
          <Shield className="text-orange-500" size={16} />
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-100">Backup Manager</h3>
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-red-500 transition-colors p-1 border border-transparent hover:border-neutral-800 bg-transparent hover:bg-neutral-900 rounded-none">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-805 bg-neutral-950/40">
        <button
          onClick={() => {
            setActiveTab('export');
            setError('');
            setSuccessMsg('');
          }}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center space-x-2 border-b-2 rounded-none ${
            activeTab === 'export'
              ? 'border-orange-500 text-orange-500 bg-neutral-900/30'
              : 'border-transparent text-neutral-550 hover:text-neutral-350 hover:bg-neutral-900/10'
          }`}
        >
          <Download size={12} />
          <span>Export Backup</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('import');
            setError('');
            setSuccessMsg('');
          }}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center space-x-2 border-b-2 rounded-none ${
            activeTab === 'import'
              ? 'border-orange-500 text-orange-500 bg-neutral-900/30'
              : 'border-transparent text-neutral-550 hover:text-neutral-350 hover:bg-neutral-900/10'
          }`}
        >
          <Upload size={12} />
          <span>Import Backup</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-6 bg-neutral-900/60">
        {error && (
          <div className="mb-4 p-3 bg-red-950/20 border border-red-900/40 text-red-400 rounded-none text-xs flex items-start space-x-2 uppercase font-bold">
            <AlertCircle className="flex-shrink-0 mt-0.5 text-red-500" size={14} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 rounded-none text-xs flex items-start space-x-2 uppercase font-bold">
            <CheckCircle className="flex-shrink-0 mt-0.5 text-emerald-500" size={14} />
            <span>{successMsg}</span>
          </div>
        )}

        {activeTab === 'export' ? (
          <form onSubmit={handleExport} className="space-y-4">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wide leading-relaxed">
              This will export all your connection details into a JSON backup file. All sensitive fields (Passwords, Private Keys) will be encrypted using the password below.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 mb-1.5 uppercase tracking-wide">
                Set Backup Password (min 4 chars)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to protect your backup"
                required
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-none focus:outline-none focus:border-orange-500 text-xs text-neutral-200 placeholder-neutral-700 uppercase font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded-none text-xs font-bold transition-colors disabled:opacity-50 uppercase tracking-wider"
            >
              {loading ? 'Exporting...' : 'Export Configurations'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleImport} className="space-y-4">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wide leading-relaxed">
              Select an exported backup JSON file and enter the password used to encrypt it. Duplicated connection names will append a suffix `(Imported)`.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 mb-1.5 uppercase tracking-wide">
                Select Backup File (.json)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  id="backup-file-input"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2 px-3 py-2 border border-neutral-800 rounded-none bg-neutral-950 hover:bg-neutral-900 text-xs text-neutral-300 font-bold transition-colors uppercase"
                >
                  <FileJson size={14} className="text-neutral-500" />
                  <span>{importFile ? importFile.name : 'Choose file...'}</span>
                </button>
                {importFile && (
                  <span className="text-[10px] text-neutral-500 font-mono">
                    ({(importFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 mb-1.5 uppercase tracking-wide">
                Enter Backup Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to decrypt configurations"
                required
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-none focus:outline-none focus:border-orange-500 text-xs text-neutral-200 placeholder-neutral-700 uppercase font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !importFile}
              className="w-full flex items-center justify-center py-2 px-4 bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded-none text-xs font-bold transition-colors disabled:opacity-50 uppercase tracking-wider"
            >
              {loading ? 'Importing...' : 'Import Configurations'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default BackupModal;
