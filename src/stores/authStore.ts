import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  isOnboarded: boolean;
  checkingAuth: boolean;
  lockoutSec: number;
  error: string;
  loading: boolean;
  checkAuth: () => Promise<void>;
  register: (password: string) => Promise<boolean>;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setLockoutSec: (sec: number) => void;
  setError: (err: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Listen to 'unauthorized' custom events globally to reset state
  if (typeof window !== 'undefined') {
    window.addEventListener('unauthorized', () => {
      set({ isAuthenticated: false });
    });
  }

  return {
    isAuthenticated: false,
    isOnboarded: false,
    checkingAuth: true,
    lockoutSec: 0,
    error: '',
    loading: false,

    setLockoutSec: (sec) => set({ lockoutSec: sec }),
    setError: (err) => set({ error: err }),
    setLoading: (loading) => set({ loading }),

    checkAuth: async () => {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        
        if (data.success) {
          set({ isOnboarded: data.onboarded });
          
          if (data.onboarded) {
            const token = localStorage.getItem('master_token');
            if (token) {
              const verifyRes = await fetch('/api/auth/verify');
              const verifyData = await verifyRes.json();
              if (verifyData.success && verifyData.valid) {
                set({ isAuthenticated: true });
              } else {
                localStorage.removeItem('master_token');
                set({ isAuthenticated: false });
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to check authentication status:', e);
      } finally {
        set({ checkingAuth: false });
      }
    },

    register: async (password: string) => {
      set({ loading: true, error: '' });
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('master_token', data.token);
          set({ isAuthenticated: true, isOnboarded: true, loading: false });
          return true;
        } else {
          set({ error: data.error || 'Failed to complete setup', loading: false });
          return false;
        }
      } catch (err) {
        set({ error: 'Connection error. Server not reachable.', loading: false });
        return false;
      }
    },

    login: async (password: string) => {
      set({ loading: true, error: '' });
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        const data = await res.json();
        if (res.status === 429) {
          set({ lockoutSec: 30, error: data.error || 'Too many failed login attempts.', loading: false });
          return false;
        } else if (data.success && data.token) {
          localStorage.setItem('master_token', data.token);
          set({ isAuthenticated: true, loading: false });
          return true;
        } else {
          set({ error: data.error || 'Authentication failed', loading: false });
          return false;
        }
      } catch (err) {
        set({ error: 'Connection error. Server not reachable.', loading: false });
        return false;
      }
    },

    logout: async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {
        console.error('Logout request failed:', e);
      } finally {
        localStorage.removeItem('master_token');
        set({ isAuthenticated: false });
      }
    }
  };
});
