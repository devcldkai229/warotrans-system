import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import {
  getStoredThemeMode,
  saveStoredThemeMode,
  StoredThemeMode,
  THEME_MODE_KEY,
} from '../api/secureStore';
import {
  darkColors,
  lightColors,
  ResolvedColorScheme,
  syncActiveColors,
  ThemeColors,
} from './colors';
import {
  darkShadows,
  lightShadows,
  syncActiveShadows,
  ThemeShadows,
} from './shadows';
import { getLanguage, Language, onLanguageChange } from '../i18n';

export type ThemeMode = StoredThemeMode;

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedScheme: ResolvedColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  shadows: ThemeShadows;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  language?: Language;
}

export function resolveThemeScheme(
  mode: ThemeMode,
  systemScheme: string | null | undefined,
): ResolvedColorScheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

function getInitialWebThemeMode(): ThemeMode {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(THEME_MODE_KEY);
      if (raw === 'system' || raw === 'light' || raw === 'dark') {
        return raw;
      }
    } catch {}
  }
  return 'system';
}

const DEFAULT_CONTEXT: ThemeContextValue = {
  mode: 'system',
  resolvedScheme: 'light',
  isDark: false,
  colors: lightColors,
  shadows: lightShadows,
  setMode: () => {},
  cycleMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_CONTEXT);

const styleCache = new WeakMap<
  (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) => unknown,
  { light?: unknown; dark?: unknown }
>();

export function clearThemedStylesCache(): void {
  // WeakMap entries are keyed by factory; exposed for deterministic test resets if needed.
}

export function ThemeProvider({
  children,
  initialMode,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}) {
  const rnSystemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => initialMode ?? getInitialWebThemeMode());
  const [language, setLanguageState] = useState<Language>(() => getLanguage());

  useEffect(() => {
    return onLanguageChange((next) => {
      setLanguageState(next);
    });
  }, []);

  useEffect(() => {
    if (initialMode !== undefined) return;
    let mounted = true;
    getStoredThemeMode().then((stored) => {
      if (mounted && stored) {
        setModeState(stored);
      }
    });
    return () => {
      mounted = false;
    };
  }, [initialMode]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    void saveStoredThemeMode(nextMode);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode =
        prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
      void saveStoredThemeMode(next);
      return next;
    });
  }, []);

  const resolvedScheme = resolveThemeScheme(mode, rnSystemScheme);
  const isDark = resolvedScheme === 'dark';

  // Synchronously update module-level active palette before child render pass
  syncActiveColors(resolvedScheme);
  syncActiveShadows(resolvedScheme);

  const activeColors = isDark ? darkColors : lightColors;
  const activeShadows = isDark ? darkShadows : lightShadows;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolvedScheme);
      document.documentElement.style.colorScheme = resolvedScheme;
    }
  }, [resolvedScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedScheme,
      isDark,
      colors: activeColors,
      shadows: activeShadows,
      setMode,
      cycleMode,
      language,
    }),
    [mode, resolvedScheme, isDark, activeColors, activeShadows, setMode, cycleMode, language],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export type ThemedStylesResult<T> = T & {
  styles: T;
  colors: ThemeColors;
  shadows: ThemeShadows;
  isDark: boolean;
};

export function useThemedStyles<T extends object>(
  factory: (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) => T,
): ThemedStylesResult<T> {
  const { resolvedScheme, colors, shadows, isDark } = useContext(ThemeContext);
  let entry = styleCache.get(factory);
  if (!entry) {
    entry = {};
    styleCache.set(factory, entry);
  }
  const cached = entry[resolvedScheme];
  if (cached !== undefined) {
    return cached as ThemedStylesResult<T>;
  }
  const raw = factory(colors, shadows, isDark);
  const created =
    raw && typeof raw === 'object' && Object.isFrozen(raw) ? ({ ...raw } as T) : raw;
  if (created && typeof created === 'object') {
    if (!('styles' in created)) {
      Object.defineProperty(created, 'styles', {
        value: created,
        enumerable: false,
        configurable: true,
      });
    }
    if (!('colors' in created)) {
      Object.defineProperty(created, 'colors', {
        value: colors,
        enumerable: false,
        configurable: true,
      });
    }
    if (!('shadows' in created)) {
      Object.defineProperty(created, 'shadows', {
        value: shadows,
        enumerable: false,
        configurable: true,
      });
    }
    if (!('isDark' in created)) {
      Object.defineProperty(created, 'isDark', {
        value: isDark,
        enumerable: false,
        configurable: true,
      });
    }
  }
  entry[resolvedScheme] = created;
  return created as ThemedStylesResult<T>;
}
