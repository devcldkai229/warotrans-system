import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  HttpTransportType,
} from '@microsoft/signalr';
import { getApiBaseUrl, getBearerToken } from '../api/client';

export interface RobotConnectivityEvent {
  robotId: string;
  robotCode: string;
  isOnline: boolean;
  status: string;
  lastHeartbeatAt: string | null;
}

export interface RobotTelemetryEvent {
  robotId: string;
  robotCode: string;
  poseX: number;
  poseY: number;
  poseYaw: number;
  batteryPercent: number;
  navigationStatus: string | null;
  localizationStatus: string | null;
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
  private isConnecting = false;

  private connectivityListeners = new Set<RealtimeEventHandler<RobotConnectivityEvent>>();
  private telemetryListeners = new Set<RealtimeEventHandler<RobotTelemetryEvent>>();
  private notificationListeners = new Set<RealtimeEventHandler<LiveNotificationEvent>>();
  private transportStatusListeners = new Set<RealtimeEventHandler<TransportStatusEvent>>();
  private connectionStateListeners = new Set<(connected: boolean) => void>();

  public get isConnected(): boolean {
    return this.connection?.state === HubConnectionState.Connected;
  }

  public async start(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    const baseUrl = getApiBaseUrl();
    const hubUrl = `${baseUrl.replace(/\/$/, '')}/hubs/notifications`;

    try {
      this.connection = new HubConnectionBuilder()
        .withUrl(hubUrl, {
          accessTokenFactory: () => getBearerToken() || '',
          transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(LogLevel.Warning)
        .build();

      this.connection.on('robotConnectivityChanged', (data: RobotConnectivityEvent) => {
        this.connectivityListeners.forEach((fn) => fn(data));
      });

      this.connection.on('robotTelemetryUpdated', (data: RobotTelemetryEvent) => {
        this.telemetryListeners.forEach((fn) => fn(data));
      });

      this.connection.on('notificationReceived', (data: LiveNotificationEvent) => {
        this.notificationListeners.forEach((fn) => fn(data));
      });

      this.connection.on('transportRequestStatusChanged', (data: TransportStatusEvent) => {
        this.transportStatusListeners.forEach((fn) => fn(data));
      });

      this.connection.onreconnecting(() => {
        this.notifyConnectionState(false);
      });

      this.connection.onreconnected(() => {
        this.notifyConnectionState(true);
      });

      this.connection.onclose(() => {
        this.notifyConnectionState(false);
      });

      await this.connection.start();
      this.notifyConnectionState(true);
    } catch (err) {
      // In local dev/demo without backend running, log quietly without halting runtime
      console.warn('Realtime Hub connection offline or unreachable:', hubUrl);
      this.notifyConnectionState(false);
    } finally {
      this.isConnecting = false;
    }
  }

  public async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // quiet shutdown
      }
      this.connection = null;
      this.notifyConnectionState(false);
    }
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
