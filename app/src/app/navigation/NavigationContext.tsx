import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from '../../features/auth/authContext';
import { Platform } from 'react-native';

export type MainTab = 'home' | 'jobs' | 'live_map' | 'transport';

export type AppScreen =
  | 'home'
  | 'jobs'
  | 'transport'
  | 'job_detail'
  | 'job_monitoring'
  | 'transport_create'
  | 'create_container'
  | 'inventory_lookup'
  | 'live_map'
  | 'payload_recovery'
  | 'fleet_recall'
  | 'replenishment'
  | 'point_to_point'
  | 'block_path'
  | 'transport_history'
  | 'offline_hud'
  | 'scanner_hud';

/** Screens that own the shell (AppHeader + bottom bar). Keep in one place. */
const MAIN_TABS: ReadonlySet<string> = new Set<MainTab>([
  'home',
  'jobs',
  'live_map',
  'transport',
]);

/** True when `screen` is one of the four tab roots. */
export function isMainTabScreen(screen: string): screen is MainTab {
  return MAIN_TABS.has(screen);
}

export interface NavigationState {
  currentScreen: AppScreen;
  activeTab: MainTab;
  params: Record<string, any>;
}

interface NavigationContextType {
  currentScreen: AppScreen;
  activeTab: MainTab;
  params: Record<string, any>;
  navigate: (screen: AppScreen, params?: Record<string, any>) => void;
  switchTab: (tab: MainTab) => void;
  goBack: () => void;
  activeJobCount: number;
  setActiveJobCount: (count: number) => void;
  /** Measured height of the bottom bar, published by BottomTabBar. */
  dockHeight: number;
  setDockHeight: (height: number) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

function mapRawScreen(raw: string | null): AppScreen | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === 'home' || s === 'home-map' || s === 'home-pulse') return 'home';
  if (s === 'jobs' || s === 'jobs-my' || s === 'jobs-global' || s === 'jobs-history' || s === 'jobs-empty') return 'jobs';
  if (s === 'transport' || s === 'transport-hub') return 'transport';
  if (s === 'job-detail' || s === 'job_detail' || s === 'handover-hud' || s === 'mismatch-modal') return 'job_detail';
  if (s === 'job-monitoring' || s === 'job_monitoring') return 'job_monitoring';
  if (s === 'transport-new' || s === 'transport_create' || s === 'dispatch') return 'transport_create';
  if (s === 'create-container' || s === 'create_container') return 'create_container';
  if (s === 'inventory-lookup' || s === 'inventory_lookup') return 'inventory_lookup';
  if (s === 'live-map' || s === 'live_map') return 'live_map';
  if (s === 'rescue' || s === 'payload_recovery' || s === 'payload-recovery') return 'payload_recovery';
  if (s === 'maintenance' || s === 'fleet_recall' || s === 'fleet-recall') return 'fleet_recall';
  if (s === 'replenishment') return 'replenishment';
  if (s === 'point-to-point' || s === 'point_to_point') return 'point_to_point';
  if (s === 'block-path' || s === 'block_path') return 'block_path';
  if (s === 'transport-history' || s === 'transport_history') return 'transport_history';
  if (s === 'offline-hud' || s === 'offline_hud') return 'offline_hud';
  if (s === 'scanner-hud' || s === 'scanner_hud') return 'scanner_hud';
  return null;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const getInitial = (): { screen: AppScreen; tab: MainTab; params: Record<string, any> } => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const rawScreen = sp.get('screen');
        const mapped = mapRawScreen(rawScreen);
        const initialParams: Record<string, any> = {};
      
      const modal = sp.get('modal');
      if (modal) initialParams.modal = modal;
      if (rawScreen === 'handover-hud') initialParams.modal = 'verify';
      if (rawScreen === 'mismatch-modal') initialParams.modal = 'mismatch';
      if (rawScreen === 'issue-sheet') initialParams.modal = 'issue';

      const view = sp.get('view');
      if (view) initialParams.view = view;
      if (rawScreen === 'jobs-global') initialParams.view = 'global';
      if (rawScreen === 'jobs-history') initialParams.view = 'history';
      if (rawScreen === 'jobs-empty') initialParams.view = 'empty';

      const job = sp.get('job');
      if (job) initialParams.jobId = job;

      const workflow = sp.get('workflow');
      if (workflow) initialParams.workflow = workflow;

      if (mapped) {
        let activeTab: MainTab = 'home';
        if (isMainTabScreen(mapped)) {
          activeTab = mapped;
        } else if (mapped === 'job_detail' || mapped === 'job_monitoring') {
          activeTab = 'jobs';
        } else {
          activeTab = 'transport';
        }
        return { screen: mapped, tab: activeTab, params: initialParams };
      }
    } catch {
      // Fallback
    }
  }
  return { screen: 'home', tab: 'home', params: {} };
};

  const { session, isLoading } = useAuth();
  const previousAccount = useRef<string | null>(null);
  const initial = getInitial();
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(initial.screen);
  const [activeTab, setActiveTab] = useState<MainTab>(initial.tab);
  const [params, setParams] = useState<Record<string, any>>(initial.params);
  const [history, setHistory] = useState<{ screen: AppScreen; params: Record<string, any> }[]>([
    { screen: initial.screen, params: initial.params },
  ]);
  const [activeJobCount, setActiveJobCount] = useState<number>(0);
  // Initial guess until BottomTabBar's onLayout reports the real bar height
  // (56pt + the bottom safe-area inset, so 64 on web, ~90 on a notched phone).
  // Prevents a visible one-frame jump in the screens that dock content.
  const [dockHeight, setDockHeight] = useState<number>(64);

  useEffect(() => {
    if (!isLoading && !session && previousAccount.current) {
      setCurrentScreen('home'); setActiveTab('home'); setParams({});
      setHistory([{ screen: 'home', params: {} }]); setActiveJobCount(0);
    }
    previousAccount.current = session?.id ?? null;
  }, [session?.id, isLoading]);

  const navigate = (screen: AppScreen, newParams: Record<string, any> = {}) => {
    setHistory((prev) => [...prev, { screen, params: newParams }]);
    setCurrentScreen(screen);
    setParams(newParams);

    // Landing on a tab root from anywhere re-activates that tab, so the bar
    // never shows Home highlighted while the Jobs screen is on screen.
    if (isMainTabScreen(screen)) {
      setActiveTab(screen);
    }
  };

  const switchTab = (tab: MainTab) => {
    navigate(tab);
    setActiveTab(tab);
  };

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    (window as any).__navigate = navigate;
    (window as any).__switchTab = switchTab;
  }

  const goBack = () => {
    if (history.length > 1) {
      const nextHistory = history.slice(0, -1);
      const prevEntry = nextHistory[nextHistory.length - 1];
      setHistory(nextHistory);
      setCurrentScreen(prevEntry.screen);
      setParams(prevEntry.params);

      if (isMainTabScreen(prevEntry.screen)) {
        setActiveTab(prevEntry.screen);
      }
    } else {
      setCurrentScreen('home');
      setActiveTab('home');
      setParams({});
    }
  };

  return (
    <NavigationContext.Provider
      value={{
        currentScreen,
        activeTab,
        params,
        navigate,
        switchTab,
        goBack,
        activeJobCount,
        setActiveJobCount,
        dockHeight,
        setDockHeight,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
