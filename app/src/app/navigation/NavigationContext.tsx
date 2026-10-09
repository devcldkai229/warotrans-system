import React, { createContext, useContext, useState, ReactNode } from 'react';

export type MainTab = 'home' | 'jobs' | 'transport';

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
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('home');
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [params, setParams] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<{ screen: AppScreen; params: Record<string, any> }[]>([
    { screen: 'home', params: {} },
  ]);
  const [activeJobCount, setActiveJobCount] = useState<number>(2);

  const navigate = (screen: AppScreen, newParams: Record<string, any> = {}) => {
    setHistory((prev) => [...prev, { screen, params: newParams }]);
    setCurrentScreen(screen);
    setParams(newParams);

    if (screen === 'home' || screen === 'jobs' || screen === 'transport') {
      setActiveTab(screen);
    }
  };

  const switchTab = (tab: MainTab) => {
    navigate(tab);
    setActiveTab(tab);
  };

  const goBack = () => {
    if (history.length > 1) {
      const nextHistory = history.slice(0, -1);
      const prevEntry = nextHistory[nextHistory.length - 1];
      setHistory(nextHistory);
      setCurrentScreen(prevEntry.screen);
      setParams(prevEntry.params);

      if (
        prevEntry.screen === 'home' ||
        prevEntry.screen === 'jobs' ||
        prevEntry.screen === 'transport'
      ) {
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
