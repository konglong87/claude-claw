/**
 * DingTalk Platform Adapter
 *
 * Transforms DingTalk-specific messages to/from unified message format.
 */

import type { PlatformAdapter, UnifiedMessage, MessageResponse } from '../types';

/**
 * DingTalk raw message format from Stream SDK
 */
export interface DingTalkRawMessage {
  msgtype: 'text' | 'picture' | 'richText' | 'file' | 'audio' | 'video';
  text?: {
    content: string;
  };
  picture?: {
    downloadCode: string;
  };
  richText?: {
    content: string;
  };
  file?: {
    downloadCode: string;
    fileName: string;
  };
  senderId: string;
  senderNick?: string;
  senderCorpId?: string;
  senderStaffId: string;
  conversationId: string;
  conversationType: '1' | '2';  // 1=单聊, 2=群聊
  messageId: string;
  createTime: number;
  corpId?: string;
  sessionWebhook?: string;
}

/**
 * DingTalk adapter configuration
 */
export interface DingTalkAdapterConfig {
  app_key: string;
  app_secret: string;
  agent_id: string;
}

/**
 * DingTalk Platform Adapter
 *
 * Implements PlatformAdapter to transform DingTalk messages to/from UnifiedMessage format.
 */
export class DingTalkAdapter implements PlatformAdapter {
  name = 'dingtalk';
  private config: DingTalkAdapterConfig;

  constructor(config: DingTalkAdapterConfig) {
    this.config = config;
  }

  /**
   * Transform DingTalk raw message to unified format
   */
  normalizeMessage(rawMessage: any): UnifiedMessage {
    const raw = rawMessage as DingTalkRawMessage;

    return {
      platform: 'dingtalk',
      type: this.getMessageType(raw.msgtype),
      content: this.extractContent(raw),
      userId: raw.senderStaffId || raw.senderId || 'unknown',
      chatId: raw.conversationId || 'unknown',
      timestamp: raw.createTime || Date.now(),
      metadata: {
        senderNick: raw.senderNick,
        senderCorpId: raw.senderCorpId,
        senderStaffId: raw.senderStaffId,
        corpId: raw.corpId,
        msgtype: raw.msgtype,
        conversationType: raw.conversationType,
        sessionWebhook: raw.sessionWebhook,
        messageId: raw.messageId,
        raw: raw
      }
    };
  }

  /**
   * Transform unified response to DingTalk message format
   */
  formatResponse(response: MessageResponse): any {
    return {
      msgtype: 'text',
      text: {
        content: response.content
      }
    };
  }

  /**
   * Get message type from DingTalk msgtype
   */
  private getMessageType(msgtype: string): 'text' | 'image' | 'file' | 'audio' | 'video' {
    switch (msgtype) {
      case 'text':
      case 'richText':
        return 'text';
      case 'picture':
        return 'image';
      case 'file':
        return 'file';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      default:
        return 'text';
    }
  }

  /**
   * Extract content from DingTalk message
   */
  private extractContent(raw: DingTalkRawMessage): string {
    switch (raw.msgtype) {
      case 'text':
        return raw.text?.content || '';

      case 'picture':
        return '[图片消息]';

      case 'richText':
        return raw.richText?.content || '';

      case 'file':
        return `[文件消息: ${raw.file?.fileName || '未知文件'}]`;

      case 'audio':
        return '[语音消息]';

      case 'video':
        return '[视频消息]';

      default:
        return `[未知消息类型: ${raw.msgtype}]`;
    }
  }

  /**
   * Get adapter configuration
   */
  getConfig(): DingTalkAdapterConfig {
    return this.config;
  }
}