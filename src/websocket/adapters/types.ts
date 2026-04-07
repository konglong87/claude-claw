/**
 * Platform Adapter Types
 *
 * 平台适配器接口定义
 */

import type { PlatformType } from '../protocol/types'

// ========== 统一消息格式 ==========

/**
 * 统一消息（所有平台通用）
 */
export interface UnifiedMessage {
  id: string                    // 消息ID
  platform: PlatformType        // 平台标识
  userId: string                // 用户ID
  userName?: string             // 用户名
  chatId: string                // 聊天ID
  chatType: 'private' | 'group' // 聊天类型
  content: string               // 消息内容
  timestamp: number             // 时间戳
  metadata?: Record<string, any> // 元数据
}

/**
 * 统一响应（所有平台通用）
 */
export interface UnifiedResponse {
  messageId: string             // 消息ID
  content: string               // 响应内容
  mentions?: string[]           // @用户列表
  replyTo?: string              // 回复的消息ID
  metadata?: Record<string, any> // 元数据
}

// ========== 平台特定消息 ==========

/**
 * 飞书消息
 */
export interface FeishuMessage {
  msg_type: string
  content: {
    text?: string
    rich_text?: any
  }
  sender: {
    sender_id: {
      open_id: string
      union_id: string
      user_id: string
    }
    sender_type: string
  }
  message: {
    message_id: string
    root_id: string
    parent_id: string
    create_time: string
    chat_id: string
    message_type: string
  }
}

/**
 * 钉钉消息
 */
export interface DingTalkMessage {
  msgtype: string
  text: {
    content: string
  }
  msgId: string
  createAt: number
  conversationId: string
  conversationType: string
  senderId: string
  senderNick: string
}

/**
 * 微信消息
 */
export interface WeChatMessage {
  MsgType: string
  Content: string
  MsgId: string
  CreateTime: number
  FromUserName: string
  ToUserName: string
  ChatType?: string
}

// ========== 平台适配器接口 ==========

/**
 * 平台适配器基类接口
 */
export interface PlatformAdapter {
  name: PlatformType

  /**
   * 平台消息 → 统一消息
   */
  normalizeMessage(rawMessage: any): UnifiedMessage

  /**
   * 统一响应 → 平台格式
   */
  formatResponse(response: UnifiedResponse): any

  /**
   * 验证平台认证
   */
  verifyAuth(credentials: any): Promise<boolean>

  /**
   * 验证Webhook签名
   */
  verifySignature?(payload: string, signature: string): boolean

  /**
   * 获取平台配置
   */
  getConfig(): PlatformConfig
}

/**
 * 平台配置
 */
export interface PlatformConfig {
  enabled: boolean
  appId?: string
  appSecret?: string
  appKey?: string
  appToken?: string
  webhookUrl?: string

  // 平台特定配置
  [key: string]: any
}

// ========== 适配器工具函数 ==========

/**
 * 检测平台类型
 */
export function detectPlatform(userAgent: string): PlatformType | null {
  if (userAgent.includes('Feishu') || userAgent.includes('Lark')) {
    return 'feishu'
  }
  if (userAgent.includes('DingTalk')) {
    return 'dingtalk'
  }
  if (userAgent.includes('MicroMessenger') || userAgent.includes('WeChat')) {
    return 'wechat'
  }
  if (userAgent.includes('Slack')) {
    return 'slack'
  }
  return null
}