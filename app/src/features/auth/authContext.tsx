import { Platform } from 'react-native';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AccountRole, UserSession } from '../../shared/types/contracts';
import {
  getCurrentAccount,
  loginWithCredentials,
  logoutSession,
} from '../../shared/api/identityApi';
import { setAccessToken, onSessionExpired } from '../../shared/api/client';
import {
  clearAllStoredAuth,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredUserSession,
  saveStoredAccessToken,
  saveStoredRefreshToken,
  saveStoredUserSession,
} from '../../shared/api/secureStore';
import { clearWarehouseSnapshots } from '../../shared/api/warehouseApi';
import { queryClient } from '../../app/providers/QueryProvider';

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, zone?: string, password?: string) => Promise<boolean> | boolean;
  loginAsync: (username: string, password?: string, zone?: string) => Promise<UserSession>;
  logout: () => void;
  updateZone: (zone: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function hydrateAuth() {
      try {
        const [token, stored] = await Promise.all([
          getStoredAccessToken(),
          getStoredUserSession<UserSession>(),
        ]);

        if (token) {
          setAccessToken(token);
        }

        if (stored && token) {
          const account = await getCurrentAccount();
          if (!isMounted) return;
          const fullName = account.fullName || account.username;
          const refreshed: UserSession = {
            ...stored, id: account.id, username: account.username, fullName,
            role: account.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
            avatarInitials: fullName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(),
          };
          setSession(refreshed);
          await saveStoredUserSession(refreshed);
        } else {
          setAccessToken(null);
          await clearAllStoredAuth();
        }
      } catch (err) {
        setAccessToken(null);
        if (isMounted) setSession(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    hydrateAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const loginAsync = async (
    username: string,
    password?: string,
    zone?: string,
  ): Promise<UserSession> => {
    const trimmed = username.trim();
    if (!password) throw new Error('A password is required.');
    const res = await loginWithCredentials(trimmed, password);
    const fullName = res.account.fullName || res.account.username;
    const nextSession: UserSession = {
      id: res.account.id, username: res.account.username, fullName,
      role: res.account.role === 'ADMIN' ? 'ADMIN' : 'STAFF', zone: zone || 'Inbound Dock 01',
      avatarInitials: fullName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'OP',
    };
    clearWarehouseSnapshots();
    queryClient.clear();
    await clearAllStoredAuth();
    await saveStoredAccessToken(res.accessToken);
    if (res.refreshToken) await saveStoredRefreshToken(res.refreshToken);
    await saveStoredUserSession(nextSession);
    setAccessToken(res.accessToken);
    setSession(nextSession);
    return nextSession;
  };

  const login = async (identifier: string, zone?: string, password?: string): Promise<boolean> => {
    await loginAsync(identifier, password, zone);
    return true;
  };

  const clearSession = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    setAccessToken(null);
    clearWarehouseSnapshots();
    queryClient.clear();
    void clearAllStoredAuth();
    setSession(null);
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
        login,
        loginAsync,
        logout,
        updateZone,
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
