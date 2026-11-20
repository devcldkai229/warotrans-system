import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  realtimeClient,
  HandoverStopsChangedEvent,
  RobotConnectivityEvent,
  RobotTelemetryEvent,
  TransportStatusEvent,
  JobUpdatedRealtimeEvent,
  RobotHealthEvent,
  TrafficUpdatedEvent,
} from './realtimeClient';
import { triggerHaptic } from '../utils/haptics';
import { getAccessToken, onAccessTokenChange } from '../api/client';
import { listRobots } from '../api/fleetApi';
import { useNotificationInbox, type NotificationInboxState } from './useNotificationInbox';
import { useHandoverStopHeartbeat } from './useHandoverStopHeartbeat';

export type { HandoverStopsChangedEvent, JobUpdatedRealtimeEvent };

interface RealtimeContextValue extends NotificationInboxState {
  isConnected: boolean;
  robotTelemetry: Record<string, RobotTelemetryEvent>;
  robotConnectivity: Record<string, RobotConnectivityEvent>;
  lastTransportStatus: TransportStatusEvent | null;
  lastJobUpdate: JobUpdatedRealtimeEvent | null;
  lastHandoverStopsChange: HandoverStopsChangedEvent | null;
  /** Latest overall health per robot id (robotHealthUpdated). */
  robotHealth: Record<string, RobotHealthEvent>;
  lastTrafficUpdate: TrafficUpdatedEvent | null;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [robotTelemetry, setRobotTelemetry] = useState<Record<string, RobotTelemetryEvent>>({});
  const [robotConnectivity, setRobotConnectivity] = useState<Record<string, RobotConnectivityEvent>>({});
  const [robotHealth, setRobotHealth] = useState<Record<string, RobotHealthEvent>>({});
  const [lastTrafficUpdate, setLastTrafficUpdate] = useState<TrafficUpdatedEvent | null>(null);

  const inbox = useNotificationInbox();
  const [lastTransportStatus, setLastTransportStatus] = useState<TransportStatusEvent | null>(null);
  const [lastJobUpdate, setLastJobUpdate] = useState<JobUpdatedRealtimeEvent | null>(null);
  const [lastHandoverStopsChange, setLastHandoverStopsChange] = useState<HandoverStopsChangedEvent | null>(null);
  const [accessToken, setAuthToken] = useState(getAccessToken);
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const telemetryVersions = useRef<Record<string, number>>({});

  useHandoverStopHeartbeat(appActive, accessToken, lastHandoverStopsChange || lastJobUpdate);

  useEffect(() => {
    const lifecycle = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => { lifecycle.remove(); };
  }, []);

  useEffect(() => {
    if (!accessToken || !getAccessToken() || !appActive) {
      return;
    }
    let cancelled = false;
    const versions = { ...telemetryVersions.current };
    async function hydrateLiveState() {
      const fleet = await listRobots().catch(() => null);
      if (cancelled || getAccessToken() !== accessToken) return;
      if (fleet) {
        setRobotTelemetry((prev) => {
          const next = { ...prev };
          fleet.items.forEach((robot) => {
            // A SignalR update received during this fetch is newer than its snapshot.
            if (telemetryVersions.current[robot.code] !== versions[robot.code]) return;
            next[robot.code] = {
              robotId: robot.id, robotCode: robot.code,
              poseX: robot.poseX ?? 0, poseY: robot.poseY ?? 0, poseYaw: robot.poseYaw ?? 0,
              batteryPercent: robot.batteryPercent ?? null,
              navigationStatus: robot.navigationStatus,
              localizationStatus: robot.localizationStatus,
              lastTelemetryAt: robot.lastTelemetryAt,
            };
          });
          return next;
        });
      }
    }
    hydrateLiveState().catch(() => {});
    const poll = setInterval(() => { void hydrateLiveState().catch(() => {}); }, 15000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [accessToken, appActive, lastJobUpdate, isConnected]);

  useEffect(() => {
    realtimeClient.start().catch(() => {});

    const unsubConnState = realtimeClient.onConnectionStateChange((connected) => {
      setIsConnected(connected);
    });

    const unsubTelemetry = realtimeClient.onTelemetryUpdated((event) => {
      telemetryVersions.current[event.robotCode] = (telemetryVersions.current[event.robotCode] || 0) + 1;
      setRobotTelemetry((prev) => ({
        ...prev,
        [event.robotCode]: event,
      }));
    });

    const unsubConnectivity = realtimeClient.onConnectivityChanged((event) => {
      setRobotConnectivity((prev) => ({
        ...prev,
        [event.robotCode]: event,
      }));
    });

    const unsubNotification = realtimeClient.onNotificationReceived((event) => {
      triggerHaptic(event.category === 'HAZARD' ? 'warning' : 'tap');
    });

    const unsubTransport = realtimeClient.onTransportStatusChanged((event) => {
      setLastTransportStatus(event);
    });

    const unsubJobUpdate = realtimeClient.onJobUpdated((event) => {
      setLastJobUpdate(event);
    });

    const unsubHandoverStops = realtimeClient.onHandoverStopsChanged((event) => {
      setLastHandoverStopsChange(event);
      void client.invalidateQueries({ queryKey: ['handover-stops'] });
      void client.invalidateQueries({ queryKey: ['handover-stops-mine'] });
    });

    const unsubHealth = realtimeClient.onHealthUpdated((event) => {
      if (typeof event?.robotId === 'string') setRobotHealth(prev => ({ ...prev, [event.robotId]: event }));
    });

    const unsubTraffic = realtimeClient.onTrafficUpdated((event) => {
      setLastTrafficUpdate(event);
    });

    const unsubToken = onAccessTokenChange((token) => {
      setAuthToken(token);
      telemetryVersions.current = {};
      setRobotTelemetry({});
      setRobotConnectivity({});
      setRobotHealth({});
      setLastTransportStatus(null);
      setLastJobUpdate(null);
      setLastHandoverStopsChange(null);
      setLastTrafficUpdate(null);
      // When token becomes available or changes on login/logout, reconnect with Bearer token
      realtimeClient.restart().catch(() => {});
    });

    return () => {
      unsubConnState();
      unsubTelemetry();
      unsubConnectivity();
      unsubNotification();
      unsubTransport();
      unsubJobUpdate();
      unsubHandoverStops();
      unsubHealth();
      unsubTraffic();
      unsubToken();
      realtimeClient.stop();
    };
  }, [client]);

  useEffect(() => {
    if (!accessToken || !appActive) return;
    if (!realtimeClient.isConnected) void realtimeClient.start();
    const retry = setInterval(() => { if (!realtimeClient.isConnected) void realtimeClient.start(); }, 10000);
    return () => clearInterval(retry);
  }, [accessToken, appActive]);

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        robotTelemetry,
        robotConnectivity,
        ...inbox,
        lastTransportStatus,
        lastJobUpdate,
        lastHandoverStopsChange,
        robotHealth,
        lastTrafficUpdate,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used within a RealtimeProvider');
  return context;
}
