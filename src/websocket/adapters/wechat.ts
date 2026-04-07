/**
 * 微信平台适配器（企业微信）
 *
 * 实现企业微信消息格式与统一消息格式的转换
 */

import type { PlatformType } from '../protocol/types'
import crypto from 'crypto'

/**
 * 企业微信原始消息格式（XML）
 */
export interface WeChatRawMessage {
  ToUserName: string      // 企业ID
  FromUserName: string    // 发送者ID
  CreateTime: number      // 消息创建时间（秒级时间戳）
  MsgType: 'text' | 'image' | 'voice' | 'video' | 'event'
  Content?: string        // 文本消息内容
  MsgId: string           // 消息ID
  AgentID: string         // 应用ID
  ChatId?: string         // 群聊ID（群聊时存在）
  Event?: string          // 事件类型（subscribe/unsubscribe等)
  PicUrl?: string         // 图片链接
  MediaId?: string        // 媒体文件ID
  [key: string]: any      // 其他字段
}

/**
 * 微信统一消息格式
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
    agentId: string
    event?: string
    msgType: string
    picUrl?: string
    mediaId?: string
    raw: WeChatRawMessage
  }
}

/**
 * 微信适配器配置
 */
export interface WeChatAdapterConfig {
  corp_id: string
  corp_secret: string
  agent_id: string
  token: string
  encoding_aes_key?: string
}

/**
 * 微信平台适配器（企业微信）
 */
export class WeChatAdapter {
  name: PlatformType = 'wechat'
  private config: WeChatAdapterConfig

  constructor(config: WeChatAdapterConfig) {
    this.config = config
  }

  /**
   * 将企业微信原始消息转换为统一消息格式
   */
  normalizeMessage(raw: WeChatRawMessage): UnifiedMessage {
    return {
      id: raw.MsgId,
      platform: 'wechat',
      userId: raw.FromUserName,
      chatId: raw.ChatId || raw.FromUserName,  // 群聊用ChatId，私聊用userId
      chatType: raw.ChatId ? 'group' : 'private',
      content: this.extractContent(raw),
      timestamp: raw.CreateTime * 1000,  // 秒级转毫秒级
      metadata: {
        agentId: raw.AgentID,
        event: raw.Event,
        msgType: raw.MsgType,
        picUrl: raw.PicUrl,
        mediaId: raw.MediaId,
        raw
      }
    }
  }

  /**
   * 将统一响应格式转换为企业微信消息格式
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
   * 验证企业微信签名
   *
   * @param signature 签名
   * @param timestamp 时间戳
   * @param nonce 随机数
   * @param echostr 随机字符串（用于首次验证）
   * @returns 验证结果
   */
  verifySignature(
    signature: string,
    timestamp: string,
    nonce: string,
    echostr?: string
  ): boolean {
    const token = this.config.token

    // 字典序排序
    const arr = [token, timestamp, nonce].sort()
    const str = arr.join('')

    // SHA1加密
    const sha1 = crypto.createHash('sha1').update(str).digest('hex')

    return sha1 === signature
  }

  /**
   * 解析企业微信 XML 消息
   *
   * @param xml XML 字符串
   * @returns 解析后的消息对象
   */
  parseXML(xml: string): WeChatRawMessage {
    // 简化的XML解析（实际应使用xml2js等专业库）
    const result: any = {}

    // 提取XML字段
    const extractField = (fieldName: string): string => {
      const regex = new RegExp(`<${fieldName}><!\\[CDATA\\[(.*?)\\]\\]></${fieldName}>`)
      const match = xml.match(regex)
      return match ? match[1] : ''
    }

    result.ToUserName = extractField('ToUserName')
    result.FromUserName = extractField('FromUserName')
    result.CreateTime = parseInt(extractField('CreateTime') || '0')
    result.MsgType = extractField('MsgType') || 'text'
    result.Content = extractField('Content')
    result.MsgId = extractField('MsgId')
    result.AgentID = extractField('AgentID')
    result.ChatId = extractField('ChatId') || undefined
    result.Event = extractField('Event') || undefined

    return result as WeChatRawMessage
  }

  /**
   * 提取消息内容
   */
  private extractContent(raw: WeChatRawMessage): string {
    switch (raw.MsgType) {
      case 'text':
        return raw.Content || ''

      case 'image':
        return '[图片消息]'

      case 'voice':
        return '[语音消息]'

      case 'video':
        return '[视频消息]'

      case 'event':
        return `[事件: ${raw.Event || '未知事件'}]`

      default:
        return '[未知消息类型]'
    }
  }

  /**
   * 获取配置
   */
  getConfig(): WeChatAdapterConfig {
    return this.config
  }
}