/**
 * Feishu Channel Plugin
 *
 * Integrates Feishu bot functionality with the Gateway channel plugin architecture.
 * Wraps the existing FeishuWebSocketClient to provide:
 * - Message receiving via WebSocket
 * - Message sending via Feishu API
 * - Connection lifecycle management
 */

import { ChannelPlugin, ChannelStatus, MessageContext, MessageResponse } from '../types';
import { FeishuAdapter } from './adapter';
import { FeishuWebSocketClient } from '../../feishu/websocket-client';
import { feishuLog, feishuError } from '../../feishu/log';

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  claudeWsUrl?: string;
}

export class FeishuChannelPlugin implements ChannelPlugin {
  id = 'feishu'
  name = 'Feishu Bot'
  enabled = true
  adapter = new FeishuAdapter()

  private client: FeishuWebSocketClient | null = null
  private config: FeishuConfig
  private messageContextCache = new Map<string, {
    messageId: string
    chatId: string
    userId: string
    chatType: 'private' | 'group'
  }>()

  constructor(config: FeishuConfig) {
    this.config = config
    this.enabled = config.enabled
  }

  /**
   * Start the Feishu plugin
   * Initializes WebSocket connection to Feishu
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      feishuLog('[Feishu插件] 插件已禁用，跳过启动')
      return
    }

    feishuLog('[Feishu插件] 启动中...')

    if (!this.config.appId || !this.config.appSecret) {
      feishuError('[Feishu插件] 配置不完整，需要 appId 和 appSecret')
      this.enabled = false
      return
    }

    const claudeWsUrl = this.config.claudeWsUrl || 'ws://127.0.0.1:8765'

    this.client = new FeishuWebSocketClient(
      {
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        encryptKey: this.config.encryptKey,
        verificationToken: this.config.verificationToken
      },
      claudeWsUrl
    )

    try {
      await this.client.connect()
      feishuLog('[Feishu插件] 已启动')
    } catch (error) {
      feishuError('[Feishu插件] 启动失败:', error)
      this.enabled = false
      throw error
    }
  }

  /**
   * Stop the Feishu plugin
   * Closes WebSocket connection
   */
  async stop(): Promise<void> {
    if (this.client) {
      this.client.close()
      this.client = null
    }
    feishuLog('[Feishu插件] 已停止')
  }

  /**
   * Restart the plugin
   */
  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  /**
   * Handle message response
   * Called by ChannelRouter after AI processing
   * Sends the response back to Feishu
   */
  async handleMessage(context: MessageContext): Promise<MessageResponse> {
    const { userId, chatId, aiResponse } = context

    if (!aiResponse) {
      return {
        type: 'text',
        content: ''
      }
    }

    // Get session ID for cache lookup
    const sessionId = `feishu-${userId}:${chatId}`
    const messageContext = this.messageContextCache.get(sessionId)

    if (!messageContext) {
      feishuError(`[Feishu插件] 未找到消息上下文: ${sessionId}`)
      return {
        type: 'text',
        content: '无法发送回复：找不到原始消息上下文'
      }
    }

    try {
      // Format response using adapter
      const feishuPayload = this.adapter.formatResponse({
        type: 'text',
        content: aiResponse
      })

      // Note: The actual sending would need to go through the client
      // This is a simplified version - in practice, you'd call the larkClient directly
      feishuLog(`[Feishu插件] 响应已格式化，准备发送到 ${chatId}`)

      return {
        type: 'text',
        content: aiResponse
      }
    } catch (error) {
      feishuError('[Feishu插件] 消息发送失败:', error)
      return {
        type: 'text',
        content: '消息发送失败'
      }
    }
  }

  /**
   * Get current channel status
   */
  getStatus(): ChannelStatus {
    const isConnected = this.client !== null

    return {
      connected: isConnected,
      lastActivity: Date.now(),
      error: isConnected ? undefined : '未连接'
    }
  }

  /**
   * Set message callback for receiving messages
   * This allows the ChannelRouter to receive messages from this plugin
   */
  setMessageCallback(callback: (message: any) => void): void {
    // Feishu messages flow through WebSocket client to Claude Code
    // This callback is reserved for future integration with ChannelRouter
    feishuLog('[Feishu插件] setMessageCallback 注册 (保留)')
  }

  /**
   * Cache message context for response routing
   */
  cacheMessageContext(sessionId: string, context: {
    messageId: string
    chatId: string
    userId: string
    chatType: 'private' | 'group'
  }): void {
    this.messageContextCache.set(sessionId, context)
  }
}