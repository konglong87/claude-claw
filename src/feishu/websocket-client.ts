/**
 * 飞书 WebSocket 长连接客户端
 *
 * 使用飞书官方SDK (@larksuiteoapi/node-sdk) WebSocket 长连接模式
 */

import WebSocket from 'ws'
import * as Lark from '@larksuiteoapi/node-sdk'
import { setCurrentUserId } from '../bootstrap/state.js'
import { feishuLog, feishuError } from './log.js'
import {
  parseFeishuMessageContent,
  buildOptimizedMessagePayload,
} from './message-formatter.js'

interface FeishuConfig {
  appId: string
  appSecret: string
  encryptKey?: string
  verificationToken?: string
}

export class FeishuWebSocketClient {
  private config: FeishuConfig
  private wsClient: Lark.WSClient | null = null
  private eventDispatcher: Lark.EventDispatcher | null = null
  private larkClient: Lark.Client | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  // Claude Code WebSocket Server
  private claudeWsUrl: string
  private instanceId: string = Math.random().toString(36).substring(2, 9)
  private claudeWs: WebSocket | null = null

  // 消息上下文缓存（用于回复）
  // key: sessionId (格式: feishu-{userId}:{chatId})
  // value: 消息上下文信息
  private messageContextCache = new Map<string, {
    messageId: string      // 原始消息ID (om_xxx)
    chatId: string         // 聊天ID
    userId: string         // 用户ID
    chatType: 'private' | 'group'
    timestamp: number      // 缓存时间（用于过期清理）
  }>()

  constructor(config: FeishuConfig, claudeWsUrl: string = 'ws://localhost:8765') {
    this.config = config
    this.claudeWsUrl = claudeWsUrl
    feishuLog(`[飞书] 初始化客户端，Claude WebSocket URL: ${claudeWsUrl}`)
  }

  /**
   * 连接到飞书 WebSocket（使用官方SDK）
   */
  async connect(): Promise<void> {
    try {
      feishuLog('[飞书] 正在连接到飞书 WebSocket...')

      // 创建Lark Client用于发送消息
      this.larkClient = new Lark.Client({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        appType: Lark.AppType.SelfBuild,
        domain: Lark.Domain.Feishu,
      })

      // 创建EventDispatcher
      this.eventDispatcher = new Lark.EventDispatcher({
        encryptKey: this.config.encryptKey || '',
        verificationToken: this.config.verificationToken || '',
      })

      // 注册事件处理器
      this.setupEventHandlers()

      // 使用官方SDK创建WebSocket客户端
      this.wsClient = new Lark.WSClient({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        domain: Lark.Domain.Feishu,
        loggerLevel: Lark.LoggerLevel.info,
      })

      // 1. 先连接本地Claude Code Server（在飞书SDK启动前）
      await this.connectToClaudeCode()

      // 2. 启动定时器保持连接（每30秒发送ping）
      this.heartbeatInterval = setInterval(() => {
        if (this.claudeWs?.readyState === WebSocket.OPEN) {
          this.claudeWs.ping()
          feishuLog('[Claude Code] 发送心跳 ping')
        }
      }, 30000)

      // 3. 启动飞书SDK（这会阻塞，但本地连接已有定时器保持）
      feishuLog('[飞书] 启动飞书SDK（可能会阻塞事件循环）...')
      await this.wsClient.start({ eventDispatcher: this.eventDispatcher })
      feishuLog('[飞书] ✅ 飞书WebSocket客户端已启动')

      feishuLog('[飞书] ✅ WebSocket客户端已启动')
      this.reconnectAttempts = 0
    } catch (error) {
      feishuError('[飞书] 连接失败:', error)
      this.scheduleReconnect()
    }
  }

