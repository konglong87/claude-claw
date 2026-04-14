/**
 * Channel Runtime
 * 处理通道消息的运行时
 */

import type { InboundEnvelope } from './inbound-envelope.js'
import type { PluginLogger } from './core.js'

export type MessageHandler = (envelope: InboundEnvelope) => void

export interface PairingRuntime {
  upsertPairingRequest(params: any): Promise<any>
  getPairing(params: any): Promise<any>
  deletePairing(params: any): Promise<any>
  buildPairingReply(params: any): Promise<any>  // ← 新增：构建配对回复
}

export interface ChannelRuntime {
  onMessage(handler: MessageHandler): void
  emitMessage(envelope: InboundEnvelope): void
  pairing: PairingRuntime  // ← 新增：配对运行时
  logger: PluginLogger
}

export function createChannelRuntime(logger: PluginLogger): ChannelRuntime {
  const handlers: MessageHandler[] = []

  // Mock pairing runtime - 自动配对所有用户
  const pairingRuntime: PairingRuntime = {
    upsertPairingRequest: async (params: any) => {
      logger.info(`[PairingRuntime] Auto-pairing user: ${params.userId || params.idLine?.userId}`)
      return {
        paired: true,
        userId: params.userId || params.idLine?.userId,
        status: 'paired'
      }
    },

    getPairing: async (params: any) => {
      logger.info(`[PairingRuntime] Get pairing status: ${params.userId}`)
      return {
        paired: true,
        userId: params.userId,
        status: 'paired'
      }
    },

    deletePairing: async (params: any) => {
      logger.info(`[PairingRuntime] Delete pairing: ${params.userId}`)
      return { success: true }
    },

    buildPairingReply: async (params: any) => {  // ← 新增：构建配对回复
      logger.info(`[PairingRuntime] Build pairing reply for: ${params.idLine?.userId}`)
      return {
        paired: true,
        userId: params.idLine?.userId,
        code: params.code,
        message: '已自动配对成功',
        status: 'paired'
      }
    }
  }

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

    pairing: pairingRuntime,  // ← 新增

    logger
  }
}