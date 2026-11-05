import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  realtimeClient,
  RobotConnectivityEvent,
  RobotTelemetryEvent,
  LiveNotificationEvent,
  TransportStatusEvent,
  JobUpdatedRealtimeEvent,
} from './realtimeClient';
import { triggerHaptic } from '../utils/haptics';
import { getAccessToken, onAccessTokenChange } from '../api/client';
import { listJobs } from '../api/executionApi';
import { listRobots } from '../api/fleetApi';
import type { JobDetailResponse, RobotResponse } from '../types/contracts';
import { jobActivityTime } from './jobActivity';

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

const INITIAL_NOTIFICATIONS: LiveNotificationEvent[] = [];

const RealtimeContext = createContext<RealtimeContextValue>({
  isConnected: false,
  robotTelemetry: {},
  robotConnectivity: {},
  notifications: INITIAL_NOTIFICATIONS,
  unreadCount: 0,
  markAllNotificationsRead: () => {},
  markNotificationRead: () => {},
  lastTransportStatus: null,
  lastJobUpdate: null,
});

function notificationFromJob(job: JobDetailResponse, robots: RobotResponse[]): LiveNotificationEvent | null {
  const context = job.contextValues;
  const robotCode = (context?.assignedRobotCode as string) ||
    robots.find((robot) => robot.id === context?.assignedRobotId)?.code || 'Unassigned';
  const firstMeta = Array.isArray(context?.containerMeta) ? context.containerMeta[0] : null;
  const firstContainerCode = firstMeta?.code || job.containers?.[0]?.containerId || 'tote';
  const base: LiveNotificationEvent = {
    id: `backend-job-${job.id}-${job.status}-${Boolean(context?.hasWaitingHandover)}`,
    category: 'JOB_ASSIGNED',
    title: '',
    message: '',
    timeLabel: jobActivityTime(job),
    jobId: job.id,
    robotId: robotCode,
    isRead: false,
  };
  if (context?.hasWaitingHandover) {
    return { ...base, category: 'ROBOT_ARRIVED', title: `Carrier ${robotCode} Awaiting Handover`,
      message: `${job.jobNo}: Confirm container ${firstContainerCode} at ${context?.currentStop || context?.sourceEndpointCode || 'station'}.` };
  }
  if (['RECOVERY_REQUIRED', 'FAILED', 'PAUSED'].includes(job.status)) {
    return { ...base, category: 'HAZARD', title: `${job.jobNo} Attention Required (${job.status})`,
      message: job.failureMessage || `Route ${context?.routeText || ''} requires operator check.` };
  }
  if (job.status === 'RUNNING') {
    return { ...base, category: 'ROBOT_ARRIVED', title: `${robotCode} Executing ${job.jobNo}`,
      message: `Active route: ${context?.routeText || 'In transit'}.` };
  }
  if (['CREATED', 'QUEUED'].includes(job.status)) {
    return { ...base, title: `Job ${job.jobNo} Ready to Start`,
      message: `Route ${context?.routeText || ''} queued for AMR dispatch.` };
  }
  if (job.status === 'COMPLETED') {
    return { ...base, title: `Job ${job.jobNo} Completed`,
      message: `Route ${context?.routeText || ''} finished.`, isRead: true };
  }
  return null;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [robotTelemetry, setRobotTelemetry] = useState<Record<string, RobotTelemetryEvent>>({});
  const [robotConnectivity, setRobotConnectivity] = useState<Record<string, RobotConnectivityEvent>>({});

  const [notifications, setNotifications] = useState<LiveNotificationEvent[]>(INITIAL_NOTIFICATIONS);
  const [lastTransportStatus, setLastTransportStatus] = useState<TransportStatusEvent | null>(null);
  const [lastJobUpdate, setLastJobUpdate] = useState<JobUpdatedRealtimeEvent | null>(null);
  const [accessToken, setAuthToken] = useState(getAccessToken);
  const readNotificationIds = useRef(new Set<string>());
  const telemetryVersions = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!accessToken || !getAccessToken()) {
      setNotifications(INITIAL_NOTIFICATIONS.map((n) => ({ ...n, isRead: n.isRead || readNotificationIds.current.has(n.id) })));
      return;
    }
    let cancelled = false;
    const versions = { ...telemetryVersions.current };
    async function hydrateLiveState() {
      const [jobs, fleet] = await Promise.all([
        listJobs().catch(() => null),
        listRobots().catch(() => null),
      ]);
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
              batteryPercent: robot.batteryPercent ?? 0,
              navigationStatus: robot.navigationStatus,
              localizationStatus: robot.localizationStatus,
              lastTelemetryAt: robot.lastTelemetryAt,
            };
          });
          return next;
        });
      }
      if (!jobs) return;
      const realJobs = jobs;
      const derived = realJobs.map((job) => notificationFromJob(job, fleet?.items || []))
        .filter((n): n is LiveNotificationEvent => n !== null);
      setNotifications((prev) => {
        const next = realJobs.length > 0 ? [
          ...derived,
          ...prev.filter((n) => !n.id.startsWith('backend-job-') &&
            !INITIAL_NOTIFICATIONS.some((seed) => seed.id === n.id)),
        ] : INITIAL_NOTIFICATIONS;
        return next.map((n) => ({ ...n, isRead: n.isRead || readNotificationIds.current.has(n.id) ||
          prev.some((old) => old.id === n.id && old.isRead) }));
      });
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
      setNotifications((prev) => [{ ...event, isRead: event.isRead || readNotificationIds.current.has(event.id) ||
        prev.some((n) => n.id === event.id && n.isRead) }, ...prev.filter((n) => n.id !== event.id)]);
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

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAllNotificationsRead = () => {
    triggerHaptic('tap');
    setNotifications((prev) => prev.map((n) => {
      readNotificationIds.current.add(n.id);
      return { ...n, isRead: true };
    }));
  };

  const markNotificationRead = (id: string) => {
    readNotificationIds.current.add(id);
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
