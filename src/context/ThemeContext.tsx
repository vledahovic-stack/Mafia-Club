import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'mafia_app_theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => {},
});

export function getSavedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode;
  if (saved === 'dark' || saved === 'light' || saved === 'system') {
    return saved;
  }
  return 'dark';
}

export function getResolvedTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return mode;
}

export function applyThemeToDom(mode: ThemeMode): 'dark' | 'light' {
  const resolved = getResolvedTheme(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
  }
  return resolved;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(getSavedTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => getResolvedTheme(getSavedTheme()));

  const setTheme = (newMode: ThemeMode) => {
    setThemeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newMode);
    }
    const res = applyThemeToDom(newMode);
    setResolvedTheme(res);
  };

  useEffect(() => {
    // Apply initial theme
    const currentSaved = getSavedTheme();
    const res = applyThemeToDom(currentSaved);
    setResolvedTheme(res);

    // System theme media listener
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (getSavedTheme() === 'system') {
        const updated = applyThemeToDom('system');
        setResolvedTheme(updated);
      }
    };

    try {
      mediaQuery.addEventListener('change', handleSystemChange);
    } catch {
      mediaQuery.addListener(handleSystemChange);
    }

    return () => {
      try {
        mediaQuery.removeEventListener('change', handleSystemChange);
      } catch {
        mediaQuery.removeListener(handleSystemChange);
      }
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
