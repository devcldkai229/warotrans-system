import { Platform } from 'react-native';
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { UserSession } from '../../shared/types/contracts';
import {
  changeOwnPassword,
  getCapabilities,
  loginWithCredentials,
  logoutSession,
  type SessionResponse,
} from '../../shared/api/identityApi';
import { initialsFor } from '../../shared/auth/permissions';
import { setAccessToken, onSessionExpired } from '../../shared/api/client';
import {
  clearAllStoredAuth,
  getStoredRefreshToken,
  saveStoredAccessToken,
  saveStoredRefreshToken,
  saveStoredUserSession,
} from '../../shared/api/secureStore';
import { clearWarehouseSnapshots } from '../../shared/api/warehouseApi';
import { queryClient } from '../../app/providers/QueryProvider';
import { restoreSession } from './restoreSession';

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  connectionError: string | null;
  retrySession: () => void;
  login: (username: string, zone?: string, password?: string) => Promise<boolean> | boolean;
  loginAsync: (username: string, password?: string, zone?: string) => Promise<UserSession>;
  logout: () => void;
  updateZone: (zone: string) => void;
  /** Replaces the password; rejects with the API error so the form can show it. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const authVersion = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const version = ++authVersion.current;
    const isCurrent = () => isMounted && authVersion.current === version;
    setIsLoading(true);
    void restoreSession(isCurrent).then(result => {
      if (!isCurrent() || result.kind === 'cancelled') return;
      setSession(result.kind === 'ready' ? result.session : null);
      setConnectionError(result.kind === 'unavailable' ? result.message : null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [restoreAttempt]);

  const retrySession = () => {
    if (isLoading) return;
    setIsLoading(true);
    setRestoreAttempt(value => value + 1);
  };

  const loginAsync = async (
    username: string,
    password?: string,
    zone?: string,
  ): Promise<UserSession> => {
    const trimmed = username.trim();
    if (!password) throw new Error('A password is required.');
    const res = await loginWithCredentials(trimmed, password);
    authVersion.current += 1;
    clearWarehouseSnapshots();
    queryClient.clear();
    await clearAllStoredAuth();
    return adoptSession(res, zone || 'Inbound Dock 01');
  };

  /** Stores a token pair and builds the UI session from the server's capabilities for it. */
  const adoptSession = async (res: SessionResponse, zone: string): Promise<UserSession> => {
    await saveStoredAccessToken(res.accessToken);
    if (res.refreshToken) await saveStoredRefreshToken(res.refreshToken);
    setAccessToken(res.accessToken);
    const capabilities = await getCapabilities();
    const fullName = res.account.fullName || res.account.username;
    const nextSession: UserSession = {
      id: res.account.id, username: res.account.username, fullName,
      role: res.account.role as UserSession['role'], zone,
      avatarInitials: initialsFor(fullName),
      permissions: capabilities.permissions,
      mustChangePassword: capabilities.mustChangePassword,
    };
    await saveStoredUserSession(nextSession);
    setSession(nextSession);
    setConnectionError(null);
    return nextSession;
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    const res = await changeOwnPassword(currentPassword, newPassword);
    await adoptSession(res, session?.zone || 'Inbound Dock 01');
  };

  const login = async (identifier: string, zone?: string, password?: string): Promise<boolean> => {
    await loginAsync(identifier, password, zone);
    return true;
  };

  const clearSession = () => {
    authVersion.current += 1;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    setAccessToken(null);
    clearWarehouseSnapshots();
    queryClient.clear();
    void clearAllStoredAuth();
    setSession(null);
    setConnectionError(null);
    setIsLoading(false);
  };
  useEffect(() => onSessionExpired(clearSession), []);

  const logout = () => {
    const token = getStoredRefreshToken();
    // Revoke the captured refresh session after local state is removed.
    clearSession();
    void token.then(refreshToken => logoutSession(refreshToken)).catch(() => {});
  };

  const updateZone = (zone: string) => {
    if (session) {
      const updated = {
        ...session,
        zone,
      };
      setSession(updated);
      saveStoredUserSession(updated).catch(() => {});
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: !!session,
        isLoading,
        connectionError,
        retrySession,
        login,
        loginAsync,
        logout,
        updateZone,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
