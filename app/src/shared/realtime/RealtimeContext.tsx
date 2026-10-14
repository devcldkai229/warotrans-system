import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  realtimeClient,
  RobotConnectivityEvent,
  RobotTelemetryEvent,
  LiveNotificationEvent,
  TransportStatusEvent,
} from './realtimeClient';
import { triggerHaptic } from '../utils/haptics';

interface RealtimeContextValue {
  isConnected: boolean;
  robotTelemetry: Record<string, RobotTelemetryEvent>;
  robotConnectivity: Record<string, RobotConnectivityEvent>;
  notifications: LiveNotificationEvent[];
  unreadCount: number;
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  lastTransportStatus: TransportStatusEvent | null;
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
    title: 'Obstacle Cleared in Aisle 2',
    message: 'Dynamic rerouting restored. AMR-02 resumed planned speed.',
    timeLabel: '14m ago',
    robotId: 'AMR-02',
    isRead: false,
  },
  {
    id: 'notif-3',
    category: 'JOB_ASSIGNED',
    title: 'New Handover Task Assigned',
    message: 'Outbound Retrieval TR-2046 allocated to your shift zone.',
    timeLabel: '28m ago',
    jobId: 'TR-2046',
    isRead: false,
  },
  {
    id: 'notif-4',
    category: 'BATTERY_LOW',
    title: 'AMR-03 Scheduled for Recharging',
    message: 'Battery level reached 18%. Autonomous dock return initiated.',
    timeLabel: '1h ago',
    robotId: 'AMR-03',
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

  useEffect(() => {
    realtimeClient.start();

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

    return () => {
      unsubConnState();
      unsubTelemetry();
      unsubConnectivity();
      unsubNotification();
      unsubTransport();
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
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
