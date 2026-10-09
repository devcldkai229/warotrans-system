import React, { createContext, useContext, useState, ReactNode } from 'react';
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
    zone: 'Storage Zone A (Racks A01-A12)',
    role: 'STAFF',
  },
  {
    id: 'STF-2026-042',
    name: 'Sarah Connor',
    zone: 'Inbound Dock 01 (Receiving Bay)',
    role: 'STAFF',
  },
  {
    id: 'STF-2026-015',
    name: 'David Miller',
    zone: 'Outbound Dock 04 (Staging & Dispatch)',
    role: 'STAFF',
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);

  const login = (staffId: string, zone?: string): boolean => {
    const matched = PRESET_OPERATORS.find((op) => op.id.toLowerCase() === staffId.trim().toLowerCase());
    const fullName = matched ? matched.name : `Operator (${staffId})`;
    const activeZone = zone || (matched ? matched.zone : 'Storage Zone A (Racks A01-A12)');
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
