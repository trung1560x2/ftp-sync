import React, { useState, useRef, useCallback } from 'react';
import { X, Plus, Terminal, Circle } from 'lucide-react';

export interface TerminalTab {
  id: string;
  sessionId: string;
  connectionId: number;
  title: string;
  isConnected: boolean;
}

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

const TerminalTabBar: React.FC<TerminalTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab]
  );

  return (
    <div className="flex items-center bg-neutral-950 border-b border-neutral-800 h-9 select-none">
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
              draggable
              onDragStart={() => setDragTabId(tab.id)}
              onDragEnd={() => setDragTabId(null)}
              className={`
                group flex items-center gap-1.5 px-3 h-9 cursor-pointer
                border-r border-neutral-800 min-w-[120px] max-w-[200px]
                transition-colors duration-100
                ${isActive
                  ? 'bg-neutral-900 text-neutral-100 border-b-2 border-b-orange-500'
                  : 'bg-neutral-950 text-neutral-500 hover:bg-neutral-900/50 hover:text-neutral-300 border-b-2 border-b-transparent'
                }
                ${dragTabId === tab.id ? 'opacity-50' : ''}
              `}
            >
              {/* Connection status dot */}
              <Circle
                size={6}
                className={`flex-shrink-0 fill-current ${
                  tab.isConnected ? 'text-emerald-500' : 'text-neutral-600'
                }`}
              />

              {/* Tab icon */}
              <Terminal size={12} className="flex-shrink-0 text-neutral-500" />

              {/* Tab title */}
              <span className="text-[11px] font-mono truncate flex-1">
                {tab.title || `Terminal ${index + 1}`}
              </span>

              {/* Close button */}
              <button
                onClick={(e) => handleTabClose(e, tab.id)}
                className="flex-shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 transition-opacity"
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
    </div>
  );
};

export default TerminalTabBar;
