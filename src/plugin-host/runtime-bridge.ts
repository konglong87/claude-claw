/**
 * Runtime Bridge
 * 连接插件运行时和Claude WebSocket Server
 */

import type { ClaudeWebSocketServer } from '../websocket/server.js'
import type { ChannelRuntime, ReplyRuntime, PluginLogger, InboundEnvelope, ReplyEnvelope } from '../plugin-sdk/index.js'
import { createChannelRuntime, createReplyRuntime } from '../plugin-sdk/index.js'

export interface RuntimeBridgeConfig {
  wsServer: ClaudeWebSocketServer
  logger: PluginLogger
}

export class RuntimeBridge {
  private channelRuntime: ChannelRuntime
  private replyRuntime: ReplyRuntime
  private wsServer: ClaudeWebSocketServer

  constructor(config: RuntimeBridgeConfig) {
    this.wsServer = config.wsServer
    this.channelRuntime = createChannelRuntime(config.logger)
    this.replyRuntime = createReplyRuntime(config.logger, this.sendToFeishu.bind(this))

    this.setupBridge()
  }

  private setupBridge() {
    // 监听插件发出的消息，转发到Claude WebSocket Server
    this.channelRuntime.onMessage((envelope: InboundEnvelope) => {
      this.forwardToClaude(envelope)
    })
  }

  private forwardToClaude(envelope: InboundEnvelope) {
    const claudeMessage = {
      type: 'user_message',
      content: envelope.content.text || '',
      userId: envelope.userId,
      messageId: envelope.messageId,
      channelId: envelope.channelId
    }

    this.wsServer.broadcast(JSON.stringify(claudeMessage))
    this.channelRuntime.logger.info(`[RuntimeBridge] Forwarded message to Claude: ${envelope.messageId}`)
  }

  private async sendToFeishu(envelope: ReplyEnvelope) {
    // Phase 2: 发送回复到飞书（通过插件）
    // 具体实现需要插件提供outbound.sendMessage
    this.replyRuntime.logger.info(`[RuntimeBridge] Would send reply to Feishu: ${envelope.messageId}`)
    this.replyRuntime.logger.warn('[RuntimeBridge] sendToFeishu not fully implemented yet')
  }

  getChannelRuntime(): ChannelRuntime {
    return this.channelRuntime
  }

  getReplyRuntime(): ReplyRuntime {
    return this.replyRuntime
  }
}

export function createRuntimeBridge(config: RuntimeBridgeConfig): RuntimeBridge {
  return new RuntimeBridge(config)
}