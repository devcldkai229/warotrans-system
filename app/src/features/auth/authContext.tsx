import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { UserSession } from '../../shared/types/contracts';

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  login: (staffId: string, zone?: string) => boolean;
  logout: () => void;
  updateZone: (zone: string) => void;
}

export const PRESET_OPERATORS: { id: string; name: string; zone: string; role: 'STAFF' | 'ADMIN' }[] = [
  {
    id: 'STF-2026-088',
    name: 'Alex Tran',
    zone: 'Inbound Dock 01',
    role: 'STAFF',
  },
  {
    id: 'STF-2026-042',
    name: 'Sarah Connor',
    zone: 'Inbound Dock 01',
    role: 'STAFF',
  },
  {
    id: 'STF-2026-015',
    name: 'David Miller',
    zone: 'Outbound Dock 04',
    role: 'STAFF',
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const scr = sp.get('screen');
        if (scr === 'login') return null;
        if (scr || sp.get('auth') === '1') {
          const matched = PRESET_OPERATORS[0];
          return {
            id: matched.id,
            username: matched.id.toLowerCase(),
            fullName: matched.name,
            role: matched.role,
            zone: matched.zone,
            avatarInitials: 'AT',
          };
        }
      } catch {
        // Fallback
      }
    }
    return null;
  });

  const login = (staffId: string, zone?: string): boolean => {
    const matched = PRESET_OPERATORS.find((op) => op.id.toLowerCase() === staffId.trim().toLowerCase());
    const fullName = matched ? matched.name : `Operator (${staffId})`;
    const activeZone = zone || (matched ? matched.zone : 'Inbound Dock 01');
    const initials = fullName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const newSession: UserSession = {
      id: staffId,
      username: staffId.toLowerCase(),
      fullName,
      role: matched ? matched.role : 'STAFF',
      zone: activeZone,
      avatarInitials: initials || 'OP',
    };

    setSession(newSession);
    return true;
  };

  const logout = () => {
    setSession(null);
  };

  const updateZone = (zone: string) => {
    if (session) {
      setSession({
        ...session,
        zone,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: !!session,
        login,
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
