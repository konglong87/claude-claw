/**
 * WeChat Channel Adapter
 *
 * Adapts WeChat (Enterprise WeChat) messages to/from unified format.
 * Reuses existing WeChatAdapter from websocket/adapters.
 */

import type { PlatformAdapter, UnifiedMessage, MessageResponse } from '../types';
import { WeChatAdapter as WeChatAdapterImpl, WeChatRawMessage } from '../../websocket/adapters/wechat';

export interface WeChatAdapterConfig {
  corp_id: string;
  corp_secret: string;
  agent_id: string;
  token: string;
  encoding_aes_key?: string;
}

/**
 * WeChat Platform Adapter
 *
 * Wraps the existing WeChatAdapter to implement the PlatformAdapter interface.
 */
export class WeChatAdapter implements PlatformAdapter {
  private adapter: WeChatAdapterImpl;

  constructor(config: WeChatAdapterConfig) {
    this.adapter = new WeChatAdapterImpl(config);
  }

  /**
   * Transform WeChat raw message to unified format
   */
  normalizeMessage(rawMessage: any): UnifiedMessage {
    const raw = rawMessage as WeChatRawMessage;
    const normalized = this.adapter.normalizeMessage(raw);

    return {
      platform: normalized.platform,
      type: this.getMessageType(raw.MsgType),
      content: normalized.content,
      userId: normalized.userId,
      chatId: normalized.chatId,
      timestamp: normalized.timestamp,
      metadata: {
        msgType: normalized.metadata.msgType,
        msgId: raw.MsgId,
        event: normalized.metadata.event,
        agentId: normalized.metadata.agentId,
        chatType: normalized.chatType,
        raw: rawMessage
      }
    };
  }

  /**
   * Transform unified response to WeChat message format
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
   * Verify WeChat signature
   */
  verifySignature(signature: string, timestamp: string, nonce: string, echostr?: string): boolean {
    return this.adapter.verifySignature(signature, timestamp, nonce, echostr);
  }

  /**
   * Parse XML message from WeChat webhook
   */
  parseXML(xml: string): WeChatRawMessage {
    return this.adapter.parseXML(xml);
  }

  /**
   * Get message type from WeChat MsgType
   */
  private getMessageType(msgType: string): 'text' | 'image' | 'file' | 'audio' | 'video' {
    switch (msgType) {
      case 'text':
        return 'text';
      case 'image':
        return 'image';
      case 'voice':
        return 'audio';
      case 'video':
        return 'video';
      case 'file':
        return 'file';
      default:
        return 'text';
    }
  }
}