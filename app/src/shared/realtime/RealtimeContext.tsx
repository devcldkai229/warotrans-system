import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  realtimeClient,
  RobotConnectivityEvent,
  RobotTelemetryEvent,
  TransportStatusEvent,
  JobUpdatedRealtimeEvent,
} from './realtimeClient';
import { triggerHaptic } from '../utils/haptics';
import { getAccessToken, onAccessTokenChange } from '../api/client';
import { listRobots } from '../api/fleetApi';
import { useNotificationInbox, type NotificationInboxState } from './useNotificationInbox';

export type { JobUpdatedRealtimeEvent };

interface RealtimeContextValue extends NotificationInboxState {
  isConnected: boolean;
  robotTelemetry: Record<string, RobotTelemetryEvent>;
  robotConnectivity: Record<string, RobotConnectivityEvent>;
  lastTransportStatus: TransportStatusEvent | null;
  lastJobUpdate: JobUpdatedRealtimeEvent | null;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [robotTelemetry, setRobotTelemetry] = useState<Record<string, RobotTelemetryEvent>>({});
  const [robotConnectivity, setRobotConnectivity] = useState<Record<string, RobotConnectivityEvent>>({});

  const inbox = useNotificationInbox();
  const [lastTransportStatus, setLastTransportStatus] = useState<TransportStatusEvent | null>(null);
  const [lastJobUpdate, setLastJobUpdate] = useState<JobUpdatedRealtimeEvent | null>(null);
  const [accessToken, setAuthToken] = useState(getAccessToken);
  const telemetryVersions = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!accessToken || !getAccessToken()) {
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
  }, [accessToken, lastJobUpdate, isConnected]);

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

    const unsubToken = onAccessTokenChange((token) => {
      setAuthToken(token);
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
      unsubToken();
      realtimeClient.stop();
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const retry = setInterval(() => { if (!realtimeClient.isConnected) void realtimeClient.start(); }, 10000);
    return () => clearInterval(retry);
  }, [accessToken]);

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        robotTelemetry,
        robotConnectivity,
        ...inbox,
        lastTransportStatus,
        lastJobUpdate,
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
