import { useState, useEffect } from 'react';
import { TerminalTab } from '../components/terminal/TerminalTabBar';

export interface TerminalProfile {
  id?: number;
  name: string;
  theme: string;
  font_family: string;
  font_size: number;
  line_height: number;
  letter_spacing: number;
  enable_ligatures: boolean;
  scrollback_limit: number;
  custom_keybindings: Record<string, string>;
  is_default: boolean;
}

export const TERMINAL_THEMES: Record<string, {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}> = {
  omnisync_hud: {
    name: 'OmniSync HUD',
    background: '#0f172a',
    foreground: '#38bdf8',
    cursor: '#38bdf8',
    black: '#020617',
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#ec4899',
    cyan: '#06b6d4',
    white: '#f8fafc'
  },
  dracula: {
    name: 'Dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2'
  },
  solarized_dark: {
    name: 'Solarized Dark',
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5'
  },
  monokai: {
    name: 'Monokai',
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2'
  },
  nord: {
    name: 'Nord',
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0'
  },
  gruvbox_dark: {
    name: 'Gruvbox Dark',
    background: '#282828',
    foreground: '#ebdbb2',
    cursor: '#ebdbb2',
    black: '#282828',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#a89984'
  },
  tokyo_night: {
    name: 'Tokyo Night',
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6'
  },
  catppuccin_mocha: {
    name: 'Catppuccin Mocha',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#cba6f7',
    cyan: '#89dceb',
    white: '#bac2de'
  },
  one_dark: {
    name: 'One Dark',
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#d19a66',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf'
  },
  github_dark: {
    name: 'Github Dark',
    background: '#24292e',
    foreground: '#e1e4e8',
    cursor: '#c8e1ff',
    black: '#24292e',
    red: '#f97583',
    green: '#85e89d',
    yellow: '#ffea7f',
    blue: '#79b8ff',
    magenta: '#b392f0',
    cyan: '#73e3ff',
    white: '#e1e4e8'
  }
};

export const MONOSPACE_FONTS = [
  { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace' },
  { name: 'Fira Code', family: '"Fira Code", monospace' },
  { name: 'Source Code Pro', family: '"Source Code Pro", monospace' },
  { name: 'Consolas', family: 'Consolas, monospace' },
  { name: 'Courier New', family: '"Courier New", monospace' }
];

const DEFAULT_PROFILE: TerminalProfile = {
  name: 'Default Profile',
  theme: 'omnisync_hud',
  font_family: 'JetBrains Mono',
  font_size: 12,
  line_height: 1.2,
  letter_spacing: 0,
  enable_ligatures: true,
  scrollback_limit: 10000,
  custom_keybindings: {},
  is_default: true
};

// Simple global listener implementation to act as a reactive Zustand-like store
type Listener = () => void;
let listeners: Listener[] = [];
let profiles: TerminalProfile[] = [];
let activeProfile: TerminalProfile = DEFAULT_PROFILE;
let hoveredTheme: string | null = null;
let isLoading = false;
let error: string | null = null;

const token = localStorage.getItem('token');

const notify = () => {
  listeners.forEach(l => l());
};

export const terminalSettingsStore = {
  subscribe(listener: Listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  getState() {
    return {
      profiles,
      activeProfile,
      hoveredTheme,
      isLoading,
      error
    };
  },

  setHoveredTheme(theme: string | null) {
    hoveredTheme = theme;
    notify();
  },

  async fetchProfiles() {
    isLoading = true;
    error = null;
    notify();

    try {
      const res = await fetch('/api/terminal-config/profiles', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        profiles = data.profiles;
        const foundDefault = profiles.find(p => p.is_default);
        if (foundDefault) {
          activeProfile = foundDefault;
        } else if (profiles.length > 0) {
          activeProfile = profiles[0];
        } else {
          activeProfile = DEFAULT_PROFILE;
        }
      } else {
        error = data.error;
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      isLoading = false;
      notify();
    }
  },

  async createProfile(profile: Omit<TerminalProfile, 'id'>) {
    try {
      const res = await fetch('/api/terminal-config/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProfiles();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      error = err.message;
      notify();
      throw err;
    }
  },

  async updateProfile(id: number, updates: Partial<TerminalProfile>) {
    try {
      const res = await fetch(`/api/terminal-config/profiles/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProfiles();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      error = err.message;
      notify();
      throw err;
    }
  },

  async deleteProfile(id: number) {
    try {
      const res = await fetch(`/api/terminal-config/profiles/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchProfiles();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      error = err.message;
      notify();
      throw err;
    }
  },

  async selectProfile(profile: TerminalProfile) {
    activeProfile = profile;
    notify();
  },

  async fetchSavedTabs(): Promise<TerminalTab[]> {
    try {
      const res = await fetch('/api/terminal-config/tabs', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.tabs)) {
        return data.tabs.map((t: any) => ({
          id: t.id,
          sessionId: '', // Empty on restore, will reconnect
          connectionId: t.connectionId,
          title: t.title,
          isConnected: false,
          cwd: t.cwd,
          color: t.color
        }));
      }
      return [];
    } catch (err) {
      console.error('Failed to fetch saved tabs:', err);
      return [];
    }
  },

  async syncTabs(tabs: TerminalTab[]) {
    try {
      await fetch('/api/terminal-config/tabs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ tabs })
      });
    } catch (err) {
      console.error('Failed to sync tabs to backend:', err);
    }
  }
};

// React hook to access terminal config store state
export function useTerminalSettings() {
  const [state, setState] = useState(terminalSettingsStore.getState());

  useEffect(() => {
    const unsubscribe = terminalSettingsStore.subscribe(() => {
      setState(terminalSettingsStore.getState());
    });
    // Initial fetch if profiles is empty
    if (profiles.length === 0 && !isLoading) {
      terminalSettingsStore.fetchProfiles();
    }
    return unsubscribe;
  }, []);

  return state;
}
