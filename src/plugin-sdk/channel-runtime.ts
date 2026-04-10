/**
 * Channel Runtime
 * 处理通道消息的运行时
 */

import type { InboundEnvelope } from './inbound-envelope.js'
import type { PluginLogger } from './core.js'

export type MessageHandler = (envelope: InboundEnvelope) => void

export interface ChannelRuntime {
  onMessage(handler: MessageHandler): void
  emitMessage(envelope: InboundEnvelope): void
  logger: PluginLogger
}

export function createChannelRuntime(logger: PluginLogger): ChannelRuntime {
  const handlers: MessageHandler[] = []

  return {
    onMessage: (handler) => {
      handlers.push(handler)
      logger.info('[ChannelRuntime] Message handler registered')
    },

    emitMessage: (envelope) => {
      logger.info(`[ChannelRuntime] Emitting message: ${envelope.messageId}`)
      handlers.forEach(handler => {
        try {
          handler(envelope)
        } catch (error) {
          logger.error(`[ChannelRuntime] Handler error: ${error}`)
        }
      })
    },

    logger
  }
}