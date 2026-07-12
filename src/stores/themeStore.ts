import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const savedTheme = localStorage.getItem('theme') as Theme | null;
  const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  // Initialize theme class on document element
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(initialTheme);
  }

  return {
    theme: initialTheme,
    setTheme: (theme) => {
      localStorage.setItem('theme', theme);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }
      set({ theme });
    },
    toggleTheme: () => {
      set((state) => {
        const nextTheme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', nextTheme);
        if (typeof document !== 'undefined') {
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(nextTheme);
        }
        return { theme: nextTheme };
      });
    }
  };
});
