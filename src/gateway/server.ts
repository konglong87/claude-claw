// Gateway WebSocket Server
// Main server that handles client connections, authentication, and protocol negotiation

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { GatewayAuth } from './auth';
import { GatewaySessionManager } from './session-manager';
import { GatewayHeartbeat } from './heartbeat';
import { GatewayEngine, SessionContext } from './engine';
import {
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  ConnectRequest,
  ConnectResponse,
  PROTOCOL_VERSION,
  GatewayPolicy
} from './protocol';
import { GatewayConfig } from './config';

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private server: http.Server | null = null;
  private auth: GatewayAuth;
  private sessionManager: GatewaySessionManager;
  private heartbeat: GatewayHeartbeat;
  private engine: GatewayEngine;
  private config: GatewayConfig;
  private clients: Set<WebSocket> = new Set();

  constructor(config: GatewayConfig) {
    this.config = config;
    this.auth = new GatewayAuth(config.auth);
    this.sessionManager = new GatewaySessionManager();
    this.heartbeat = new GatewayHeartbeat(config.heartbeat.interval);

    // Initialize execution engine
    this.engine = new GatewayEngine();

    console.log('[Gateway] Execution engine initialized');
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create HTTP server
      this.server = http.createServer();

      // Create WebSocket server
      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (ws: WebSocket, req) => {
        this.handleConnection(ws, req);
      });

      // Health check endpoint
      this.server.on('request', (req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
        }
      });

      const host = this.config.bind === 'loopback' ? '127.0.0.1' : '0.0.0.0';

      this.server.listen(port, host, () => {
        console.log(`Gateway server started on ${host}:${port}`);
        this.heartbeat.startHeartbeat((event) => this.broadcast(event));
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    this.heartbeat.stopHeartbeat();

    // Close all client connections
    for (const ws of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>(resolve => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>(resolve => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    console.log('Gateway server stopped');
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    this.clients.add(ws);
    this.heartbeat.registerClient(ws);

    console.log('New WebSocket connection');

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
        this.sendError(ws, 'invalid-message', 'Failed to parse message');
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this.heartbeat.unregisterClient(ws);
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
      this.heartbeat.unregisterClient(ws);
    });
  }

  private async handleMessage(ws: WebSocket, message: any): Promise<void> {
    // Handle Gateway protocol messages
    if (message.type === 'req') {
      await this.handleRequest(ws, message as GatewayRequest);
      return;
    }

    // Handle JSON-RPC messages from channel plugins (Feishu/DingTalk)
    if (message.jsonrpc === '2.0' && message.method === 'command') {
      await this.handleCommand(ws, message);
      return;
    }
  }

  /**
   * Handle command from channel plugins
   */
  private async handleCommand(ws: WebSocket, message: any): Promise<void> {
    try {
      const { id, params } = message;
      const { content, userId, chatId, chatType, platform } = params;

      console.log(`[Gateway] 收到命令: ${content} (来自: ${platform}/${userId})`);

      // Build session context
      const sessionContext: SessionContext = {
        sessionId: `${platform}-${userId}:${chatId}`,
        userId,
        chatId,
        platform,
        chatType: chatType || 'private',
      };

      // Execute command using GatewayEngine
      const result = await this.engine.executeCommand(content, sessionContext);

      // Send response back to client
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: {
          content: result.text,
          sessionId: result.sessionId,
          duration_ms: result.duration_ms,
          toolCalls: result.toolCalls,
        }
      };

      ws.send(JSON.stringify(response));

      console.log(
        `[Gateway] 命令执行成功: ${result.text.length} chars, ` +
        `${result.duration_ms}ms, ${result.toolCalls} tool calls`
      );
    } catch (error) {
      console.error('[Gateway] 命令处理错误:', error);

      const errorResponse = {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };

      ws.send(JSON.stringify(errorResponse));
    }
  }

  private async handleRequest(ws: WebSocket, request: GatewayRequest): Promise<void> {
    try {
      if (request.method === 'connect') {
        await this.handleConnect(ws, request);
      } else {
        // Handle other methods (to be implemented in later tasks)
        this.sendResponse(ws, request.id, false, undefined, {
          code: 'METHOD_NOT_IMPLEMENTED',
          message: `Method ${request.method} not implemented`
        });
      }
    } catch (error) {
      console.error('Error handling request:', error);
      this.sendError(ws, request.id, 'Internal server error');
    }
  }

  private async handleConnect(ws: WebSocket, request: GatewayRequest): Promise<void> {
    const connectRequest = request.params as ConnectRequest;

    // Protocol version negotiation
    if (connectRequest.minProtocol > PROTOCOL_VERSION || connectRequest.maxProtocol < PROTOCOL_VERSION) {
      this.sendResponse(ws, request.id, false, undefined, {
        code: 'PROTOCOL_VERSION_MISMATCH',
        message: `Server protocol version ${PROTOCOL_VERSION} not supported by client`
      });
      ws.close(1002, 'Protocol version mismatch');
      return;
    }

    // Authentication
    const authResult = this.auth.authenticate(connectRequest, this.config.bind);
    if (!authResult.success) {
      this.sendResponse(ws, request.id, false, undefined, {
        code: authResult.error!,
        message: 'Authentication failed'
      });
      ws.close(1008, 'Authentication failed');
      return;
    }

    // Send hello-ok response
    const response: ConnectResponse = {
      protocol: PROTOCOL_VERSION,
      policy: {
        tickIntervalMs: this.config.heartbeat.interval
      }
    };

    this.sendResponse(ws, request.id, true, { type: 'hello-ok', ...response });
    console.log(`Client connected: ${connectRequest.client.id} (${connectRequest.role})`);
  }

  private sendResponse(ws: WebSocket, id: string, ok: boolean, payload?: any, error?: any): void {
    const response: GatewayResponse = {
      type: 'res',
      id,
      ok,
      payload,
      error
    };
    ws.send(JSON.stringify(response));
  }

  private sendError(ws: WebSocket, id: string, message: string): void {
    this.sendResponse(ws, id, false, undefined, {
      code: 'ERROR',
      message
    });
  }

  private broadcast(event: GatewayEvent): void {
    const message = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Get the session manager for session tracking.
   * Reserved for future use in managing logical sessions.
   */
  getSessionManager(): GatewaySessionManager {
    return this.sessionManager;
  }
}