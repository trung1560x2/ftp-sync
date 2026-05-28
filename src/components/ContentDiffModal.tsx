import React, { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { X, ArrowRight, ArrowLeft, Loader2, Save, RefreshCw } from 'lucide-react';

interface Props {
    connectionId: number;
    remotePath: string;
    fileName: string;
    onClose: () => void;
    onSyncComplete?: () => void;
}

const getLanguage = (fileName: string): string => {
    const lower = fileName.toLowerCase();

    // Special filenames
    if (lower === 'artisan') return 'php';
    if (lower === 'dockerfile') return 'dockerfile';
    if (lower === 'nginx.conf') return 'nginx';
    if (lower.endsWith('.env') || lower.includes('.env.')) return 'ini';
    if (lower === 'composer.lock') return 'json';
    if (lower === 'package-lock.json') return 'json';
    if (lower === 'yarn.lock') return 'yaml'; // yarn.lock is yaml-like usually, or custom. text is safer? Monaco handles yaml well.
    if (lower === 'cargo.lock') return 'toml';

    // Extensions
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
    if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.cjs') || lower.endsWith('.mjs')) return 'javascript';
    if (lower.endsWith('.php')) return 'php';
    if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.blade.php')) return 'html'; // Blade as html often works ok
    if (lower.endsWith('.css')) return 'css';
    if (lower.endsWith('.scss') || lower.endsWith('.sass')) return 'scss';
    if (lower.endsWith('.less')) return 'less';
    if (lower.endsWith('.json') || lower.endsWith('.lock')) return 'json'; // Generic .lock as json
    if (lower.endsWith('.xml') || lower.endsWith('.svg')) return 'xml';
    if (lower.endsWith('.sql')) return 'sql';
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'shell';
    if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
    if (lower.endsWith('.ini') || lower.endsWith('.conf')) return 'ini';
    if (lower.endsWith('.py')) return 'python';
    if (lower.endsWith('.java')) return 'java';
    if (lower.endsWith('.rb')) return 'ruby';
    if (lower.endsWith('.go')) return 'go';
    if (lower.endsWith('.rs')) return 'rust';
    if (lower.endsWith('.vue')) return 'html'; // fallback vue to html for basic highlighting
    if (lower.endsWith('.txt')) return 'plaintext';

    return 'plaintext';
};

const ContentDiffModal: React.FC<Props> = ({
    connectionId,
    remotePath,
    fileName,
    onClose,
    onSyncComplete
}) => {
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [localContent, setLocalContent] = useState<string | null>(null);
    const [remoteContent, setRemoteContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const editorRef = React.useRef<any>(null);

    const fetchContent = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/content-diff/${connectionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ remotePath })
            });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
            } else {
                setLocalContent(data.localContent);
                setRemoteContent(data.remoteContent);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch content');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContent();
    }, [connectionId, remotePath]);

    const handleSave = async (target: 'local' | 'remote') => {
        if (!editorRef.current) return;

        setIsSyncing(true);
        try {
            const original = editorRef.current.getOriginalEditor();
            const modified = editorRef.current.getModifiedEditor();

            const currentLocal = original.getValue();
            const currentRemote = modified.getValue();

            const url = `/api/content-diff/${connectionId}/merge`;
            const body = {
                remotePath,
                direction: target === 'local' ? 'toLocal' : 'toRemote',
                content: target === 'local' ? currentLocal : currentRemote
            };

            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // No optimistic update needed for direct save as the content is already there
            // Just notify success ideally, but for now just clear syncing state

        } catch (err) {
            console.error('Save failed', err);
            alert(`Failed to save to ${target}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSync = async (direction: 'upload' | 'download') => {
        if (!editorRef.current) return;

        setIsSyncing(true);
        try {
            const original = editorRef.current.getOriginalEditor();
            const modified = editorRef.current.getModifiedEditor();

            const currentLocal = original.getValue();
            const currentRemote = modified.getValue();

            let url = '';
            let body = {};

            if (direction === 'upload') {
                url = `/api/content-diff/${connectionId}/merge`;
                body = {
                    remotePath,
                    direction: 'toRemote',
                    content: currentLocal
                };
            } else {
                url = `/api/content-diff/${connectionId}/merge`;
                body = {
                    remotePath,
                    direction: 'toLocal',
                    content: currentRemote
                };
            }

            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (onSyncComplete) onSyncComplete();

            // Optimistic Update can be tricky without provoking state update -> re-render loop.
            // But since we are not driving the editor with state anymore for *changes*, 
            // updating state here *might* reset cursor if user is typing, but user just clicked a button so it's fine.
            if (onSyncComplete) onSyncComplete();

            // Refresh content from server to ensure we have the latest state on disk/remote
            // This replaces the optimistic update which might be inaccurate if the file changed differently
            await fetchContent();
        } catch (err) {
            console.error('Sync failed', err);
            alert('Failed to sync file content');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden rounded-none text-neutral-200 font-mono">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-neutral-800 bg-neutral-950">
                    <div className="flex items-center">
                        <span className="p-2 bg-neutral-900 border border-neutral-800 text-orange-500 rounded-none mr-3">
                            <Save size={20} />
                        </span>
                        <div>
                            <h3 className="text-xs font-bold text-neutral-100 uppercase tracking-widest">{fileName}</h3>
                            <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider mt-0.5">[Live Content Comparison]</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        {loading && (
                            <span className="text-xs text-neutral-450 flex items-center uppercase font-bold">
                                <Loader2 size={12} className="animate-spin mr-2 text-orange-500" /> Fetching...
                            </span>
                        )}

                        {!loading && !error && (
                            <>
                                <button
                                    onClick={fetchContent}
                                    className="p-2 text-neutral-400 border border-neutral-800 bg-neutral-950 hover:text-orange-500 hover:bg-neutral-900 rounded-none transition-colors mr-2"
                                    title="Reload from Server (Discard Edits)"
                                >
                                    <RefreshCw size={14} />
                                </button>

                                <button
                                    onClick={() => handleSync('download')}
                                    disabled={loading || isSyncing || remoteContent === null}
                                    className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 border border-emerald-900/50 text-emerald-500 rounded-none text-xs font-bold flex items-center transition-colors disabled:opacity-50"
                                    title="Overwrite Local with Remote"
                                >
                                    {isSyncing ? <Loader2 size={12} className="animate-spin mr-2" /> : <ArrowLeft size={12} className="mr-2" />}
                                    PULL_TO_LOCAL
                                </button>
                                <button
                                    onClick={() => handleSync('upload')}
                                    disabled={isSyncing || !localContent}
                                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded-none text-xs font-bold flex items-center transition-colors disabled:opacity-50"
                                    title="Overwrite Remote with Local"
                                >
                                    PUSH_TO_REMOTE
                                    {isSyncing ? <Loader2 size={12} className="animate-spin ml-2" /> : <ArrowRight size={12} className="ml-2" />}
                                </button>
                            </>
                        )}
                        <div className="h-6 w-px bg-neutral-800 mx-2"></div>
                        <button onClick={onClose} className="p-1.5 hover:bg-neutral-850 border border-neutral-850 rounded-none transition-colors text-neutral-500 hover:text-red-500">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Diff Editor */}
                <div className="flex-1 relative bg-[#1e1e1e]">
                    <div className="absolute top-0 left-0 w-1/2 flex justify-between items-center px-4 py-1.5 bg-neutral-950 border-b border-neutral-850 z-10 font-mono">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">LOCAL (Editable)</span>
                        <button
                            onClick={() => handleSave('local')}
                            disabled={isSyncing || localContent === null}
                            className="text-[9px] bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-emerald-400 px-2 py-0.5 rounded-none flex items-center disabled:opacity-50 uppercase font-bold tracking-wider"
                        >
                            <Save size={10} className="mr-1 text-emerald-500" /> Save Local
                        </button>
                    </div>
                    <div className="absolute top-0 right-0 w-1/2 flex justify-between items-center px-4 py-1.5 bg-neutral-950 border-b border-neutral-850 z-10 font-mono">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">REMOTE (Editable)</span>
                        <button
                            onClick={() => handleSave('remote')}
                            disabled={isSyncing || remoteContent === null}
                            className="text-[9px] bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 px-2 py-0.5 rounded-none flex items-center disabled:opacity-50 uppercase font-bold tracking-wider"
                        >
                            <Save size={10} className="mr-1" /> Save Remote
                        </button>
                    </div>

                    <div className="pt-8 h-full">
                        {!loading && !error ? (
                            <DiffEditor
                                original={localContent || ''} // Left side (Original/Local)
                                modified={remoteContent || ''} // Right side (Modified/Remote)
                                language={getLanguage(fileName)}
                                theme="vs-dark"
                                options={{
                                    readOnly: false,
                                    originalEditable: true,
                                    renderSideBySide: true,
                                    scrollBeyondLastLine: false,
                                    minimap: { enabled: false },
                                    fontFamily: 'ui-monospace, monospace',
                                    fontSize: 12,
                                    lineNumbersMinChars: 3
                                }}
                                onMount={(editor) => {
                                    editorRef.current = editor;
                                }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-neutral-500 flex-col">
                                {loading ? (
                                    <>
                                        <Loader2 size={32} className="animate-spin mb-4 text-orange-500" />
                                        <p className="text-xs uppercase font-bold tracking-widest text-neutral-400">Fetching remote files...</p>
                                    </>
                                ) : (
                                    <div className="text-red-500 text-center max-w-md p-6 border border-neutral-800 bg-neutral-950 font-mono">
                                        <p className="font-bold mb-2 uppercase text-xs tracking-wider">Error loading content</p>
                                        <p className="text-xs text-neutral-450 mb-4">{error}</p>
                                        <button
                                            onClick={fetchContent}
                                            className="px-4 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-red-400 text-xs font-bold uppercase tracking-wider rounded-none"
                                        >
                                            Retry Operation
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContentDiffModal;
