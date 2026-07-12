import { create } from 'zustand';

export interface Connection {
  id: number;
  name: string;
  server: string;
  port: number;
  username: string;
  target_directory?: string;
  local_path?: string;
  sync_mode?: string;
  secure?: number;
  protocol?: 'ftp' | 'sftp';
  [key: string]: any;
}

interface ConnectionsState {
  connections: Connection[];
  loading: boolean;
  error: string | null;
  fetchConnections: () => Promise<void>;
  deleteConnection: (id: number) => Promise<boolean>;
  setConnections: (connections: Connection[]) => void;
}

export const useConnectionsStore = create<ConnectionsState>((set) => ({
  connections: [],
  loading: false,
  error: null,

  setConnections: (connections) => set({ connections }),

  fetchConnections: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/ftp-connections');
      const data = await response.json();
      // Handle both raw arrays and nested lists
      if (Array.isArray(data)) {
        set({ connections: data, loading: false });
      } else if (data.success && Array.isArray(data.connections)) {
        set({ connections: data.connections, loading: false });
      } else {
        set({ connections: [], loading: false });
      }
    } catch (e: any) {
      set({ error: e.message || 'Failed to fetch connections', loading: false });
    }
  },

  deleteConnection: async (id: number) => {
    try {
      const res = await fetch(`/api/ftp-connections/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
        }));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to delete connection:', e);
      return false;
    }
  }
}));
