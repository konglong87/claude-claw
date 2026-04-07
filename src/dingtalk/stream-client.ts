/**
 * 钉钉 Stream 客户端
 *
 * 使用钉钉官方 SDK (dingtalk-stream) 实现消息收发
 */

import { DWClient, TOPIC_ROBOT, type DWClientDownStream } from 'dingtalk-stream'
import WebSocket from 'ws'
import { setCurrentUserId } from '../bootstrap/state.js'
import type { Config } from '../config/loader'

/**
 * 钉钉消息数据
 */
interface DingTalkMessageData {
  senderStaffId: string
  senderNick?: string
  conversationId: string
  conversationType: '1' | '2'
  msgtype: 'text' | 'picture' | 'richText' | 'file' | 'audio' | 'video'
  text?: { content: string }
  createTime: number
  sessionWebhook: string
  [key: string]: any
}

/**
 * 消息上下文缓存
 */
interface MessageContext {
  messageId: string
  chatId: string
  userId: string
  chatType: 'private' | 'group'
  sessionWebhook: string
  timestamp: number
}

/**
 * 钉钉 Stream 客户端
 */
export class DingTalkStreamClient {
  private config: Config['dingtalk']
  private client: DWClient | null = null
  private claudeWs: WebSocket | null = null
  private claudeWsUrl: string

  // 消息上下文缓存（用于回复）
  private messageContextCache = new Map<string, MessageContext>()

  constructor(config: Config['dingtalk'], claudeWsUrl: string) {
    this.config = config
    this.claudeWsUrl = claudeWsUrl
  }

  /**
   * 连接到钉钉和 Claude Code
   */
  async connect(): Promise<void> {
    try {
      console.log('[钉钉] 正在连接到钉钉 Stream...')
      console.log(`[钉钉] AppKey: ${this.config.app_key}`)

      // 1. 连接到 Claude Code WebSocket Server
      this.connectToClaudeCode()

      // 2. 创建钉钉 Stream 客户端
      this.client = new DWClient({
        clientId: this.config.app_key,
        clientSecret: this.config.app_secret,
        debug: false,
        keepAlive: true,
      })

      // 3. 修复 SDK 的 keepAlive 重连 bug
      this.patchReconnectBug()

      // 4. 注册消息监听器
      this.client.registerCallbackListener(TOPIC_ROBOT, this.handleMessage.bind(this))

      // 5. 注册连接事件
      this.client.on('open', () => {
        console.log('[钉钉] ✅ Stream 连接已建立')
      })

      this.client.on('close', () => {
        console.log('[钉钉] Stream 连接已关闭')
      })

      this.client.on('error', (error: Error) => {
        console.error('[钉钉] Stream 连接错误:', error)
      })

      // 6. 启动连接（connect 方法无返回值）
      this.client.connect()

      console.log('[钉钉] ✅ Stream 客户端已启动')
    } catch (error) {
      console.error('[钉钉] 连接失败:', error)
      throw error
    }
  }

  /**
   * 修复 dingtalk-stream SDK 的 keepAlive 重连 bug
   *
   * SDK 的 close 事件处理中没有 clearInterval(heartbeatIntervallId)，
   * 导致重连时旧的 heartbeat interval 还在运行，会 terminate 正在建立的新连接。
   */
  private patchReconnectBug(): void {
    if (!this.client) return

    const originalConnect = (this.client as any)._connect.bind(this.client)
    ;(this.client as any)._connect = function (this: any) {
      // 清理上一轮的 heartbeat interval，防止它干扰新连接
      if (this.heartbeatIntervallId !== undefined) {
        clearInterval(this.heartbeatIntervallId)
        this.heartbeatIntervallId = undefined
        console.log('[钉钉] [PATCH] 清理旧的 heartbeat interval')
      }
      return originalConnect()
    }
  }

  /**
   * 连接到 Claude Code WebSocket Server
   */
  private connectToClaudeCode(): void {
    console.log(`[Claude Code] 连接到 ${this.claudeWsUrl}`)

    this.claudeWs = new WebSocket(this.claudeWsUrl)

    this.claudeWs.on('open', () => {
      console.log('[Claude Code] ✅ 已连接')
    })

    this.claudeWs.on('message', (data) => {
      this.handleClaudeCodeResponse(data)
    })

    this.claudeWs.on('error', (error) => {
      console.error('[Claude Code] WebSocket 错误:', error.message)
    })

    this.claudeWs.on('close', () => {
      console.log('[Claude Code] 连接关闭，5秒后重连')
      setTimeout(() => this.connectToClaudeCode(), 5000)
    })
  }

