// Gateway Heartbeat Monitor
// Broadcasts periodic tick events and monitors client health

import WebSocket from 'ws';
import { GatewayEvent } from './protocol';

export interface HeartbeatClient {
  ws: WebSocket;
  lastResponseTime: number;
}

export class GatewayHeartbeat {
  private clients: Map<WebSocket, HeartbeatClient> = new Map();
  private interval: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private timeoutMs: number;

  constructor(intervalMs: number = 30000, timeoutMs: number = 180000) {
    this.intervalMs = intervalMs;  // 30秒检查间隔
    this.timeoutMs = timeoutMs;    // 180秒超时（3分钟，足够长）
  }

  /**
   * Start the heartbeat interval.
   * Broadcasts tick events and checks client health periodically.
   *
   * @param broadcast - Function to broadcast events to all connected clients
   */
  startHeartbeat(broadcast: (event: GatewayEvent) => void): void {
    this.interval = setInterval(() => {
      this.broadcastTick(broadcast);
      this.checkClientHealth();
    }, this.intervalMs);
  }

  /**
   * Stop the heartbeat interval.
   */
  stopHeartbeat(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Register a new client for heartbeat monitoring.
   *
   * @param ws - The WebSocket connection to monitor
   */
  registerClient(ws: WebSocket): void {
    this.clients.set(ws, {
      ws,
      lastResponseTime: Date.now()
    });
  }

  /**
   * Unregister a client from heartbeat monitoring.
   *
   * @param ws - The WebSocket connection to remove
   */
  unregisterClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Record a response from a client, updating their last response time.
   *
   * @param ws - The WebSocket connection that responded
   */
  recordClientResponse(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      client.lastResponseTime = Date.now();
    }
  }

  /**
   * Broadcast a tick event to all clients.
   */
  private broadcastTick(broadcast: (event: GatewayEvent) => void): void {
    const tickEvent: GatewayEvent = {
      type: 'event',
      event: 'tick',
      payload: { timestamp: Date.now() }
    };
    broadcast(tickEvent);
  }

  /**
   * Check health of all registered clients.
   * Disconnects clients that have not responded within the timeout period.
   */
  private checkClientHealth(): void {
    const now = Date.now();
    const disconnectedClients: WebSocket[] = [];

    for (const [ws, client] of this.clients.entries()) {
      if ((now - client.lastResponseTime) > this.timeoutMs) {
        disconnectedClients.push(ws);
      }
    }

    for (const ws of disconnectedClients) {
      console.log('Client timeout, disconnecting:', (ws as any).id || 'unknown');
      ws.close(1001, 'Heartbeat timeout');
      this.clients.delete(ws);
    }
  }
}