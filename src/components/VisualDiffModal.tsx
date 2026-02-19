import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, ArrowLeft, Folder, File, ArrowRight, Upload, Download, AlertCircle, CheckCircle, Smartphone, Monitor, Eye, Search } from 'lucide-react';
import ContentDiffModal from './ContentDiffModal';

interface Props {
    connectionId: number;
    serverName: string;
    onClose: () => void;
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

const VisualDiffModal: React.FC<Props> = ({ connectionId, serverName, onClose }) => {
    const [items, setItems] = useState<DiffItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<DiffItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState<string | null>(null);

    const [isEditingPath, setIsEditingPath] = useState(false);
    const [tempPath, setTempPath] = useState('');
    const [contentDiffFile, setContentDiffFile] = useState<{ remotePath: string; fileName: string } | null>(null);
    const [recursive, setRecursive] = useState(false);

    // Queue for accumulating single-file clicks
    const pendingItemsRef = useRef<{ path: string; localName: string | null; direction: 'upload' | 'download'; isDirectory: boolean }[]>([]);
    const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [pendingCount, setPendingCount] = useState(0);


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
        try {
            const baseUrl = `/api/files/diff/${connectionId}`;
            const params = new URLSearchParams();
            if (path) params.append('path', path);
            if (recursive) params.append('recursive', 'true');

            const url = `${baseUrl}?${params.toString()}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.diffs) {
                setItems(data.diffs);
                setCurrentPath(data.currentPath);
            }
        } catch (err) {
            console.error('Failed to fetch diff', err);
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
            case 'synchronized': return 'text-gray-400';
            case 'newer_local': return 'text-green-600 bg-green-50';
            case 'newer_remote': return 'text-blue-600 bg-blue-50';
            case 'missing_local': return 'text-red-500 bg-red-50';
            case 'missing_remote': return 'text-purple-500 bg-purple-50';
            case 'different_size': return 'text-orange-500 bg-orange-50';
            default: return 'text-gray-500';
        }
    };

    const getStatusIcon = (item: DiffItem) => {
        if (item.containsChanges) {
            return <AlertCircle size={16} className="text-orange-500" />;
        }
        switch (item.status) {
            case 'synchronized': return <CheckCircle size={16} className="text-green-500" />;
            case 'newer_local': return <div className="flex items-center text-green-600">Local <ArrowRight size={14} className="mx-1" /> Remote</div>;
            case 'newer_remote': return <div className="flex items-center text-blue-600">Local <ArrowLeft size={14} className="mx-1" /> Remote</div>;
            case 'missing_local': return <div className="flex items-center text-red-500"><Download size={14} className="mr-1" /> Missing Local</div>;
            case 'missing_remote': return <div className="flex items-center text-purple-500"><Upload size={14} className="mr-1" /> Missing Remote</div>;
            case 'different_size': return <AlertCircle size={16} className="text-orange-500" />;
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
    } | null>(null);

    // Refs to persist across re-renders without triggering useEffect restarts
    const completionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isCompletingRef = useRef(false);
    const processingRef = useRef(processing);
    processingRef.current = processing;
    const currentPathRef = useRef(currentPath);
    currentPathRef.current = currentPath;

    // Polling for progress - only depends on processing state (NOT overallProgress)
    // This prevents the infinite loop: fetchDiff → loading=true → useEffect restart → poll again
    useEffect(() => {
        if (!processing) return;

        const pollTimer = setInterval(async () => {
            try {
                const res = await fetch(`/api/sync/progress/${connectionId}`);
                const data = await res.json();

                // Show modal immediately when batch starts
                if (processingRef.current === 'batch') {
                    const hasActivity = data.activeUploads.length > 0 || data.queueLength > 0 || data.totalFilesInBatch > 0;

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
                                // fetchDiff after a small extra delay so processing=null clears first
                                setTimeout(() => fetchDiff(currentPathRef.current), 100);
                                setSelectedItems(new Set());
                                completionTimerRef.current = null;
                                isCompletingRef.current = false;
                            }, 1500);
                        }
                    } else if (!isCompletingRef.current) {
                        // No activity - either not started yet (show scanning) or done (counters reset)
                        setOverallProgress(prev => {
                            if (!prev) {
                                // Not started yet - show scanning state
                                return { activeUploads: [], queueLength: 0, totalFilesInBatch: 0, completedFiles: 0 };
                            }
                            // Had progress before, now empty = server reset counters = done
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
                            return prev; // Keep showing last progress while timer runs
                        });
                    }
                }
            } catch (e) {
                console.error('Poll failed', e);
            }
        }, 200);

        return () => {
            clearInterval(pollTimer);
        };
    }, [connectionId, processing]);


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
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col">
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                        <div className="flex items-center gap-4 flex-1">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center whitespace-nowrap">
                                Visual Diff <span className="ml-3 text-sm font-normal px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{serverName}</span>
                            </h2>
                            <div className="relative flex-1 max-w-sm">
                                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search files..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-1.5 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 rounded-lg text-sm transition-colors outline-none"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {selectedItems.size > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <button
                                        onClick={() => handleBulkSync('upload')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm flex items-center"
                                    >
                                        <Upload size={14} className="mr-1.5" />
                                        Upload ({selectedItems.size})
                                    </button>
                                    <button
                                        onClick={() => handleBulkSync('download')}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm flex items-center"
                                    >
                                        <Download size={14} className="mr-1.5" />
                                        Download ({selectedItems.size})
                                    </button>
                                </div>
                            )}

                            {pendingCount > 0 && (
                                <button
                                    onClick={() => {
                                        // Force send batch immediately
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
                                    className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm flex items-center animate-pulse"
                                >
                                    <Upload size={14} className="mr-1.5" />
                                    Send Queue ({pendingCount})
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors shadow-sm">
                                <input
                                    type="checkbox"
                                    checked={recursive}
                                    onChange={(e) => setRecursive(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Deep Scan
                            </label>
                            <button
                                onClick={() => fetchDiff(currentPath)}
                                disabled={loading}
                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 text-gray-500"
                                title="Refresh"
                            >
                                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500 hover:text-red-500"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Toolbar / Breadcrumb */}
                    <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center shadow-sm z-10">
                        <button
                            onClick={() => {
                                const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
                                fetchDiff(parent);
                            }}
                            disabled={currentPath === '/' || loading}
                            className="mr-3 p-1.5 hover:bg-gray-100 rounded-full disabled:opacity-30 border border-gray-200"
                        >
                            <ArrowLeft size={16} className="text-gray-700" />
                        </button>
                        <div
                            className={`flex-1 flex items-center text-sm text-gray-700 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-md font-mono border ${isEditingPath ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300 shadow-sm'} transition-all cursor-text mr-4 group`}
                            onClick={() => {
                                if (!isEditingPath) {
                                    setIsEditingPath(true);
                                    setTempPath(currentPath);
                                }
                            }}
                        >
                            <Folder size={14} className="mr-2 text-gray-500 flex-shrink-0" />
                            {isEditingPath ? (
                                <input
                                    type="text"
                                    value={tempPath}
                                    onChange={(e) => setTempPath(e.target.value)}
                                    onBlur={() => {
                                        setIsEditingPath(false);
                                        // Optional: Commit on blur? Usually better to just cancel or have user press Enter to be explicit.
                                        // Let's cancel on blur to be safe, or just stay in edit mode?
                                        // Standard UX is commit or revert. Let's revert if no change, or maybe just close.
                                        // Actually, if they click away, they probably didn't mean to navigate.
                                        if (tempPath !== currentPath) {
                                            // Maybe ask? No, just reset.
                                            // But for copy-paste workflows, sometimes you click out.
                                            // Let's just reset for now.
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            fetchDiff(tempPath);
                                            setIsEditingPath(false);
                                        } else if (e.key === 'Escape') {
                                            setIsEditingPath(false);
                                        }
                                    }}
                                    className="bg-transparent border-none outline-none w-full p-0 text-sm font-mono text-gray-800"
                                    autoFocus
                                />
                            ) : (
                                <span className="truncate w-full">{currentPath}</span>
                            )}
                        </div>



                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <div className="flex items-center"><div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>Newer Local</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>Missing Local</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>Newer Remote</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-purple-500 rounded-full mr-1"></div>Missing Remote</div>
                        </div>
                    </div>

                    {/* Grid Header */}
                    <div className="grid grid-cols-12 gap-0 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <div className="col-span-4 p-3 border-r border-gray-200 flex items-center">
                            <input
                                type="checkbox"
                                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                checked={filteredItems.length > 0 && selectedItems.size === filteredItems.length}
                                onChange={toggleSelectAll}
                            />
                            <Smartphone size={14} className="mr-2" /> Local File
                        </div>
                        <div className="col-span-4 p-3 border-r border-gray-200 text-center">
                            Status & Action
                        </div>
                        <div className="col-span-4 p-3 flex items-center justify-end">
                            Remote File <Monitor size={14} className="ml-2" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto bg-gray-50">
                        {loading ? (
                            <div className="flex flex-col justify-center items-center h-full text-gray-400">
                                <RefreshCw size={40} className="animate-spin mb-4 text-blue-300" />
                                <p>Processing...</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200 bg-white shadow-sm mx-4 my-4 rounded-lg border border-gray-200">
                                {filteredItems.map((item, i) => (
                                    <div key={i} className={`grid grid-cols-12 gap-0 hover:bg-gray-50 transition-colors group ${item.isDirectory ? 'bg-gray-50' : ''}`}>

                                        {/* Local Side */}
                                        <div className="col-span-4 p-3 flex items-center border-r border-gray-100 overflow-hidden">
                                            <input
                                                type="checkbox"
                                                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                                checked={selectedItems.has(item.name)}
                                                onChange={() => toggleSelection(item.name)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <div className="flex items-center min-w-0 flex-1">
                                                {item.isDirectory ? (
                                                    <div className="relative mr-3 flex-shrink-0">
                                                        <Folder size={18} className="text-yellow-500" />
                                                        {item.containsChanges && (
                                                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-white"></span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <File size={18} className={`mr-3 flex-shrink-0 ${!item.local ? 'text-gray-200' : 'text-gray-400'}`} />
                                                )}
                                                <div className={`truncate text-sm ${!item.local ? 'text-gray-300 italic' : 'text-gray-700 font-medium'}`}>
                                                    {item.name}
                                                </div>
                                            </div>
                                            {item.local && !item.isDirectory && (
                                                <div className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                                                    {formatSize(item.local.size)}
                                                    <br />
                                                    <span className="text-[10px]">{new Date(item.local.modifiedAt).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Center Status */}
                                        <div className="col-span-4 p-2 flex flex-col justify-center items-center border-r border-gray-100 bg-gray-50/30">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full mb-1 flex items-center ${getStatusColor(item.status)}`}>
                                                {getStatusIcon(item)}
                                                {item.containsChanges && <span className="ml-1 text-[10px] text-orange-600 font-extrabold">(Changed)</span>}
                                            </span>

                                            {/* Action Buttons */}
                                            <div className="flex space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                {/* File Actions */}
                                                {!item.isDirectory && (
                                                    <>
                                                        {/* Compare Button - always visible for files that exist on remote */}
                                                        {item.remote && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
                                                                    setContentDiffFile({ remotePath, fileName: item.name });
                                                                }}
                                                                disabled={!!processing}
                                                                title="Compare Content"
                                                                className="p-1.5 rounded-md hover:bg-green-50 text-gray-500 hover:text-green-600 transition-colors"
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                        )}

                                                        {item.status !== 'synchronized' && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleSyncItem(item, 'upload'); }}
                                                                    disabled={!!processing || item.status === 'missing_local'}
                                                                    title="Upload to Remote"
                                                                    className="p-1.5 rounded-md hover:bg-blue-50 text-gray-500 hover:text-blue-600 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors"
                                                                >
                                                                    <Upload size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleSyncItem(item, 'download'); }}
                                                                    disabled={!!processing || item.status === 'missing_remote'}
                                                                    title="Download to Local"
                                                                    className="p-1.5 rounded-md hover:bg-purple-50 text-gray-500 hover:text-purple-600 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-500 transition-colors"
                                                                >
                                                                    <Download size={16} />
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
                                                            className="bg-white border border-gray-200 px-3 py-1 rounded-full text-xs text-gray-500 hover:bg-gray-100 mr-2"
                                                        >
                                                            Open
                                                        </button>

                                                        {item.status !== 'synchronized' && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleFolderSync(item, 'upload'); }}
                                                                    disabled={!!processing || item.status === 'missing_local'}
                                                                    title="Recursively Upload"
                                                                    className="p-1.5 rounded-md hover:bg-blue-50 text-gray-500 hover:text-blue-600 disabled:opacity-20 transition-colors"
                                                                >
                                                                    <Upload size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleFolderSync(item, 'download'); }}
                                                                    disabled={!!processing || item.status === 'missing_remote'}
                                                                    title="Recursively Download"
                                                                    className="p-1.5 rounded-md hover:bg-purple-50 text-gray-500 hover:text-purple-600 disabled:opacity-20 transition-colors"
                                                                >
                                                                    <Download size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Remote Side */}
                                        <div className="col-span-4 p-3 flex items-center justify-end overflow-hidden">
                                            {item.remote && !item.isDirectory && (
                                                <div className="text-xs text-gray-400 mr-2 text-right whitespace-nowrap">
                                                    {formatSize(item.remote.size)}
                                                    <br />
                                                    <span className="text-[10px]">{new Date(item.remote.modifiedAt).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center min-w-0 justify-end flex-1 pl-2">
                                                <div className={`truncate text-sm text-right ${!item.remote ? 'text-gray-300 italic' : 'text-gray-700 font-medium'}`}>
                                                    {item.name}
                                                </div>
                                                {item.isDirectory ? (
                                                    <Folder size={18} className="text-yellow-500 ml-3 flex-shrink-0" />
                                                ) : (
                                                    <File size={18} className={`ml-3 flex-shrink-0 ${!item.remote ? 'text-gray-200' : 'text-gray-400'}`} />
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                ))}

                                {filteredItems.length === 0 && (
                                    <div className="text-center py-12 text-gray-400">
                                        {searchQuery ? 'No matching files found' : 'Folder is empty'}
                                    </div>
                                )}


                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Custom Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] animate-in fade-in duration-200">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center mb-4">
                            <div className={`p-2 rounded-full mr-3 ${confirmModal.type === 'warning' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">{confirmModal.title}</h3>
                        </div>
                        <p className="text-gray-600 mb-6 leading-relaxed">
                            {confirmModal.message}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModal.onConfirm}
                                className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sync Progress Modal */}
            {overallProgress && (() => {
                // Cap values to never exceed 100%
                const displayCompleted = Math.min(overallProgress.completedFiles, overallProgress.totalFilesInBatch);
                const progressPercent = overallProgress.totalFilesInBatch > 0
                    ? Math.min(100, Math.round((displayCompleted / overallProgress.totalFilesInBatch) * 100))
                    : 0;

                return (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
                        <div className="bg-white p-6 rounded-xl shadow-2xl w-96 max-w-lg">
                            <h3 className="text-lg font-bold mb-4 flex items-center justify-between">
                                <span>Processing...</span>
                                {overallProgress.totalFilesInBatch > 0 && (
                                    <span className="text-sm font-normal text-gray-500">
                                        {displayCompleted} / {overallProgress.totalFilesInBatch} files
                                    </span>
                                )}
                            </h3>

                            {/* Overall Progress Bar */}
                            {overallProgress.totalFilesInBatch > 0 && (
                                <div className="mb-4">
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>Overall Progress</span>
                                        <span>{progressPercent}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
                                        <div
                                            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500 relative overflow-hidden"
                                            style={{ width: `${progressPercent}%` }}
                                        >
                                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Scanning/Queue Status */}
                            {overallProgress.activeUploads.length === 0 && overallProgress.totalFilesInBatch === 0 && overallProgress.queueLength === 0 && (
                                <div className="text-sm text-gray-500 mb-4 animate-pulse flex items-center">
                                    <RefreshCw size={14} className="mr-2 animate-spin" />
                                    Scanning folder...
                                </div>
                            )}

                            {/* Queue Status */}
                            {overallProgress.activeUploads.length === 0 && overallProgress.queueLength > 0 && (
                                <div className="text-sm text-gray-500 mb-4 animate-pulse">
                                    Waiting for queue ({overallProgress.queueLength} items)...
                                </div>
                            )}

                            {/* Active Uploads */}
                            {overallProgress.activeUploads.map((upload, idx) => (
                                <div key={idx} className="mb-4 last:mb-0">
                                    <div className="flex justify-between text-xs text-gray-700 mb-1 font-medium truncate">
                                        <span className="truncate max-w-[70%]">{upload.filename}</span>
                                        <span>{upload.percent}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-300 relative overflow-hidden"
                                            style={{ width: `${upload.percent}%` }}
                                        >
                                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-500">
                                        <span>{upload.speedMBps} MB/s</span>
                                        <span>ETA: {upload.etaSeconds}s</span>
                                    </div>
                                </div>
                            ))}

                            {overallProgress.activeUploads.length === 0 && overallProgress.queueLength === 0 && overallProgress.totalFilesInBatch > 0 && (
                                <div className="text-center text-gray-500 py-2">
                                    Finishing up...
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

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
