import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { UserSession } from '../../shared/types/contracts';
import { getCurrentAccount, loginWithCredentials, logoutSession, AccountDto } from '../../shared/api/identityApi';
import { ApiError, beginAuthSession, getAccessToken, getSessionGeneration, invalidateAuthSession, onAccessTokenChange, persistAuthSession, persistLocalSession, setAccessToken } from '../../shared/api/client';
import { getStoredAccessToken, getStoredRefreshToken, getStoredUserSession } from '../../shared/api/secureStore';

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, zone?: string, password?: string) => Promise<boolean>;
  loginAsync: (username: string, password?: string, zone?: string) => Promise<UserSession>;
  logout: () => void;
  updateZone: (zone: string) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
function toSession(account: AccountDto, zone = ''): UserSession {
  const fullName = account.fullName || account.username;
  return { id: account.id, username: account.username, fullName,
    role: account.role === 'ADMIN' ? 'ADMIN' : 'STAFF', zone,
    avatarInitials: fullName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    const generation = getSessionGeneration();
    const unsubscribe = onAccessTokenChange(token => { if (!token && mounted) setSession(null); });
    void (async () => {
      try {
        const [token, stored] = await Promise.all([getStoredAccessToken(), getStoredUserSession<UserSession>()]);
        if (!mounted || generation !== getSessionGeneration()) return;
        if (!token) { await invalidateAuthSession(); return; }
        setAccessToken(token);
        const account = await getCurrentAccount();
        if (!mounted || generation !== getSessionGeneration() || !getAccessToken()) return;
        const verified = toSession(account, stored?.zone);
        setSession(verified);
      } catch {
        if (generation === getSessionGeneration()) await invalidateAuthSession();
      } finally { if (mounted) setIsLoading(false); }
    })();
    return () => { mounted = false; unsubscribe(); };
  }, []);
  const loginAsync = async (username: string, password = '', zone = ''): Promise<UserSession> => {
    await invalidateAuthSession();
    const generation = beginAuthSession();
    const response = await loginWithCredentials(username.trim(), password);
    const verified = toSession(response.account, zone);
    if (!await persistAuthSession(response.accessToken, response.refreshToken, generation, verified)) {
      throw new ApiError(401, 'SESSION_CHANGED', 'The session changed. Please sign in again.');
    }
    setSession(verified);
    return verified;
  };
  const logout = () => {
    const token = getAccessToken();
    const refresh = getStoredRefreshToken();
    void invalidateAuthSession();
    setSession(null);
    void refresh.then(rt => logoutSession(rt, token)).catch(() => {});
  };
  const updateZone = (zone: string) => {
    if (!session) return;
    const updated = { ...session, zone };
    setSession(updated);
    // This value is a local display preference, never an assignment from the server.
    void persistLocalSession(updated, getSessionGeneration());
  };
  return <AuthContext.Provider value={{ session, isAuthenticated: !!session, isLoading, loginAsync,
    login: async (username, zone, password) => { await loginAsync(username, password, zone); return true; }, logout, updateZone }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