  /**
   * 连接到 Claude Code WebSocket Server
   */
  private async connectToClaudeCode(): Promise<void> {
    feishuLog(`[Claude Code] 正在连接到: ${this.claudeWsUrl}`)
    feishuLog(`[Claude Code] 当前实例ID: ${this.instanceId}`)

    return new Promise((resolve, reject) => {
      // 设置连接超时 (30秒)
      const connectionTimeout = setTimeout(() => {
        feishuError('[Claude Code] 连接超时 (30s)')
        reject(new Error('Connection timeout'))
      }, 30000)

      this.claudeWs = new WebSocket(this.claudeWsUrl, {
        // 增加握手超时时间到30秒
        handshakeTimeout: 30000,
      })

      this.claudeWs.on('open', () => {
        clearTimeout(connectionTimeout)
        feishuLog('[Claude Code] ✅ 已连接')
        resolve()
      })

      this.claudeWs.on('error', (error) => {
        clearTimeout(connectionTimeout)
        feishuError('[Claude Code] WebSocket 错误:', error.message)
        reject(error)
      })

    this.claudeWs.on('message', (data) => {
      this.handleClaudeCodeResponse(data)
    })

    this.claudeWs.on('close', () => {
        feishuLog('[Claude Code] 连接关闭，5秒后重连')
        setTimeout(() => this.connectToClaudeCode(), 5000)
      })
    })
  }

  /**
   * 设置飞书 WebSocket 事件处理器（使用SDK EventDispatcher）
   */
  private setupEventHandlers(): void {
    if (!this.eventDispatcher) return

    // 注册消息接收事件处理器
    this.eventDispatcher.register({
      'im.message.receive_v1': async (data: Lark.IMMessageReceiveV1) => {
        feishuLog('[飞书] 收到消息事件:', JSON.stringify(data, null, 2))

        try {
          await this.processChatMessage(data)
        } catch (error) {
          feishuError('[飞书] 消息处理错误:', error)
        }
      }
    })

    feishuLog('[飞书] 事件处理器已注册')
  }

  /**
   * 处理聊天消息（SDK事件格式）
   *
   * 注意：飞书SDK传给事件处理器的事件对象已经是展开的
   * 不是嵌套的 event.event.message，而是直接的 event.message
   */
  private async processChatMessage(event: any): Promise<void> {
    feishuLog('[飞书] 处理聊天消息（优化格式）')

    // 飞书SDK已经展开事件对象，直接访问message和sender
    const message = event.message
    const sender = event.sender

    if (!message || !sender) {
      feishuLog('[飞书] 消息格式无效，忽略')
      return
    }

    // Extract user ID and set to state
    const userId = sender.sender_id?.open_id
    if (userId) {
      setCurrentUserId(userId, 'feishu')
      feishuLog(`[飞书] 设置用户ID: ${userId}`)
    }

    // 使用优化的消息解析函数
    const content = parseFeishuMessageContent(message.content, message.message_type)

    if (!content) {
      feishuLog('[飞书] 忽略非文本消息')
      return
    }

    feishuLog(`[飞书] 用户 ${sender.sender_id.open_id}: ${content}`)

    // 发送到 Claude Code 执行
    this.sendToClaudeCode(
      content,
      sender.sender_id.open_id,
      message.chat_id,
      message.chat_type === 'p2p' ? 'private' : 'group',
      message.message_id  // 传入原始消息ID用于回复
    )
  }

  /**
   * 从飞书富文本消息中提取纯文本（备用函数）
   *
   * 这是原有的简单解析逻辑，保留作为备用
   * 新的解析逻辑在 message-formatter.ts 的 parsePostContent 函数
   */
  private extractTextFromPostLegacy(postContent: any): string {
    if (!postContent || !postContent.content) return ''

    // 遍历富文本段落提取文本
    let text = ''
    for (const paragraph of postContent.content) {
      if (paragraph.paragraph?.elements) {
        for (const element of paragraph.paragraph.elements) {
          if (element.text_run?.content) {
            text += element.text_run.content
          }
        }
        text += '\n'
      }
    }
    return text.trim()
  }

