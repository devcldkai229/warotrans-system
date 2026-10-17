import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  realtimeClient,
  RobotConnectivityEvent,
  RobotTelemetryEvent,
  LiveNotificationEvent,
  TransportStatusEvent,
  JobUpdatedRealtimeEvent,
} from './realtimeClient';
import { triggerHaptic } from '../utils/haptics';
import { getAccessToken, getSessionGeneration, onAccessTokenChange } from '../api/client';

import { listRobots } from '../api/fleetApi';
export type { JobUpdatedRealtimeEvent };

interface RealtimeContextValue {
  isConnected: boolean;
  resyncVersion: number;
  robotTelemetry: Record<string, RobotTelemetryEvent>;
  robotConnectivity: Record<string, RobotConnectivityEvent>;
  notifications: LiveNotificationEvent[];
  unreadCount: number;
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  lastTransportStatus: TransportStatusEvent | null;
  lastJobUpdate: JobUpdatedRealtimeEvent | null;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  isConnected: false,
  resyncVersion: 0,
  robotTelemetry: {},
  robotConnectivity: {},
  notifications: [],
  unreadCount: 0,
  markAllNotificationsRead: () => {},
  markNotificationRead: () => {},
  lastTransportStatus: null,
  lastJobUpdate: null,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [robotTelemetry, setRobotTelemetry] = useState<Record<string, RobotTelemetryEvent>>({});
  const [robotConnectivity, setRobotConnectivity] = useState<Record<string, RobotConnectivityEvent>>({});
  const [notifications, setNotifications] = useState<LiveNotificationEvent[]>([]);
  const [resyncVersion, setResyncVersion] = useState(0);
  const [lastTransportStatus, setLastTransportStatus] = useState<TransportStatusEvent | null>(null);
  const [lastJobUpdate, setLastJobUpdate] = useState<JobUpdatedRealtimeEvent | null>(null);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const connectivityRevisions = new Map<string, number>();
    const push = (event: LiveNotificationEvent) => setNotifications(prev => [event, ...prev.filter(n => n.id !== event.id)].slice(0, 100));
    const resync = async () => {
      const generation = getSessionGeneration();
      const revision = sequence;
      const observedAt = Date.now();
      try {
        const response = await listRobots();
        if (!active || generation !== getSessionGeneration() || !getAccessToken()) return;
        const telemetry: Record<string, RobotTelemetryEvent> = {};
        const connectivity: Record<string, RobotConnectivityEvent> = {};
        for (const robot of response.items) {
          telemetry[robot.code] = { robotId: robot.id, robotCode: robot.code, poseX: robot.poseX, poseY: robot.poseY, poseYaw: robot.poseYaw, batteryPercent: robot.batteryPercent, navigationStatus: robot.navigationStatus, localizationStatus: robot.localizationStatus, lastTelemetryAt: robot.lastTelemetryAt };
          connectivity[robot.code] = { robotId: robot.id, robotCode: robot.code, status: robot.status, isOnline: robot.isOnline, lastHeartbeatAt: robot.lastHeartbeatAt, observedAt };
        }
        setRobotTelemetry(previous => Object.fromEntries(Object.entries(telemetry).map(([code, snapshot]) => {
          const live = previous[code];
          return [code, live?.lastTelemetryAt && (!snapshot.lastTelemetryAt || Date.parse(live.lastTelemetryAt) > Date.parse(snapshot.lastTelemetryAt)) ? live : snapshot];
        })));
        setRobotConnectivity(previous => Object.fromEntries(Object.entries(connectivity).map(([code, snapshot]) =>
          [code, (connectivityRevisions.get(code) ?? 0) > revision && previous[code] ? previous[code] : snapshot],
        )));
      } catch { /* Screens expose REST errors separately. */ }
    };

    const unsubConnState = realtimeClient.onConnectionStateChange((connected) => {
      setIsConnected(connected);
      if (connected) { setResyncVersion(v => v + 1); void resync(); }
    });

    const unsubTelemetry = realtimeClient.onTelemetryUpdated((event) => {
      setRobotTelemetry((prev) => ({
        ...prev,
        [event.robotCode]: event,
      }));
    });

    const unsubConnectivity = realtimeClient.onConnectivityChanged((event) => {
      connectivityRevisions.set(event.robotCode, sequence + 1);
      push({ id: `connectivity-${event.robotId}-${++sequence}`, category: event.isOnline ? 'SYSTEM' : 'HAZARD',
        title: `${event.robotCode} ${event.isOnline ? 'Online' : 'Offline'}`, message: `Robot status: ${event.status}`,
        timeLabel: `Received ${new Date().toLocaleTimeString()}`, robotId: event.robotId, isRead: false });
      setRobotConnectivity((prev) => ({
        ...prev,
        [event.robotCode]: { ...event, observedAt: Date.now() },
      }));
    });

    const unsubNotification = realtimeClient.onNotificationReceived((event) => {
      triggerHaptic(event.category === 'HAZARD' ? 'warning' : 'tap');
      push(event);
    });

    const unsubTransport = realtimeClient.onTransportStatusChanged((event) => {
      setLastTransportStatus(event);
    });

    const unsubJobUpdate = realtimeClient.onJobUpdated((event) => {
      setLastJobUpdate(event);
      push({ id: `job-${event.jobId}-${++sequence}`, category: event.failureCode || event.errorCode ? 'HAZARD' : 'SYSTEM',
        title: `Job ${event.jobNo ?? event.jobId}`, message: `${event.kind === 'step' ? event.stepKey ?? 'Step' : 'Job'}: ${event.status}`,
        timeLabel: event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString() : `Received ${new Date().toLocaleTimeString()}`, jobId: event.jobId, isRead: false });
    });

    const unsubToken = onAccessTokenChange((token) => {
      if (!token) {
        setRobotTelemetry({}); setRobotConnectivity({}); setNotifications([]);
        setLastJobUpdate(null); setLastTransportStatus(null);
      }
      realtimeClient.restart().catch(() => {});
    });

    void realtimeClient.start();
    return () => {
      active = false;
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

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAllNotificationsRead = () => {
    triggerHaptic('tap');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        resyncVersion,
        robotTelemetry,
        robotConnectivity,
        notifications,
        unreadCount,
        markAllNotificationsRead,
        markNotificationRead,
        lastTransportStatus,
        lastJobUpdate,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
