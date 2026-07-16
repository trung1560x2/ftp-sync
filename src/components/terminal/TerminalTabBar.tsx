import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Plus, Terminal, Circle } from 'lucide-react';

export interface TerminalTab {
  id: string;
  sessionId: string;
  connectionId: number;
  title: string;
  isConnected: boolean;
  cwd?: string;
  color?: string;
}

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onUpdateTabColor?: (tabId: string, color: string | undefined) => void;
  onRenameTab?: (tabId: string, newTitle: string) => void;
  onDuplicateTab?: (tabId: string) => void;
}

const TerminalTabBar: React.FC<TerminalTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onUpdateTabColor,
  onRenameTab,
  onDuplicateTab,
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({
      tabId,
      x: e.clientX,
      y: e.clientY
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (contextMenu) {
      window.addEventListener('click', closeContextMenu);
      return () => window.removeEventListener('click', closeContextMenu);
    }
  }, [contextMenu, closeContextMenu]);

  return (
    <div className="flex items-center bg-neutral-950 border-b border-neutral-800 h-9 select-none relative">
      {/* Tab list */}
      <div
        ref={tabsContainerRef}
        className="flex items-center flex-1 overflow-x-auto hide-scrollbar"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              draggable
              onDragStart={() => setDragTabId(tab.id)}
              onDragEnd={() => setDragTabId(null)}
              className={`
                group flex items-center gap-1.5 px-3 h-9 cursor-pointer
                border-r border-neutral-800 min-w-[120px] max-w-[200px]
                transition-colors duration-100
                ${isActive
                  ? 'bg-neutral-900 text-neutral-100 border-b-2'
                  : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-900/50 hover:text-neutral-300 border-b-2 border-b-transparent'
                }
                ${dragTabId === tab.id ? 'opacity-50' : ''}
              `}
              style={{
                borderBottomColor: isActive ? (tab.color || '#f97316') : 'transparent'
              }}
            >
              {/* Connection status dot */}
              <Circle
                size={6}
                className={`flex-shrink-0 fill-current ${
                  tab.isConnected ? 'text-emerald-500' : 'text-neutral-600'
                }`}
              />

              {/* Tab icon */}
              <Terminal
                size={12}
                className="flex-shrink-0"
                style={{ color: tab.color || '#737373' }}
              />

              {/* Tab title */}
              <span className="text-[11px] font-mono truncate flex-1">
                {tab.title || `Terminal ${index + 1}`}
              </span>

              {/* Close button */}
              <button
                onClick={(e) => handleTabClose(e, tab.id)}
                className="flex-shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 transition-opacity rounded"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* New tab button */}
      <button
        onClick={onNewTab}
        className="flex items-center justify-center w-9 h-9 text-neutral-500 hover:text-orange-500 hover:bg-neutral-900 transition-colors border-l border-neutral-800"
        title="New Terminal (Ctrl+Shift+T)"
      >
        <Plus size={14} />
      </button>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-neutral-900 border border-neutral-800 rounded shadow-lg py-1 text-xs text-neutral-300 min-w-[150px] font-mono"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-3 py-1.5 text-neutral-500 border-b border-neutral-800 font-bold uppercase tracking-wider text-[9px]">
            Tab Options
          </div>
          
          <button
            onClick={() => {
              const tabToRename = tabs.find(t => t.id === contextMenu.tabId);
              const newTitle = prompt('Enter new tab title:', tabToRename?.title || '');
              if (newTitle !== null) {
                onRenameTab?.(contextMenu.tabId, newTitle.trim() || 'Terminal');
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            Rename Tab...
          </button>
          
          <button
            onClick={() => {
              onDuplicateTab?.(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            Duplicate Connection
          </button>
          
          <div className="border-t border-neutral-800 my-1"></div>
          
          <div className="px-3 py-1 text-[10px] text-neutral-500 font-bold">
            Select Color:
          </div>
          <div className="grid grid-cols-6 gap-1 px-3 py-2">
            {[
              { name: 'none', value: undefined, class: 'bg-neutral-700 border border-neutral-500' },
              { name: 'red', value: '#ef4444', class: 'bg-red-500' },
              { name: 'emerald', value: '#10b981', class: 'bg-emerald-500' },
              { name: 'sky', value: '#0ea5e9', class: 'bg-sky-500' },
              { name: 'amber', value: '#f59e0b', class: 'bg-amber-500' },
              { name: 'purple', value: '#a855f7', class: 'bg-purple-500' }
            ].map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={() => onUpdateTabColor?.(contextMenu.tabId, color.value)}
                className={`w-4 h-4 rounded-full ${color.class} hover:scale-110 transition-transform`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TerminalTabBar;