  /**
   * 发送命令到 Claude Code
   */
  private sendToClaudeCode(
    content: string,
    userId: string,
    chatId: string,
    chatType: 'private' | 'group',
    messageId: string  // 原始消息ID (用于回复)
  ): void {
    if (!this.claudeWs || this.claudeWs.readyState !== WebSocket.OPEN) {
      feishuError('[Claude Code] 未连接，无法发送消息')
      return
    }

    // 创建sessionId标识这次对话
    const sessionId = `feishu-${userId}:${chatId}`

    // 缓存消息上下文用于回复
    this.messageContextCache.set(sessionId, {
      messageId,
      chatId,
      userId,
      chatType,
      timestamp: Date.now()
    })

    const command = {
      jsonrpc: '2.0',
      id: sessionId,  // 使用sessionId作为请求ID
      method: 'command',
      params: {
        platform: 'feishu',
        userId,
        chatId,
        chatType,
        content
      }
    }

    feishuLog('[Claude Code] 发送命令:', content)
    this.claudeWs.send(JSON.stringify(command))
  }

  /**
   * 处理 Claude Code 响应
   */
  private handleClaudeCodeResponse(data: Buffer): void {
    try {
      const response = JSON.parse(data.toString())

      feishuLog('[Claude Code] 收到响应:', JSON.stringify(response, null, 2))

      // 过滤欢迎消息（content包含"Connected to Claude Code"）
      if (
        response.result?.content &&
        response.result.content.includes('Connected to Claude Code')
      ) {
        feishuLog('[Claude Code] 收到欢迎消息，忽略')
        return
      }

      // 使用请求的id字段（sessionId格式: feishu-{userId}:{chatId}）匹配响应
      // 注意：response.result.sessionId 是QueryEngine的全局UUID，不是我们的sessionId
      const sessionId = response.id

      // 检查sessionId格式（应该是 feishu-{userId}:{chatId}）
      if (!sessionId || !sessionId.startsWith('feishu-')) {
        feishuLog(`[Claude Code] 响应ID格式不符合预期: ${sessionId}, 忽略`)
        return
      }

      if (response.result?.content) {
        // 发送回复到飞书
        this.sendToFeishu(response.result.content, sessionId)
      } else if (response.error) {
        feishuError('[Claude Code] 执行错误:', response.error)

        // 发送错误消息到飞书
        const errorMsg = `执行失败: ${response.error.message || '未知错误'}`
        this.sendToFeishu(errorMsg, sessionId)
      }
    } catch (error) {
      feishuError('[Claude Code] 响应处理错误:', error)
    }
  }

