import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  getStoredLanguage,
  LANGUAGE_KEY,
  saveStoredLanguage,
} from '../api/secureStore';
import {
  getLanguage,
  Language,
  LANGUAGES,
  onLanguageChange,
  setLanguage as setGlobalLanguage,
  syncActiveLanguage,
  t as translate,
} from '../i18n';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (
    text: string,
    values?: Record<string, string | number | null | undefined>,
  ) => string;
}

function getInitialWebLanguage(): Language {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(LANGUAGE_KEY);
      if (raw === 'en' || raw === 'vi') {
        return raw;
      }
    } catch {}
  }
  return getLanguage();
}

const DEFAULT_CONTEXT: LanguageContextValue = {
  language: getLanguage(),
  setLanguage: (next) => {
    setGlobalLanguage(next);
    void saveStoredLanguage(next);
  },
  toggleLanguage: () => {
    const next: Language = getLanguage() === 'vi' ? 'en' : 'vi';
    setGlobalLanguage(next);
    void saveStoredLanguage(next);
  },
  t: translate,
};

const LanguageContext = createContext<LanguageContextValue>(DEFAULT_CONTEXT);

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: React.ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(
    () => initialLanguage ?? getInitialWebLanguage(),
  );

  // Synchronously keep module-level language aligned before child render pass
  syncActiveLanguage(language);

  useEffect(() => {
    if (initialLanguage !== undefined) return;
    let mounted = true;
    getStoredLanguage().then((stored) => {
      if (mounted && stored) {
        syncActiveLanguage(stored);
        setLanguageState(stored);
      }
    });
    return () => {
      mounted = false;
    };
  }, [initialLanguage]);

  useEffect(() => {
    return onLanguageChange((next) => {
      setLanguageState(next);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    syncActiveLanguage(nextLanguage);
    setLanguageState(nextLanguage);
    setGlobalLanguage(nextLanguage);
    void saveStoredLanguage(nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'vi' ? 'en' : 'vi';
      syncActiveLanguage(next);
      setGlobalLanguage(next);
      void saveStoredLanguage(next);
      return next;
    });
  }, []);

  const t = useCallback(
    (
      text: string,
      values?: Record<string, string | number | null | undefined>,
    ) => translate(text, values),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language, setLanguage, toggleLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export { LANGUAGES };
export type { Language };
