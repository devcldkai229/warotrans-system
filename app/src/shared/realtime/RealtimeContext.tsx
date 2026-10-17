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
import { onAccessTokenChange } from '../api/client';

export type { JobUpdatedRealtimeEvent };

interface RealtimeContextValue {
  isConnected: boolean;
  robotTelemetry: Record<string, RobotTelemetryEvent>;
  robotConnectivity: Record<string, RobotConnectivityEvent>;
  notifications: LiveNotificationEvent[];
  unreadCount: number;
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  lastTransportStatus: TransportStatusEvent | null;
  lastJobUpdate: JobUpdatedRealtimeEvent | null;
}

const INITIAL_NOTIFICATIONS: LiveNotificationEvent[] = [
  {
    id: 'notif-1',
    category: 'ROBOT_ARRIVED',
    title: 'Carrier AMR-01 at Dock 01',
    message: 'Chassis ready for tote loading. Slot 1 awaiting barcode scan.',
    timeLabel: '2m ago',
    robotId: 'AMR-01',
    jobId: 'JOB-2026-0812',
    isRead: false,
  },
  {
    id: 'notif-2',
    category: 'HAZARD',
    title: 'AMR-02 Stalled in Corridor B2',
    message: 'Drive motor torque fault. 2 totes (BOX-401, BOX-402) require payload rescue.',
    timeLabel: '14m ago',
    robotId: 'AMR-02',
    jobId: 'JOB-2026-0819',
    isRead: false,
  },
  {
    id: 'notif-3',
    category: 'JOB_ASSIGNED',
    title: 'New Handover Task Assigned',
    message: 'Outbound Retrieval TR-2046 allocated to your shift zone.',
    timeLabel: '25m ago',
    robotId: 'AMR-02',
    jobId: 'JOB-2026-0813',
    isRead: false,
  },
  {
    id: 'notif-4',
    category: 'BATTERY_LOW',
    title: 'AMR-01 Scheduled for Fast Top-Up',
    message: 'Battery level at 85%. Scheduled for auto-charge after current putaway batch.',
    timeLabel: '1h ago',
    robotId: 'AMR-01',
    jobId: 'JOB-2026-0812',
    isRead: true,
  },
];

const RealtimeContext = createContext<RealtimeContextValue>({
  isConnected: false,
  robotTelemetry: {},
  robotConnectivity: {},
  notifications: INITIAL_NOTIFICATIONS,
  unreadCount: 3,
  markAllNotificationsRead: () => {},
  markNotificationRead: () => {},
  lastTransportStatus: null,
  lastJobUpdate: null,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [robotTelemetry, setRobotTelemetry] = useState<Record<string, RobotTelemetryEvent>>({
    'AMR-01': {
      robotId: 'rbt-001',
      robotCode: 'AMR-01',
      poseX: 18.5,
      poseY: 12.2,
      poseYaw: 1.57,
      batteryPercent: 88,
      navigationStatus: 'NAVIGATING',
      localizationStatus: 'TRACKED',
      lastTelemetryAt: new Date().toISOString(),
    },
    'AMR-02': {
      robotId: 'rbt-002',
      robotCode: 'AMR-02',
      poseX: 32.1,
      poseY: 8.4,
      poseYaw: 0.0,
      batteryPercent: 94,
      navigationStatus: 'STANDBY',
      localizationStatus: 'TRACKED',
      lastTelemetryAt: new Date().toISOString(),
    },
  });

  const [robotConnectivity, setRobotConnectivity] = useState<Record<string, RobotConnectivityEvent>>({
    'AMR-01': {
      robotId: 'rbt-001',
      robotCode: 'AMR-01',
      isOnline: true,
      status: 'AVAILABLE',
      lastHeartbeatAt: new Date().toISOString(),
    },
    'AMR-02': {
      robotId: 'rbt-002',
      robotCode: 'AMR-02',
      isOnline: true,
      status: 'AVAILABLE',
      lastHeartbeatAt: new Date().toISOString(),
    },
  });

  const [notifications, setNotifications] = useState<LiveNotificationEvent[]>(INITIAL_NOTIFICATIONS);
  const [lastTransportStatus, setLastTransportStatus] = useState<TransportStatusEvent | null>(null);
  const [lastJobUpdate, setLastJobUpdate] = useState<JobUpdatedRealtimeEvent | null>(null);

  useEffect(() => {
    realtimeClient.start().catch(() => {});

    const unsubConnState = realtimeClient.onConnectionStateChange((connected) => {
      setIsConnected(connected);
    });

    const unsubTelemetry = realtimeClient.onTelemetryUpdated((event) => {
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
      setNotifications((prev) => [event, ...prev]);
    });

    const unsubTransport = realtimeClient.onTransportStatusChanged((event) => {
      setLastTransportStatus(event);
    });

    const unsubJobUpdate = realtimeClient.onJobUpdated((event) => {
      setLastJobUpdate(event);
    });

    const unsubToken = onAccessTokenChange((token) => {
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
