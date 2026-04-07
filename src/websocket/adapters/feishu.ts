/**
 * Feishu Adapter
 *
 * 飞书平台适配器
 */

import type {
  PlatformAdapter,
  UnifiedMessage,
  UnifiedResponse,
  PlatformConfig
} from './types'
import { FeishuMessage } from './types'
import type { PlatformType, RequestMessage, ResponseMessage } from '../protocol/types'
import { randomUUID } from 'crypto'

// ========== 飞书事件类型定义 ==========

export interface FeishuEvent {
  type: string
  sender: {
    sender_id: {
      user_id: string
      open_id: string
    }
    sender_type: string
  }
  message: {
    message_id: string
    root_id: string
    parent_id: string
    create_time: number
    chat_id: string
    chat_type: 'p2p' | 'group' | undefined
    message_type: string
    content: string
  }
}

export interface FeishuMessageContent {
  text?: string
  [key: string]: any
}

export interface FeishuResponse {
  code: number
  msg: string
  data?: any
}

export class FeishuAdapter implements PlatformAdapter {
  name: PlatformType = 'feishu'

  private config: PlatformConfig

  constructor(config: PlatformConfig) {
    this.config = config
  }

  /**
   * 飞书消息 → 统一消息
   */
  normalizeMessage(rawMessage: FeishuMessage): UnifiedMessage {
    const msg: UnifiedMessage = {
      id: rawMessage.message.message_id,
      platform: 'feishu',
      userId: rawMessage.sender.sender_id.open_id,
      userName: rawMessage.sender.sender_id.user_id,
      chatId: rawMessage.message.chat_id,
      chatType: rawMessage.message.message_type === 'p2p' ? 'private' : 'group',
      content: rawMessage.content.text || '',
      timestamp: parseInt(rawMessage.message.create_time, 10),
      metadata: {
        msgType: rawMessage.msg_type,
        rootId: rawMessage.message.root_id,
        parentId: rawMessage.message.parent_id
      }
    }

    return msg
  }

  /**
   * 统一响应 → 飞书格式
   */
  formatResponse(response: UnifiedResponse): any {
    return {
      msg_type: 'text',
      content: {
        text: response.content
      }
    }
  }

  /**
   * 验证飞书认证
   */
  async verifyAuth(credentials: any): Promise<boolean> {
    // 验证 app_id 和 app_secret
    if (!credentials.appId || !credentials.appSecret) {
      return false
    }

    // 这里应该调用飞书API验证
    // 简化实现：直接比对配置
    return (
      credentials.appId === this.config.appId &&
      credentials.appSecret === this.config.appSecret
    )
  }

  /**
   * 验证飞书Webhook签名
   */
  verifySignature(payload: string, signature: string): boolean {
    // 飞书签名验证逻辑
    // 实际实现需要使用加密库验证
    return true // 简化实现
  }

  /**
   * 获取配置
   */
  getConfig(): PlatformConfig {
    return this.config
  }
}

// ========== 消息转换函数 ==========

/**
 * 飞书事件 → WebSocket标准消息
 */
export function adaptFeishuMessage(event: FeishuEvent): RequestMessage {
  // 解析消息内容
  let contentObj: FeishuMessageContent
  try {
    contentObj = JSON.parse(event.message.content)
  } catch {
    contentObj = { text: event.message.content }
  }

  return {
    jsonrpc: '2.0',
    id: randomUUID(),
    method: 'command',
    params: {
      platform: 'feishu',
      userId: event.sender.sender_id.user_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type === 'p2p' ? 'private' : 'group',
      content: extractTextContent(contentObj),
      metadata: {
        message_id: event.message.message_id,
        create_time: event.message.create_time,
        sender_open_id: event.sender.sender_id.open_id
      }
    }
  }
}

/**
 * 提取飞书消息文本内容
 */
function extractTextContent(content: FeishuMessageContent): string {
  // 文本消息
  if (content.text) return content.text

  // 富文本消息 (暂不支持，返回提示)
  if (content.rich_text) {
    return '[富文本消息暂不支持]'
  }

  // 图片消息
  if (content.image_key) {
    return '[图片]'
  }

  // 其他类型
  return '[非文本消息]'
}

/**
 * WebSocket响应 → 飞书消息格式
 */
export function adaptToFeishuResponse(response: ResponseMessage): FeishuResponse {
  if ('result' in response) {
    // SuccessResponse
    return {
      code: 0,
      msg: 'success',
      data: {
        message_id: response.result.sessionId,
        content: {
          text: response.result.content || ''
        }
      }
    }
  } else {
    // ErrorResponse
    return {
      code: response.error.code,
      msg: response.error.message || 'Error',
      data: null
    }
  }
}