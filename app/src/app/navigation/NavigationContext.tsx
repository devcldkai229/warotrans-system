import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';

export type MainTab = 'home' | 'jobs' | 'transport';
export type AppScreen = MainTab | 'job_detail' | 'job_monitoring' | 'transport_create' | 'create_container'
  | 'inventory_lookup' | 'live_map' | 'payload_recovery' | 'fleet_recall' | 'replenishment'
  | 'point_to_point' | 'block_path' | 'transport_history' | 'transport_detail' | 'offline_hud' | 'scanner_hud' | 'scanner';
type Entry = { screen: AppScreen; params: Record<string, any> };
export interface NavigationState { currentScreen: AppScreen; activeTab: MainTab; params: Record<string, any> }
interface NavigationContextType extends NavigationState {
  navigate: (screen: AppScreen, params?: Record<string, any>) => void;
  switchTab: (tab: MainTab) => void; goBack: () => void;
  activeJobCount: number; setActiveJobCount: (count: number) => void;
  dockHeight: number; setDockHeight: (height: number) => void;
}
const NavigationContext = createContext<NavigationContextType | undefined>(undefined);
const screens = new Set<AppScreen>(['home','jobs','transport','job_detail','job_monitoring','transport_create',
  'create_container','inventory_lookup','live_map','payload_recovery','fleet_recall','replenishment','point_to_point',
  'block_path','transport_history','transport_detail','offline_hud','scanner_hud','scanner']);
export function isMainTabScreen(screen: string): screen is MainTab { return ['home','jobs','transport'].includes(screen); }
function tabFor(screen: AppScreen): MainTab {
  return isMainTabScreen(screen) ? screen : ['job_detail','job_monitoring','live_map'].includes(screen) ? 'jobs' : 'transport';
}
function normalizeEntry(screen: AppScreen, params: Record<string, any> = {}): Entry {
  if (screen === 'replenishment') return { screen: 'transport_create', params: { ...params, workflow: 'REPLENISHMENT' } };
  if (screen === 'point_to_point') return { screen: 'transport_create', params: { ...params, workflow: 'POINT_TO_POINT_TRANSPORT' } };
  return { screen, params };
}
function parseUrl(url: string): Entry {
  const query = new URL(url).searchParams;
  const raw = query.get('screen') || 'home';
  const aliases: Record<string, AppScreen> = {
    'home-map':'home','home-pulse':'home','jobs-my':'jobs','jobs-global':'jobs','jobs-history':'jobs','jobs-empty':'jobs',
    'transport-hub':'transport','job-detail':'job_detail','handover-hud':'job_detail','mismatch-modal':'job_detail',
    'job-monitoring':'job_monitoring','transport-new':'transport_create','dispatch':'transport_create',
    'create-container':'create_container','inventory-lookup':'inventory_lookup','live-map':'live_map','rescue':'payload_recovery',
    'payload-recovery':'payload_recovery','maintenance':'fleet_recall','fleet-recall':'fleet_recall','point-to-point':'point_to_point',
    'block-path':'block_path','transport-history':'transport_history','transport-detail':'transport_detail','offline-hud':'offline_hud','scanner-hud':'scanner_hud',
  };
  const screen = aliases[raw] || (screens.has(raw as AppScreen) ? raw as AppScreen : 'home');
  const params: Record<string, any> = {};
  for (const key of ['modal','view','workflow','container','robotId','requestId','target','route','source','destination','qty','repeatRequestId']) {
    const value = query.get(key); if (value !== null) params[key] = value;
  }
  if (query.get('job') || query.get('jobId')) params.jobId = query.get('job') || query.get('jobId');
  if (raw === 'jobs-global') params.view = 'global';
  if (raw === 'jobs-history') params.view = 'history';
  if (raw === 'handover-hud') params.modal = 'verify';
  if (raw === 'mismatch-modal') params.modal = 'mismatch';
  return normalizeEntry(screen, params);
}
function initialEntry(): Entry {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return parseUrl(window.location.href);
  return { screen: 'home', params: {} };
}
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>(() => [initialEntry()]);
  const stackRef = useRef(stack);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [dockHeight, setDockHeight] = useState(64);
  const current = stack[stack.length - 1];
  const applyStack = useCallback((entries: Entry[], write: 'push' | 'replace' | false = false) => {
    stackRef.current = entries;
    setStack(entries);
    if (write && Platform.OS === 'web' && typeof window !== 'undefined') {
      const entry = entries[entries.length - 1];
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('screen', entry.screen);
      Object.entries(entry.params).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') url.searchParams.set(key === 'jobId' ? 'job' : key, String(value));
      });
      window.history[write === 'push' ? 'pushState' : 'replaceState']({ waroTransStack: entries }, '', url);
    }
  }, []);
  const navigate = useCallback((screen: AppScreen, params: Record<string, any> = {}) => {
    applyStack([...stackRef.current, normalizeEntry(screen, params)], 'push');
  }, [applyStack]);
  const switchTab = useCallback((tab: MainTab) => {
    applyStack([{ screen: tab, params: {} }], 'push');
  }, [applyStack]);
  const goBack = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' &&
        window.history.state?.waroTransStack?.length > 1) {
      window.history.back();
      return;
    }
    const previous = stackRef.current.length > 1 ? stackRef.current.slice(0, -1) : [{ screen: 'home' as const, params: {} }];
    applyStack(previous, 'replace');
  }, [applyStack]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      applyStack(stackRef.current, 'replace');
      const onPop = (event: PopStateEvent) => applyStack(event.state?.waroTransStack || [parseUrl(window.location.href)]);
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
    const hardware = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length === 1 && stackRef.current[0].screen === 'home') return false;
      goBack(); return true;
    });
    let mounted = true;
    const open = (url: string) => { try { applyStack([parseUrl(url)]); } catch {} };
    void Linking.getInitialURL().then(url => { if (url && mounted) open(url); });
    const links = Linking.addEventListener('url', ({ url }) => open(url));
    return () => { mounted = false; hardware.remove(); links.remove(); };
  }, [applyStack, goBack]);
  return (
    <NavigationContext.Provider value={{
      currentScreen: current.screen, activeTab: tabFor(current.screen), params: current.params,
      navigate, switchTab, goBack, activeJobCount, setActiveJobCount, dockHeight, setDockHeight,
    }}>{children}</NavigationContext.Provider>
  );
}
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within a NavigationProvider');
  return context;
}
