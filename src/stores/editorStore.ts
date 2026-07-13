import { create } from 'zustand';

export interface RecentFile {
  connectionId: number;
  path: string;
  name: string;
  timestamp: number;
}

export interface EditorTab {
  connectionId: number;
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface EditorState {
  recentFiles: RecentFile[];
  openTabs: EditorTab[];
  activeTab: { connectionId: number; path: string } | null;
  addRecentFile: (connectionId: number, path: string) => void;
  clearRecentFiles: () => void;
  openTab: (connectionId: number, path: string) => void;
  closeTab: (connectionId: number, path: string) => void;
  setActiveTab: (connectionId: number, path: string) => void;
  updateTabContent: (connectionId: number, path: string, content: string) => void;
  setTabOriginalContent: (connectionId: number, path: string, originalContent: string) => void;
  setTabClean: (connectionId: number, path: string) => void;
}

export const useEditorStore = create<EditorState>((set) => {
  const savedRecent = localStorage.getItem('recent_editor_files');
  const initialRecent: RecentFile[] = savedRecent ? JSON.parse(savedRecent) : [];

  return {
    recentFiles: initialRecent,
    openTabs: [],
    activeTab: null,
    
    addRecentFile: (connectionId, path) => {
      set((state) => {
        const name = path.split('/').pop() || 'file';
        const filtered = state.recentFiles.filter(
          (f) => !(f.connectionId === connectionId && f.path === path)
        );
        const newEntry: RecentFile = {
          connectionId,
          path,
          name,
          timestamp: Date.now()
        };
        const updated = [newEntry, ...filtered].slice(0, 10);
        localStorage.setItem('recent_editor_files', JSON.stringify(updated));
        return { recentFiles: updated };
      });
    },
    
    clearRecentFiles: () => {
      localStorage.removeItem('recent_editor_files');
      set({ recentFiles: [] });
    },

    openTab: (connectionId, path) => {
      set((state) => {
        const alreadyOpen = state.openTabs.some(
          (t) => t.connectionId === connectionId && t.path === path
        );
        
        if (alreadyOpen) {
          return { activeTab: { connectionId, path } };
        }

        const name = path.split('/').pop() || 'file';
        const newTab: EditorTab = {
          connectionId,
          path,
          name,
          content: '',
          originalContent: '',
          isDirty: false
        };

        return {
          openTabs: [...state.openTabs, newTab],
          activeTab: { connectionId, path }
        };
      });
    },

    closeTab: (connectionId, path) => {
      set((state) => {
        const remainingTabs = state.openTabs.filter(
          (t) => !(t.connectionId === connectionId && t.path === path)
        );
        
        let newActive = state.activeTab;
        if (state.activeTab && state.activeTab.connectionId === connectionId && state.activeTab.path === path) {
          newActive = remainingTabs.length > 0 
            ? { connectionId: remainingTabs[remainingTabs.length - 1].connectionId, path: remainingTabs[remainingTabs.length - 1].path }
            : null;
        }

        return {
          openTabs: remainingTabs,
          activeTab: newActive
        };
      });
    },

    setActiveTab: (connectionId, path) => {
      set({ activeTab: { connectionId, path } });
    },

    updateTabContent: (connectionId, path, content) => {
      set((state) => {
        const updatedTabs = state.openTabs.map((t) => {
          if (t.connectionId === connectionId && t.path === path) {
            return {
              ...t,
              content,
              isDirty: content !== t.originalContent
            };
          }
          return t;
        });
        return { openTabs: updatedTabs };
      });
    },

    setTabOriginalContent: (connectionId, path, originalContent) => {
      set((state) => {
        const updatedTabs = state.openTabs.map((t) => {
          if (t.connectionId === connectionId && t.path === path) {
            return {
              ...t,
              originalContent,
              content: t.isDirty ? t.content : originalContent,
              isDirty: t.isDirty && t.content !== originalContent
            };
          }
          return t;
        });
        return { openTabs: updatedTabs };
      });
    },

    setTabClean: (connectionId, path) => {
      set((state) => {
        const updatedTabs = state.openTabs.map((t) => {
          if (t.connectionId === connectionId && t.path === path) {
            return {
              ...t,
              originalContent: t.content,
              isDirty: false
            };
          }
          return t;
        });
        return { openTabs: updatedTabs };
      });
    }
  };
});
