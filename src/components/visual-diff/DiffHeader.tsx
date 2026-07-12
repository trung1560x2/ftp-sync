import React from 'react';
import { RefreshCw, Search, X, Upload, Download, Sparkles, Terminal } from 'lucide-react';

interface DiffHeaderProps {
  loading: boolean;
  serverName: string;
  isSyncing: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedItemsSize: number;
  handleBulkSync: (direction: 'upload' | 'download') => void;
  pendingCount: number;
  handleSendQueue: () => void;
  recursive: boolean;
  setRecursive: (r: boolean) => void;
  showCopilot: boolean;
  handleToggleCopilot: () => void;
  showLogs: boolean;
  handleToggleLogs: () => void;
  copilotLoading: boolean;
  fetchDiff: () => void;
  onClose: () => void;
}

export const DiffHeader: React.FC<DiffHeaderProps> = ({
  loading,
  serverName,
  isSyncing,
  searchQuery,
  setSearchQuery,
  selectedItemsSize,
  handleBulkSync,
  pendingCount,
  handleSendQueue,
  recursive,
  setRecursive,
  showCopilot,
  handleToggleCopilot,
  showLogs,
  handleToggleLogs,
  copilotLoading,
  fetchDiff,
  onClose
}) => {
  return (
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
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-neutral-505 hover:text-neutral-300 transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {selectedItemsSize > 0 && (
          <div className="flex items-center gap-2 animate-fadeIn">
            <button
              onClick={() => handleBulkSync('upload')}
              className="bg-orange-600 hover:bg-orange-500 text-black border border-orange-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider flex items-center shadow-md shadow-orange-950/20 cursor-pointer"
            >
              <Upload size={12} className="mr-1.5 stroke-[2.5]" />
              Upload ({selectedItemsSize})
            </button>
            <button
              onClick={() => handleBulkSync('download')}
              className="bg-[#0d0e12]/60 hover:bg-[#0d0e12] border border-emerald-900/40 hover:border-emerald-800 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider flex items-center shadow-md cursor-pointer"
            >
              <Download size={12} className="mr-1.5 stroke-[2.5]" />
              Download ({selectedItemsSize})
            </button>
          </div>
        )}

        {pendingCount > 0 && (
          <button
            onClick={handleSendQueue}
            className="bg-amber-600 hover:bg-amber-500 text-black border border-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider flex items-center animate-pulse cursor-pointer"
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
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider select-none cursor-pointer ${
            showCopilot 
              ? 'bg-emerald-500 text-black border-emerald-600 shadow-lg shadow-emerald-500/20 font-extrabold' 
              : 'bg-[#0d0e12]/40 text-neutral-400 border-neutral-800 hover:bg-[#0d0e12]/80 hover:text-emerald-400'
          }`}
          title="AI Explains Changes"
        >
          <Sparkles size={13} className={copilotLoading ? 'animate-spin' : ''} />
          AI Copilot
        </button>
        <button
          onClick={handleToggleLogs}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all duration-150 uppercase tracking-wider select-none cursor-pointer ${
            showLogs 
              ? 'bg-orange-600 text-black border-orange-700 shadow-lg shadow-orange-600/20 font-extrabold' 
              : 'bg-[#0d0e12]/40 text-neutral-400 border-neutral-800 hover:bg-[#0d0e12]/80 hover:text-neutral-200'
          }`}
          title="Toggle Activity Log"
        >
          <Terminal size={13} />
          Logs
        </button>
        <button
          onClick={fetchDiff}
          disabled={loading}
          className="p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-250 transition-colors rounded-lg disabled:opacity-50 cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-red-400 transition-colors rounded-lg cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
