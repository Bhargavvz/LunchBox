import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import type { OrderStatus, PingInput } from './types';

/** Messages on /topic/orders.{orderId}. Mirrors TrackingDtos.TrackingMessage in the backend. */
export interface TrackingMessage {
  type: 'location' | 'status';
  orderId: string;
  status: OrderStatus | null;
  lat: number | null;
  lng: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  etaSeconds: number | null;
  at: string;
}

/** Messages on /topic/admin.live. */
export interface LivePartnerMessage {
  partnerId: string;
  lat: number;
  lng: number;
  headingDeg: number | null;
  speedMps: number | null;
  activeOrders: number;
  at: string;
}

/** Messages on /topic/admin.alerts. */
export interface AdminAlert {
  type: string;
  orderId: string | null;
  partnerId: string | null;
  message: string;
  at: string;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeOptions {
  /** wss://api.example.com/ws */
  url: string;
  getToken: () => Promise<string | null>;
  /** React Native needs binary frames and NUL fix-ups (stompjs docs). */
  reactNative?: boolean;
  onStateChange?: (state: ConnectionState) => void;
  debug?: (msg: string) => void;
}

/**
 * STOMP connection with automatic reconnect. A fresh Firebase token is attached on every (re)connect, and
 * subscriptions are restored after reconnecting.
 */
export function createRealtime(options: RealtimeOptions) {
  const wanted = new Map<string, (body: unknown) => void>();
  const active = new Map<string, StompSubscription>();

  const client = new Client({
    brokerURL: options.url,
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    forceBinaryWSFrames: options.reactNative ?? false,
    appendMissingNULLonIncoming: options.reactNative ?? false,
    debug: options.debug ?? (() => undefined),
  });

  client.beforeConnect = async () => {
    options.onStateChange?.('connecting');
    const token = await options.getToken();
    client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  };
  client.onConnect = () => {
    active.clear();
    wanted.forEach((handler, destination) => active.set(destination, subscribeRaw(destination, handler)));
    options.onStateChange?.('connected');
  };
  client.onWebSocketClose = () => options.onStateChange?.('disconnected');
  client.onStompError = (frame) => options.debug?.(`STOMP error: ${frame.headers['message'] ?? ''}`);

  function subscribeRaw(destination: string, handler: (body: unknown) => void): StompSubscription {
    return client.subscribe(destination, (message: IMessage) => {
      try {
        handler(JSON.parse(message.body));
      } catch {
        // Ignore malformed frames.
      }
    });
  }

  function subscribe<T>(destination: string, handler: (body: T) => void): () => void {
    const h = handler as (body: unknown) => void;
    wanted.set(destination, h);
    if (client.connected) {
      active.set(destination, subscribeRaw(destination, h));
    }
    return () => {
      wanted.delete(destination);
      active.get(destination)?.unsubscribe();
      active.delete(destination);
    };
  }

  return {
    connect: () => client.activate(),
    disconnect: () => client.deactivate(),
    get connected() {
      return client.connected;
    },
    subscribeOrder: (orderId: string, handler: (m: TrackingMessage) => void) =>
      subscribe<TrackingMessage>(`/topic/orders.${orderId}`, handler),
    subscribeAdminLive: (handler: (m: LivePartnerMessage) => void) =>
      subscribe<LivePartnerMessage>('/topic/admin.live', handler),
    subscribeAdminAlerts: (handler: (m: AdminAlert) => void) => subscribe<AdminAlert>('/topic/admin.alerts', handler),
    /** Partner app: returns false when not connected so the caller can fall back to the HTTP batch endpoint. */
    sendLocation: (ping: PingInput): boolean => {
      if (!client.connected) return false;
      client.publish({ destination: '/app/partner.location', body: JSON.stringify(ping) });
      return true;
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
