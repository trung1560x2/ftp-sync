import React from 'react';
import { Trash2, X } from 'lucide-react';

interface LogsPanelProps {
  consoleContainerRef: React.RefObject<HTMLDivElement>;
  logs: any[];
  handleClearLogs: () => void;
  setShowLogs: (show: boolean) => void;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({
  consoleContainerRef,
  logs,
  handleClearLogs,
  setShowLogs
}) => {
  return (
    <div className="border-t border-neutral-800/60 bg-[#0d0e12]/85 flex flex-col h-64 select-none shrink-0 animate-in slide-in-from-bottom duration-250">
      {/* Terminal Header */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-800/60 bg-[#0d0e12]/40">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
          <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest font-outfit">
            SYNC ACTIVITY CONSOLE // LIVE ACTIVITY LOG
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-900/40 bg-neutral-900/60 transition-colors uppercase tracking-wider rounded-md cursor-pointer"
            title="Clear Log History"
          >
            <Trash2 size={11} />
            Clear
          </button>
          <button
            onClick={() => setShowLogs(false)}
            className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-250 transition-colors border border-neutral-800 rounded-md cursor-pointer"
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
              [{new Date(log.created_at || log.timestamp || Date.now()).toLocaleTimeString()}]
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
  );
};
