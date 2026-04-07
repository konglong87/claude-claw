/**
 * 钉钉平台适配器
 *
 * 实现钉钉消息格式与统一消息格式的转换
 */

import type { PlatformType } from '../protocol/types'

/**
 * 钉钉原始消息格式
 */
export interface DingTalkRawMessage {
  msgtype: 'text' | 'picture' | 'richText' | 'file'
  text?: {
    content: string
  }
  picture?: {
    downloadCode: string
  }
  richText?: {
    content: string
  }
  file?: {
    downloadCode: string
    fileName: string
  }
  senderId: string
  senderNick?: string
  senderCorpId?: string
  senderStaffId?: string
  conversationId: string
  conversationType: '1' | '2'  // 1=单聊, 2=群聊
  messageId: string
  createTime: number
  corpId?: string
}

/**
 * 钉钉统一消息格式
 */
export interface UnifiedMessage {
  id: string
  platform: PlatformType
  userId: string
  chatId: string
  chatType: 'private' | 'group'
  content: string
  timestamp: number
  metadata: {
    senderNick?: string
    senderCorpId?: string
    senderStaffId?: string
    corpId?: string
    msgtype: string
    raw: DingTalkRawMessage
  }
}

/**
 * 钉钉适配器配置
 */
export interface DingTalkAdapterConfig {
  app_key: string
  app_secret: string
  agent_id: string
}

/**
 * 钉钉平台适配器
 */
export class DingTalkAdapter {
  name: PlatformType = 'dingtalk'
  private config: DingTalkAdapterConfig

  constructor(config: DingTalkAdapterConfig) {
    this.config = config
  }

  /**
   * 将钉钉原始消息转换为统一消息格式
   */
  normalizeMessage(raw: DingTalkRawMessage): UnifiedMessage {
    return {
      id: raw.messageId,
      platform: 'dingtalk',
      userId: raw.senderId,
      chatId: raw.conversationId,
      chatType: raw.conversationType === '1' ? 'private' : 'group',
      content: this.extractContent(raw),
      timestamp: raw.createTime,
      metadata: {
        senderNick: raw.senderNick,
        senderCorpId: raw.senderCorpId,
        senderStaffId: raw.senderStaffId,
        corpId: raw.corpId,
        msgtype: raw.msgtype,
        raw
      }
    }
  }

  /**
   * 将统一响应格式转换为钉钉消息格式
   */
  formatResponse(response: { content: string }): any {
    return {
      msgtype: 'text',
      text: {
        content: response.content
      }
    }
  }

  /**
   * 提取消息内容
   */
  private extractContent(raw: DingTalkRawMessage): string {
    switch (raw.msgtype) {
      case 'text':
        return raw.text?.content || ''

      case 'picture':
        return '[图片消息]'

      case 'richText':
        return raw.richText?.content || ''

      case 'file':
        return `[文件消息: ${raw.file?.fileName || '未知文件'}]`

      default:
        return '[未知消息类型]'
    }
  }

  /**
   * 获取配置
   */
  getConfig(): DingTalkAdapterConfig {
    return this.config
  }
}