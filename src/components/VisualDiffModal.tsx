import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, ArrowLeft, Folder, File, ArrowRight, Upload, Download, AlertCircle, CheckCircle, Smartphone, Monitor, Eye, Search, Terminal, Trash2, Sparkles, Settings } from 'lucide-react';
import { FixedSizeList as List } from 'react-window';
import ContentDiffModal from './ContentDiffModal';
import { useSyncProgress } from '../hooks/useSyncProgress';

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

interface DiffItem {
    name: string;           // Remote name (canonical for Linux operations)
    localName: string | null; // Local name (for Windows file operations)
    isDirectory: boolean;
    status: 'synchronized' | 'newer_local' | 'newer_remote' | 'missing_local' | 'missing_remote' | 'different_size';
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
    const [copilotEnabled, setCopilotEnabled] = useState<boolean>(() => {
        const stored = localStorage.getItem('gemini_copilot_enabled');
        return stored !== 'false'; // default to true
    });
    const [copilotAutoAnalyze, setCopilotAutoAnalyze] = useState<boolean>(() => {
        const stored = localStorage.getItem('gemini_copilot_auto_analyze');
        return stored !== 'false'; // default to true
    });
    const [customApiKey, setCustomApiKey] = useState<string>(() => {
        return localStorage.getItem('gemini_custom_api_key') || '';
    });
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return localStorage.getItem('gemini_copilot_model') || 'gemini-1.5-flash';
    });
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
    const [contentDiffFile, setContentDiffFile] = useState<{ remotePath: string; fileName: string } | null>(null);
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
        } catch (err: any) {
            console.error('AI explanation failed', err);
            setCopilotError(err.message || 'LỖI KẾT NỐI VỚI MÁY CHỦ.');
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

    const fetchDiff = async (path?: string) => {
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
        } catch (err: any) {
            console.error('Failed to fetch diff', err);
            setFetchError(err.message || 'Unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDiff(currentPath || undefined);
    }, [connectionId, recursive, currentPath]); // Refetch when recursive toggles or path changes

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
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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
                    <div className="flex justify-between items-center p-4 border-b border-neutral-800/60 bg-[#0d0e12]/60 shrink-0">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="flex items-center">
                                <span className="p-2 bg-neutral-900 border border-neutral-800 text-orange-500 rounded-lg mr-3">
                                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold font-outfit text-white uppercase tracking-wider flex items-center gap-2">
                                        Visual Diff
                                        <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-md uppercase">{serverName}</span>
                                        {isSyncing && (
                                            <span className="text-[9px] font-mono px-2 py-0.5 bg-emerald-950/20 text-emerald-400 border border-emerald-800/40 rounded-md font-bold uppercase tracking-wider flex items-center">
                                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
                                                Sync Active
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider mt-0.5">[Compare local and remote filesystem difference]</p>
                                </div>
                            </div>
                            
                            <div className="relative w-64 flex-shrink-0">
                                <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500" />
                                <input
                                    type="text"
                                    placeholder="FILTER FILES..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-8 py-1.5 bg-[#0d0e12]/40 border border-neutral-800/80 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 rounded-lg text-xs text-neutral-200 placeholder-neutral-600 outline-none uppercase font-mono transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            {selectedItems.size > 0 && (
                                <div className="flex items-center gap-2 animate-fadeIn">
                                    <button
                                        onClick={() => handleBulkSync('upload')}
                                        className="bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider flex items-center shadow-md shadow-orange-950/20"
                                    >
                                        <Upload size={12} className="mr-1.5 stroke-[2.5]" />
                                        Upload ({selectedItems.size})
                                    </button>
                                    <button
                                        onClick={() => handleBulkSync('download')}
                                        className="bg-[#0d0e12]/60 hover:bg-[#0d0e12] border border-emerald-900/40 hover:border-emerald-800 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider flex items-center shadow-md"
                                    >
                                        <Download size={12} className="mr-1.5 stroke-[2.5]" />
                                        Download ({selectedItems.size})
                                    </button>
                                </div>
                            )}

                            {pendingCount > 0 && (
                                <button
                                    onClick={() => {
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
                                    className="bg-amber-600 hover:bg-amber-500 text-black border border-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider flex items-center animate-pulse"
                                >
                                    <Upload size={12} className="mr-1.5" />
                                    Send Queue ({pendingCount})
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                            <label className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 cursor-pointer bg-[#0d0e12]/40 px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-[#0d0e12]/80 hover:text-neutral-250 transition-all uppercase select-none">
                                <input
                                    type="checkbox"
                                    checked={recursive}
                                    onChange={(e) => setRecursive(e.target.checked)}
                                    className="rounded bg-[#0d0e12]/60 border-neutral-800 text-orange-500 focus:ring-0 cursor-pointer"
                                />
                                Deep Scan
                            </label>
                            <button
                                onClick={handleToggleCopilot}
                                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider select-none ${
                                    showCopilot 
                                        ? 'bg-emerald-500 text-black border-emerald-600 shadow-lg shadow-emerald-500/20' 
                                        : 'bg-[#0d0e12]/40 text-neutral-400 border-neutral-800 hover:bg-[#0d0e12]/80 hover:text-emerald-400'
                                }`}
                                title="AI Explains Changes"
                            >
                                <Sparkles size={13} className={copilotLoading ? 'animate-spin' : ''} />
                                AI Copilot
                            </button>
                            <button
                                onClick={handleToggleLogs}
                                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider select-none ${
                                    showLogs 
                                        ? 'bg-orange-600 text-black border-orange-700 shadow-lg shadow-orange-600/20' 
                                        : 'bg-[#0d0e12]/40 text-neutral-400 border-neutral-800 hover:bg-[#0d0e12]/80 hover:text-neutral-200'
                                }`}
                                title="Toggle Activity Log"
                            >
                                <Terminal size={13} />
                                Logs
                            </button>
                            <button
                                onClick={() => fetchDiff(currentPath)}
                                disabled={loading}
                                className="p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-250 transition-colors rounded-lg disabled:opacity-50"
                                title="Refresh"
                            >
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-red-400 transition-colors rounded-lg"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

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
                                                    <div style={style} className={`grid grid-cols-12 gap-0 hover:bg-[#161922]/50 hover:border-neutral-800/40 border-b border-neutral-800/30 transition-all duration-150 group ${item.isDirectory ? 'bg-[#161922]/10' : ''}`}>

                                                        {/* Local Side */}
                                                        <div className="col-span-4 p-3 flex items-center border-r border-neutral-800/40 overflow-hidden">
                                                            <input
                                                                type="checkbox"
                                                                className="mr-3 rounded border-neutral-800 bg-[#0d0e12]/40 text-orange-500 focus:ring-0 h-4 w-4 cursor-pointer"
                                                                checked={selectedItems.has(item.name)}
                                                                onChange={() => toggleSelection(item.name)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <div className="flex items-center min-w-0 flex-1">
                                                                {item.isDirectory ? (
                                                                    <div className="relative mr-3 flex-shrink-0">
                                                                        <Folder size={14} className="text-amber-500" />
                                                                        {item.containsChanges && (
                                                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full border border-[#161922]"></span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <File size={14} className={`mr-3 flex-shrink-0 ${!item.local ? 'text-neutral-700' : 'text-neutral-400'}`} />
                                                                )}
                                                                <div className="truncate min-w-0 flex-1">
                                                                    <div className={`truncate text-xs ${!item.local ? 'text-neutral-600 italic' : 'text-neutral-200 font-semibold group-hover:text-orange-400 transition-colors uppercase'}`}>
                                                                        {item.name}
                                                                    </div>
                                                                    {item.local && !item.isDirectory && (
                                                                        <div className="text-[9px] text-neutral-500 font-mono mt-0.5 uppercase">
                                                                            {formatSize(item.local.size)} • {new Date(item.local.modifiedAt).toLocaleDateString()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Center Status */}
                                                        <div className="col-span-4 p-2 flex flex-col justify-center items-center border-r border-neutral-800/40 bg-[#0d0e12]/10">
                                                            <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full mb-1 flex items-center ${getStatusColor(item.status)}`}>
                                                                {getStatusIcon(item)}
                                                                {item.containsChanges && <span className="ml-1 text-orange-500 font-extrabold uppercase">[Sub Modified]</span>}
                                                            </span>

                                                            {/* Action Buttons */}
                                                            <div className="flex space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-150">
                                                                {!item.isDirectory && (
                                                                    <>
                                                                        {item.remote && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
                                                                                    setContentDiffFile({ remotePath, fileName: item.name });
                                                                                }}
                                                                                disabled={!!processing}
                                                                                title="Compare Content"
                                                                                className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-orange-400 hover:bg-neutral-900 transition-colors"
                                                                            >
                                                                                <Eye size={12} />
                                                                            </button>
                                                                        )}

                                                                        {item.status !== 'synchronized' && (
                                                                            <>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleSyncItem(item, 'upload'); }}
                                                                                    disabled={!!processing || item.status === 'missing_local'}
                                                                                    title="Upload to Remote"
                                                                                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-orange-500 hover:bg-neutral-900 disabled:opacity-20 transition-colors"
                                                                                >
                                                                                    <Upload size={12} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleSyncItem(item, 'download'); }}
                                                                                    disabled={!!processing || item.status === 'missing_remote'}
                                                                                    title="Download to Local"
                                                                                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-900 disabled:opacity-20 transition-colors"
                                                                                >
                                                                                    <Download size={12} />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </>
                                                                )}

                                                                {/* Directory Actions */}
                                                                {item.isDirectory && (
                                                                    <div className="flex items-center space-x-1">
                                                                        <button
                                                                            onClick={() => fetchDiff(currentPath === '/' ? item.name : `${currentPath}/${item.name}`)}
                                                                            className="bg-[#0d0e12]/60 border border-neutral-800 px-3 py-1 rounded-lg text-[10px] font-bold text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 mr-1.5 uppercase transition-colors"
                                                                        >
                                                                            Open
                                                                        </button>

                                                                        {item.status !== 'synchronized' && (
                                                                            <>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleFolderSync(item, 'upload'); }}
                                                                                    disabled={!!processing || item.status === 'missing_local'}
                                                                                    title="Recursively Upload"
                                                                                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-orange-500 disabled:opacity-20 transition-colors"
                                                                                >
                                                                                    <Upload size={12} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleFolderSync(item, 'download'); }}
                                                                                    disabled={!!processing || item.status === 'missing_remote'}
                                                                                    title="Recursively Download"
                                                                                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-emerald-400 disabled:opacity-20 transition-colors"
                                                                                >
                                                                                    <Download size={12} />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Remote Side */}
                                                        <div className="col-span-4 p-3 flex items-center justify-end overflow-hidden">
                                                            <div className="flex items-center min-w-0 justify-end flex-1 pr-1">
                                                                <div className="truncate min-w-0 flex-1 text-right">
                                                                    <div className={`truncate text-xs ${!item.remote ? 'text-neutral-600 italic' : 'text-neutral-200 font-semibold group-hover:text-orange-400 transition-colors uppercase'}`}>
                                                                        {item.name}
                                                                    </div>
                                                                    {item.remote && !item.isDirectory && (
                                                                        <div className="text-[9px] text-neutral-500 font-mono mt-0.5 uppercase">
                                                                            {formatSize(item.remote.size)} • {new Date(item.remote.modifiedAt).toLocaleDateString()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {item.isDirectory ? (
                                                                    <Folder size={14} className="text-amber-500 ml-3 flex-shrink-0" />
                                                                ) : (
                                                                    <File size={14} className={`ml-3 flex-shrink-0 ${!item.remote ? 'text-neutral-700' : 'text-neutral-400'}`} />
                                                                )}
                                                            </div>
                                                        </div>

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

                    {/* Docked Terminal Console */}
                    {showLogs && (
                        <div className="border-t border-neutral-800/60 bg-[#0d0e12]/85 flex flex-col h-64 select-none shrink-0 animate-in slide-in-from-bottom duration-250">
                            {/* Terminal Header */}
                            <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-800/60 bg-[#0d0e12]/40">
                                <div className="flex items-center gap-2">
                                    <Terminal size={12} className="text-orange-500" />
                                    <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest font-outfit">
                                        SYSTEM ACTIVITY LOG
                                    </span>
                                    {isSyncing && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleClearLogs}
                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-900/40 bg-neutral-900/60 transition-colors uppercase tracking-wider rounded-md"
                                        title="Clear Log History"
                                    >
                                        <Trash2 size={11} />
                                        Clear
                                    </button>
                                    <button
                                        onClick={() => setShowLogs(false)}
                                        className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-250 transition-colors border border-neutral-800 rounded-md"
                                        title="Minimize Terminal"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Terminal Logs View */}
                            <div 
                                ref={consoleContainerRef}
                                className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1.5 custom-scrollbar bg-[#0d0e12]/10"
                            >
                                {logs.map((log, idx) => (
                                    <div 
                                        key={log.id || idx} 
                                        className={`flex items-start border-l-2 pl-2 py-0.5 ${
                                            log.type === 'error' ? 'text-red-400 border-red-500 bg-red-950/5' :
                                            log.type === 'success' ? 'text-emerald-400 border-emerald-500 bg-emerald-950/5' : 
                                            'text-neutral-350 border-neutral-700'
                                        }`}
                                    >
                                        <span className="text-neutral-600 mr-2 flex-shrink-0 select-none">
                                            [{new Date(log.created_at || log.timestamp).toLocaleTimeString()}]
                                        </span>
                                        <span className={`mr-2.5 font-bold flex-shrink-0 select-none text-[10px] tracking-wider ${
                                            log.type === 'error' ? 'text-red-500' :
                                            log.type === 'success' ? 'text-emerald-500' : 
                                            'text-neutral-500'
                                        }`}>
                                            [{log.type.toUpperCase()}]
                                        </span>
                                        <span className="break-all whitespace-pre-wrap uppercase">{log.message}</span>
                                    </div>
                                ))}
                                {logs.length === 0 && (
                                    <div className="text-neutral-600 text-center py-8 uppercase text-xs font-bold tracking-wider">
                                        No sync activity recorded.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AI Copilot Console */}
                    {showCopilot && (
                        <div className="border-t border-neutral-800/60 bg-[#0d0e12]/85 flex flex-col h-64 select-none shrink-0 animate-in slide-in-from-bottom duration-250">
                            {/* Terminal Header */}
                            <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-800/60 bg-[#0d0e12]/40">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={12} className="text-emerald-400 animate-pulse" />
                                    <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest font-outfit">
                                        AI COPILOT // DIFF EXPLANATION
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!showCopilotSettings && copilotEnabled && (
                                        <button
                                            onClick={generateAiExplanation}
                                            disabled={copilotLoading}
                                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-neutral-400 hover:text-emerald-400 border border-neutral-800 hover:border-emerald-900/40 bg-neutral-900/60 disabled:opacity-50 transition-colors uppercase tracking-wider rounded-md"
                                            title="Re-analyze File Diffs"
                                        >
                                            <RefreshCw size={11} className={copilotLoading ? 'animate-spin' : ''} />
                                            Re-Analyze
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowCopilotSettings(!showCopilotSettings)}
                                        className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold border rounded-md transition-colors uppercase tracking-wider ${
                                            showCopilotSettings 
                                                ? 'bg-orange-600 text-black border-orange-700' 
                                                : 'text-neutral-400 border-neutral-800 hover:text-orange-500 hover:border-orange-900/40 bg-neutral-900/60'
                                        }`}
                                        title="Copilot Settings"
                                    >
                                        <Settings size={11} className={showCopilotSettings ? 'animate-spin' : ''} />
                                        Settings
                                    </button>
                                    <button
                                        onClick={() => setShowCopilot(false)}
                                        className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-250 transition-colors border border-neutral-800 rounded-md"
                                        title="Minimize Copilot"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Terminal Content View */}
                            <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] custom-scrollbar bg-[#0d0e12]/10 text-neutral-300">
                                {showCopilotSettings ? (
                                    <div className="max-w-md mx-auto space-y-3.5 py-1 font-mono text-[11px] uppercase">
                                        <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-neutral-800/60">
                                            <span className="w-1.5 h-3 bg-orange-500 block"></span>
                                            <span className="text-[10px] font-black text-neutral-400 tracking-widest font-outfit">
                                                AI COPILOT CONFIGURATION
                                            </span>
                                        </div>
                                        
                                        {/* Toggle Enable */}
                                        <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl">
                                            <div className="space-y-0.5 pr-4">
                                                <span className="font-bold text-neutral-300 block">ENABLE AI COPILOT</span>
                                                <span className="text-[9px] text-neutral-500 font-normal block leading-normal">
                                                    Enable or disable Gemini diff explanations
                                                </span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={copilotEnabled}
                                                    onChange={(e) => {
                                                        const val = e.target.checked;
                                                        setCopilotEnabled(val);
                                                        localStorage.setItem('gemini_copilot_enabled', String(val));
                                                    }}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-black"></div>
                                            </label>
                                        </div>

                                        {/* API Key Input */}
                                        <div className="bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl space-y-1.5">
                                            <div className="space-y-0.5">
                                                <span className="font-bold text-neutral-300 block">CUSTOM GEMINI API KEY</span>
                                                <span className="text-[9px] text-neutral-505 font-normal block leading-normal">
                                                    Stored locally in your browser. Defaults to server key if empty.
                                                </span>
                                            </div>
                                            <input
                                                type="password"
                                                value={customApiKey}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setCustomApiKey(val);
                                                    localStorage.setItem('gemini_custom_api_key', val);
                                                }}
                                                placeholder="AIzaSy..."
                                                className="w-full bg-[#0d0e12]/60 border border-neutral-800 text-xs px-2.5 py-1.5 text-neutral-200 outline-none focus:border-orange-500 rounded-lg transition-colors"
                                            />
                                        </div>

                                        {/* Model Selection */}
                                        <div className="bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl space-y-1.5">
                                            <div className="space-y-0.5">
                                                <span className="font-bold text-neutral-300 block">AI GEMINI MODEL</span>
                                                <span className="text-[9px] text-neutral-500 font-normal block leading-normal">
                                                    Select AI model to perform the analysis
                                                </span>
                                            </div>
                                            <input
                                                type="text"
                                                list="gemini-models"
                                                value={selectedModel}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSelectedModel(val);
                                                    localStorage.setItem('gemini_copilot_model', val);
                                                }}
                                                placeholder="gemini-1.5-flash"
                                                className="w-full bg-[#0d0e12]/60 border border-neutral-800 text-xs px-2.5 py-1.5 text-neutral-200 outline-none focus:border-orange-500 rounded-lg transition-colors"
                                            />
                                            <datalist id="gemini-models">
                                                <option value="gemini-2.5-flash">GEMINI 2.5 FLASH (RECOMMENDED)</option>
                                                <option value="gemini-2.5-pro">GEMINI 2.5 PRO</option>
                                                <option value="gemini-2.0-flash">GEMINI 2.0 FLASH</option>
                                                <option value="gemini-2.0-flash-thinking-exp">GEMINI 2.0 FLASH THINKING</option>
                                                <option value="gemini-1.5-flash">GEMINI 1.5 FLASH</option>
                                                <option value="gemini-1.5-pro">GEMINI 1.5 PRO</option>
                                                <option value="gemini-1.5-flash-8b">GEMINI 1.5 FLASH 8B</option>
                                            </datalist>
                                        </div>

                                        {/* Auto Analyze Trigger */}
                                        <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/60 p-2.5 rounded-xl">
                                            <div className="space-y-0.5 pr-4">
                                                <span className="font-bold text-neutral-300 block">AUTO RUN ON OPEN</span>
                                                <span className="text-[9px] text-neutral-500 font-normal block leading-normal">
                                                    Automatically trigger analysis when copilot is opened
                                                </span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={copilotAutoAnalyze}
                                                    onChange={(e) => {
                                                        const val = e.target.checked;
                                                        setCopilotAutoAnalyze(val);
                                                        localStorage.setItem('gemini_copilot_auto_analyze', String(val));
                                                    }}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-black"></div>
                                            </label>
                                        </div>

                                        <button
                                            onClick={() => setShowCopilotSettings(false)}
                                            className="w-full py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:text-white text-neutral-400 font-bold transition-colors rounded-lg text-center"
                                        >
                                            SAVE & BACK
                                        </button>
                                    </div>
                                ) : !copilotEnabled ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-3.5 text-center px-6">
                                        <AlertCircle size={20} className="text-neutral-500 animate-pulse" />
                                        <div className="space-y-1">
                                            <span className="text-neutral-400 font-bold uppercase text-[11px] block">AI COPILOT IS CURRENTLY DISABLED</span>
                                            <span className="text-neutral-500 text-[10px] uppercase block leading-relaxed max-w-sm mx-auto">
                                                Enable it below or configure custom model settings
                                            </span>
                                        </div>
                                        <div className="flex gap-3 justify-center">
                                            <button
                                                onClick={() => {
                                                    setCopilotEnabled(true);
                                                    localStorage.setItem('gemini_copilot_enabled', 'true');
                                                    setTimeout(() => {
                                                        generateAiExplanation();
                                                    }, 50);
                                                }}
                                                className="px-4 py-1.5 bg-emerald-950/25 text-emerald-450 border border-emerald-900/40 hover:bg-emerald-900 hover:text-black font-bold text-xs transition-colors rounded-lg uppercase tracking-wider"
                                            >
                                                ENABLE COPILOT
                                            </button>
                                            <button
                                                onClick={() => setShowCopilotSettings(true)}
                                                className="px-4 py-1.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 hover:text-white text-neutral-400 font-bold text-xs transition-colors rounded-lg uppercase tracking-wider"
                                            >
                                                OPEN CONFIG
                                            </button>
                                        </div>
                                    </div>
                                ) : copilotLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-2 uppercase text-neutral-500 font-bold tracking-wider">
                                        <div className="flex space-x-1.5 mb-1.5">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                        </div>
                                        <span>CONNECTING TO GEMINI API SERVICE...</span>
                                        <span className="text-[9px] text-neutral-500 font-normal">ANALYZING CHANGED FILES STRUCTURE</span>
                                    </div>
                                ) : copilotError ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-3.5 text-center px-6">
                                        <AlertCircle size={20} className="text-red-500 animate-pulse" />
                                        <div className="space-y-1">
                                            <span className="text-red-400 font-bold uppercase text-[11px] block">ANALYSIS FAILURE</span>
                                            <span className="text-neutral-500 text-[10px] uppercase block leading-relaxed">{copilotError}</span>
                                        </div>
                                        {copilotError.includes('GEMINI_API_KEY_MISSING') && (
                                            <div className="text-[9px] bg-red-950/20 text-red-400 border border-red-900/30 p-2.5 select-all max-w-md mx-auto rounded-lg">
                                                Configure custom API key in settings or set server env:
                                                <br />
                                                GEMINI_API_KEY=AIzaSy...
                                            </div>
                                        )}
                                        <div className="flex gap-3 justify-center">
                                            <button
                                                onClick={generateAiExplanation}
                                                className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 border border-neutral-800 text-xs font-bold uppercase tracking-wider transition-colors rounded-lg"
                                            >
                                                RETRY ANALYSIS
                                            </button>
                                            <button
                                                onClick={() => setShowCopilotSettings(true)}
                                                className="px-4 py-1.5 bg-emerald-950/20 text-emerald-400 border border-emerald-900/40 hover:bg-emerald-900 hover:text-black font-bold text-xs transition-colors rounded-lg uppercase tracking-wider"
                                            >
                                                CONFIGURE API KEY
                                            </button>
                                        </div>
                                    </div>
                                ) : copilotExplanation ? (
                                    <div className="whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px] text-emerald-400/90 max-w-4xl mx-auto uppercase">
                                        {copilotExplanation}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full space-y-3 text-center">
                                        <Sparkles size={16} className="text-neutral-500 animate-pulse" />
                                        <span className="text-neutral-500 uppercase text-[11px] font-bold tracking-wider">Click start to analyze filesystem difference</span>
                                        <button
                                            onClick={generateAiExplanation}
                                            className="px-4 py-1.5 bg-emerald-950/20 text-emerald-400 border border-emerald-900/40 hover:bg-emerald-900 hover:text-black font-bold text-xs transition-colors rounded-lg uppercase tracking-wider"
                                        >
                                            Start AI Analysis
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
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
                    onClose={() => setContentDiffFile(null)}
                    onSyncComplete={() => fetchDiff(currentPath)}
                />
            )}
        </>
    );
};

export default VisualDiffModal;
