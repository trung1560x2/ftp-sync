import { create } from 'zustand';

interface AiSettingsState {
  enabled: boolean;
  autoAnalyze: boolean;
  apiKey: string;
  model: string;
  setEnabled: (enabled: boolean) => void;
  setAutoAnalyze: (autoAnalyze: boolean) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
}

export const useAiSettingsStore = create<AiSettingsState>((set) => {
  // Load initial values from localStorage safely
  const getStoredBool = (key: string, defaultVal: boolean): boolean => {
    const val = localStorage.getItem(key);
    return val !== null ? val === 'true' : defaultVal;
  };

  return {
    enabled: getStoredBool('gemini_copilot_enabled', true),
    autoAnalyze: getStoredBool('gemini_copilot_auto_analyze', false),
    apiKey: localStorage.getItem('gemini_custom_api_key') || '',
    model: localStorage.getItem('gemini_copilot_model') || 'gemini-1.5-flash',

    setEnabled: (enabled) => {
      localStorage.setItem('gemini_copilot_enabled', String(enabled));
      set({ enabled });
    },
    setAutoAnalyze: (autoAnalyze) => {
      localStorage.setItem('gemini_copilot_auto_analyze', String(autoAnalyze));
      set({ autoAnalyze });
    },
    setApiKey: (apiKey) => {
      localStorage.setItem('gemini_custom_api_key', apiKey);
      set({ apiKey });
    },
    setModel: (model) => {
      localStorage.setItem('gemini_copilot_model', model);
      set({ model });
    }
  };
});
