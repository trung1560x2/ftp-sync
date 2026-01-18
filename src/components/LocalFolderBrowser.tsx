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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg h-[600px] flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
          <h3 className="font-semibold text-gray-800">Browse Local Folder</h3>
          <button onClick={onClose}><X size={20} className="text-gray-500" /></button>
        </div>

        <div className="p-3 border-b border-gray-100 flex gap-2">
           <select 
             className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
             onChange={handleDriveChange}
             value={drives.find(d => currentPath.startsWith(d.name))?.path || ''}
           >
             {drives.map(d => (
               <option key={d.name} value={d.path}>{d.description}</option>
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
               className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm bg-white text-gray-700"
               value={currentPath}
               onChange={(e) => setCurrentPath(e.target.value)}
               placeholder="Enter path..."
             />
             <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
               Go
             </button>
           </form>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
           {loading ? (
             <div className="text-center py-10 text-gray-400">Loading...</div>
           ) : (
             <ul className="space-y-1">
               {/* Parent Directory Link */}
               {currentPath.length > 3 && (
                   <li>
                     <button 
                       onClick={() => {
                          // Naive parent implementation
                          const sep = currentPath.includes('\\') ? '\\' : '/';
                          const parent = currentPath.substring(0, currentPath.lastIndexOf(sep));
                          // Handle C:\ vs C:\Folder
                          const target = parent.endsWith(':') ? parent + sep : (parent || sep);
                          fetchDir(target);
                       }}
                       className="w-full flex items-center p-2 rounded hover:bg-gray-100 text-left text-gray-600"
                     >
                       <ArrowLeft size={16} className="mr-2" /> .. (Parent)
                     </button>
                   </li>
               )}
               
               {folders.map((folder, i) => (
                 <li key={i}>
                   <button
                     onClick={() => fetchDir(folder.path)}
                     className="w-full flex items-center p-2 rounded hover:bg-blue-50 text-left group"
                   >
                     <Folder size={18} className="text-yellow-500 mr-3 flex-shrink-0" />
                     <span className="truncate text-sm text-gray-700">{folder.name}</span>
                   </button>
                 </li>
               ))}
               {folders.length === 0 && (
                 <div className="text-center py-10 text-gray-400 text-sm">Empty folder</div>
               )}
             </ul>
           )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex justify-end">
           <button 
             onClick={onClose}
             className="px-4 py-2 mr-2 text-sm text-gray-600 hover:text-gray-800"
           >
             Cancel
           </button>
           <button 
             onClick={() => onSelect(currentPath)}
             className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center"
           >
             <Check size={16} className="mr-2" /> Select This Folder
           </button>
        </div>
      </div>
    </div>
  );
};

export default LocalFolderBrowser;
