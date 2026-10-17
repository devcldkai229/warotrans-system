import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { AccountRole, UserSession } from '../../shared/types/contracts';
import {
  getCurrentAccount,
  loginWithCredentials,
  logoutSession,
} from '../../shared/api/identityApi';
import { ApiError, setAccessToken } from '../../shared/api/client';
import {
  clearAllStoredAuth,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredUserSession,
  saveStoredAccessToken,
  saveStoredRefreshToken,
  saveStoredUserSession,
} from '../../shared/api/secureStore';

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, zone?: string, password?: string) => Promise<boolean> | boolean;
  loginAsync: (username: string, password?: string, zone?: string) => Promise<UserSession>;
  logout: () => void;
  updateZone: (zone: string) => void;
}

export const PRESET_OPERATORS: {
  id: string;
  username: string;
  name: string;
  zone: string;
  role: 'STAFF' | 'ADMIN';
}[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    username: 'staff',
    name: 'Warehouse Staff',
    zone: 'Inbound Dock 01',
    role: 'STAFF',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    username: 'admin',
    name: 'WaroTrans Admin',
    zone: 'Inbound Dock 01',
    role: 'ADMIN',
  },
  {
    id: 'STF-2026-088',
    username: 'alex.tran',
    name: 'Alex Tran',
    zone: 'Inbound Dock 01',
    role: 'STAFF',
  },
  {
    id: 'STF-2026-042',
    username: 'sarah.connor',
    name: 'Sarah Connor',
    zone: 'Inbound Dock 01',
    role: 'STAFF',
  },
  {
    id: 'STF-2026-015',
    username: 'david.miller',
    name: 'David Miller',
    zone: 'Outbound Dock 04',
    role: 'STAFF',
  },
];

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

        if (stored) {
          if (isMounted) setSession(stored);

          // In the background, validate profile via getCurrentAccount()
          if (token) {
            getCurrentAccount()
              .then((acct) => {
                if (!isMounted) return;
                const fullName = acct.fullName || acct.username;
                const initials =
                  fullName
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'OP';
                const role = (acct.role === 'ADMIN' ? 'ADMIN' : 'STAFF') as AccountRole;

                const refreshed: UserSession = {
                  ...stored,
                  id: acct.id,
                  username: acct.username,
                  fullName,
                  role,
                  avatarInitials: initials,
                };
                setSession(refreshed);
                saveStoredUserSession(refreshed).catch(() => {});
              })
              .catch((err) => {
                console.warn('Profile background verification skipped/failed:', err?.message);
              });
          }
        } else if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
          try {
            const sp = new URLSearchParams(window.location.search);
            const scr = sp.get('screen');
            if (scr !== 'login' && (scr || sp.get('auth') === '1')) {
              const matched = PRESET_OPERATORS[0];
              const demoSession: UserSession = {
                id: matched.id,
                username: matched.username,
                fullName: matched.name,
                role: matched.role as AccountRole,
                zone: matched.zone,
                avatarInitials: 'WS',
              };
              if (isMounted) setSession(demoSession);
            }
          } catch {}
        }
      } catch (err) {
        console.warn('Hydration error:', err);
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
    const pwd = password || 'Staff@123';
    const activeZone = zone || 'Inbound Dock 01';

    try {
      const res = await loginWithCredentials(trimmed, pwd);
      setAccessToken(res.accessToken);
      await saveStoredAccessToken(res.accessToken);
      if (res.refreshToken) {
        await saveStoredRefreshToken(res.refreshToken);
      }

      const fullName = res.account.fullName || res.account.username;
      const initials =
        fullName
          .split(' ')
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'OP';

      const role = (res.account.role === 'ADMIN' ? 'ADMIN' : 'STAFF') as AccountRole;

      const newSession: UserSession = {
        id: res.account.id,
        username: res.account.username,
        fullName,
        role,
        zone: activeZone,
        avatarInitials: initials,
      };

      await saveStoredUserSession(newSession);
      setSession(newSession);
      return newSession;
    } catch (err: any) {
      // Graceful fallback to offline preset session if backend is completely unreachable
      if (err instanceof ApiError && err.status === 0) {
        console.warn('Backend identity service unreachable. Falling back to offline preset session for demo.');
        const matched = PRESET_OPERATORS.find(
          (op) =>
            op.username.toLowerCase() === trimmed.toLowerCase() ||
            op.id.toLowerCase() === trimmed.toLowerCase(),
        );
        const fullName = matched
          ? matched.name
          : trimmed.includes('.')
            ? trimmed
                .split('.')
                .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                .join(' ')
            : `Operator (${trimmed})`;
        const initials =
          fullName
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'OP';

        const fallbackSession: UserSession = {
          id: matched ? matched.id : 'STF-2026-088',
          username: matched ? matched.username : trimmed,
          fullName,
          role: (matched?.role || 'STAFF') as AccountRole,
          zone: activeZone,
          avatarInitials: initials,
        };

        await saveStoredUserSession(fallbackSession);
        setSession(fallbackSession);
        return fallbackSession;
      }

      // Re-throw 401, 400, 422 to show real authentication error on login screen
      throw err;
    }
  };

  const login = (identifier: string, zone?: string, password?: string): boolean => {
    loginAsync(identifier, password, zone).catch((err) => {
      console.warn('login() asynchronous error:', err);
    });
    return true;
  };

  const logout = () => {
    getStoredRefreshToken()
      .then((rt) => logoutSession(rt))
      .catch(() => {});
    setAccessToken(null);
    clearAllStoredAuth().catch(() => {});
    setSession(null);
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
