import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  HttpTransportType,
} from '@microsoft/signalr';
import type { NavigationStatus, LocalizationStatus, RobotStatus } from '../types/contracts';
import { getApiBaseUrl, getAccessToken, getSessionGeneration } from '../api/client';

export interface JobUpdatedRealtimeEvent {
  jobId: string;
  kind: 'job' | 'step';
  status: string;
  jobStepId?: string;
  stepKey?: string;
  jobNo?: string;
  robotId?: string | null;
  failureCode?: string | null;
  errorCode?: string | null;
  occurredAt?: string;
}

export interface RobotConnectivityEvent {
  robotId: string;
  robotCode: string;
  isOnline: boolean;
  status: RobotStatus;
  lastHeartbeatAt: string | null;
  /** Local observation time used only by snapshot merging, absent on the wire. */
  observedAt?: number;
}

export interface RobotTelemetryEvent {
  robotId: string;
  robotCode: string;
  poseX: number;
  poseY: number;
  poseYaw: number;
  batteryPercent: number | null;
  navigationStatus: NavigationStatus | null;
  localizationStatus: LocalizationStatus | null;
  lastTelemetryAt: string | null;
}

export interface LiveNotificationEvent {
  id: string;
  category: 'ROBOT_ARRIVED' | 'HAZARD' | 'JOB_ASSIGNED' | 'BATTERY_LOW' | 'SYSTEM';
  title: string;
  message: string;
  timeLabel: string;
  robotId?: string;
  jobId?: string;
  isRead: boolean;
}

export interface TransportStatusEvent {
  transportRequestId: string;
  requestCode: string;
  status: string;
  timestamp: string;
}

export type RealtimeEventHandler<T> = (data: T) => void;

class RealtimeClient {
  private connection: HubConnection | null = null;
  private operations: Promise<void> = Promise.resolve();
  private wanted = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private serialize(action: () => Promise<void>): Promise<void> {
    const next = this.operations.then(action, action);
    this.operations = next.catch(() => {});
    return next;
  }
  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private scheduleRetry() {
    if (!this.wanted || !getAccessToken() || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.serialize(() => this.connect());
    }, Math.min(30000, 1000 * 2 ** Math.min(this.retryAttempt++, 5)));
  }
  public start(): Promise<void> {
    this.wanted = true;
    return this.serialize(() => this.connect());
  }

  private connectivityListeners = new Set<RealtimeEventHandler<RobotConnectivityEvent>>();
  private telemetryListeners = new Set<RealtimeEventHandler<RobotTelemetryEvent>>();
  private notificationListeners = new Set<RealtimeEventHandler<LiveNotificationEvent>>();
  private transportStatusListeners = new Set<RealtimeEventHandler<TransportStatusEvent>>();
  private jobUpdatedListeners = new Set<RealtimeEventHandler<JobUpdatedRealtimeEvent>>();
  private connectionStateListeners = new Set<(connected: boolean) => void>();

  public get isConnected(): boolean {
    return this.connection?.state === HubConnectionState.Connected;
  }

  private async connect(): Promise<void> {
    this.clearRetry();
    if (!this.wanted || !getAccessToken() || this.connection?.state === HubConnectionState.Connected) return;
    const generation = getSessionGeneration();
    const current = () => generation === getSessionGeneration() && !!getAccessToken();
    const baseUrl = getApiBaseUrl();
    const hubUrl = `${baseUrl.replace(/\/$/, '')}/hubs/notifications`;

    try {
      this.connection = new HubConnectionBuilder()
        .withUrl(hubUrl, {
          accessTokenFactory: () => getAccessToken() ?? '',
          transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(LogLevel.Warning)
        .build();

      this.connection.on('robotConnectivityChanged', (data: RobotConnectivityEvent) => {
        if (!current()) return;
        this.connectivityListeners.forEach((fn) => fn(data));
      });

      this.connection.on('robotTelemetryUpdated', (data: RobotTelemetryEvent) => {
        if (!current()) return;
        this.telemetryListeners.forEach((fn) => fn(data));
      });

      this.connection.on('notificationReceived', (data: LiveNotificationEvent) => {
        if (!current()) return;
        this.notificationListeners.forEach((fn) => fn(data));
      });

      this.connection.on('transportRequestStatusChanged', (data: TransportStatusEvent) => {
        if (!current()) return;
        this.transportStatusListeners.forEach((fn) => fn(data));
      });

      this.connection.on('jobUpdated', (data: JobUpdatedRealtimeEvent) => {
        if (!current()) return;
        this.jobUpdatedListeners.forEach((fn) => fn(data));
      });

      this.connection.onreconnecting(() => {
        this.notifyConnectionState(false);
      });

      this.connection.onreconnected(() => {
        if (!current()) return;
        this.notifyConnectionState(true);
      });

      const connection = this.connection;
      this.connection.onclose(() => {
        if (this.connection !== connection) return;
        this.connection = null;
        this.notifyConnectionState(false);
        this.scheduleRetry();
      });

      await this.connection.start();
      if (!current() || !this.wanted) { await this.disconnect(); return; }
      this.retryAttempt = 0;
      this.notifyConnectionState(true);
    } catch (err) {
      console.warn('Realtime Hub connection offline or unreachable:', hubUrl);
      this.connection = null;
      this.notifyConnectionState(false);
      this.scheduleRetry();
    }
  }

  private async disconnect(): Promise<void> {
    this.clearRetry();
    const connection = this.connection;
    this.connection = null;
    if (connection) { try { await connection.stop(); } catch { /* Already closed. */ } }
    this.notifyConnectionState(false);
  }
  public stop(): Promise<void> {
    this.wanted = false;
    this.clearRetry();
    return this.serialize(() => this.disconnect());
  }
  public restart(): Promise<void> {
    this.wanted = !!getAccessToken();
    this.clearRetry();
    return this.serialize(async () => { await this.disconnect(); await this.connect(); });
  }

  public onConnectivityChanged(fn: RealtimeEventHandler<RobotConnectivityEvent>): () => void {
    this.connectivityListeners.add(fn);
    return () => this.connectivityListeners.delete(fn);
  }

  public onTelemetryUpdated(fn: RealtimeEventHandler<RobotTelemetryEvent>): () => void {
    this.telemetryListeners.add(fn);
    return () => this.telemetryListeners.delete(fn);
  }

  public onNotificationReceived(fn: RealtimeEventHandler<LiveNotificationEvent>): () => void {
    this.notificationListeners.add(fn);
    return () => this.notificationListeners.delete(fn);
  }

  public onTransportStatusChanged(fn: RealtimeEventHandler<TransportStatusEvent>): () => void {
    this.transportStatusListeners.add(fn);
    return () => this.transportStatusListeners.delete(fn);
  }

  public onJobUpdated(fn: RealtimeEventHandler<JobUpdatedRealtimeEvent>): () => void {
    this.jobUpdatedListeners.add(fn);
    return () => this.jobUpdatedListeners.delete(fn);
  }

  public onConnectionStateChange(fn: (connected: boolean) => void): () => void {
    this.connectionStateListeners.add(fn);
    fn(this.isConnected);
    return () => this.connectionStateListeners.delete(fn);
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionStateListeners.forEach((fn) => fn(connected));
  }
}

export const realtimeClient = new RealtimeClient();
