import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ArrowLeft, ArrowRight, AlertCircle, CheckCircle, Download, Upload, Folder, Smartphone, Monitor } from 'lucide-react';
import { FixedSizeList as List } from 'react-window';
import ContentDiffModal from './ContentDiffModal';
import { useSyncProgress } from '../hooks/useSyncProgress';
import { DiffHeader } from './visual-diff/DiffHeader';
import { DiffRow } from './visual-diff/DiffRow';
import { CopilotPanel } from './visual-diff/CopilotPanel';
import { LogsPanel } from './visual-diff/LogsPanel';
import { useAiSettingsStore } from '../stores/aiSettingsStore';

interface AutoSizerProps {
    renderProp: (props: { height: number | undefined; width: number | undefined }) => React.ReactNode;
}

const AutoSizerComponent: React.FC<AutoSizerProps> = ({ renderProp }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<{ height: number | undefined; width: number | undefined }>({
        height: undefined,
        width: undefined
    });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const measure = () => setSize({ height: el.clientHeight, width: el.clientWidth });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
            {renderProp(size)}
        </div>
    );
};

interface Props {
    connectionId: number;
    serverName: string;
    onClose: () => void;
    isSyncing?: boolean;
}

export interface DiffItem {
    name: string;           // Remote name (canonical for Linux operations)
    localName: string | null; // Local name (for Windows file operations)
    isDirectory: boolean;
    status: 'synchronized' | 'newer_local' | 'newer_remote' | 'missing_local' | 'missing_remote' | 'different_size' | 'conflict';
    local: { size: number; modifiedAt: string } | null;
    remote: { size: number; modifiedAt: string } | null;
    containsChanges?: boolean; // Indicates if any sub-item has changes
}