  /**
   * 发送消息到飞书（优化格式）
   *
   * 使用 message-formatter.ts 的优化格式化功能：
   * - 简单文本 → text 类型
   * - Markdown格式 → post 类型（富文本）
   * - 代码块/表格 → interactive 类型（卡片，最佳渲染）
   *
   * 参考: OpenClaw send.ts sendMessageFeishu
   */
  private async sendToFeishu(text: string, sessionId: string): Promise<void> {
    if (!this.larkClient) {
      feishuError('[飞书] Lark Client未初始化，无法发送消息')
      return
    }

    // 从缓存获取消息上下文
    const context = this.messageContextCache.get(sessionId)
    if (!context) {
      feishuError(`[飞书] 未找到消息上下文: ${sessionId}`)
      return
    }

    feishuLog(`[飞书] 发送回复到 ${context.chatId}: ${text.substring(0, 256)}...`)

    try {
      // 使用优化的消息格式化函数
      const { content, msgType } = buildOptimizedMessagePayload(text)

      feishuLog(`[飞书] 消息类型: ${msgType}`)

      // 使用飞书SDK的reply API回复消息
      // 参考: OpenClaw send.ts:152-159
      const response = await this.larkClient.im.message.reply({
        path: { message_id: context.messageId },
        data: {
          content,
          msg_type: msgType
        }
      })

      // 检查响应 - 打印完整响应数据
      feishuLog(`[飞书] API 响应: code=${response.code}, msg=${response.msg || 'unknown'}`)
      feishuLog(`[飞书] API 响应数据: ${JSON.stringify(response.data, null, 2)}`)

      if (response.code !== 0) {
        feishuError(`[飞书] 消息回复失败: code=${response.code}, msg=${response.msg || 'unknown'}`)

        // 如果卡片发送失败，降级到纯文本发送
        if (msgType === 'interactive') {
          feishuLog('[飞书] 尝试降级为纯文本发送...')
          await this.sendToFeishuLegacy(text, sessionId)
        }
        return
      }

      feishuLog(`[飞书] ✅ 消息已回复: message_id=${response.data?.message_id || 'unknown'}`)

      // 清理过期的消息上下文缓存（超过1小时）
      this.cleanupMessageContextCache()
    } catch (error) {
      feishuError('[飞书] 消息回复异常:', error)

      // 异常时尝试降级发送
      try {
        feishuLog('[飞书] 异常后尝试降级发送...')
        await this.sendToFeishuLegacy(text, sessionId)
      } catch (fallbackError) {
        feishuError('[飞书] 降级发送也失败:', fallbackError)
      }
    }
  }

  /**
   * 发送消息到飞书（备用方法 - 简单文本格式）
   *
   * 这是原有的简单文本发送逻辑，保留作为备用
   * 当优化格式发送失败时，降级使用此方法
   */
  private async sendToFeishuLegacy(text: string, sessionId: string): Promise<void> {
    if (!this.larkClient) {
      feishuError('[飞书] Lark Client未初始化，无法发送消息')
      return
    }

    const context = this.messageContextCache.get(sessionId)
    if (!context) {
      feishuError(`[飞书] 未找到消息上下文: ${sessionId}`)
      return
    }

    feishuLog(`[飞书] 使用备用文本格式发送...`)

    try {
      // 构建简单文本消息内容
      // 飞书文本消息格式: {"text": "消息内容"}
      const content = JSON.stringify({ text })

      const response = await this.larkClient.im.message.reply({
        path: { message_id: context.messageId },
        data: {
          content,
          msg_type: 'text'
        }
      })

      if (response.code !== 0) {
        feishuError(`[飞书] 备用发送失败: code=${response.code}, msg=${response.msg || 'unknown'}`)
        return
      }

      feishuLog(`[飞书] ✅ 备用发送成功: message_id=${response.data?.message_id || 'unknown'}`)
    } catch (error) {
      feishuError('[飞书] 备用发送异常:', error)
    }
  }

  /**
   * 清理过期的消息上下文缓存
   * 超过1小时的缓存会被清理
   */
  private cleanupMessageContextCache(): void {
    const now = Date.now()
    const EXPIRE_MS = 60 * 60 * 1000 // 1小时

    for (const [sessionId, context] of this.messageContextCache.entries()) {
      if (now - context.timestamp > EXPIRE_MS) {
        this.messageContextCache.delete(sessionId)
        feishuLog(`[飞书] 清理过期消息上下文: ${sessionId}`)
      }
    }
  }

  /**
   * 重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      feishuError('[飞书] 达到最大重连次数，停止重连')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(5000 * this.reconnectAttempts, 30000)

    feishuLog(`[飞书] ${delay/1000}秒后重连 (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * 关闭连接
   * SDK内部会处理心跳和连接清理，只需关闭客户端和Claude Code连接
   */
  close(): void {
    try {
      // 关闭飞书WebSocket客户端（SDK会处理清理）
      if (this.wsClient) {
        this.wsClient.close()
      }
    } catch (err) {
      feishuError('[飞书] 关闭WebSocket客户端错误:', err)
    }

    // 关闭Claude Code连接
    this.claudeWs?.close()
  }
}
