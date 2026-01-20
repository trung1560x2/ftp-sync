import React, { useState, useEffect } from 'react';
import { Rocket, RotateCcw, Clock, AlertTriangle, CheckCircle, Loader, RefreshCw, X } from 'lucide-react';

interface Props {
    connectionId: number;
    onClose: () => void;
}

interface Backup {
    name: string;
    timestamp: number;
    path: string;
}

interface DeploymentStatus {
    status: 'idle' | 'deploying' | 'rolling_back';
    step: string;
    progress: number;
    error?: string;
}

const DeploymentManager: React.FC<Props> = ({ connectionId, onClose }) => {
    const [status, setStatus] = useState<DeploymentStatus>({ status: 'idle', step: '', progress: 0 });
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [activeTab, setActiveTab] = useState<'deploy' | 'rollback'>('deploy');

    const fetchStatus = async () => {
        try {
            const res = await fetch(`/api/deployment/${connectionId}/status`);
            const data = await res.json();
            setStatus(data);
        } catch (err) { console.error(err); }
    };

    const fetchBackups = async () => {
        setLoadingBackups(true);
        try {
            const res = await fetch(`/api/deployment/${connectionId}/backups`);
            const data = await res.json();
            setBackups(data.backups || []);
        } catch (err) { console.error(err); }
        finally { setLoadingBackups(false); }
    };

    useEffect(() => {
        // Poll status if active
        fetchStatus();
        const interval = setInterval(() => {
            if (status.status !== 'idle') {
                fetchStatus();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [connectionId, status.status]);

    useEffect(() => {
        if (activeTab === 'rollback') {
            fetchBackups();
        }
    }, [activeTab]);

    const handleDeploy = async () => {
        if (!confirm('This will re-upload ALL files to a new folder and swap it. It is safer but slower. Continue?')) return;
        try {
            await fetch(`/api/deployment/${connectionId}/deploy`, { method: 'POST' });
            setStatus({ ...status, status: 'deploying', step: 'Starting...' });

            // Start polling immediately
            const poll = setInterval(async () => {
                const res = await fetch(`/api/deployment/${connectionId}/status`);
                const data = await res.json();
                setStatus(data);
                if (data.status === 'idle') clearInterval(poll);
            }, 1000);
        } catch (err) {
            alert('Failed to start deployment');
        }
    };

    const handleRollback = async (backupName: string) => {
        if (!confirm(`Are you sure you want to rollback to ${backupName}?`)) return;
        try {
            await fetch(`/api/deployment/${connectionId}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backupName })
            });
            setStatus({ ...status, status: 'rolling_back', step: 'Starting rollback...' });
        } catch (err) {
            alert('Failed to start rollback');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="flex bg-gray-50 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('deploy')}
                        className={`flex-1 py-4 text-sm font-medium flex items-center justify-center ${activeTab === 'deploy' ? 'bg-white border-t-2 border-t-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Rocket size={18} className="mr-2" /> Zero-Downtime Deploy
                    </button>
                    <button
                        onClick={() => setActiveTab('rollback')}
                        className={`flex-1 py-4 text-sm font-medium flex items-center justify-center ${activeTab === 'rollback' ? 'bg-white border-t-2 border-t-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <RotateCcw size={18} className="mr-2" /> Rollback / History
                    </button>
                    <button onClick={onClose} className="px-4 text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 min-h-[400px]">
                    {/* STATUS OVERLAY */}
                    {status.status !== 'idle' && (
                        <div className="absolute inset-0 bg-white bg-opacity-90 z-10 flex flex-col items-center justify-center">
                            <RefreshCw size={48} className="animate-spin text-blue-500 mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                {status.status === 'deploying' ? 'Deploying...' : 'Rolling Back...'}
                            </h3>
                            <p className="text-gray-600 mb-4">{status.step}</p>
                            <div className="w-64 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                            </div>
                        </div>
                    )}

                    {status.error && (
                        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
                            <AlertTriangle size={20} className="mr-3" />
                            <div>
                                <p className="font-bold">Error</p>
                                <p className="text-sm">{status.error}</p>
                            </div>
                            <button onClick={() => setStatus({ ...status, error: undefined })} className="ml-auto text-red-500 hover:text-red-700">Dismiss</button>
                        </div>
                    )}

                    {activeTab === 'deploy' && (
                        <div className="text-center py-8">
                            <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Rocket size={40} className="text-blue-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Zero-Downtime Deployment</h2>
                            <p className="text-gray-600 max-w-md mx-auto mb-8">
                                This will create a fresh release folder, upload all files, and instantly swap it with the live site.
                                <br /><span className="text-xs text-gray-500 mt-2 block">(Safe, atomic, but slower than sync)</span>
                            </p>
                            <button
                                onClick={handleDeploy}
                                disabled={status.status !== 'idle'}
                                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transition-transform active:scale-95 disabled:opacity-50"
                            >
                                START DEPLOYMENT
                            </button>
                        </div>
                    )}

                    {activeTab === 'rollback' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700">Previous Releases</h3>
                                <button onClick={fetchBackups} className="text-blue-600 hover:text-blue-800 text-sm flex items-center">
                                    <RefreshCw size={14} className={`mr-1 ${loadingBackups ? 'animate-spin' : ''}`} /> Refresh
                                </button>
                            </div>

                            {loadingBackups ? (
                                <div className="text-center py-12 text-gray-400">Loading history...</div>
                            ) : backups.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">No backups found.</div>
                            ) : (
                                <div className="space-y-3 max-h-[350px] overflow-y-auto">
                                    {backups.map((backup) => (
                                        <div key={backup.name} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center">
                                                <div className="bg-green-100 p-2 rounded-full mr-3">
                                                    <CheckCircle size={20} className="text-green-600" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-800">{new Date(backup.timestamp).toLocaleString()}</p>
                                                    <p className="text-xs text-gray-500 font-mono">{backup.name}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRollback(backup.name)}
                                                className="px-4 py-2 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 text-sm font-medium flex items-center transition-colors"
                                            >
                                                <RotateCcw size={16} className="mr-2" /> Rollback to this
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeploymentManager;
