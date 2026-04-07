/**
 * DingTalk Channel Plugin
 *
 * Wraps the existing DingTalkStreamClient into the ChannelPlugin architecture.
 */

import type { ChannelPlugin, ChannelStatus, MessageContext, MessageResponse, PlatformAdapter } from '../types';
import { DingTalkAdapter, type DingTalkAdapterConfig } from './adapter';

/**
 * DingTalk plugin configuration (from config.yaml)
 */
export interface DingTalkConfig {
  enabled: boolean;
  app_key: string;
  app_secret: string;
  agent_id: string;
  connection_mode: 'stream' | 'webhook';
}

/**
 * DingTalk Channel Plugin
 *
 * Implements ChannelPlugin interface and wraps DingTalkStreamClient.
 */
export class DingTalkChannelPlugin implements ChannelPlugin {
  id = 'dingtalk';
  name = 'DingTalk Bot';
  enabled = true;
  adapter: PlatformAdapter;

  private client: any = null;  // DingTalkStreamClient
  private config: DingTalkConfig;
  private isConnected = false;
  private lastActivity = 0;

  constructor(config: DingTalkConfig) {
    this.config = config;
    this.enabled = config.enabled;

    // Initialize adapter with config
    const adapterConfig: DingTalkAdapterConfig = {
      app_key: config.app_key,
      app_secret: config.app_secret,
      agent_id: config.agent_id
    };
    this.adapter = new DingTalkAdapter(adapterConfig);
  }

  /**
   * Start the DingTalk plugin
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[DingTalk] Plugin is disabled');
      return;
    }

    if (!this.config.app_key || !this.config.app_secret) {
      console.error('[DingTalk] Missing required configuration: app_key or app_secret');
      return;
    }

    if (this.client) {
      console.log('[DingTalk] Client already running');
      return;
    }

    try {
      console.log('[DingTalk] Starting plugin...');
      console.log(`[DingTalk] AppKey: ${this.config.app_key.substring(0, 10)}...`);
      console.log(`[DingTalk] Connection mode: ${this.config.connection_mode}`);

      // Import dynamically to avoid issues when dingtalk-stream is not installed
      const { DingTalkStreamClient } = await import('../../dingtalk/stream-client.js');

      // Gateway WebSocket URL for Claude Code connection
      const gatewayWsUrl = 'ws://localhost:8765';

      // The StreamClient expects config and a WebSocket URL for Claude Code
      this.client = new DingTalkStreamClient(
        this.config,
        gatewayWsUrl
      );

      // Connect to DingTalk Stream
      await this.client.connect();

      this.isConnected = true;
      this.lastActivity = Date.now();
      console.log('[DingTalk] ✅ Plugin started successfully');
    } catch (error) {
      console.error('[DingTalk] Failed to start plugin:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Stop the DingTalk plugin
   */
  async stop(): Promise<void> {
    if (!this.client) {
      console.log('[DingTalk] Client not running');
      return;
    }

    try {
      this.client.close();
      this.client = null;
      this.isConnected = false;
      console.log('[DingTalk] ✅ Plugin stopped');
    } catch (error) {
      console.error('[DingTalk] Error stopping plugin:', error);
      throw error;
    }
  }

  /**
   * Restart the DingTalk plugin
   */
  async restart(): Promise<void> {
    console.log('[DingTalk] Restarting plugin...');
    await this.stop();
    await this.start();
  }

  /**
   * Handle incoming message from DingTalk platform
   *
   * Note: In the current implementation, messages are forwarded to Claude Code
   * via WebSocket. This method is used for processing responses or standalone mode.
   */
  async handleMessage(context: MessageContext): Promise<MessageResponse> {
    // Update last activity
    this.lastActivity = Date.now();

    // Return the AI response in the unified format
    return {
      type: 'text',
      content: context.aiResponse || '',
      metadata: {
        platform: 'dingtalk',
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
      connected: this.isConnected,
      lastActivity: this.lastActivity,
      error: this.isConnected ? undefined : 'Not connected'
    };
  }

  /**
   * Set message callback for incoming messages
   *
   * Used by the ChannelPluginManager to receive messages from the plugin.
   */
  setMessageCallback(callback: (message: any) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * Send response back to DingTalk
   *
   * This method can be used to send messages through the DingTalk client.
   */
  async sendMessage(chatId: string, content: string, sessionWebhook?: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.error('[DingTalk] Cannot send message: not connected');
      return;
    }

    // Use sessionWebhook if provided, otherwise use default method
    if (sessionWebhook) {
      await this.sendViaWebhook(sessionWebhook, content);
    } else {
      console.log('[DingTalk] No sessionWebhook available for reply');
    }
  }

  /**
   * Send message via webhook
   */
  private async sendViaWebhook(webhook: string, content: string): Promise<void> {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'text',
          text: {
            content: content
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DingTalk] Send failed: ${response.status} ${errorText}`);
        return;
      }

      const result = await response.json();
      console.log('[DingTalk] ✅ Message sent:', result);
    } catch (error) {
      console.error('[DingTalk] Send error:', error);
    }
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }
}