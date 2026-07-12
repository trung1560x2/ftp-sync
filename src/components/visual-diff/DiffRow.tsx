import React from 'react';
import { Folder, File, Eye, Upload, Download } from 'lucide-react';
import { DiffItem } from '../VisualDiffModal';

interface DiffRowProps {
  item: DiffItem;
  currentPath: string;
  selectedItems: Set<string>;
  toggleSelection: (name: string) => void;
  processing: string | null;
  setContentDiffFile: (val: { remotePath: string; fileName: string; status?: string }) => void;
  handleSyncItem: (item: DiffItem, direction: 'upload' | 'download') => void;
  handleFolderSync: (item: DiffItem, direction: 'upload' | 'download') => void;
  fetchDiff: (path?: string) => void;
  formatSize: (size: number) => string;
  getStatusColor: (status: string) => string;
  getStatusIcon: (item: DiffItem) => React.ReactNode;
}

export const DiffRow: React.FC<DiffRowProps> = ({
  item,
  currentPath,
  selectedItems,
  toggleSelection,
  processing,
  setContentDiffFile,
  handleSyncItem,
  handleFolderSync,
  fetchDiff,
  formatSize,
  getStatusColor,
  getStatusIcon
}) => {
  return (
    <div className={`grid grid-cols-12 gap-0 hover:bg-[#161922]/50 hover:border-neutral-800/40 border-b border-neutral-800/30 transition-all duration-150 group h-full items-center ${item.isDirectory ? 'bg-[#161922]/10' : ''}`}>
      {/* Local Side */}
      <div className="col-span-4 p-3 flex items-center border-r border-neutral-800/40 overflow-hidden">
        <input
          type="checkbox"
          className="mr-3 rounded border-neutral-800 bg-[#0d0e12]/40 text-orange-500 focus:ring-0 h-4 w-4 cursor-pointer"
          checked={selectedItems.has(item.name)}
          onChange={() => toggleSelection(item.name)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex items-center min-w-0 flex-1">
          {item.isDirectory ? (
            <div className="relative mr-3 flex-shrink-0">
              <Folder size={14} className="text-amber-500" />
              {item.containsChanges && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full border border-[#161922]"></span>
              )}
            </div>
          ) : (
            <File size={14} className={`mr-3 flex-shrink-0 ${!item.local ? 'text-neutral-700' : 'text-neutral-400'}`} />
          )}
          <div className="truncate min-w-0 flex-1">
            <div className={`truncate text-xs ${!item.local ? 'text-neutral-600 italic' : 'text-neutral-200 font-semibold group-hover:text-orange-400 transition-colors uppercase'}`}>
              {item.name}
            </div>
            {item.local && !item.isDirectory && (
              <div className="text-[9px] text-neutral-500 font-mono mt-0.5 uppercase">
                {formatSize(item.local.size)} • {new Date(item.local.modifiedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Status */}
      <div className="col-span-4 p-2 flex flex-col justify-center items-center border-r border-neutral-800/40 bg-[#0d0e12]/10">
        <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full mb-1 flex items-center ${getStatusColor(item.status)}`}>
          {getStatusIcon(item)}
          {item.containsChanges && <span className="ml-1 text-orange-500 font-extrabold uppercase">[Sub Modified]</span>}
        </span>

        {/* Action Buttons */}
        <div className="flex space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-150">
          {!item.isDirectory && (
            <>
              {item.remote && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const remotePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
                    setContentDiffFile({ remotePath, fileName: item.name, status: item.status });
                  }}
                  disabled={!!processing}
                  title="Compare Content"
                  className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-orange-400 hover:bg-neutral-900 transition-colors cursor-pointer"
                >
                  <Eye size={12} />
                </button>
              )}

              {item.status !== 'synchronized' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSyncItem(item, 'upload'); }}
                    disabled={!!processing || item.status === 'missing_local'}
                    title="Upload to Remote"
                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-orange-500 hover:bg-neutral-900 disabled:opacity-20 transition-colors cursor-pointer"
                  >
                    <Upload size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSyncItem(item, 'download'); }}
                    disabled={!!processing || item.status === 'missing_remote'}
                    title="Download to Local"
                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-900 disabled:opacity-20 transition-colors cursor-pointer"
                  >
                    <Download size={12} />
                  </button>
                </>
              )}
            </>
          )}

          {/* Directory Actions */}
          {item.isDirectory && (
            <div className="flex items-center space-x-1">
              <button
                onClick={() => fetchDiff(currentPath === '/' ? item.name : `${currentPath}/${item.name}`)}
                className="bg-[#0d0e12]/60 border border-neutral-800 px-3 py-1 rounded-lg text-[10px] font-bold text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 mr-1.5 uppercase transition-colors cursor-pointer"
              >
                Open
              </button>

              {item.status !== 'synchronized' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleFolderSync(item, 'upload'); }}
                    disabled={!!processing || item.status === 'missing_local'}
                    title="Recursively Upload"
                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-orange-500 disabled:opacity-20 transition-colors cursor-pointer"
                  >
                    <Upload size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleFolderSync(item, 'download'); }}
                    disabled={!!processing || item.status === 'missing_remote'}
                    title="Recursively Download"
                    className="p-1.5 rounded-lg border border-neutral-800 bg-[#0d0e12]/60 text-neutral-400 hover:text-emerald-400 disabled:opacity-20 transition-colors cursor-pointer"
                  >
                    <Download size={12} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Remote Side */}
      <div className="col-span-4 p-3 flex items-center justify-end overflow-hidden">
        <div className="flex items-center min-w-0 justify-end flex-1 pr-1">
          <div className="truncate min-w-0 flex-1 text-right">
            <div className={`truncate text-xs ${!item.remote ? 'text-neutral-600 italic' : 'text-neutral-200 font-semibold group-hover:text-orange-400 transition-colors uppercase'}`}>
              {item.name}
            </div>
            {item.remote && !item.isDirectory && (
              <div className="text-[9px] text-neutral-500 font-mono mt-0.5 uppercase">
                {formatSize(item.remote.size)} • {new Date(item.remote.modifiedAt).toLocaleDateString()}
              </div>
            )}
          </div>
          {item.isDirectory ? (
            <Folder size={14} className="text-amber-500 ml-3 flex-shrink-0" />
          ) : (
            <File size={14} className={`ml-3 flex-shrink-0 ${!item.remote ? 'text-neutral-700' : 'text-neutral-400'}`} />
          )}
        </div>
      </div>
    </div>
  );
};