const VisualDiffModal: React.FC<Props> = ({ connectionId, serverName, onClose, isSyncing }) => {
    const [items, setItems] = useState<DiffItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<DiffItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [showCopilot, setShowCopilot] = useState(false);
    const [showCopilotSettings, setShowCopilotSettings] = useState(false);
    const {
        enabled: copilotEnabled,
        autoAnalyze: copilotAutoAnalyze,
        apiKey: customApiKey,
        model: selectedModel
    } = useAiSettingsStore();
    const [copilotLoading, setCopilotLoading] = useState(false);
    const [copilotExplanation, setCopilotExplanation] = useState('');
    const [copilotError, setCopilotError] = useState('');
    const [logs, setLogs] = useState<{
        id: number;
        connection_id: number;
        type: 'info' | 'error' | 'success';
        message: string;
        created_at: string;
        timestamp?: string;
    }[]>([]);
    const consoleContainerRef = useRef<HTMLDivElement | null>(null);

    const [isEditingPath, setIsEditingPath] = useState(false);
    const [tempPath, setTempPath] = useState('');
    const [contentDiffFile, setContentDiffFile] = useState<{ remotePath: string; fileName: string; status?: string } | null>(null);
    const [recursive, setRecursive] = useState(false);

    // Queue for accumulating single-file clicks
    const pendingItemsRef = useRef<{ path: string; localName: string | null; direction: 'upload' | 'download'; isDirectory: boolean }[]>([]);
    const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [pendingCount, setPendingCount] = useState(0);

    const generateAiExplanation = async () => {
        setCopilotLoading(true);
        setCopilotError('');
        try {
            const res = await fetch('/api/ai/explain-diff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connectionId,
                    diffs: items,
                    customApiKey: customApiKey || undefined,
                    model: selectedModel
                })
            });
            const data = await res.json();
            if (data.success) {
                setCopilotExplanation(data.explanation);
            } else {
                setCopilotError(data.message || 'FAILED TO GENERATE EXPLANATION.');
            }
        } catch (err: unknown) {
            console.error('AI explanation failed', err);
            const error = err as Error;
            setCopilotError(error.message || 'LỖI KẾT NỐI VỚI MÁY CHỦ.');
        } finally {
            setCopilotLoading(false);
        }
    };

    const handleToggleLogs = () => {
        setShowLogs(!showLogs);
        setShowCopilot(false);
    };

    const handleToggleCopilot = () => {
        const nextShow = !showCopilot;
        setShowCopilot(nextShow);
        setShowLogs(false);
        if (nextShow) {
            setShowCopilotSettings(false);
            if (copilotEnabled && copilotAutoAnalyze && !copilotExplanation && !copilotLoading) {
                setTimeout(() => {
                    generateAiExplanation();
                }, 50);
            }
        }
    };
    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (batchTimerRef.current) {
                clearTimeout(batchTimerRef.current);
            }
        };
    }, []);

    const fetchDiff = useCallback(async (path?: string) => {
        setLoading(true);
        setFetchError(null);
        try {
            const baseUrl = `/api/files/diff/${connectionId}`;
            const params = new URLSearchParams();
            if (path) params.append('path', path);
            if (recursive) params.append('recursive', 'true');

            const url = `${baseUrl}?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Server returned status ${res.status}`);
            }
            const data = await res.json();
            if (data.diffs) {
                setItems(data.diffs);
                setCurrentPath(data.currentPath);
            } else if (data.error) {
                throw new Error(data.error);
            }
        } catch (err: unknown) {
            console.error('Failed to fetch diff', err);
            const error = err as Error;
            setFetchError(error.message || 'Unknown error occurred');
        } finally {
            setLoading(false);
        }
    }, [connectionId, recursive]);

    useEffect(() => {
        fetchDiff(currentPath || undefined);
    }, [fetchDiff, currentPath]); // Refetch when recursive toggles or path changes

    useEffect(() => {
        if (!searchQuery) {
            setFilteredItems(items);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredItems(items.filter(item =>
                item.name.toLowerCase().includes(query) ||
                (item.localName && item.localName.toLowerCase().includes(query))
            ));
        }
    }, [searchQuery, items]);

    const handleSyncItem = async (item: DiffItem, direction: 'upload' | 'download') => {
        if (item.isDirectory) return;
        
        // Add to pending queue
        pendingItemsRef.current.push({
            path: item.name,
            localName: item.localName,
            direction: direction,
            isDirectory: false
        });

        // Update pending count for UI
        setPendingCount(pendingItemsRef.current.length);

        // Clear existing timer
        if (batchTimerRef.current) {
            clearTimeout(batchTimerRef.current);
        }

        // Set processing state immediately
        if (!processing) {
            setProcessing('batch');
        }

        // Increased debounce: wait 2 seconds for more clicks, then send batch
        // This allows users to click multiple files before batch is sent
        batchTimerRef.current = setTimeout(async () => {
            const itemsToSync = [...pendingItemsRef.current];
            pendingItemsRef.current = [];
            setPendingCount(0);

            if (itemsToSync.length === 0) return;

            try {
                await fetch('/api/sync/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: connectionId,
                        items: itemsToSync,
                        basePath: currentPath
                    })
                });
                // Progress polling will handle the rest
            } catch (err) {
                console.error('Sync action failed', err);
                setProcessing(null);
            }
        }, 2000); // Increased from 300ms to 2000ms
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'synchronized': return 'text-emerald-400 bg-emerald-950/10 border border-emerald-500/20';
            case 'newer_local': return 'text-emerald-400 bg-emerald-950/10 border border-emerald-500/20';
            case 'newer_remote': return 'text-orange-400 bg-orange-950/10 border border-orange-500/20';
            case 'missing_local': return 'text-red-400 bg-red-950/10 border border-red-500/20';
            case 'missing_remote': return 'text-neutral-400 bg-neutral-900/40 border border-neutral-800';
            case 'different_size': return 'text-amber-400 bg-amber-950/10 border border-amber-500/20';
            case 'conflict': return 'text-red-400 bg-red-950/20 border border-red-500/35';
            default: return 'text-neutral-500 bg-neutral-900/40 border border-neutral-800';
        }
    };

    const getStatusIcon = (item: DiffItem) => {
        if (item.containsChanges) {
            return <AlertCircle size={11} className="text-orange-500 mr-1.5 flex-shrink-0" />;
        }
        switch (item.status) {
            case 'synchronized': return <CheckCircle size={11} className="text-emerald-500 mr-1.5 flex-shrink-0" />;
            case 'newer_local': return <div className="flex items-center text-emerald-400 text-[9px] uppercase font-bold tracking-wider">Local <ArrowRight size={10} className="mx-1" /> Remote</div>;
            case 'newer_remote': return <div className="flex items-center text-orange-400 text-[9px] uppercase font-bold tracking-wider">Local <ArrowLeft size={10} className="mx-1" /> Remote</div>;
            case 'missing_local': return <div className="flex items-center text-red-400 text-[9px] uppercase font-bold tracking-wider"><Download size={10} className="mr-1" /> Missing Local</div>;
            case 'missing_remote': return <div className="flex items-center text-neutral-400 text-[9px] uppercase font-bold tracking-wider"><Upload size={10} className="mr-1" /> Missing Remote</div>;
            case 'different_size': return <AlertCircle size={11} className="text-amber-500 mr-1.5 flex-shrink-0" />;
            case 'conflict': return <div className="flex items-center text-red-400 text-[9px] uppercase font-bold tracking-wider animate-pulse"><AlertCircle size={10} className="mr-1 text-red-500" /> Conflict</div>;
            default: return null;
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Update selection toggles to work with filteredItems if needed, but usually we select from what is visible
    // For "Select All", we should probably only select visible filtered items
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());


    const toggleSelectAll = () => {
        if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(i => i.name)));
        }
    };

    const toggleSelection = (name: string) => {
        const newSelection = new Set(selectedItems);
        if (newSelection.has(name)) {
            newSelection.delete(name);
        } else {
            newSelection.add(name);
        }
        setSelectedItems(newSelection);
    };

    // Progress State
    const [overallProgress, setOverallProgress] = useState<{
        activeUploads: {
            filename: string;
            totalBytes: number;
            bytesTransferred: number;
            percent: number;
            speedMBps: number;
            etaSeconds: number;
        }[];
        queueLength: number;
        totalFilesInBatch: number;
        completedFiles: number;
        uploadSpeedMBps?: number;
        downloadSpeedMBps?: number;
    } | null>(null);

    // Refs to persist across re-renders without triggering useEffect restarts
    const completionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isCompletingRef = useRef(false);
    const processingRef = useRef(processing);
    processingRef.current = processing;
    const currentPathRef = useRef(currentPath);
    currentPathRef.current = currentPath;

    const progressData = useSyncProgress(connectionId, !!(processing || isSyncing));

    useEffect(() => {
        if (!processing && !isSyncing) {
            setOverallProgress(null);
            return;
        }

        if (!progressData) return;

        const data = progressData;
        const hasActivity = data.activeUploads.length > 0 || data.queueLength > 0 || data.totalFilesInBatch > 0;

        if (processingRef.current === 'batch') {
            if (hasActivity) {
                setOverallProgress(data);

                const isComplete = data.activeUploads.length === 0 &&
                    data.queueLength === 0 &&
                    data.totalFilesInBatch > 0 &&
                    data.completedFiles >= data.totalFilesInBatch;

                if (!isComplete && completionTimerRef.current) {
                    clearTimeout(completionTimerRef.current);
                    completionTimerRef.current = null;
                    isCompletingRef.current = false;
                }

                if (isComplete && !isCompletingRef.current) {
                    isCompletingRef.current = true;
                    completionTimerRef.current = setTimeout(() => {
                        setOverallProgress(null);
                        setProcessing(null);
                        setTimeout(() => fetchDiff(currentPathRef.current), 100);
                        setSelectedItems(new Set());
                        completionTimerRef.current = null;
                        isCompletingRef.current = false;
                    }, 1500);
                }
            } else if (!isCompletingRef.current) {
                setOverallProgress(prev => {
                    if (!prev) {
                        return { activeUploads: [], queueLength: 0, totalFilesInBatch: 0, completedFiles: 0 };
                    }
                    if (!isCompletingRef.current) {
                        isCompletingRef.current = true;
                        completionTimerRef.current = setTimeout(() => {
                            setOverallProgress(null);
                            setProcessing(null);
                            setTimeout(() => fetchDiff(currentPathRef.current), 100);
                            setSelectedItems(new Set());
                            completionTimerRef.current = null;
                            isCompletingRef.current = false;
                        }, 500);
                    }
                    return prev;
                });
            }
        } else if (isSyncing) {
            if (data.activeUploads.length > 0 || data.queueLength > 0) {
                setOverallProgress(data);
            } else {
                setOverallProgress(null);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [progressData, processing, isSyncing]);

    // Auto-expand logs when sync is active (either local bulk processing or background sync)
    useEffect(() => {
        if (processing === 'batch' || isSyncing) {
            setShowLogs(true);
        }
    }, [processing, isSyncing]);

    // Fetch logs when showLogs is true
    useEffect(() => {
        if (!showLogs) return;

        const fetchLogs = async () => {
            try {
                const res = await fetch(`/api/reports/logs/${connectionId}?limit=500`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.logs) {
                        // logs returned are newest first, we reverse it to show oldest first (chronological order)
                        setLogs([...data.logs].reverse());
                    }
                }
            } catch (err) {
                console.error('Failed to fetch logs', err);
            }
        };

        // Fetch immediately
        fetchLogs();

        // Poll every 2000ms
        const logsTimer = setInterval(fetchLogs, 2000);

        return () => {
            clearInterval(logsTimer);
        };
    }, [connectionId, showLogs]);

    // Auto-scroll logs terminal to bottom
    useEffect(() => {
        if (consoleContainerRef.current) {
            consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
        }
    }, [logs, showLogs]);

    // Clear logs handler
    const handleClearLogs = async () => {
        try {
            const res = await fetch(`/api/reports/logs/clear/${connectionId}`, {
                method: 'POST'
            });
            if (res.ok) {
                setLogs([]);
            }
        } catch (err) {
            console.error('Failed to clear logs', err);
        }
    };


    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'info' | 'warning';
    } | null>(null);

    const handleBulkSync = async (direction: 'upload' | 'download') => {
        if (selectedItems.size === 0) return;

        // Collect all items to sync
        const bulkItems = items
            .filter(i => selectedItems.has(i.name))
            .map(i => ({
                path: i.name,         // Remote Name
                localName: i.localName, // Local Name
                direction: direction,
                isDirectory: i.isDirectory
            }));

        if (bulkItems.length === 0) return;

        setConfirmModal({
            title: `Confirm Batch ${direction === 'upload' ? 'Upload' : 'Download'}`,
            message: `Are you sure you want to ${direction} ${bulkItems.length} selected items? This will distribute the task to the server.`,
            type: 'warning',
            onConfirm: async () => {
                setConfirmModal(null);
                setProcessing('batch'); // Mark as batch processing

                try {
                    await fetch('/api/sync/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: connectionId,
                            items: bulkItems,
                            basePath: currentPath
                        })
                    });

                    // Progress polling will pick up the rest via useEffect

                } catch (err) {
                    console.error('Bulk sync init failed', err);
                    setProcessing(null);
                }
            }
        });
    };

    // Handler for single folder sync (recursive)
    const handleFolderSync = async (item: DiffItem, direction: 'upload' | 'download') => {
        setConfirmModal({
            title: `Confirm Folder ${direction === 'upload' ? 'Upload' : 'Download'}`,
            message: `Recursively ${direction} folder "${item.name}"? This involves scanning and transferring all contents.`,
            type: 'warning',
            onConfirm: async () => {
                setConfirmModal(null);
                setProcessing('batch'); // Mark as batch processing to enable progress polling

                try {
                    await fetch('/api/sync/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: connectionId,
                            items: [{
                                path: item.name,           // Remote name
                                localName: item.localName, // Local name
                                direction,
                                isDirectory: true
                            }],
                            basePath: currentPath
                        })
                    });

                    // Progress polling will pick up the rest via useEffect
                    // Don't reset processing here - let the polling logic handle completion
                } catch (err) {
                    console.error('Folder sync failed', err);
                    setProcessing(null); // Only reset on error
                }
            }
        });
    };

    return (
        <>
            <div className="fixed inset-0 bg-[#0d0e12]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                <div className="bg-[#161922]/95 backdrop-blur-md border border-neutral-800/80 w-full max-w-6xl h-[85vh] flex flex-col relative rounded-2xl text-neutral-200 font-sans shadow-2xl overflow-hidden">
                    {/* Header */}
                    <DiffHeader
                        loading={loading}
                        serverName={serverName}
                        isSyncing={!!isSyncing}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        selectedItemsSize={selectedItems.size}
                        handleBulkSync={handleBulkSync}
                        pendingCount={pendingCount}
                        handleSendQueue={() => {
                            if (batchTimerRef.current) {
                                clearTimeout(batchTimerRef.current);
                                batchTimerRef.current = null;
                            }
                            
                            const itemsToSync = [...pendingItemsRef.current];
                            pendingItemsRef.current = [];
                            setPendingCount(0);

                            if (itemsToSync.length > 0) {
                                fetch('/api/sync/bulk', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        id: connectionId,
                                        items: itemsToSync,
                                        basePath: currentPath
                                    })
                                }).catch(err => {
                                    console.error('Sync action failed', err);
                                    setProcessing(null);
                                });
                            }
                        }}
                        recursive={recursive}
                        setRecursive={setRecursive}
                        showCopilot={showCopilot}
                        handleToggleCopilot={handleToggleCopilot}
                        showLogs={showLogs}
                        handleToggleLogs={handleToggleLogs}
                        copilotLoading={copilotLoading}
                        fetchDiff={() => fetchDiff(currentPath)}
                        onClose={onClose}
                    />

                    {/* Toolbar / Breadcrumb */}
                    <div className="px-4 py-3 bg-[#0d0e12]/40 border-b border-neutral-800/60 flex items-center shadow-sm z-10 shrink-0">
                        <button
                            onClick={() => {
                                const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
                                fetchDiff(parent);
                            }}
                            disabled={currentPath === '/' || loading}
                            className="mr-3 p-1.5 hover:bg-neutral-800 rounded-lg disabled:opacity-30 border border-neutral-800 text-neutral-400 transition-colors"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <div
                            className={`flex-1 flex items-center text-xs text-neutral-450 bg-[#0d0e12]/20 hover:bg-[#0d0e12]/40 px-3 py-1.5 rounded-lg font-mono border ${isEditingPath ? 'border-orange-500' : 'border-neutral-800/60'} transition-all cursor-text mr-4 group`}
                            onClick={() => {
                                if (!isEditingPath) {
                                    setIsEditingPath(true);
                                    setTempPath(currentPath);
                                }
                            }}
                        >
                            <Folder size={12} className="mr-2 text-neutral-550 flex-shrink-0" />
                            {isEditingPath ? (
                                <input
                                    type="text"
                                    value={tempPath}
                                    onChange={(e) => setTempPath(e.target.value)}
                                    onBlur={() => {
                                        setIsEditingPath(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            fetchDiff(tempPath);
                                            setIsEditingPath(false);
                                        } else if (e.key === 'Escape') {
                                            setIsEditingPath(false);
                                        }
                                    }}
                                    className="bg-transparent border-none outline-none w-full p-0 text-xs font-mono text-neutral-200 uppercase"
                                    autoFocus
                                />
                            ) : (
                                <span className="truncate w-full">// {currentPath}</span>
                            )}
                        </div>

                        <div className="flex items-center space-x-4 text-[9px] text-neutral-550 font-bold uppercase tracking-wider select-none shrink-0">
                            <div className="flex items-center"><div className="w-2.5 h-2.5 bg-emerald-500 mr-1.5 rounded-sm"></div>Newer Local</div>
                            <div className="flex items-center"><div className="w-2.5 h-2.5 bg-red-500 mr-1.5 rounded-sm"></div>Missing Local</div>
                            <div className="flex items-center"><div className="w-2.5 h-2.5 bg-orange-500 mr-1.5 rounded-sm"></div>Newer Remote</div>
                            <div className="flex items-center"><div className="w-2.5 h-2.5 bg-neutral-600 mr-1.5 rounded-sm"></div>Missing Remote</div>
                        </div>
                    </div>

                    {/* Grid Header */}
                    <div className="grid grid-cols-12 gap-0 bg-[#0d0e12]/40 border-b border-neutral-800/60 text-[10px] font-bold text-[#f97316] uppercase tracking-widest select-none shrink-0">
                        <div className="col-span-4 p-3 border-r border-neutral-800/60 flex items-center">
                            <input
                                type="checkbox"
                                className="mr-3 rounded border-neutral-800 bg-[#0d0e12]/40 text-orange-505 focus:ring-0 h-4 w-4 cursor-pointer"
                                checked={filteredItems.length > 0 && selectedItems.size === filteredItems.length}
                                onChange={toggleSelectAll}
                            />
                            <Smartphone size={12} className="mr-2 text-neutral-450" /> Local File
                        </div>
                        <div className="col-span-4 p-3 border-r border-neutral-800/60 text-center text-neutral-450">
                            Status & Actions
                        </div>
                        <div className="col-span-4 p-3 flex items-center justify-end text-neutral-455">
                            Remote File <Monitor size={12} className="ml-2 text-neutral-450" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 bg-[#0d0e12]/10 relative min-h-0 p-4">
                        {loading ? (
                            <div className="flex flex-col justify-center items-center h-full text-neutral-500 text-xs uppercase font-bold tracking-wider">
                                <RefreshCw size={24} className="animate-spin mb-4 text-orange-500" />
                                <p>Analyzing differences...</p>
                            </div>
                        ) : fetchError ? (
                            <div className="flex flex-col justify-center items-center h-full text-xs uppercase font-bold">
                                <AlertCircle size={28} className="text-red-500 mb-4" />
                                <p className="text-red-400 mb-2">Failed to load diff</p>
                                <p className="text-neutral-500 normal-case mb-4 max-w-md text-center">{fetchError}</p>
                                <button
                                    onClick={() => fetchDiff(currentPath || undefined)}
                                    className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-850 hover:text-neutral-100 transition-colors rounded-lg"
                                >
                                    <RefreshCw size={12} className="inline mr-2" />
                                    Retry
                                </button>
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="text-center py-12 text-neutral-500 uppercase text-xs font-bold tracking-wider">
                                {searchQuery ? 'No matching items found' : 'Folder is empty'}
                            </div>
                        ) : (
                            <div className="absolute inset-4">
                                <AutoSizerComponent renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => (
                                    height !== undefined && width !== undefined ? (
                                        <List
                                            height={height}
                                            width={width}
                                            itemCount={filteredItems.length}
                                            itemSize={68}
                                            className="bg-[#161922]/20 border border-neutral-800/60 rounded-xl shadow-inner custom-scrollbar"
                                        >
                                            {({ index, style }) => {
                                                const item = filteredItems[index];
                                                return (
                                                    <div style={style}>
                                                        <DiffRow
                                                            item={item}
                                                            currentPath={currentPath}
                                                            selectedItems={selectedItems}
                                                            toggleSelection={toggleSelection}
                                                            processing={processing}
                                                            setContentDiffFile={setContentDiffFile}
                                                            handleSyncItem={handleSyncItem}
                                                            handleFolderSync={handleFolderSync}
                                                            fetchDiff={fetchDiff}
                                                            formatSize={formatSize}
                                                            getStatusColor={getStatusColor}
                                                            getStatusIcon={getStatusIcon}
                                                        />
                                                    </div>
                                                );
                                            }}
                                        </List>
                                    ) : null
                                )} />
                            </div>
                        )}
                    </div>
                    {/* Unified Non-blocking Sync Progress Widget */}
                    {overallProgress && (() => {
                        const displayCompleted = Math.min(overallProgress.completedFiles, overallProgress.totalFilesInBatch);
                        const progressPercent = overallProgress.totalFilesInBatch > 0
                            ? Math.min(100, Math.round((displayCompleted / overallProgress.totalFilesInBatch) * 100))
                            : 0;
                        
                        const isManual = processing !== null;

                        return (
                            <div className="absolute bottom-4 right-4 bg-[#161922]/95 border border-neutral-800/80 p-4 z-40 w-80 max-w-sm rounded-xl shadow-2xl text-neutral-200 font-sans backdrop-blur-md animate-fadeIn">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-800/60">
                                    <div className="flex items-center space-x-2">
                                        <span className="flex h-2 w-2 relative">
                                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isManual ? 'bg-orange-400' : 'bg-emerald-500'}`}></span>
                                            <span className={`relative inline-flex rounded-full h-2 w-2 ${isManual ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                                        </span>
                                        <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-wide">
                                            {isManual ? 'Syncing Queue...' : 'Background Sync...'}
                                        </span>
                                    </div>
                                    {overallProgress.queueLength > 0 && (
                                        <span className="text-[9px] bg-[#0d0e12]/40 px-2 py-0.5 rounded-md border border-neutral-800/60 text-neutral-400 font-mono">
                                            Q: {overallProgress.queueLength}
                                        </span>
                                    )}
                                </div>

                                {/* Overall Progress Bar */}
                                {overallProgress.totalFilesInBatch > 1 && (
                                    <div className="mb-3">
                                        <div className="flex justify-between text-[9px] text-neutral-500 mb-1 uppercase font-bold tracking-wide">
                                            <span>Batch Progress</span>
                                            <span className="text-emerald-400">{progressPercent}%</span>
                                        </div>
                                        <div className="w-full bg-[#0d0e12]/40 border border-neutral-800/60 h-1.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Scanning / Waiting Status */}
                                {overallProgress.activeUploads.length === 0 && overallProgress.totalFilesInBatch === 0 && overallProgress.queueLength === 0 && (
                                    <div className="text-[10px] text-neutral-400 py-2 animate-pulse flex items-center uppercase font-bold">
                                        <RefreshCw size={11} className="mr-2 animate-spin text-orange-500" />
                                        Scanning directory...
                                    </div>
                                )}

                                {overallProgress.activeUploads.length === 0 && overallProgress.queueLength > 0 && (
                                    <div className="text-[10px] text-neutral-400 py-2 animate-pulse uppercase font-bold text-center">
                                        WAITING FOR QUEUE ({overallProgress.queueLength} ITEMS)...
                                    </div>
                                )}

                                {/* Active Uploads List */}
                                <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                    {overallProgress.activeUploads.map((upload, idx) => (
                                        <div key={idx} className="text-xs">
                                            <div className="flex justify-between text-neutral-300 font-bold mb-1 truncate uppercase">
                                                <span className="truncate max-w-[70%] font-semibold" title={upload.filename}>{upload.filename}</span>
                                                <span className="text-orange-500 font-mono">{upload.percent}%</span>
                                            </div>
                                            <div className="w-full bg-[#0d0e12]/40 border border-neutral-800/60 h-1.5 mb-1 overflow-hidden rounded-full">
                                                <div
                                                    className="bg-orange-600 h-1.5 rounded-full transition-all duration-300"
                                                    style={{ width: `${upload.percent}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[9px] text-neutral-500 font-mono uppercase">
                                                <span>{upload.speedMBps} MB/S</span>
                                                <span>ETA: {upload.etaSeconds}S</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {overallProgress.activeUploads.length === 0 && overallProgress.queueLength === 0 && overallProgress.totalFilesInBatch > 0 && (
                                    <div className="text-center text-neutral-500 py-1.5 text-[9px] uppercase font-bold">
                                        Finalizing transfers...
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                    {showLogs && (
                        <LogsPanel
                            consoleContainerRef={consoleContainerRef}
                            logs={logs}
                            handleClearLogs={handleClearLogs}
                            setShowLogs={setShowLogs}
                        />
                    )}

                    {/* AI Copilot Console */}
                    {showCopilot && (
                        <CopilotPanel
                            showCopilotSettings={showCopilotSettings}
                            setShowCopilotSettings={setShowCopilotSettings}
                            copilotLoading={copilotLoading}
                            copilotExplanation={copilotExplanation}
                            copilotError={copilotError}
                            generateAiExplanation={generateAiExplanation}
                            setShowCopilot={setShowCopilot}
                        />
                    )}
                </div>
            </div>

            {/* Custom Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 bg-[#0d0e12]/80 backdrop-blur-sm flex items-center justify-center z-[130]">
                    <div className="bg-[#161922]/95 border border-neutral-800/80 max-w-md w-full p-6 rounded-2xl text-neutral-200 font-sans shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center mb-4 border-b border-neutral-800/60 pb-3">
                            <div className={`p-2 border mr-3 rounded-lg ${confirmModal.type === 'warning' ? 'bg-orange-950/20 text-orange-500 border-orange-900/40' : 'bg-neutral-900 border border-neutral-800 text-neutral-400'}`}>
                                <AlertCircle size={20} />
                            </div>
                            <h3 className="text-sm font-bold font-outfit uppercase tracking-wider text-white">{confirmModal.title}</h3>
                        </div>
                        <p className="text-xs text-neutral-400 mb-6 leading-relaxed uppercase">
                            {confirmModal.message}
                        </p>
                        <div className="flex justify-end gap-3 border-t border-neutral-800/60 pt-4">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="px-4 py-2 text-xs font-bold text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg hover:bg-neutral-800 hover:text-neutral-200 transition-colors uppercase tracking-wider"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModal.onConfirm}
                                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-black font-bold border border-orange-700 rounded-lg text-xs transition-colors uppercase tracking-wider"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Diff Modal */}
            {contentDiffFile && (
                <ContentDiffModal
                    connectionId={connectionId}
                    remotePath={contentDiffFile.remotePath}
                    fileName={contentDiffFile.fileName}
                    status={contentDiffFile.status}
                    onClose={() => setContentDiffFile(null)}
                    onSyncComplete={() => fetchDiff(currentPath)}
                />
            )}
        </>
    );
};

export default VisualDiffModal;