  /**
   * 处理钉钉消息
   */
  private async handleMessage(message: DWClientDownStream): Promise<void> {
    try {
      const data = JSON.parse(message.data) as DingTalkMessageData

      console.log('[钉钉] 收到消息:', JSON.stringify(data, null, 2))

      // Extract user ID and set to state
      const userId = data.senderStaffId
      if (userId) {
        setCurrentUserId(userId, 'dingtalk')
        console.log(`[钉钉] 设置用户ID: ${userId}`)
      }

      // 提取消息内容
      const content = this.extractContent(data)
      if (!content) {
        console.log('[钉钉] 忽略空消息')
        return
      }

      console.log(`[钉钉] 用户 ${data.senderStaffId} (${data.senderNick}): ${content}`)

      // 发送到 Claude Code 执行
      this.sendToClaudeCode(
        content,
        data.senderStaffId,
        data.conversationId,
        data.conversationType === '1' ? 'private' : 'group',
        message.messageId,
        data.sessionWebhook
      )
    } catch (error) {
      console.error('[钉钉] 消息处理错误:', error)
    }
  }

  /**
   * 提取消息内容
   */
  private extractContent(data: DingTalkMessageData): string {
    switch (data.msgtype) {
      case 'text':
        return data.text?.content || ''

      case 'picture':
        return '[图片消息]'

      case 'richText':
        return '[富文本消息]'

      case 'file':
        return '[文件消息]'

      case 'audio':
        return '[语音消息]'

      case 'video':
        return '[视频消息]'

      default:
        return `[未知消息类型: ${data.msgtype}]`
    }
  }

  /**
   * 发送命令到 Claude Code
   */
  private sendToClaudeCode(
    content: string,
    userId: string,
    chatId: string,
    chatType: 'private' | 'group',
    messageId: string,
    sessionWebhook: string
  ): void {
    if (!this.claudeWs || this.claudeWs.readyState !== WebSocket.OPEN) {
      console.error('[Claude Code] 未连接，无法发送消息')
      return
    }

    // 创建 sessionId
    const sessionId = `dingtalk-${userId}:${chatId}`

    // 缓存消息上下文（包含 sessionWebhook 用于回复）
    this.messageContextCache.set(sessionId, {
      messageId,
      chatId,
      userId,
      chatType,
      sessionWebhook,
      timestamp: Date.now()
    })

    const command = {
      jsonrpc: '2.0',
      id: sessionId,
      method: 'command',
      params: {
        platform: 'dingtalk',
        userId,
        chatId,
        chatType,
        content
      }
    }

    console.log('[Claude Code] 发送命令:', content)
    this.claudeWs.send(JSON.stringify(command))
  }

  /**
   * 处理 Claude Code 响应
   */
  private handleClaudeCodeResponse(data: Buffer): void {
    try {
      const response = JSON.parse(data.toString())

      // 过滤欢迎消息
      if (response.result?.content?.includes('Connected to Claude Code')) {
        console.log('[Claude Code] 收到欢迎消息，忽略')
        return
      }

      const sessionId = response.id

      if (!sessionId || !sessionId.startsWith('dingtalk-')) {
        return
      }

      if (response.result?.content) {
        this.sendToDingTalk(response.result.content, sessionId)
      } else if (response.error) {
        console.error('[Claude Code] 执行错误:', response.error)
        this.sendToDingTalk(`执行失败: ${response.error.message}`, sessionId)
      }
    } catch (error) {
      console.error('[Claude Code] 响应处理错误:', error)
    }
  }

  /**
   * 发送消息到钉钉（使用 sessionWebhook）
   */
  private async sendToDingTalk(text: string, sessionId: string): Promise<void> {
    const context = this.messageContextCache.get(sessionId)
    if (!context) {
      console.error(`[钉钉] 未找到消息上下文: ${sessionId}`)
      return
    }

    console.log(`[钉钉] 发送回复: ${text.substring(0, 100)}...`)

    try {
      // 使用 sessionWebhook 发送消息
      const response = await fetch(context.sessionWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'text',
          text: {
            content: text
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[钉钉] 发送消息失败: ${response.status} ${errorText}`)
        return
      }

      const result = await response.json()
      console.log('[钉钉] ✅ 消息已回复:', result)

      // 清理过期缓存
      this.cleanupMessageContextCache()
    } catch (error) {
      console.error('[钉钉] 发送消息错误:', error)
    }
  }

  /**
   * 清理过期的消息上下文缓存
   */
  private cleanupMessageContextCache(): void {
    const now = Date.now()
    const EXPIRE_MS = 60 * 60 * 1000 // 1小时

    for (const [sessionId, context] of this.messageContextCache.entries()) {
      if (now - context.timestamp > EXPIRE_MS) {
        this.messageContextCache.delete(sessionId)
        console.log(`[钉钉] 清理过期消息上下文: ${sessionId}`)
      }
    }
  }

  /**
   * 关闭连接
   */
  close(): void {
    try {
      if (this.client) {
        this.client.disconnect()
      }
    } catch (err) {
      console.error('[钉钉] 关闭 Stream 客户端错误:', err)
    }

    // 关闭 Claude Code 连接
    this.claudeWs?.close()
  }
}