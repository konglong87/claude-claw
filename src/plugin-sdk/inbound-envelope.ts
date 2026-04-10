/**
 * Message Envelope Types
 * 消息信封定义
 */

export interface InboundEnvelope {
  messageId: string
  accountId: string
  channelId: string
  userId: string
  content: MessageContent
  timestamp: number
  metadata?: Record<string, any>
}

export interface MessageContent {
  type: 'text' | 'image' | 'file' | 'interactive'
  text?: string
  imageUrl?: string
  fileUrl?: string
}

export interface ReplyEnvelope {
  messageId: string
  replyToId?: string
  accountId: string
  channelId: string
  userId: string
  content: MessageContent
  timestamp: number
}