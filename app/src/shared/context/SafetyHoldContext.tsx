import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

interface SafetyHoldContextType {
  /** True while a 3m soft pause around the operator is active. */
  isHolding: boolean;
  /** Flip the hold on or off. Read `isHolding` first if the caller needs the result. */
  toggleHold: () => void;
  /** Drop the hold without toggling — used when a shift ends. */
  releaseHold: () => void;
}

const SafetyHoldContext = createContext<SafetyHoldContextType | undefined>(undefined);

/**
 * The "hold nearby robots" soft pause is a *fleet* state, not a screen state:
 * the header shield shows it, the safety sheet toggles it, and the Transport
 * hub offers the same action. Lifting it into a context is what stops those
 * three surfaces from disagreeing — holding from the header used to leave the
 * Transport hub still reading "not holding".
 *
 * In production this is a WES command (`POST /api/fleet/soft-hold`) that every
 * handheld polls; the optimistic local flag mirrors that contract's shape. Until
 * that route is wired it never leaves the device, which is why every surface
 * that offers the hold says "Local Fleet Simulation" out loud.
 */
export function SafetyHoldProvider({ children }: { children: ReactNode }) {
  const [isHolding, setIsHolding] = useState(false);

  const toggleHold = useCallback(() => setIsHolding((prev) => !prev), []);
  const releaseHold = useCallback(() => setIsHolding(false), []);

  const value = useMemo(
    () => ({ isHolding, toggleHold, releaseHold }),
    [isHolding, toggleHold, releaseHold]
  );

  return <SafetyHoldContext.Provider value={value}>{children}</SafetyHoldContext.Provider>;
}

export function useSafetyHold(): SafetyHoldContextType {
  const context = useContext(SafetyHoldContext);
  if (!context) {
    throw new Error('useSafetyHold must be used within a SafetyHoldProvider');
  }
  return context;
}