// Gateway WebSocket Server
// Main server that handles client connections, authentication, and protocol negotiation

// ✅ MACRO polyfill - 开发环境需要手动注入
if (typeof (globalThis as any).MACRO === 'undefined') {
  (globalThis as any).MACRO = {
    VERSION: '1.0.0-dev',
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/issues',
    ISSUES_EXPLAINER: 'report the issue at https://github.com/anthropics/claude-code/issues',
    NATIVE_PACKAGE_URL: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
    PACKAGE_URL: 'https://www.npmjs.com/package/claude-code',
    VERSION_CHANGELOG: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  }
}

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

/**
 * Type definitions for SDKMessage chunk handling
 * These are narrowed types for specific chunk types from QueryEngine
 */

// Content block delta event from partial_assistant messages
interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
}

// Any event type from partial_assistant
interface StreamEvent {
  type: string;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  [key: string]: unknown;
}

// Partial assistant message chunk
interface PartialAssistantChunk {
  type: 'partial_assistant';
  event?: ContentBlockDeltaEvent | StreamEvent;
  partial?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

// Assistant message chunk
interface AssistantChunk {
  type: 'assistant';
  message?: {
    content?: Array<{
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
}

// Result chunk with usage info
interface ResultChunk {
  type: 'result';
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// Union type for all chunk types we handle
type StreamChunk = PartialAssistantChunk | AssistantChunk | ResultChunk | { type: string; [key: string]: unknown };

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

      // HTTP request handler
      this.server.on('request', (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        // Health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
          return;
        }

        // OpenAI Chat Completions API endpoint
        if (req.url === '/v1/chat/completions' && req.method === 'POST') {
          this.handleOpenAIRequest(req, res);
          return;
        }

        // 404 for other routes
        res.writeHead(404);
        res.end('Not Found');
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

  /**
   * Handle OpenAI Chat Completions API request
   */
  private async handleOpenAIRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Parse request body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);

        // Validate required fields
        if (!requestData.messages || !Array.isArray(requestData.messages)) {
          return this.sendOpenAIError(res, 400, 'messages array is required', 'invalid_request_error', 'missing_messages');
        }

        if (requestData.messages.length === 0) {
          return this.sendOpenAIError(res, 400, 'messages array must not be empty', 'invalid_request_error', 'empty_messages');
        }

        const lastMessage = requestData.messages[requestData.messages.length - 1];
        if (lastMessage.role !== 'user') {
          return this.sendOpenAIError(res, 400, 'Last message must have role \'user\'', 'invalid_request_error', 'invalid_last_message_role');
        }

        // Extract user content
        const userContent = this.extractUserContent(lastMessage);
        if (!userContent) {
          return this.sendOpenAIError(res, 400, 'Unable to extract content from user message', 'invalid_request_error', 'invalid_user_content');
        }

        // Generate session ID
        const sessionId = `chatcmpl-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 15)}`;
        const model = requestData.model || 'moonshotai/kimi-k2.5';

        // Build session context
        const sessionContext: SessionContext = {
          sessionId,
          userId: 'openai-user',
          chatId: sessionId,
          platform: 'openai',
          chatType: 'private',
        };

        const startTime = Date.now();

        // Check if streaming is requested
        if (requestData.stream === true) {
          await this.streamOpenAIResponse(res, sessionContext, userContent, sessionId, model);
        } else {
          // Non-streaming response
          const result = await this.engine.executeCommand(userContent, sessionContext);

          // Format response in OpenAI format
          const response = {
            id: sessionId,
            object: 'chat.completion',
            created: Math.floor(startTime / 1000),
            model: model,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: result.text,
              },
              finish_reason: 'stop',
            }],
            usage: {
              prompt_tokens: result.usage?.input_tokens || 0,
              completion_tokens: result.usage?.output_tokens || 0,
              total_tokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
            },
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));

