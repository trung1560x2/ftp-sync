import React, { useState, useEffect } from 'react';
import { X, Folder, HardDrive, ArrowLeft, Check } from 'lucide-react';

interface Props {
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface Drive {
  name: string;
  description: string;
  path: string;
}

interface FolderItem {
  name: string;
  path: string;
}

const LocalFolderBrowser: React.FC<Props> = ({ onSelect, onClose }) => {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDrives();
  }, []);

  // When drives loaded, default to C: or first drive
  useEffect(() => {
    if (drives.length > 0 && !currentPath) {
        fetchDir(drives[0].path);
    }
  }, [drives]);

  const fetchDrives = async () => {
    try {
      const res = await fetch('/api/system/drives');
      const data = await res.json();
      setDrives(data.drives || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDir = async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/list-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await res.json();
      if (data.currentPath) {
         setCurrentPath(data.currentPath);
         setFolders(data.folders || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDriveChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
     fetchDir(e.target.value);
  };

  const handleParent = () => {
     // Simple parent logic for Windows/Unix
     // Or rely on backend 'parentPath' if we stored it
     // But backend API returns parentPath, let's use it if we can
     // For now, let's re-fetch parent by splitting string or backend call
     // Re-fetching current dir actually returns parentPath in response, but we didn't store it in state
     // Let's just use ".." logic or simple string manipulation
     // Actually, let's improve fetchDir to store parentPath if needed, or just use string manipulation
     
     // Quick fix: use backend response if we had it, but we didn't store it. 
     // Let's assume standard path separator.
     const separator = currentPath.includes('\\') ? '\\' : '/';
     const parts = currentPath.split(separator).filter(Boolean);
     parts.pop();
     const parent = parts.join(separator) + (separator === '\\' ? '\\' : '/'); 
     // Windows Root case: "C:\" -> split -> ["C:"] -> pop -> empty -> join -> "\" (Wrong)
     // Correct: if length is 1 (e.g. "C:"), don't pop?
     
     // Better: Call backend with parent directory logic?
     // Or just click "Back" button calls fetchDir with ".." relative? No, backend expects absolute.
     
     // Let's just reload Drives if we go too far up?
     // For now, let's rely on string manipulation for simplicity
     if (currentPath.endsWith(':\\') || currentPath === '/') {
         return; // Can't go up from root
     }
     // Use backend parentPath from previous response would be best. 
     // Let's update state to store parentPath.
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg h-[600px] flex flex-col rounded-none text-neutral-200 font-mono">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
          <h3 className="font-bold text-xs uppercase tracking-widest text-neutral-100 flex items-center gap-2">
            <span className="w-1.5 h-3 bg-orange-500 block animate-signal"></span>
            Browse Local Folder
          </h3>
          <button onClick={onClose}><X size={16} className="text-neutral-500 hover:text-neutral-300 transition-colors" /></button>
        </div>

        <div className="p-3 border-b border-neutral-850 flex gap-2 bg-neutral-900/50">
           <select 
             className="border border-neutral-800 px-2 py-1 text-xs bg-neutral-950 text-neutral-300 focus:outline-none focus:border-orange-500 font-mono rounded-none uppercase cursor-pointer"
             onChange={handleDriveChange}
             value={drives.find(d => currentPath.startsWith(d.name))?.path || ''}
           >
             {drives.map(d => (
               <option key={d.name} value={d.path} className="bg-neutral-950">{d.description}</option>
             ))}
           </select>
           <form 
             className="flex-1 flex gap-2"
             onSubmit={(e) => {
               e.preventDefault();
               fetchDir(currentPath);
             }}
           >
             <input 
               type="text" 
               className="flex-1 bg-neutral-950 border border-neutral-850 rounded-none px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
               value={currentPath}
               onChange={(e) => setCurrentPath(e.target.value)}
               placeholder="ENTER_ABSOLUTE_PATH..."
             />
             <button type="submit" className="bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 px-3 py-1 rounded-none text-xs font-bold uppercase transition-colors">
               Go
             </button>
           </form>
         </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-neutral-950/20">
           {loading ? (
             <div className="text-center py-10 text-neutral-600 text-xs">LOADING_DIRECTORIES...</div>
           ) : (
             <ul className="space-y-1">
               {/* Parent Directory Link */}
               {currentPath.length > 3 && (
                   <li>
                     <button 
                       onClick={() => {
                          const sep = currentPath.includes('\\') ? '\\' : '/';
                          const parent = currentPath.substring(0, currentPath.lastIndexOf(sep));
                          const target = parent.endsWith(':') ? parent + sep : (parent || sep);
                          fetchDir(target);
                       }}
                       className="w-full flex items-center p-2 hover:bg-neutral-850/40 text-left text-neutral-400 text-xs border border-transparent hover:border-neutral-800 transition-all rounded-none"
                     >
                       <ArrowLeft size={14} className="mr-2" /> .. (PARENT_DIR)
                     </button>
                   </li>
               )}
               
               {folders.map((folder, i) => (
                 <li key={i}>
                   <button
                     onClick={() => fetchDir(folder.path)}
                     className="w-full flex items-center p-2 hover:bg-neutral-850/40 text-left text-neutral-300 text-xs border border-transparent hover:border-neutral-800 transition-all rounded-none"
                   >
                     <Folder size={14} className="text-orange-500 mr-3 flex-shrink-0" />
                     <span className="truncate">{folder.name}</span>
                   </button>
                 </li>
               ))}
               {folders.length === 0 && (
                 <div className="text-center py-10 text-neutral-650 text-xs">EMPTY_DIRECTORY</div>
               )}
             </ul>
           )}
        </div>

        <div className="p-4 border-t border-neutral-850 bg-neutral-950 flex justify-end">
           <button 
             onClick={onClose}
             className="px-4 py-2 mr-2.5 text-xs text-neutral-400 hover:text-neutral-200 uppercase font-bold"
           >
             Cancel
           </button>
           <button 
             onClick={() => onSelect(currentPath)}
             className="px-4 py-2 text-xs font-bold text-black bg-orange-600 border border-orange-700 hover:bg-orange-500 rounded-none flex items-center uppercase tracking-wider transition-colors"
           >
             <Check size={14} className="mr-1.5 stroke-[2.5]" /> Select Folder
           </button>
        </div>
      </div>
    </div>
  );
};

export default LocalFolderBrowser;
