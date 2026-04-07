/**
 * WeChat Channel Plugin
 *
 * Implements ChannelPlugin interface for WeChat (Enterprise WeChat) platform.
 * Wraps the existing WeChatWebhookServer and adapts it to the plugin architecture.
 */

import type {
  ChannelPlugin,
  ChannelStatus,
  MessageContext,
  MessageResponse,
  UnifiedMessage,
  ChannelConfig
} from '../types';
import { WeChatAdapter, WeChatAdapterConfig } from './adapter';
import type { WeChatRawMessage } from '../../websocket/adapters/wechat';
import http from 'http';
import crypto from 'crypto';

/**
 * WeChat plugin configuration
 */
export interface WeChatConfig extends ChannelConfig {
  corp_id: string;
  corp_secret: string;
  agent_id: string;
  token: string;
  encoding_aes_key?: string;
  webhook_port?: number;
  webhook_host?: string;
  claude_ws_url?: string;
}

/**
 * Message callback type for plugin
 */
type MessageCallback = (message: UnifiedMessage) => void;

/**
 * WeChat Channel Plugin
 *
 * Wraps the existing WeChatWebhookServer to provide:
 * - HTTP webhook server for receiving messages
 * - Message normalization via WeChatAdapter
 * - Response formatting for sending back to WeChat
 */
export class WeChatChannelPlugin implements ChannelPlugin {
  readonly id = 'wechat';
  readonly name = 'WeChat Bot';
  enabled = true;
  readonly adapter: WeChatAdapter;

  private server: http.Server | null = null;
  private config: WeChatConfig;
  private onMessageCallback?: MessageCallback;
  private isRunning = false;
  private lastActivity = 0;

  // Message context cache for response routing
  private messageContextCache = new Map<string, {
    messageId: string;
    chatId: string;
    userId: string;
    chatType: 'private' | 'group';
    timestamp: number;
  }>();

  constructor(config: WeChatConfig) {
    this.config = config;
    this.enabled = config.enabled ?? true;

    const adapterConfig: WeChatAdapterConfig = {
      corp_id: config.corp_id,
      corp_secret: config.corp_secret,
      agent_id: config.agent_id,
      token: config.token,
      encoding_aes_key: config.encoding_aes_key
    };
    this.adapter = new WeChatAdapter(adapterConfig);
  }

  /**
   * Start the WeChat webhook server
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[WeChat] Plugin disabled, skipping start');
      return;
    }

    const port = this.config.webhook_port || 3000;
    const host = this.config.webhook_host || '0.0.0.0';

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(port, host, () => {
        this.isRunning = true;
        this.lastActivity = Date.now();
        console.log(`[WeChat] Plugin started on http://${host}:${port}/webhook/wechat`);
        resolve();
      });

      this.server!.on('error', (err) => {
        console.error('[WeChat] Server error:', err);
        this.isRunning = false;
        reject(err);
      });
    });
  }

  /**
   * Stop the WeChat webhook server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          this.isRunning = false;
          console.log('[WeChat] Plugin stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Restart the plugin
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Handle incoming message from the platform
   */
  async handleMessage(context: MessageContext): Promise<MessageResponse> {
    this.lastActivity = Date.now();

    // Return the AI response in WeChat format
    return {
      type: 'text',
      content: context.aiResponse || '',
      metadata: {
        chatId: context.chatId,
        userId: context.userId
      }
    };
  }

  /**
   * Get current channel status
   */
  getStatus(): ChannelStatus {
    return {
      connected: this.isRunning,
      lastActivity: this.lastActivity,
      error: this.isRunning ? undefined : 'Server not running'
    };
  }

  /**
   * Set message callback (for receiving messages from the platform)
   */
  setMessageCallback(callback: MessageCallback): void {
    this.onMessageCallback = callback;
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Handle HTTP requests to the webhook server
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // Handle WeChat verification (GET request)
    if (url === '/webhook/wechat' && method === 'GET') {
      this.handleVerification(req, res);
      return;
    }

    // Handle WeChat webhook messages (POST request)
    if (url === '/webhook/wechat' && method === 'POST') {
      await this.handleWebhook(req, res);
      return;
    }

    // Health check endpoint
    if (url === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', platform: 'wechat' }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
  }

  /**
   * Handle WeChat verification (first-time URL verification)
   */
  private handleVerification(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const signature = url.searchParams.get('signature') || '';
    const timestamp = url.searchParams.get('timestamp') || '';
    const nonce = url.searchParams.get('nonce') || '';
    const echostr = url.searchParams.get('echostr') || '';

    if (this.verifySignature(signature, timestamp, nonce)) {
      console.log('[WeChat] Verification signature OK');
      res.writeHead(200);
      res.end(echostr);
    } else {
      console.error('[WeChat] Verification signature failed');
      res.writeHead(403);
      res.end('Forbidden');
    }
  }

  /**
   * Handle incoming WeChat webhook messages
   */
  private async handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Read request body
      const body = await this.readBody(req);

      // Get signature headers
      const signature = (req.headers['x-wx-signature'] as string) || '';
      const timestamp = (req.headers['x-wx-timestamp'] as string) || '';
      const nonce = (req.headers['x-wx-nonce'] as string) || '';

      // Verify signature
      if (!this.verifySignature(signature, timestamp, nonce)) {
        console.error('[WeChat] Webhook signature verification failed');
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }

      // Parse XML message
      const rawMessage = this.adapter.parseXML(body) as WeChatRawMessage;

      console.log('[WeChat] Received message:', JSON.stringify(rawMessage, null, 2));

      // Normalize message
      const unifiedMessage = this.adapter.normalizeMessage(rawMessage);

      // Cache message context for response routing
      this.cacheMessageContext(unifiedMessage);

      // Update last activity
      this.lastActivity = Date.now();

      // Notify callback if registered
      if (this.onMessageCallback) {
        this.onMessageCallback(unifiedMessage);
      }

      // Return success
      res.writeHead(200);
      res.end('success');
    } catch (error) {
      console.error('[WeChat] Error handling webhook:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }

  /**
   * Verify WeChat signature
   */
  private verifySignature(signature: string, timestamp: string, nonce: string): boolean {
    const token = this.config.token;
    if (!token) {
      console.warn('[WeChat] No token configured, skipping verification');
      return true; // Skip verification if no token
    }

    const arr = [token, timestamp, nonce].sort();
    const str = arr.join('');
    const sha1 = crypto.createHash('sha1').update(str).digest('hex');

    return sha1 === signature;
  }

  /**
   * Read HTTP request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', reject);
    });
  }

  /**
   * Cache message context for response routing
   */
  private cacheMessageContext(message: UnifiedMessage): void {
    const sessionId = `wechat-${message.userId}:${message.chatId}`;
    this.messageContextCache.set(sessionId, {
      messageId: message.metadata?.msgId || '',
      chatId: message.chatId,
      userId: message.userId,
      chatType: (message.metadata?.chatType as 'private' | 'group') || 'private',
      timestamp: Date.now()
    });

    // Cleanup old entries
    this.cleanupCache();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const EXPIRE_MS = 60 * 60 * 1000; // 1 hour

    for (const [sessionId, context] of this.messageContextCache.entries()) {
      if (now - context.timestamp > EXPIRE_MS) {
        this.messageContextCache.delete(sessionId);
      }
    }
  }

  /**
   * Get cached message context by session ID
   */
  getMessageContext(sessionId: string) {
    return this.messageContextCache.get(sessionId);
  }

  /**
   * Get all cached session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.messageContextCache.keys());
  }
}