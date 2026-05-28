import React, { useState, useEffect } from 'react';
import { Rocket, RotateCcw, Clock, AlertTriangle, CheckCircle, Loader, RefreshCw, X } from 'lucide-react';
import { useConfirmModal } from './ConfirmModal';

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
    const { showConfirm, showAlert, ConfirmModalComponent } = useConfirmModal();
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
        const confirmed = await showConfirm({
            title: 'Zero-Downtime Deployment',
            message: 'This will re-upload ALL files to a new folder and swap it. It is safer but slower. Continue?',
            type: 'confirm',
            confirmText: 'Start Deploy',
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

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
            showAlert({
                title: 'Error',
                message: 'Failed to start deployment',
                type: 'error'
            });
        }
    };

    const handleRollback = async (backupName: string) => {
        const confirmed = await showConfirm({
            title: 'Rollback Release',
            message: `Are you sure you want to rollback to ${backupName}?`,
            type: 'warning',
            confirmText: 'Rollback',
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

        try {
            await fetch(`/api/deployment/${connectionId}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backupName })
            });
            setStatus({ ...status, status: 'rolling_back', step: 'Starting rollback...' });
        } catch (err) {
            showAlert({
                title: 'Error',
                message: 'Failed to start rollback',
                type: 'error'
            });
        }
    };

    return (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 border border-neutral-800 shadow-2xl w-full max-w-2xl overflow-hidden font-mono text-neutral-200 rounded-none">
                <div className="flex bg-neutral-950 border-b border-neutral-805">
                    <button
                        onClick={() => setActiveTab('deploy')}
                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center rounded-none border-t-2 ${activeTab === 'deploy' ? 'bg-neutral-900 border-t-orange-500 text-orange-500' : 'border-t-transparent text-neutral-550 hover:text-neutral-350 hover:bg-neutral-900/10'}`}
                    >
                        <Rocket size={14} className="mr-2" /> Zero-Downtime Deploy
                    </button>
                    <button
                        onClick={() => setActiveTab('rollback')}
                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center rounded-none border-t-2 ${activeTab === 'rollback' ? 'bg-neutral-900 border-t-orange-500 text-orange-500' : 'border-t-transparent text-neutral-550 hover:text-neutral-350 hover:bg-neutral-900/10'}`}
                    >
                        <RotateCcw size={14} className="mr-2" /> Rollback / History
                    </button>
                    <button onClick={onClose} className="px-4 text-neutral-500 hover:text-red-500 transition-colors border-l border-neutral-850">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 min-h-[400px] relative bg-neutral-900/60">
                    {/* STATUS OVERLAY */}
                    {status.status !== 'idle' && (
                        <div className="absolute inset-0 bg-neutral-950/95 z-10 flex flex-col items-center justify-center font-mono">
                            <RefreshCw size={36} className="animate-spin text-orange-500 mb-4" />
                            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-100 mb-2">
                                {status.status === 'deploying' ? 'Deploying_System...' : 'Rolling_Back_System...'}
                            </h3>
                            <p className="text-[10px] text-neutral-450 uppercase mb-4 tracking-wider">{status.step}</p>
                            <div className="w-64 bg-neutral-900 border border-neutral-850 h-3 rounded-none overflow-hidden">
                                <div className="bg-orange-600 h-3 rounded-none transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                            </div>
                        </div>
                    )}

                    {status.error && (
                        <div className="mb-4 p-4 bg-red-950/20 border border-red-900/40 text-red-400 rounded-none flex items-center font-mono uppercase text-xs font-bold">
                            <AlertTriangle size={16} className="mr-3 text-red-500" />
                            <div>
                                <p className="font-bold">Error Detected</p>
                                <p className="text-[10px] text-neutral-450 mt-1 font-normal normal-case">{status.error}</p>
                            </div>
                            <button onClick={() => setStatus({ ...status, error: undefined })} className="ml-auto text-red-400 hover:text-red-300 font-bold tracking-wider uppercase text-[10px] border border-red-900/45 px-2 py-0.5 bg-neutral-950">Dismiss</button>
                        </div>
                    )}

                    {activeTab === 'deploy' && (
                        <div className="text-center py-8">
                            <div className="bg-neutral-950 border border-neutral-850 w-16 h-16 rounded-none flex items-center justify-center mx-auto mb-6">
                                <Rocket size={28} className="text-orange-500" />
                            </div>
                            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-100 mb-2">Zero-Downtime Deployment</h2>
                            <p className="text-[10px] text-neutral-450 uppercase tracking-wide leading-relaxed max-w-md mx-auto mb-8">
                                This will create a fresh release folder, upload all files, and instantly swap it with the live site.
                                <br /><span className="text-[9px] text-neutral-550 mt-2 block">(Safe, atomic, but slower than sync)</span>
                            </p>
                            <button
                                onClick={handleDeploy}
                                disabled={status.status !== 'idle'}
                                className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded-none text-xs font-bold transition-transform active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                            >
                                START DEPLOYMENT
                            </button>
                        </div>
                    )}

                    {activeTab === 'rollback' && (
                        <div>
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-850">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">Previous Releases</h3>
                                <button onClick={fetchBackups} className="text-orange-500 hover:text-orange-450 text-[10px] font-bold flex items-center uppercase">
                                    <RefreshCw size={10} className={`mr-1 ${loadingBackups ? 'animate-spin' : ''}`} /> Refresh
                                </button>
                            </div>

                            {loadingBackups ? (
                                <div className="text-center py-12 text-neutral-500 text-xs uppercase font-bold">Loading release history...</div>
                            ) : backups.length === 0 ? (
                                <div className="text-center py-12 text-neutral-600 text-xs uppercase font-bold">No backups found.</div>
                            ) : (
                                <div className="space-y-3 max-h-[310px] overflow-y-auto pr-1 custom-scrollbar">
                                    {backups.map((backup) => (
                                        <div key={backup.name} className="border border-neutral-850 bg-neutral-950 rounded-none p-4 flex items-center justify-between hover:bg-neutral-900/50 transition-colors">
                                            <div className="flex items-center">
                                                <div className="bg-neutral-900 border border-neutral-800 p-2 rounded-none mr-3">
                                                    <CheckCircle size={16} className="text-emerald-500" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-neutral-200">{new Date(backup.timestamp).toLocaleString()}</p>
                                                    <p className="text-[9px] text-neutral-500 font-mono mt-0.5 uppercase tracking-wide">// {backup.name}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRollback(backup.name)}
                                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded-none text-[10px] font-bold flex items-center transition-colors uppercase tracking-wider"
                                            >
                                                <RotateCcw size={12} className="mr-1.5" /> Rollback to this
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <ConfirmModalComponent />
        </div>
    );
};

export default DeploymentManager;
