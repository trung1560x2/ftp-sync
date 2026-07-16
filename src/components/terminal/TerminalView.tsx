import React, { useState, useCallback, useEffect } from 'react';
import TerminalPane from './TerminalPane';
import TerminalTabBar, { TerminalTab } from './TerminalTabBar';
import SplitContainer from './SplitContainer';
import SftpFileBrowser from './SftpFileBrowser';
import SSHKeyManager from './SSHKeyManager';
import PortForwardDashboard from './PortForwardDashboard';
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
  Settings,
  Check,
  Trash,
  RotateCcw,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { useTerminalSettings, terminalSettingsStore, MONOSPACE_FONTS, TERMINAL_THEMES, TerminalProfile } from '../../stores/terminalSettingsStore';
import ServerMonitorPanel from './ServerMonitorPanel';

interface Connection {
  id: number;
  name?: string;
  server: string;
  ssh_port?: number;
  ssh_username?: string;
}

const TerminalView: React.FC = () => {
  const { profiles, activeProfile, isLoading, error } = useTerminalSettings();
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showConnectionPicker, setShowConnectionPicker] = useState(false);
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>('none');
  const [splitTabIds, setSplitTabIds] = useState<[string, string] | null>(null);
  const [subSection, setSubSection] = useState<'terminals' | 'portForwards' | 'keys'>('terminals');

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
  const [quickConnectHistory, setQuickConnectHistory] = useState<{ host: string; port: string; username: string; authMode: 'password' | 'key' }[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('omnisync_quick_connect_history');
    if (stored) {
      try {
        setQuickConnectHistory(JSON.parse(stored));
      } catch {}
    }
  }, []);

  // Path dialog for toolbar Download / Open File
  const [showPathDialog, setShowPathDialog] = useState<{ mode: 'download' | 'open' } | null>(null);
  const [pathDialogValue, setPathDialogValue] = useState('');
  const [pathDialogLoading, setPathDialogLoading] = useState(false);
  const [pathDialogUseSudo, setPathDialogUseSudo] = useState(false);

  // SFTP File Browser panel
  const [showSftpPanel, setShowSftpPanel] = useState(false);
  const [showMonitorPanel, setShowMonitorPanel] = useState(false);

  // Fetch available connections
  useEffect(() => {
    fetch('/api/ftp-connections')
      .then((res) => res.json())
      .then((data) => setConnections(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const reconnectTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.isConnected || !tab.connectionId) return;

    // Show reconnecting state locally
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, title: `Connecting...` } : t))
    );

    try {
      const res = await fetch('/api/terminal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: tab.connectionId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to create session');

      const conn = connections.find((c) => c.id === tab.connectionId);
      const originalTitle = conn?.name || conn?.server || 'Terminal';

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                sessionId: data.sessionId,
                isConnected: true,
                title: originalTitle
              }
            : t
        )
      );
    } catch (error: any) {
      console.error(`Failed to reconnect tab ${tabId}:`, error);
      const conn = connections.find((c) => c.id === tab.connectionId);
      const originalTitle = conn?.name || conn?.server || 'Terminal';
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, title: `${originalTitle} (Retry)`, isConnected: false } : t
        )
      );
    }
  }, [tabs, connections]);

  // Restore tabs from backend database on mount
  useEffect(() => {
    const restoreTabs = async () => {
      try {
        const savedTabs = await terminalSettingsStore.fetchSavedTabs();
        const storedActiveTabId = localStorage.getItem('omnisync_terminal_active_tab_id');
        const storedSplitMode = localStorage.getItem('omnisync_terminal_split_mode') as 'none' | 'horizontal' | 'vertical' | null;
        const storedSplitTabIdsStr = localStorage.getItem('omnisync_terminal_split_tab_ids');
        
        if (savedTabs.length > 0) {
          const res = await fetch('/api/terminal/sessions');
          const data = await res.json();
          if (data.success && Array.isArray(data.sessions)) {
            const activeSessionIds = new Set(data.sessions.map((s: any) => s.id));
            const processedTabs = savedTabs.map((t) => {
              const activeSession = data.sessions.find((s: any) => s.connectionId === t.connectionId);
              const isConnected = activeSession ? true : false;
              return {
                ...t,
                isConnected,
                sessionId: isConnected ? activeSession.id : ''
              };
            });
            
            setTabs(processedTabs);
            if (processedTabs.length > 0) {
              if (storedActiveTabId && processedTabs.some((t) => t.id === storedActiveTabId)) {
                setActiveTabId(storedActiveTabId);
              } else {
                setActiveTabId(processedTabs[0].id);
              }

              if (storedSplitMode && storedSplitMode !== 'none' && storedSplitTabIdsStr) {
                const storedSplitTabIds = JSON.parse(storedSplitTabIdsStr) as [string, string];
                if (processedTabs.some((t) => t.id === storedSplitTabIds[0]) && processedTabs.some((t) => t.id === storedSplitTabIds[1])) {
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

  // Save tabs to Backend Database
  useEffect(() => {
    if (!isInitialized) return;
    terminalSettingsStore.syncTabs(tabs);
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

  // Trigger auto-reconnect on visible unconnected tabs
  useEffect(() => {
    if (!isInitialized) return;

    const visibleTabIds = new Set<string>();
    if (splitMode !== 'none' && splitTabIds && splitTabIds.length === 2) {
      visibleTabIds.add(splitTabIds[0]);
      visibleTabIds.add(splitTabIds[1]);
    } else if (activeTabId) {
      visibleTabIds.add(activeTabId);
    }

    for (const tabId of visibleTabIds) {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab && !tab.isConnected && tab.connectionId) {
        reconnectTab(tabId);
      }
    }
  }, [activeTabId, splitMode, splitTabIds, isInitialized, tabs, reconnectTab]);

  // Periodically query CWD of active session and save it
  useEffect(() => {
    if (!isInitialized || !activeTabId) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || !activeTab.isConnected || !activeTab.sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/terminal/sessions/${activeTab.sessionId}/cwd`);
        const data = await res.json();
        if (data.success && data.cwd && data.cwd !== activeTab.cwd) {
          setTabs((prev) =>
            prev.map((t) => (t.id === activeTabId ? { ...t, cwd: data.cwd } : t))
          );
        }
      } catch (err) {
        // Silent error
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTabId, isInitialized, tabs]);

  const handleUpdateTabColor = useCallback((tabId: string, color: string | undefined) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, color } : t))
    );
  }, []);

  const handleRenameTab = useCallback((tabId: string, newTitle: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t))
    );
  }, []);

  const handleTerminalOpenFile = useCallback((sessionId: string, remotePath: string) => {
    window.dispatchEvent(new CustomEvent('terminal:open-file', {
      detail: { sessionId, remotePath, useSudo: false }
    }));
  }, []);

  const handleDuplicateTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || !tab.connectionId) return;

    try {
      let startCwd = '/';
      try {
        const cwdRes = await fetch(`/api/terminal/sessions/${tab.sessionId}/cwd`);
        const cwdData = await cwdRes.json();
        if (cwdData.success) startCwd = cwdData.cwd;
      } catch {}

      if (tab.connectionId > 0) {
        const res = await fetch('/api/terminal/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: tab.connectionId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to duplicate session');

        const newTabId = generateId();
        const newTab: TerminalTab = {
          id: newTabId,
          sessionId: data.sessionId,
          connectionId: tab.connectionId,
          title: `${tab.title} (Copy)`,
          isConnected: false,
          color: tab.color,
          cwd: startCwd
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTabId);
      } else {
        alert('Cannot duplicate a temporary quick connect session.');
      }
    } catch (err: any) {
      alert('Failed to duplicate tab: ' + err.message);
    }
  }, [tabs]);

  const handleImportSshConfig = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/terminal/ssh-config/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        // Refresh connection list
        fetch('/api/ftp-connections')
          .then((res) => res.json())
          .then((data) => setConnections(Array.isArray(data) ? data : []))
          .catch(console.error);
        setShowConnectionPicker(false);
      } else {
        alert('Failed to import config: ' + data.message);
      }
    } catch (err: any) {
      alert('Error importing config: ' + err.message);
    } finally {
      e.target.value = '';
    }
  }, []);

  const handleExportConnections = useCallback(() => {
    const exportData = connections.map(c => ({
      name: c.name,
      server: c.server,
      port: c.ssh_port || 22,
      username: c.ssh_username || 'root'
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnisync_connections_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [connections]);

  const handleImportThirdPartyConnections = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      let imported: ConnectionImportTemplate[] = [];
      const filename = file.name.toLowerCase();

      try {
        if (filename.endsWith('.reg')) {
          imported = parsePuTTYReg(text);
        } else if (filename.endsWith('.mxtpro') || filename.endsWith('.ini')) {
          imported = parseMobaXterm(text);
        } else if (filename.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            imported = parsed.map(c => ({
              name: c.name || c.server || 'Terminal',
              server: c.server || c.host || c.hostname,
              port: parseInt(c.port) || 22,
              username: c.username || c.user || 'root'
            }));
          } else {
            imported = parseTermius(parsed);
          }
        } else {
          throw new Error('Unsupported connection import file format.');
        }

        if (imported.length === 0) {
          throw new Error('No connections found in file.');
        }

        let successCount = 0;
        for (const s of imported) {
          try {
            const res = await fetch('/api/ftp-connections', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({
                name: s.name,
                server: s.server,
                port: s.port,
                username: s.username,
                protocol: 'sftp',
                secure: true
              })
            });
            const data = await res.json();
            if (data.id) successCount++;
          } catch {
            // ignore
          }
        }

        alert(`Successfully imported ${successCount} of ${imported.length} connections!`);
        
        // Refresh connection list
        fetch('/api/ftp-connections')
          .then((res) => res.json())
          .then((data) => setConnections(Array.isArray(data) ? data : []))
          .catch(console.error);
        setShowConnectionPicker(false);
      } catch (err: any) {
        alert('Failed to parse connections: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

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
      
      // Save to history
      setQuickConnectHistory((prev) => {
        const item = { host: quickHost, port: quickPort, username: quickUsername, authMode: quickAuthMode };
        const updated = [
          item,
          ...prev.filter((h) => !(h.host === quickHost && h.username === quickUsername && h.port === quickPort)),
        ].slice(0, 10);
        localStorage.setItem('omnisync_quick_connect_history', JSON.stringify(updated));
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

  const renderSettingsDrawer = () => {
    return (
      <div className="flex flex-col h-full bg-neutral-900 border-l border-neutral-800 text-neutral-300 select-none">
        {/* Title */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-orange-500" />
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-200">Terminal Settings</span>
          </div>
          <button onClick={() => setShowSettingsPanel(false)} className="text-neutral-500 hover:text-neutral-300">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Active Profile Selection */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-neutral-500 uppercase">Profile Selector</label>
            <div className="flex gap-2">
              <select
                value={activeProfile.id || ''}
                onChange={(e) => {
                  const p = profiles.find(pr => pr.id === parseInt(e.target.value));
                  if (p) terminalSettingsStore.selectProfile(p);
                }}
                className="flex-1 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs text-neutral-300 focus:outline-none focus:border-orange-500"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.is_default ? '(Default)' : ''}</option>
                ))}
              </select>
              {activeProfile.id && !activeProfile.is_default && (
                <button
                  onClick={async () => {
                    if (confirm('Delete this profile?')) {
                      await terminalSettingsStore.deleteProfile(activeProfile.id!);
                    }
                  }}
                  className="p-1.5 text-rose-500 hover:text-rose-400 border border-neutral-800 hover:border-neutral-700 bg-neutral-950 rounded transition-colors"
                  title="Delete Profile"
                >
                  <Trash size={12} />
                </button>
              )}
            </div>

            {/* Create Profile */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="New profile name..."
                className="flex-1 px-3 py-1 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs text-neutral-300 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={async () => {
                  if (!newProfileName.trim()) return;
                  await terminalSettingsStore.createProfile({
                    name: newProfileName.trim(),
                    theme: activeProfile.theme,
                    font_family: activeProfile.font_family,
                    font_size: activeProfile.font_size,
                    line_height: activeProfile.line_height,
                    letter_spacing: activeProfile.letter_spacing,
                    enable_ligatures: activeProfile.enable_ligatures,
                    scrollback_limit: activeProfile.scrollback_limit,
                    custom_keybindings: activeProfile.custom_keybindings,
                    is_default: false
                  });
                  setNewProfileName('');
                }}
                className="px-3 py-1 text-xs font-mono font-bold uppercase bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 rounded transition-colors"
              >
                Create
              </button>
            </div>
          </div>

          <div className="h-px bg-neutral-800/60" />

          {/* Color Schemes */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-neutral-500 uppercase">Color Schemes</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(TERMINAL_THEMES).map(themeKey => {
                const theme = TERMINAL_THEMES[themeKey];
                const isActive = activeProfile.theme === themeKey;
                return (
                  <button
                    key={themeKey}
                    onClick={() => {
                      if (activeProfile.id) {
                        terminalSettingsStore.updateProfile(activeProfile.id, { theme: themeKey });
                      }
                    }}
                    onMouseEnter={() => terminalSettingsStore.setHoveredTheme(themeKey)}
                    onMouseLeave={() => terminalSettingsStore.setHoveredTheme(null)}
                    className={`flex flex-col p-2 bg-neutral-950 border rounded text-left transition-all ${
                      isActive ? 'border-orange-500' : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="text-[10px] font-mono font-bold text-neutral-400 truncate mb-1.5 flex justify-between items-center w-full">
                      <span>{theme.name}</span>
                      {isActive && <Check size={8} className="text-orange-500" />}
                    </div>
                    {/* Tiny Color Palette Preview */}
                    <div className="flex gap-0.5 w-full h-1.5 rounded overflow-hidden">
                      <div className="flex-1" style={{ background: theme.background }} />
                      <div className="flex-1" style={{ background: theme.foreground }} />
                      <div className="flex-1" style={{ background: theme.red }} />
                      <div className="flex-1" style={{ background: theme.green }} />
                      <div className="flex-1" style={{ background: theme.yellow }} />
                      <div className="flex-1" style={{ background: theme.blue }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-neutral-800/60" />

          {/* Font Typography */}
          <div className="space-y-3">
            <label className="block text-[10px] font-mono text-neutral-500 uppercase">Typography</label>
            
            {/* Font Family Selector */}
            <div>
              <span className="text-[10px] font-mono text-neutral-600 block mb-1">Font Family</span>
              <select
                value={activeProfile.font_family}
                onChange={(e) => {
                  if (activeProfile.id) {
                    terminalSettingsStore.updateProfile(activeProfile.id, { font_family: e.target.value });
                  }
                }}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs text-neutral-300 focus:outline-none focus:border-orange-500"
              >
                {MONOSPACE_FONTS.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Font Size Slider */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-600 mb-1">
                <span>Font Size</span>
                <span className="text-neutral-400">{activeProfile.font_size}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="24"
                value={activeProfile.font_size}
                onChange={(e) => {
                  if (activeProfile.id) {
                    terminalSettingsStore.updateProfile(activeProfile.id, { font_size: parseInt(e.target.value) });
                  }
                }}
                className="w-full accent-orange-500"
              />
            </div>

            {/* Line Height Slider */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-600 mb-1">
                <span>Line Height</span>
                <span className="text-neutral-400">{activeProfile.line_height}</span>
              </div>
              <input
                type="range"
                min="1"
                max="2"
                step="0.05"
                value={activeProfile.line_height}
                onChange={(e) => {
                  if (activeProfile.id) {
                    terminalSettingsStore.updateProfile(activeProfile.id, { line_height: parseFloat(e.target.value) });
                  }
                }}
                className="w-full accent-orange-500"
              />
            </div>

            {/* Letter Spacing Slider */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-600 mb-1">
                <span>Letter Spacing</span>
                <span className="text-neutral-400">{activeProfile.letter_spacing}px</span>
              </div>
              <input
                type="range"
                min="-2"
                max="4"
                step="0.5"
                value={activeProfile.letter_spacing}
                onChange={(e) => {
                  if (activeProfile.id) {
                    terminalSettingsStore.updateProfile(activeProfile.id, { letter_spacing: parseFloat(e.target.value) });
                  }
                }}
                className="w-full accent-orange-500"
              />
            </div>

            {/* Ligatures Toggles */}
            <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mt-2">
              <span>Enable Ligatures</span>
              <input
                type="checkbox"
                checked={activeProfile.enable_ligatures}
                onChange={(e) => {
                  if (activeProfile.id) {
                    terminalSettingsStore.updateProfile(activeProfile.id, { enable_ligatures: e.target.checked });
                  }
                }}
                className="accent-orange-500 rounded bg-neutral-950 border-neutral-800 focus:ring-0 focus:ring-offset-0"
              />
            </div>
          </div>

          <div className="h-px bg-neutral-800/60" />

          {/* Scrollback Limit */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-neutral-500 uppercase">Scrollback buffer</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1000"
                max="100000"
                value={activeProfile.scrollback_limit}
                onChange={(e) => {
                  if (activeProfile.id) {
                    terminalSettingsStore.updateProfile(activeProfile.id, { scrollback_limit: parseInt(e.target.value) || 10000 });
                  }
                }}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs text-neutral-300 focus:outline-none focus:border-orange-500"
              />
              <span className="text-[10px] font-mono text-neutral-600 uppercase">Lines</span>
            </div>
          </div>

          <div className="h-px bg-neutral-800/60" />

          {/* Keybindings Shortcut Reference */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono text-neutral-500 uppercase">Keyboard Shortcuts</label>
            <div className="space-y-1 bg-neutral-950 border border-neutral-800/60 p-2.5 rounded text-[10px] font-mono text-neutral-400">
              <div className="flex justify-between border-b border-neutral-800/40 pb-1">
                <span>New Tab</span>
                <span className="text-orange-500">Ctrl+Shift+T</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/40 py-1">
                <span>Close Tab</span>
                <span className="text-orange-500">Ctrl+Shift+W</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/40 py-1">
                <span>Switch Tab</span>
                <span className="text-orange-500">Ctrl+Tab</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800/40 py-1">
                <span>Copy Output</span>
                <span className="text-orange-500">Ctrl+Shift+C</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Paste Command</span>
                <span className="text-orange-500">Ctrl+V</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
              key={tabDataA.id}
              sessionId={tabDataA.sessionId}
              connectionId={tabDataA.connectionId}
              isActive={activeTabId === tabA}
              onTitleChange={(title) => handleTitleChange(tabA, title)}
              cwd={tabDataA.cwd}
            />
            <TerminalPane
              key={tabDataB.id}
              sessionId={tabDataB.sessionId}
              connectionId={tabDataB.connectionId}
              isActive={activeTabId === tabB}
              onTitleChange={(title) => handleTitleChange(tabB, title)}
              cwd={tabDataB.cwd}
            />
          </SplitContainer>
        );
      }
    }

    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return renderEmptyState();

    return (
      <TerminalPane
        key={activeTab.id}
        sessionId={activeTab.sessionId}
        connectionId={activeTab.connectionId}
        isActive={true}
        onTitleChange={(title) => handleTitleChange(activeTab.id, title)}
        cwd={activeTab.cwd}
        onOpenFile={(path) => handleTerminalOpenFile(activeTab.sessionId, path)}
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
            {/* Recent Quick Connections */}
            {quickConnectHistory.length > 0 && (
              <div className="border border-neutral-800/60 bg-neutral-950/40 rounded p-2">
                <span className="block text-[9px] font-mono text-neutral-500 uppercase tracking-wider mb-1.5">
                  Recent Quick Connections
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {quickConnectHistory.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuickHost(item.host);
                        setQuickPort(item.port);
                        setQuickUsername(item.username);
                        setQuickAuthMode(item.authMode);
                      }}
                      className="px-2 py-1 bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 hover:text-orange-400 rounded text-[10px] font-mono transition-all text-neutral-300"
                    >
                      {item.username}@{item.host}:{item.port}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {/* Import SSH Config */}
            <button
              onClick={() => {
                const fileInput = document.getElementById('ssh-config-file-input');
                fileInput?.click();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-600/10 transition-colors text-left border-b border-neutral-800/50 mb-1"
            >
              <Download size={14} className="text-orange-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-orange-400">Import SSH Config</div>
                <div className="text-[10px] font-mono text-neutral-600">
                  Load connections from ~/.ssh/config
                </div>
              </div>
            </button>
            <input
              id="ssh-config-file-input"
              type="file"
              accept=".config,config,*"
              style={{ display: 'none' }}
              onChange={handleImportSshConfig}
            />

            {/* Import from PuTTY/Termius/MobaXterm */}
            <button
              onClick={() => {
                const fileInput = document.getElementById('third-party-connections-import');
                fileInput?.click();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-600/10 transition-colors text-left border-b border-neutral-800/50 mb-1"
            >
              <Download size={14} className="text-orange-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-orange-400">Import Session Backup</div>
                <div className="text-[10px] font-mono text-neutral-600">
                  Import from PuTTY (.reg), MobaXterm (.mxtpro), or Termius (.json)
                </div>
              </div>
            </button>
            <input
              id="third-party-connections-import"
              type="file"
              accept=".reg,.mxtpro,.ini,.json"
              style={{ display: 'none' }}
              onChange={handleImportThirdPartyConnections}
            />

            {/* Export Connections */}
            <button
              onClick={handleExportConnections}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-600/10 transition-colors text-left border-b border-neutral-800/50 mb-1"
            >
              <Download size={14} className="text-orange-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-orange-400">Export Connections List</div>
                <div className="text-[10px] font-mono text-neutral-600">
                  Download connection templates as JSON
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

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] bg-neutral-950">
      {/* Sub-navigation bar */}
      <div className="flex bg-[#0d0e12] border-b border-neutral-900 px-4 py-2.5 gap-6 select-none shrink-0">
        <button
          onClick={() => setSubSection('terminals')}
          className={`text-[10px] font-bold uppercase tracking-widest font-mono transition-all pb-1 ${
            subSection === 'terminals' ? 'text-orange-500 border-b border-orange-500' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Active Terminals
        </button>
        <button
          onClick={() => setSubSection('portForwards')}
          className={`text-[10px] font-bold uppercase tracking-widest font-mono transition-all pb-1 ${
            subSection === 'portForwards' ? 'text-orange-500 border-b border-orange-500' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Port Forwarding
        </button>
        <button
          onClick={() => setSubSection('keys')}
          className={`text-[10px] font-bold uppercase tracking-widest font-mono transition-all pb-1 ${
            subSection === 'keys' ? 'text-orange-500 border-b border-orange-500' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          SSH Key Manager
        </button>
      </div>

      {subSection === 'terminals' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar + toolbar */}
          {tabs.length > 0 && (
            <>
              <TerminalTabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onSelectTab={setActiveTabId}
                onCloseTab={handleCloseTab}
                onNewTab={handleNewTab}
                onUpdateTabColor={handleUpdateTabColor}
                onRenameTab={handleRenameTab}
                onDuplicateTab={handleDuplicateTab}
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

                  {/* Server Monitor Panel Toggle */}
                  <button
                    onClick={() => setShowMonitorPanel(!showMonitorPanel)}
                    className={`p-1.5 transition-colors rounded ${showMonitorPanel ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={showMonitorPanel ? 'Hide Server Monitor' : 'Show Server Monitor'}
                    disabled={!activeTabId}
                  >
                    <Activity size={13} />
                  </button>

                  {/* Separator */}
                  <div className="w-px h-4 bg-neutral-800 mx-1" />

                  {/* Clear Scrollback */}
                  <button
                    onClick={() => {
                      const sid = getActiveSessionId();
                      if (sid) {
                        window.dispatchEvent(new CustomEvent('terminal:clear-buffer', { detail: { sessionId: sid } }));
                      }
                    }}
                    className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Clear Terminal Buffer"
                    disabled={!activeTabId}
                  >
                    <Trash size={13} />
                  </button>

                  {/* Export Output */}
                  <button
                    onClick={() => {
                      const sid = getActiveSessionId();
                      if (sid) {
                        window.dispatchEvent(new CustomEvent('terminal:export-log', { detail: { sessionId: sid, format: 'txt' } }));
                      }
                    }}
                    className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Export Scrollback to TXT"
                    disabled={!activeTabId}
                  >
                    <FileText size={13} />
                  </button>
                  <button
                    onClick={() => {
                      const sid = getActiveSessionId();
                      if (sid) {
                        window.dispatchEvent(new CustomEvent('terminal:export-log', { detail: { sessionId: sid, format: 'html' } }));
                      }
                    }}
                    className="p-1.5 text-neutral-500 hover:text-orange-500 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Export Scrollback to HTML"
                    disabled={!activeTabId}
                  >
                    <Download size={13} />
                  </button>

                  {/* Separator */}
                  <div className="w-px h-4 bg-neutral-800 mx-1" />

                  {/* Settings Gear */}
                  <button
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    className={`p-1.5 transition-colors rounded ${showSettingsPanel ? 'text-orange-500 bg-neutral-800' : 'text-neutral-500 hover:text-orange-500 hover:bg-neutral-800'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Terminal Settings"
                    disabled={!activeTabId}
                  >
                    <Settings size={13} />
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
          <div className="flex-1 overflow-hidden flex relative">
            <div className="flex-1 h-full overflow-hidden relative">
              {showSftpPanel && tabs.length > 0 && getActiveSessionId() ? (
                <SplitContainer direction="horizontal" initialRatio={0.25}>
                  <SftpFileBrowser
                    sessionId={getActiveSessionId()!}
                    connectionId={activeTab?.connectionId}
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
                  {showMonitorPanel ? (
                    <SplitContainer direction="horizontal" initialRatio={0.7}>
                      {renderTerminalArea()}
                      <ServerMonitorPanel
                        sessionId={getActiveSessionId()!}
                        connectionId={activeTab?.connectionId}
                      />
                    </SplitContainer>
                  ) : (
                    renderTerminalArea()
                  )}
                </SplitContainer>
              ) : showMonitorPanel && tabs.length > 0 && getActiveSessionId() ? (
                <SplitContainer direction="horizontal" initialRatio={0.75}>
                  {renderTerminalArea()}
                  <ServerMonitorPanel
                    sessionId={getActiveSessionId()!}
                    connectionId={activeTab?.connectionId}
                  />
                </SplitContainer>
              ) : (
                renderTerminalArea()
              )}
            </div>
            {showSettingsPanel && (
              <div className="w-80 h-full border-l border-neutral-800 bg-neutral-900/90 backdrop-blur-md z-30 flex flex-col animate-in slide-in-from-right duration-200">
                {renderSettingsDrawer()}
              </div>
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
      ) : subSection === 'portForwards' ? (
        <div className="flex-1 overflow-auto p-6 bg-[#090a0f]">
          <PortForwardDashboard />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 bg-[#090a0f]">
          <SSHKeyManager />
        </div>
      )}
    </div>
  );
};

// Helper Interfaces and parsing functions for connection imports
interface ConnectionImportTemplate {
  name: string;
  server: string;
  port: number;
  username: string;
}

const parsePuTTYReg = (text: string): ConnectionImportTemplate[] => {
  const sessions: ConnectionImportTemplate[] = [];
  const blocks = text.split(/\[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\/gi);
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split(/\r?\n/);
    const sessionNameRaw = lines[0].replace(/\]/g, '').trim();
    const sessionName = decodeURIComponent(sessionNameRaw);
    
    let host = '';
    let port = 22;
    let username = 'root';
    
    for (const line of lines) {
      if (line.startsWith('"HostName"=')) {
        host = line.split('=')[1].replace(/"/g, '').trim();
      } else if (line.startsWith('"PortNumber"=')) {
        const hex = line.split('dword:')[1]?.trim();
        if (hex) {
          port = parseInt(hex, 16) || 22;
        }
      } else if (line.startsWith('"UserName"=')) {
        username = line.split('=')[1].replace(/"/g, '').trim();
      }
    }
    
    if (host) {
      sessions.push({ name: sessionName, server: host, port, username });
    }
  }
  return sessions;
};

const parseMobaXterm = (text: string): ConnectionImportTemplate[] => {
  const sessions: ConnectionImportTemplate[] = [];
  const lines = text.split(/\r?\n/);
  
  let currentSession: Partial<ConnectionImportTemplate> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      if (currentSession.server) {
        sessions.push({
          name: currentSession.name || currentSession.server,
          server: currentSession.server,
          port: currentSession.port || 22,
          username: currentSession.username || 'root'
        });
      }
      currentSession = { name: trimmed.slice(1, -1) };
    } else if (trimmed.includes('=')) {
      const [key, ...valParts] = trimmed.split('=');
      const val = valParts.join('=').trim();
      if (key.toLowerCase() === 'address') {
        currentSession.server = val;
      } else if (key.toLowerCase() === 'port') {
        currentSession.port = parseInt(val) || 22;
      } else if (key.toLowerCase() === 'username') {
        currentSession.username = val;
      } else if (key.toLowerCase() === 'title') {
        currentSession.name = val;
      }
    }
  }
  
  if (currentSession.server) {
    sessions.push({
      name: currentSession.name || currentSession.server,
      server: currentSession.server,
      port: currentSession.port || 22,
      username: currentSession.username || 'root'
    });
  }
  return sessions;
};

const parseTermius = (data: any): ConnectionImportTemplate[] => {
  const sessions: ConnectionImportTemplate[] = [];
  
  const extractFromObject = (obj: any) => {
    if (Array.isArray(obj)) {
      obj.forEach(extractFromObject);
      return;
    }
    
    if (obj && typeof obj === 'object') {
      const host = obj.address || obj.hostname || obj.host || obj.ip;
      if (host && typeof host === 'string') {
        sessions.push({
          name: obj.label || obj.name || host,
          server: host,
          port: parseInt(obj.port) || 22,
          username: obj.username || obj.user || 'root'
        });
      }
      
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') {
          extractFromObject(obj[key]);
        }
      }
    }
  };
  
  extractFromObject(data);
  return sessions;
};

export default TerminalView;
