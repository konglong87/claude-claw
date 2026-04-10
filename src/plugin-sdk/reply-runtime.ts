/**
 * Reply Runtime
 * 处理回复消息的运行时
 */

import type { ReplyEnvelope } from './inbound-envelope.js'
import type { PluginLogger } from './core.js'

export interface ReplyRuntime {
  sendMessage(envelope: ReplyEnvelope): Promise<void>
  logger: PluginLogger
}

export function createReplyRuntime(
  logger: PluginLogger,
  sendImpl?: (envelope: ReplyEnvelope) => Promise<void>
): ReplyRuntime {
  return {
    sendMessage: async (envelope) => {
      logger.info(`[ReplyRuntime] Sending message: ${envelope.messageId}`)
      if (sendImpl) {
        await sendImpl(envelope)
      } else {
        logger.warn('[ReplyRuntime] sendMessage not implemented')
      }
    },

    logger
  }
}