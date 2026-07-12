import React, { useState, useCallback, useEffect } from 'react';
import TerminalPane from './TerminalPane';
import TerminalTabBar, { TerminalTab } from './TerminalTabBar';
import SplitContainer from './SplitContainer';
import SftpFileBrowser from './SftpFileBrowser';
import {
  Terminal,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
  Plus,
  Server,
  Key,
  Eye,
  EyeOff,
  Loader2,
  Download,
  FileSearch,
  FolderOpen,
} from 'lucide-react';

interface Connection {
  id: number;
  name?: string;
  server: string;
  ssh_port?: number;
  ssh_username?: string;
}

const TerminalView: React.FC = () => {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showConnectionPicker, setShowConnectionPicker] = useState(false);
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>('none');
  const [splitTabIds, setSplitTabIds] = useState<[string, string] | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [pendingSplitDirection, setPendingSplitDirection] = useState<'horizontal' | 'vertical' | null>(null);

  // Quick Connect form state
  const [showQuickConnect, setShowQuickConnect] = useState(false);
  const [quickHost, setQuickHost] = useState('');
  const [quickPort, setQuickPort] = useState('22');
  const [quickUsername, setQuickUsername] = useState('root');
  const [quickPassword, setQuickPassword] = useState('');
  const [quickPrivateKey, setQuickPrivateKey] = useState('');
  const [quickAuthMode, setQuickAuthMode] = useState<'password' | 'key'>('password');
  const [showPassword, setShowPassword] = useState(false);
  const [quickConnecting, setQuickConnecting] = useState(false);
  const [quickError, setQuickError] = useState('');

  // Path dialog for toolbar Download / Open File
  const [showPathDialog, setShowPathDialog] = useState<{ mode: 'download' | 'open' } | null>(null);
  const [pathDialogValue, setPathDialogValue] = useState('');
  const [pathDialogLoading, setPathDialogLoading] = useState(false);
  const [pathDialogUseSudo, setPathDialogUseSudo] = useState(false);

  // SFTP File Browser panel
  const [showSftpPanel, setShowSftpPanel] = useState(false);

  // Fetch available connections
  useEffect(() => {
    fetch('/api/ftp-connections')
      .then((res) => res.json())
      .then((data) => setConnections(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  // Restore tabs from localStorage on mount and check active backend sessions
  useEffect(() => {
    const restoreTabs = async () => {
      try {
        const storedTabsStr = localStorage.getItem('omnisync_terminal_tabs');
        const storedActiveTabId = localStorage.getItem('omnisync_terminal_active_tab_id');
        const storedSplitMode = localStorage.getItem('omnisync_terminal_split_mode') as 'none' | 'horizontal' | 'vertical' | null;
        const storedSplitTabIdsStr = localStorage.getItem('omnisync_terminal_split_tab_ids');
        
        if (storedTabsStr) {
          const storedTabs = JSON.parse(storedTabsStr) as TerminalTab[];
          
          const res = await fetch('/api/terminal/sessions');
          const data = await res.json();
          if (data.success && Array.isArray(data.sessions)) {
            const activeSessionIds = new Set(data.sessions.map((s: any) => s.id));
            const validTabs = storedTabs.filter((t) => activeSessionIds.has(t.sessionId));
            
            setTabs(validTabs);
            if (validTabs.length > 0) {
              if (storedActiveTabId && validTabs.some((t) => t.id === storedActiveTabId)) {
                setActiveTabId(storedActiveTabId);
              } else {
                setActiveTabId(validTabs[0].id);
              }

              if (storedSplitMode && storedSplitMode !== 'none' && storedSplitTabIdsStr) {
                const storedSplitTabIds = JSON.parse(storedSplitTabIdsStr) as [string, string];
                if (validTabs.some((t) => t.id === storedSplitTabIds[0]) && validTabs.some((t) => t.id === storedSplitTabIds[1])) {
                  setSplitMode(storedSplitMode);
                  setSplitTabIds(storedSplitTabIds);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to restore terminal tabs:', err);
      } finally {
        setIsInitialized(true);
      }
    };
    
    restoreTabs();
  }, []);

  // Save tabs to localStorage
  useEffect(() => {
    if (!isInitialized) return;
    if (tabs.length > 0) {
      localStorage.setItem('omnisync_terminal_tabs', JSON.stringify(tabs));
    } else {
      localStorage.removeItem('omnisync_terminal_tabs');
    }
  }, [tabs, isInitialized]);

  // Save active tab id
  useEffect(() => {
    if (!isInitialized) return;
    if (activeTabId) {
      localStorage.setItem('omnisync_terminal_active_tab_id', activeTabId);
    } else {
      localStorage.removeItem('omnisync_terminal_active_tab_id');
    }
  }, [activeTabId, isInitialized]);

  // Save split state
  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem('omnisync_terminal_split_mode', splitMode);
    if (splitTabIds) {
      localStorage.setItem('omnisync_terminal_split_tab_ids', JSON.stringify(splitTabIds));
    } else {
      localStorage.removeItem('omnisync_terminal_split_tab_ids');
    }
  }, [splitMode, splitTabIds, isInitialized]);

  const generateId = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);

  // Create a new terminal tab for a saved connection
  const createTab = useCallback(
    async (connectionId: number) => {
      try {
        const res = await fetch('/api/terminal/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to create session');

        const tabId = generateId();
        const conn = connections.find((c) => c.id === connectionId);
        const newTab: TerminalTab = {
          id: tabId,
          sessionId: data.sessionId,
          connectionId,
          title: conn?.name || conn?.server || 'Terminal',
          isConnected: false,
        };

        setTabs((prev) => {
          const updated = [...prev, newTab];
          if (pendingSplitDirection && activeTabId) {
            setSplitMode(pendingSplitDirection);
            setSplitTabIds([activeTabId, tabId]);
            setPendingSplitDirection(null);
          }
          return updated;
        });
        setActiveTabId(tabId);
        setShowConnectionPicker(false);
      } catch (error: any) {
        console.error('Failed to create terminal:', error);
      }
    },
    [connections, pendingSplitDirection, activeTabId]
  );

  // Quick connect — create SSH session without saving to DB
  const handleQuickConnect = useCallback(async () => {
    if (!quickHost || !quickUsername) return;
    setQuickConnecting(true);
    setQuickError('');

    try {
      const body: any = {
        host: quickHost,
        port: parseInt(quickPort) || 22,
        username: quickUsername,
      };
      if (quickAuthMode === 'password') {
        body.password = quickPassword;
      } else {
        body.privateKey = quickPrivateKey;
      }

      const res = await fetch('/api/terminal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to create session');

      const tabId = generateId();
      const newTab: TerminalTab = {
        id: tabId,
        sessionId: data.sessionId,
        connectionId: 0,
        title: data.connectionName || `${quickUsername}@${quickHost}`,
        isConnected: false,
      };

      setTabs((prev) => {
        const updated = [...prev, newTab];
        if (pendingSplitDirection && activeTabId) {
          setSplitMode(pendingSplitDirection);
          setSplitTabIds([activeTabId, tabId]);
          setPendingSplitDirection(null);
        }
        return updated;
      });
      setActiveTabId(tabId);
      setShowQuickConnect(false);
      // Reset form
      setQuickHost('');
      setQuickPort('22');
      setQuickUsername('root');
      setQuickPassword('');
      setQuickPrivateKey('');
      setQuickError('');
    } catch (error: any) {
      setQuickError(error.message);
    } finally {
      setQuickConnecting(false);
    }
  }, [quickHost, quickPort, quickUsername, quickPassword, quickPrivateKey, quickAuthMode, pendingSplitDirection, activeTabId]);

  // Handle new tab button
  const handleNewTab = useCallback(() => {
    setShowConnectionPicker(true);
  }, []);

  // Close a tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        fetch(`/api/terminal/sessions/${tab.sessionId}`, { method: 'DELETE' }).catch(() => {});
      }

      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId && remaining.length > 0) {
          const closedIndex = prev.findIndex((t) => t.id === tabId);
          const newActiveIndex = Math.min(closedIndex, remaining.length - 1);
          setActiveTabId(remaining[newActiveIndex].id);
        } else if (remaining.length === 0) {
          setActiveTabId(null);
        }
        return remaining;
      });

      if (splitTabIds?.includes(tabId)) {
        setSplitMode('none');
        setSplitTabIds(null);
      }
    },
    [tabs, activeTabId, splitTabIds]
  );

  // Split current tab
  const handleSplit = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (!activeTabId) return;
      if (tabs.length >= 2) {
        const otherTab = tabs.find((t) => t.id !== activeTabId);
        if (!otherTab) return;
        setSplitMode(direction);
        setSplitTabIds([activeTabId, otherTab.id]);
      } else {
        setPendingSplitDirection(direction);
        setShowConnectionPicker(true);
      }
    },
    [activeTabId, tabs]
  );

  // Update tab title when SSH connects
  const handleTitleChange = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, title, isConnected: true } : t))
    );
  }, []);

  // Get the sessionId of the active tab
  const getActiveSessionId = useCallback((): string | null => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    return activeTab?.sessionId || null;
  }, [tabs, activeTabId]);

  // Handle toolbar download
  const handleToolbarDownload = useCallback(async (filePath: string) => {
    const sessionId = getActiveSessionId();
    if (!sessionId || !filePath.trim()) return;

    setPathDialogLoading(true);
    try {
      const url = `/api/terminal/sessions/${sessionId}/download?path=${encodeURIComponent(filePath.trim())}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.trim().split('/').pop() || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setShowPathDialog(null);
      setPathDialogValue('');
    } catch (err: any) {
      console.error('[Toolbar Download] Error:', err.message);
    } finally {
      setPathDialogLoading(false);
    }
  }, [getActiveSessionId]);

  // Handle toolbar open file — sends command to TerminalPane via custom event
  const handleToolbarOpenFile = useCallback(async (filePath: string) => {
    const sessionId = getActiveSessionId();
    if (!sessionId || !filePath.trim()) return;

    setPathDialogLoading(true);
    try {
      // Resolve relative path
      const cwdRes = await fetch(`/api/terminal/sessions/${sessionId}/cwd`);
      const cwdData = await cwdRes.json();
      if (!cwdData.success) throw new Error(cwdData.message || 'Failed to get CWD');
      const cwd = cwdData.cwd;

      let remotePath = filePath.trim();
      if (!remotePath.startsWith('/')) {
        remotePath = cwd.endsWith('/') ? cwd + remotePath : cwd + '/' + remotePath;
      }

      // Dispatch a custom event that TerminalPane listens for
      window.dispatchEvent(new CustomEvent('terminal:open-file', {
        detail: { sessionId, remotePath, useSudo: pathDialogUseSudo }
      }));

      setShowPathDialog(null);
      setPathDialogValue('');
    } catch (err: any) {
      console.error('[Toolbar Open File] Error:', err.message);
    } finally {
      setPathDialogLoading(false);
    }
  }, [getActiveSessionId, pathDialogUseSudo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        handleNewTab();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const nextIdx = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        setActiveTabId(tabs[nextIdx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, activeTabId, handleNewTab, handleCloseTab]);

  // ─── Render helpers ────────────────────────────────────────

  const renderTerminalArea = () => {
    if (tabs.length === 0) return renderEmptyState();

    if (splitMode !== 'none' && splitTabIds && splitTabIds.length === 2) {
      const [tabA, tabB] = splitTabIds;
      const tabDataA = tabs.find((t) => t.id === tabA);
      const tabDataB = tabs.find((t) => t.id === tabB);

      if (tabDataA && tabDataB) {
        return (
          <SplitContainer direction={splitMode}>
            <TerminalPane
              key={tabDataA.sessionId}
              sessionId={tabDataA.sessionId}
              connectionId={tabDataA.connectionId}
              isActive={activeTabId === tabA}
              onTitleChange={(title) => handleTitleChange(tabA, title)}
            />
            <TerminalPane
              key={tabDataB.sessionId}
              sessionId={tabDataB.sessionId}
              connectionId={tabDataB.connectionId}
              isActive={activeTabId === tabB}
              onTitleChange={(title) => handleTitleChange(tabB, title)}
            />
          </SplitContainer>
        );
      }
    }

    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return renderEmptyState();

    return (
      <TerminalPane
        key={activeTab.sessionId}
        sessionId={activeTab.sessionId}
        connectionId={activeTab.connectionId}
        isActive={true}
        onTitleChange={(title) => handleTitleChange(activeTab.id, title)}
      />
    );
  };

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-6 p-8">
      <Terminal size={48} className="text-neutral-700" />
      <div className="text-center">
        <p className="text-sm font-mono uppercase tracking-wider mb-2">SSH Terminal</p>
        <p className="text-xs text-neutral-600 max-w-sm">
          Connect to a server via SSH. Choose a saved connection or use Quick Connect.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-md">
        {/* Quick Connect button */}
        <button
          onClick={() => setShowQuickConnect(true)}
          className="flex items-center gap-3 px-4 py-3 bg-orange-600/10 border border-orange-500/30 hover:border-orange-500 hover:bg-orange-600/20 transition-all text-left group"
        >
          <Plus size={16} className="text-orange-500" />
          <div className="flex-1">
            <div className="text-xs font-mono text-orange-400 uppercase tracking-wider">
              Quick Connect
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">
              Connect to any SSH server without saving
            </div>
          </div>
        </button>

        {/* Saved connections */}
        {connections.length > 0 && (
          <>
            <div className="flex items-center gap-2 mt-2">
              <div className="h-px flex-1 bg-neutral-800" />
              <span className="text-[10px] text-neutral-600 font-mono uppercase">
                Saved Connections
              </span>
              <div className="h-px flex-1 bg-neutral-800" />
            </div>

            {connections.map((conn) => (
              <button
                key={conn.id}
                onClick={() => createTab(conn.id)}
                className="flex items-center gap-3 px-4 py-3 bg-neutral-900/50 border border-neutral-800 hover:border-orange-500/50 hover:bg-neutral-900 transition-all text-left group"
              >
                <Server size={14} className="text-neutral-600 group-hover:text-orange-500 transition-colors" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-neutral-300 truncate">
                    {conn.name || conn.server}
                  </div>
                  <div className="text-[10px] text-neutral-600 font-mono">
                    {conn.ssh_username || 'root'}@{conn.server}:{conn.ssh_port || 22}
                  </div>
                </div>
                <span className="text-[10px] text-neutral-700 uppercase font-mono group-hover:text-orange-500/70">
                  Connect
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );

  // ─── Quick Connect Form Modal ──────────────────────────────

  const renderQuickConnectModal = () => {
    if (!showQuickConnect) return null;

    return (
      <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-orange-500" />
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                Quick Connect — SSH
              </span>
            </div>
            <button
              onClick={() => { setShowQuickConnect(false); setQuickError(''); }}
              className="text-neutral-500 hover:text-neutral-300"
            >
              <X size={14} />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* Host + Port */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1">
                  Host / IP
                </label>
                <input
                  type="text"
                  value={quickHost}
                  onChange={(e) => setQuickHost(e.target.value)}
                  placeholder="192.168.1.100 or example.com"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>
              <div className="w-20">
                <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={quickPort}
                  onChange={(e) => setQuickPort(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1">
                Username
              </label>
              <input
                type="text"
                value={quickUsername}
                onChange={(e) => setQuickUsername(e.target.value)}
                placeholder="root"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Auth mode toggle */}
            <div>
              <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1.5">
                Authentication
              </label>
              <div className="flex gap-0">
                <button
                  onClick={() => setQuickAuthMode('password')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border ${
                    quickAuthMode === 'password'
                      ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Key size={11} />
                  Password
                </button>
                <button
                  onClick={() => setQuickAuthMode('key')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border-t border-b border-r ${
                    quickAuthMode === 'key'
                      ? 'bg-orange-600/20 border-orange-500 text-orange-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Key size={11} />
                  Private Key
                </button>
              </div>
            </div>

            {/* Password or Key input */}
            {quickAuthMode === 'password' ? (
              <div className="relative">
                <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={quickPassword}
                    onChange={(e) => setQuickPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 pr-9 bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickConnect()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400"
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1">
                  Private Key (PEM)
                </label>
                <textarea
                  value={quickPrivateKey}
                  onChange={(e) => setQuickPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  rows={4}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
            )}

            {/* Error message */}
            {quickError && (
              <div className="px-3 py-2 bg-red-950/50 border border-red-800/50 text-xs font-mono text-red-400">
                {quickError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800">
            <button
              onClick={() => { setShowQuickConnect(false); setQuickError(''); }}
              className="px-4 py-2 text-xs font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={handleQuickConnect}
              disabled={!quickHost || !quickUsername || quickConnecting}
              className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {quickConnecting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Connection Picker Modal ───────────────────────────────

  const renderConnectionPicker = () => {
    if (!showConnectionPicker) return null;

    return (
      <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-300">
              Open Terminal
            </span>
            <button
              onClick={() => setShowConnectionPicker(false)}
              className="text-neutral-500 hover:text-neutral-300"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-2 max-h-[400px] overflow-y-auto">
            {/* Quick Connect option */}
            <button
              onClick={() => {
                setShowConnectionPicker(false);
                setShowQuickConnect(true);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-600/10 transition-colors text-left border-b border-neutral-800/50 mb-1"
            >
              <Plus size={14} className="text-orange-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-orange-400">Quick Connect</div>
                <div className="text-[10px] font-mono text-neutral-600">
                  Enter host/user/password manually
                </div>
              </div>
            </button>

            {/* Saved connections */}
            {connections.map((conn) => (
              <button
                key={conn.id}
                onClick={() => createTab(conn.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800 transition-colors text-left"
              >
                <Server size={14} className="text-neutral-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-neutral-200 truncate">
                    {conn.name || conn.server}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-600">
                    {conn.ssh_username || 'root'}@{conn.server}:{conn.ssh_port || 22}
                  </div>
                </div>
              </button>
            ))}

            {connections.length === 0 && (
              <p className="text-xs text-neutral-600 text-center font-mono py-4">
                No saved connections. Use Quick Connect above.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] bg-neutral-950">
      {/* Tab bar + toolbar */}
      {tabs.length > 0 && (
        <>
          <TerminalTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseTab}
            onNewTab={handleNewTab}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1 bg-neutral-900/30 border-b border-neutral-800/50">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSplit('horizontal')}
                className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Split Horizontal"
                disabled={!activeTabId}
              >
                <SplitSquareHorizontal size={13} />
              </button>
              <button
                onClick={() => handleSplit('vertical')}
                className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Split Vertical"
                disabled={!activeTabId}
              >
                <SplitSquareVertical size={13} />
              </button>
              {splitMode !== 'none' && (
                <button
                  onClick={() => {
                    setSplitMode('none');
                    setSplitTabIds(null);
                  }}
                  className="p-1.5 text-orange-500 hover:text-orange-400 hover:bg-neutral-800 transition-colors"
                  title="Exit Split View"
                >
                  <X size={13} />
                </button>
              )}

              {/* Separator */}
              <div className="w-px h-4 bg-neutral-800 mx-1" />

              {/* Open File */}
              <button
                onClick={() => { setShowPathDialog({ mode: 'open' }); setPathDialogValue(''); setPathDialogUseSudo(false); }}
                className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Open Remote File"
                disabled={!activeTabId}
              >
                <FileSearch size={13} />
              </button>

              <button
                onClick={() => { setShowPathDialog({ mode: 'download' }); setPathDialogValue(''); setPathDialogUseSudo(false); }}
                className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download Remote File"
                disabled={!activeTabId}
              >
                <Download size={13} />
              </button>

              {/* Separator */}
              <div className="w-px h-4 bg-neutral-800 mx-1" />

              {/* SFTP File Browser Toggle */}
              <button
                onClick={() => setShowSftpPanel(!showSftpPanel)}
                className={`p-1.5 transition-colors rounded ${showSftpPanel ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'} disabled:opacity-50 disabled:cursor-not-allowed`}
                title={showSftpPanel ? 'Hide File Browser' : 'Show File Browser'}
                disabled={!activeTabId}
              >
                <FolderOpen size={13} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-600">
              <span>Ctrl+Shift+T: New</span>
              <span>|</span>
              <span>Ctrl+Tab: Switch</span>
            </div>
          </div>
        </>
      )}

      {/* Terminal area */}
      <div className="flex-1 overflow-hidden">
        {showSftpPanel && tabs.length > 0 && getActiveSessionId() ? (
          <SplitContainer direction="horizontal" initialRatio={0.25}>
            <SftpFileBrowser
              sessionId={getActiveSessionId()!}
              onOpenFile={(remotePath, useSudo) => {
                const sid = getActiveSessionId();
                if (sid) {
                  window.dispatchEvent(new CustomEvent('terminal:open-file', {
                    detail: { sessionId: sid, remotePath, useSudo }
                  }));
                }
              }}
              onDownloadFile={(remotePath) => {
                const sid = getActiveSessionId();
                if (sid) {
                  const url = `/api/terminal/sessions/${sid}/download?path=${encodeURIComponent(remotePath)}`;
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = remotePath.split('/').pop() || 'file';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }
              }}
            />
            {renderTerminalArea()}
          </SplitContainer>
        ) : (
          renderTerminalArea()
        )}
      </div>

      {/* Modals */}
      {renderConnectionPicker()}
      {renderQuickConnectModal()}

      {/* Path Dialog for Download / Open File */}
      {showPathDialog && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                {showPathDialog.mode === 'download' ? (
                  <Download size={14} className="text-orange-500" />
                ) : (
                  <FileSearch size={14} className="text-orange-500" />
                )}
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-200">
                  {showPathDialog.mode === 'download' ? 'Download Remote File' : 'Open Remote File'}
                </span>
              </div>
              <button
                onClick={() => setShowPathDialog(null)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-neutral-500 uppercase mb-1">
                  Remote File Path
                </label>
                <input
                  type="text"
                  value={pathDialogValue}
                  onChange={(e) => setPathDialogValue(e.target.value)}
                  placeholder="/path/to/file or relative/path"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pathDialogValue.trim()) {
                      if (showPathDialog.mode === 'download') {
                        handleToolbarDownload(pathDialogValue);
                      } else {
                        handleToolbarOpenFile(pathDialogValue);
                      }
                    }
                  }}
                />
                <p className="text-[10px] font-mono text-neutral-600 mt-1.5">
                  Nhập đường dẫn tương đối (relative) hoặc tuyệt đối (absolute) trên server
                </p>
                {showPathDialog.mode === 'open' && (
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 cursor-pointer select-none mt-2">
                    <input
                      type="checkbox"
                      checked={pathDialogUseSudo}
                      onChange={(e) => setPathDialogUseSudo(e.target.checked)}
                      className="accent-orange-500 rounded bg-neutral-950 border-neutral-800 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-orange-500 font-bold">Mở bằng SUDO</span>
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800">
              <button
                onClick={() => setShowPathDialog(null)}
                className="px-4 py-2 text-xs font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showPathDialog.mode === 'download') {
                    handleToolbarDownload(pathDialogValue);
                  } else {
                    handleToolbarOpenFile(pathDialogValue);
                  }
                }}
                disabled={!pathDialogValue.trim() || pathDialogLoading}
                className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pathDialogLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Processing...
                  </>
                ) : showPathDialog.mode === 'download' ? (
                  'Download'
                ) : (
                  'Open'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TerminalView;
