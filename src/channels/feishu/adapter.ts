/**
 * Feishu Channel Adapter
 *
 * Transforms Feishu-specific messages to/from unified message format
 */

import { PlatformAdapter, UnifiedMessage, MessageResponse } from '../types';

/**
 * Feishu SDK event format (from WebSocket)
 */
interface FeishuEvent {
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
    create_time: string
    chat_id: string
    chat_type: 'p2p' | 'group'
    message_type: string
    content: string
  }
}

/**
 * Feishu message content from JSON parsing
 */
interface FeishuMessageContent {
  text?: string
  rich_text?: any
  image_key?: string
  [key: string]: any
}

export class FeishuAdapter implements PlatformAdapter {
  name = 'feishu'

  /**
   * Transform Feishu event to unified message format
   */
  normalizeMessage(rawMessage: FeishuEvent): UnifiedMessage {
    const event = rawMessage
    const message = event.message || {}
    const sender = event.sender || {}

    // Parse message content
    let content = ''
    if (message.content) {
      try {
        const parsed = JSON.parse(message.content) as FeishuMessageContent
        content = this.extractTextContent(parsed)
      } catch {
        content = message.content
      }
    }

    return {
      platform: 'feishu',
      type: this.detectMessageType(message.message_type),
      content,
      userId: sender.sender_id?.open_id || 'unknown',
      chatId: message.chat_id || 'unknown',
      timestamp: parseInt(message.create_time, 10) || Date.now(),
      metadata: {
        message_id: message.message_id,
        message_type: message.message_type,
        chat_type: message.chat_type,
        root_id: message.root_id,
        parent_id: message.parent_id
      }
    }
  }

  /**
   * Transform unified response to Feishu message format
   */
  formatResponse(response: MessageResponse): any {
    // Simple text response
    if (response.type === 'text') {
      return {
        msg_type: 'text',
        content: JSON.stringify({ text: response.content })
      }
    }

    // Card response for rich content (Markdown, code blocks, etc.)
    if (response.type === 'card') {
      // Return interactive card format
      return {
        msg_type: 'interactive',
        content: JSON.stringify({
          config: {
            wide_screen_mode: true
          },
          elements: [
            {
              tag: 'markdown',
              content: response.content
            }
          ]
        })
      }
    }

    // Default to text
    return {
      msg_type: 'text',
      content: JSON.stringify({ text: response.content })
    }
  }

  /**
   * Detect message type from Feishu message type
   */
  private detectMessageType(msgType: string): 'text' | 'image' | 'file' | 'audio' | 'video' {
    const typeMap: Record<string, 'text' | 'image' | 'file' | 'audio' | 'video'> = {
      'text': 'text',
      'image': 'image',
      'file': 'file',
      'audio': 'audio',
      'video': 'video',
      'post': 'text'  // Rich text treated as text
    }
    return typeMap[msgType] || 'text'
  }

  /**
   * Extract text content from Feishu message content
   */
  private extractTextContent(content: FeishuMessageContent): string {
    // Text message
    if (content.text) return content.text

    // Rich text message
    if (content.rich_text) {
      return this.extractTextFromRichText(content.rich_text)
    }

    // Image message
    if (content.image_key) {
      return '[图片]'
    }

    // Other types - return placeholder
    return '[非文本消息]'
  }

  /**
   * Extract text from Feishu rich text (post) format
   */
  private extractTextFromRichText(richText: any): string {
    if (!richText || !richText.content) return ''

    let text = ''
    try {
      for (const block of richText.content) {
        if (block.paragraph?.elements) {
          for (const element of block.paragraph.elements) {
            if (element.text_run?.content) {
              text += element.text_run.content
            }
          }
          text += '\n'
        }
      }
    } catch {
      return '[富文本消息]'
    }

    return text.trim()
  }
}