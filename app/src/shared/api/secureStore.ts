import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'warotrans_access_token';
const REFRESH_TOKEN_KEY = 'warotrans_refresh_token';
const USER_SESSION_KEY = 'warotrans_user_session';
export const THEME_MODE_KEY = 'warotrans.theme_mode';
export type StoredThemeMode = 'system' | 'light' | 'dark';
export const LANGUAGE_KEY = 'warotrans.language';
export type StoredLanguage = 'en' | 'vi';

/**
 * Persist access token in hardware-backed secure storage on mobile devices,
 * or localStorage fallback when running in web browser preview.
 */
export async function saveStoredAccessToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
      }
    } catch {
      // Ignore web storage errors
    }
  } else {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    } catch (err) {
      console.warn('SecureStore setItemAsync error for access token:', err);
    }
  }
}

export async function getStoredAccessToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(ACCESS_TOKEN_KEY);
      }
      return null;
    } catch {
      return null;
    }
  } else {
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}

export async function removeStoredAccessToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
    } catch {}
  } else {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    } catch {}
  }
}

/**
 * Persist refresh token for seamless background session renewal.
 */
export async function saveStoredRefreshToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
      }
    } catch {}
  } else {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    } catch (err) {
      console.warn('SecureStore setItemAsync error for refresh token:', err);
    }
  }
}

export async function getStoredRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(REFRESH_TOKEN_KEY);
      }
      return null;
    } catch {
      return null;
    }
  } else {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}

export async function removeStoredRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } catch {}
  } else {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {}
  }
}

/**
 * Persist active user session info (account profile, zone, avatar).
 */
export async function saveStoredUserSession<T = any>(session: T): Promise<void> {
  const json = JSON.stringify(session);
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(USER_SESSION_KEY, json);
      }
    } catch {}
  } else {
    try {
      await SecureStore.setItemAsync(USER_SESSION_KEY, json);
    } catch (err) {
      console.warn('SecureStore setItemAsync error for user session:', err);
    }
  }
}

export async function getStoredUserSession<T = any>(): Promise<T | null> {
  let raw: string | null = null;
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(USER_SESSION_KEY);
      }
    } catch {
      return null;
    }
  } else {
    try {
      raw = await SecureStore.getItemAsync(USER_SESSION_KEY);
    } catch {
      return null;
    }
  }

  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function removeStoredUserSession(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(USER_SESSION_KEY);
      }
    } catch {}
  } else {
    try {
      await SecureStore.deleteItemAsync(USER_SESSION_KEY);
    } catch {}
  }
}

/**
 * Helper to wipe all authentication tokens and cached user session credentials.
 */
export async function clearAllStoredAuth(): Promise<void> {
  await Promise.all([
    removeStoredAccessToken(),
    removeStoredRefreshToken(),
    removeStoredUserSession(),
  ]);
}

/**
 * Persist UI theme mode preference ('system' | 'light' | 'dark').
 */
export async function saveStoredThemeMode(mode: StoredThemeMode): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(THEME_MODE_KEY, mode);
      }
    } catch {}
  } else {
    try {
      await SecureStore.setItemAsync(THEME_MODE_KEY, mode);
    } catch (err) {
      console.warn('SecureStore setItemAsync error for theme mode:', err);
    }
  }
}

export async function getStoredThemeMode(): Promise<StoredThemeMode | null> {
  let raw: string | null = null;
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(THEME_MODE_KEY);
      }
    } catch {
      return null;
    }
  } else {
    try {
      raw = await SecureStore.getItemAsync(THEME_MODE_KEY);
    } catch {
      return null;
    }
  }
  if (raw === 'system' || raw === 'light' || raw === 'dark') {
    return raw;
  }
  return null;
}

/**
 * Persist UI language preference ('en' | 'vi').
 */
export async function saveStoredLanguage(language: StoredLanguage): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LANGUAGE_KEY, language);
      }
    } catch {}
  } else {
    try {
      await SecureStore.setItemAsync(LANGUAGE_KEY, language);
    } catch (err) {
      console.warn('SecureStore setItemAsync error for language:', err);
    }
  }
}

export async function getStoredLanguage(): Promise<StoredLanguage | null> {
  let raw: string | null = null;
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(LANGUAGE_KEY);
      }
    } catch {
      return null;
    }
  } else {
    try {
      raw = await SecureStore.getItemAsync(LANGUAGE_KEY);
    } catch {
      return null;
    }
  }
  if (raw === 'en' || raw === 'vi') {
    return raw;
  }
  return null;
}
