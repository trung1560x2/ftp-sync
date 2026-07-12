import { create } from 'zustand';

interface SettingsState {
  logRetentionDays: number;
  defaultMaxConnections: number;
  defaultBufferSizeKB: number;
  language: 'en' | 'vi';
  setLogRetentionDays: (days: number) => void;
  setDefaultMaxConnections: (limit: number) => void;
  setDefaultBufferSizeKB: (size: number) => void;
  setLanguage: (lang: 'en' | 'vi') => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const getStoredInt = (key: string, defaultVal: number): number => {
    const val = localStorage.getItem(key);
    return val !== null ? parseInt(val, 10) : defaultVal;
  };

  return {
    logRetentionDays: getStoredInt('settings_log_retention_days', 30),
    defaultMaxConnections: getStoredInt('settings_default_max_connections', 3),
    defaultBufferSizeKB: getStoredInt('settings_default_buffer_size_kb', 64),
    language: (localStorage.getItem('settings_language') as 'en' | 'vi') || 'en',

    setLogRetentionDays: (logRetentionDays) => {
      localStorage.setItem('settings_log_retention_days', String(logRetentionDays));
      set({ logRetentionDays });
    },
    setDefaultMaxConnections: (defaultMaxConnections) => {
      localStorage.setItem('settings_default_max_connections', String(defaultMaxConnections));
      set({ defaultMaxConnections });
    },
    setDefaultBufferSizeKB: (defaultBufferSizeKB) => {
      localStorage.setItem('settings_default_buffer_size_kb', String(defaultBufferSizeKB));
      set({ defaultBufferSizeKB });
    },
    setLanguage: (language) => {
      localStorage.setItem('settings_language', language);
      set({ language });
    }
  };
});
