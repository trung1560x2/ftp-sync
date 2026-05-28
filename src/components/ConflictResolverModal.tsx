import React, { useState } from 'react';
import { AlertTriangle, File, X, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  conflicts: string[];
  onResolve: (resolutions: { [filename: string]: 'overwrite' | 'skip' | 'rename' }) => void;
  onClose: () => void;
}

const ConflictResolverModal: React.FC<Props> = ({ isOpen, conflicts, onResolve, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [applyToAll, setApplyToAll] = useState(false);
  const [tempResolutions, setTempResolutions] = useState<{ [filename: string]: 'overwrite' | 'skip' | 'rename' }>({});

  if (!isOpen || conflicts.length === 0) return null;

  const currentFile = conflicts[currentIndex];

  const handleChoice = (choice: 'overwrite' | 'skip' | 'rename') => {
    if (applyToAll) {
      // Apply this choice to all remaining files
      const newResolutions = { ...tempResolutions };
      for (let i = currentIndex; i < conflicts.length; i++) {
        newResolutions[conflicts[i]] = choice;
      }
      onResolve(newResolutions);
      // Reset state
      setCurrentIndex(0);
      setApplyToAll(false);
      setTempResolutions({});
    } else {
      const newResolutions = { ...tempResolutions, [currentFile]: choice };
      setTempResolutions(newResolutions);

      if (currentIndex + 1 < conflicts.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // Finished all conflicts
        onResolve(newResolutions);
        // Reset state
        setCurrentIndex(0);
        setApplyToAll(false);
        setTempResolutions({});
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="bg-neutral-900 border border-red-500/30 w-full max-w-md flex flex-col rounded-none text-neutral-200 font-mono shadow-[0_0_30px_rgba(239,68,68,0.07)]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 bg-neutral-950">
          <h3 className="text-xs font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle size={14} className="animate-pulse" />
            Conflict Detected
          </h3>
          <button 
            onClick={() => {
              onClose();
              setCurrentIndex(0);
              setApplyToAll(false);
              setTempResolutions({});
            }} 
            className="p-1 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-950/20 border border-red-900/40 rounded-none flex items-center justify-center text-red-400 mb-4 animate-signal">
            <File size={22} />
          </div>

          <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
            Conflict {currentIndex + 1} of {conflicts.length}
          </p>
          
          <h4 className="text-xs font-bold text-neutral-100 truncate w-full max-w-sm px-4 select-all selection:bg-red-500 selection:text-black uppercase border border-neutral-800 bg-neutral-950/50 py-2.5 mb-5 font-mono">
            {currentFile}
          </h4>

          <p className="text-xs text-neutral-400 max-w-xs mb-6 uppercase leading-relaxed text-left border-l-2 border-orange-500/50 pl-3">
            A file or folder with this name already exists in the destination path. Choose how you want to proceed.
          </p>

          {/* Apply to All Checkbox */}
          {conflicts.length > 1 && (
            <label className="flex items-center gap-2.5 mb-6 text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer uppercase select-none group">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="w-3.5 h-3.5 border-neutral-800 bg-neutral-950 text-orange-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-orange-500 rounded-none"
              />
              <span className="group-hover:translate-x-0.5 transition-transform duration-200">
                Apply to all remaining conflicts
              </span>
            </label>
          )}

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-2">
            <button
              onClick={() => handleChoice('overwrite')}
              className="w-full py-2.5 bg-neutral-950 hover:bg-red-950/20 border border-neutral-800 hover:border-red-900/60 text-red-400 text-xs font-bold rounded-none uppercase transition-all tracking-wider active:scale-[0.98]"
            >
              Overwrite Existing File
            </button>
            <button
              onClick={() => handleChoice('rename')}
              className="w-full py-2.5 bg-neutral-950 hover:bg-orange-950/20 border border-neutral-800 hover:border-orange-900/60 text-orange-400 text-xs font-bold rounded-none uppercase transition-all tracking-wider active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={12} />
              Rename (Keep Both)
            </button>
            <button
              onClick={() => handleChoice('skip')}
              className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 text-xs font-bold rounded-none uppercase transition-all tracking-wider active:scale-[0.98]"
            >
              Skip File
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-850 bg-neutral-950/50 flex justify-end text-[9px] text-neutral-600 uppercase font-mono">
          FTP_SYNC_RESOLVER_SYS_ACTIVE
        </div>
      </div>
    </div>
  );
};

export default ConflictResolverModal;
