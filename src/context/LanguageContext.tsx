import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  LanguageCode, 
  SupportedLanguage, 
  SUPPORTED_LANGUAGES, 
  loadStoredLanguage, 
  saveStoredLanguage, 
  t as translateHelper 
} from '../utils/i18n';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
  languages: SupportedLanguage[];
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'ru',
  setLanguage: () => {},
  t: (key: string, fallback?: string) => fallback || key,
  languages: SUPPORTED_LANGUAGES,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => loadStoredLanguage());

  useEffect(() => {
    // Sync HTML lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'mafia_language' && e.newValue) {
        const match = SUPPORTED_LANGUAGES.find(l => l.code === e.newValue);
        if (match) {
          setLanguageState(match.code);
        }
      }
    };

    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<LanguageCode>;
      if (customEvent.detail && SUPPORTED_LANGUAGES.some(l => l.code === customEvent.detail)) {
        setLanguageState(customEvent.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('language_changed', handleCustomChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('language_changed', handleCustomChange);
    };
  }, []);

  const setLanguage = useCallback((newLang: LanguageCode) => {
    setLanguageState(newLang);
    saveStoredLanguage(newLang);
  }, []);

  const t = useCallback((key: string, fallback?: string) => {
    return translateHelper(language, key, fallback);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    const fallbackLang = loadStoredLanguage();
    return {
      language: fallbackLang,
      setLanguage: saveStoredLanguage,
      t: (key: string, fallback?: string) => translateHelper(fallbackLang, key, fallback),
      languages: SUPPORTED_LANGUAGES,
    };
  }
  return context;
}
