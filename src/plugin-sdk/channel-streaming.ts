/**
 * Channel Streaming Support
 * 流式卡片输出支持
 */

import type { PluginLogger } from './core.js'

export interface StreamingCard {
  messageId: string
  status: 'thinking' | 'generating' | 'complete' | 'error'
  content: string
  timestamp: number
  metadata?: Record<string, any>
}

export interface StreamingRuntime {
  updateCard(card: StreamingCard): Promise<void>
  completeCard(messageId: string, finalContent: string): Promise<void>
  logger: PluginLogger
}

export function createStreamingRuntime(logger: PluginLogger): StreamingRuntime {
  return {
    updateCard: async (card) => {
      logger.info(`[StreamingRuntime] Card update: ${card.status} - ${card.messageId}`)
    },

    completeCard: async (messageId, finalContent) => {
      logger.info(`[StreamingRuntime] Card complete: ${messageId}`)
    },

    logger
  }
}