          console.log(`[OpenAI API] Request completed: ${result.duration_ms}ms, ${result.toolCalls} tool calls`);
        }

        // Clear session after response
        this.engine.clearSession(sessionId);

      } catch (error) {
        console.error('[OpenAI API] Error:', error);
        return this.sendOpenAIError(res, 500,
          error instanceof Error ? error.message : 'Internal error',
          'internal_error', 'internal_error');
      }
    });
  }

  /**
   * Stream OpenAI response in SSE format
   */
  private async streamOpenAIResponse(
    res: http.ServerResponse,
    sessionContext: SessionContext,
    userContent: string,
    sessionId: string,
    model: string
  ): Promise<void> {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const timestamp = Math.floor(Date.now() / 1000);

    // Send initial chunk (role: assistant)
    res.write(`data: ${JSON.stringify({
      id: sessionId,
      object: 'chat.completion.chunk',
      created: timestamp,
      model: model,
      choices: [{index: 0, delta: {role: 'assistant'}, finish_reason: null}]
    })}\n\n`);

    try {
      // Get generator from GatewayEngine using public method
      const generator = this.engine.getMessageGenerator(sessionContext, userContent);

      let totalContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason = 'stop';

      // Stream chunks from QueryEngine
      for await (const chunk of generator) {
        // Handle partial_assistant (streaming events)
        if (chunk.type === 'partial_assistant') {
          const partialChunk = chunk as PartialAssistantChunk;
          if (partialChunk.event) {
            const event = partialChunk.event;

            // Handle content_block_delta with text_delta
            if (event.type === 'content_block_delta' && event.delta) {
              const delta = event.delta;
              if (delta.type === 'text_delta' && delta.text) {
                totalContent += delta.text;

                res.write(`data: ${JSON.stringify({
                  id: sessionId,
                  object: 'chat.completion.chunk',
                  created: timestamp,
                  model: model,
                  choices: [{index: 0, delta: {content: delta.text}, finish_reason: null}]
                })}\n\n`);
              }
            }
          }

          // Handle usage info from partial messages
          if (partialChunk.partial?.usage) {
            inputTokens = partialChunk.partial.usage.input_tokens || 0;
            outputTokens = partialChunk.partial.usage.output_tokens || 0;
          }
        }

        // Handle assistant message for text content (fallback for non-streaming QueryEngine)
        if (chunk.type === 'assistant') {
          const assistantChunk = chunk as AssistantChunk;
          if (assistantChunk.message?.content) {
            const content = assistantChunk.message.content;
            for (const block of content) {
              // Handle text blocks
              if (block.type === 'text' && block.text) {
                // Only send if not already streamed via partial_assistant
                if (!totalContent.includes(block.text)) {
                  totalContent += block.text;

                  res.write(`data: ${JSON.stringify({
                    id: sessionId,
                    object: 'chat.completion.chunk',
                    created: timestamp,
                    model: model,
                    choices: [{index: 0, delta: {content: block.text}, finish_reason: null}]
                  })}\n\n`);
                }
              }

              // Handle tool_use blocks
              if (block.type === 'tool_use') {
                finishReason = 'tool_calls';
              }
            }
          }
        }

        // Handle result chunk for usage info
        if (chunk.type === 'result') {
          const resultChunk = chunk as ResultChunk;
          if (resultChunk.usage) {
            inputTokens = resultChunk.usage.input_tokens || 0;
            outputTokens = resultChunk.usage.output_tokens || 0;
          }
        }
      }

      // Send finish chunk
      res.write(`data: ${JSON.stringify({
        id: sessionId,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: model,
        choices: [{index: 0, delta: {}, finish_reason: finishReason}],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        }
      })}\n\n`);

      // Send [DONE]
      res.write('data: [DONE]\n\n');
      res.end();

      console.log(`[OpenAI API] Streaming completed: ${totalContent.length} chars`);

    } catch (error) {
      console.error('[OpenAI API] Stream error:', error);

      // Send error chunk
      res.write(`data: ${JSON.stringify({
        id: sessionId,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: model,
        choices: [{
          index: 0,
          delta: {content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`},
          finish_reason: 'error'
        }]
      })}\n\n`);

      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  /**
   * Extract user content from OpenAI message format
   */
  private extractUserContent(message: any): string | null {
    const content = message.content;

    // Simple text string
    if (typeof content === 'string') {
      return content.trim() || null;
    }

    // Array of content blocks
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          parts.push(block.text);
        }
      }
      return parts.length > 0 ? parts.join('\n') : null;
    }

    return null;
  }

  /**
   * Send OpenAI-formatted error response
   */
  private sendOpenAIError(
    res: http.ServerResponse,
    statusCode: number,
    message: string,
    type: string,
    code: string
  ): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        message,
        type,
        code,
      },
    }));
  }
}

// 启动 Gateway Server（仅在直接运行时）
if (import.meta.main) {
  const port = parseInt(process.env.GATEWAY_PORT || '8765');
  const bindMode = (process.env.GATEWAY_BIND || 'all') as 'loopback' | 'all';
  const host = bindMode === 'loopback' ? '127.0.0.1' : '0.0.0.0';

  const config: GatewayConfig = {
    port,
    bind: bindMode,
    auth: {
      token: process.env.GATEWAY_TOKEN,
      password: process.env.GATEWAY_PASSWORD,
    },
    reload: {
      mode: (process.env.GATEWAY_RELOAD_MODE || 'hybrid') as 'off' | 'hot' | 'restart' | 'hybrid',
    },
    heartbeat: {
      interval: parseInt(process.env.GATEWAY_HEARTBEAT_INTERVAL || '15000'),
    },
  };

  const server = new GatewayServer(config);
  server.start(port);  // ← 传入 port 参数

  console.log(`Gateway WebSocket Server running on ws://${host}:${port}`);
  console.log(`OpenAI API endpoint: http://${host}:${port}/v1/chat/completions`);
}