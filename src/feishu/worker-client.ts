/**
 * 飞书 Worker 客户端
 *
 * 使用 Worker 线程运行飞书 SDK，避免阻塞主线程
 */

import { Worker } from 'worker_threads'
import { feishuLog, feishuError } from './log.js'
import WebSocket from 'ws'
import * as Lark from '@larksuiteoapi/node-sdk'
import { setCurrentUserId } from '../bootstrap/state.js'
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

export class FeishuWorkerClient {
  private config: FeishuConfig
  private claudeWsUrl: string
  private worker: Worker | null = null
  private claudeWs: WebSocket | null = null
  private larkClient: Lark.Client | null = null  // 用于发送回复
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

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
    feishuLog(`[飞书] 初始化Worker客户端，Claude WebSocket URL: ${claudeWsUrl}`)
  }

  async connect(): Promise<void> {
    try {
      feishuLog('[飞书] 正在连接到飞书 WebSocket...')

      // 0. 创建 Lark Client 用于发送回复
      this.larkClient = new Lark.Client({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        appType: Lark.AppType.SelfBuild,
        domain: Lark.Domain.Feishu,
      })

      // 1. 先连接本地 Claude Code Server
      await this.connectToClaudeCode()

      // 2. 启动 Worker 线程运行飞书 SDK
      const workerPath = new URL('./worker.js', import.meta.url).pathname
      this.worker = new Worker(workerPath, {
        workerData: {
          appId: this.config.appId,
          appSecret: this.config.appSecret,
          encryptKey: this.config.encryptKey,
          verificationToken: this.config.verificationToken,
        },
      })

      // 3. 监听 Worker 消息
      this.worker.on('message', (msg) => {
        if (msg.type === 'message') {
          this.handleFeishuMessage(msg.data)
        } else if (msg.type === 'status') {
          feishuLog(`[飞书] Worker状态: ${msg.status}`)
        } else if (msg.type === 'error') {
          feishuError('[飞书] Worker错误:', msg.error)
        }
      })

      this.worker.on('error', (error) => {
        feishuError('[飞书] Worker线程错误:', error)
      })

      this.worker.on('exit', (code) => {
        feishuLog(`[飞书] Worker线程退出，代码: ${code}`)
        if (code !== 0) {
          this.scheduleReconnect()
        }
      })

      feishuLog('[飞书] ✅ Worker客户端已启动')
      this.reconnectAttempts = 0
    } catch (error) {
      feishuError('[飞书] 连接失败:', error)
      this.scheduleReconnect()
    }
  }

  private async connectToClaudeCode(): Promise<void> {
    return new Promise((resolve, reject) => {
      feishuLog(`[Claude Code] 正在连接到: ${this.claudeWsUrl}`)

      this.claudeWs = new WebSocket(this.claudeWsUrl)

      this.claudeWs.on('open', () => {
        feishuLog('[Claude Code] ✅ 已连接')
        resolve()
      })

      this.claudeWs.on('error', (error) => {
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
   * 处理飞书消息（从 Worker 线程接收）
   */
  private handleFeishuMessage(data: any): void {
    feishuLog('[飞书] 收到消息:', JSON.stringify(data, null, 2))

    try {
      this.processChatMessage(data)
    } catch (error) {
      feishuError('[飞书] 消息处理错误:', error)
    }
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
      const response = await this.larkClient.im.message.reply({
        path: { message_id: context.messageId },
        data: {
          content,
          msg_type: msgType
        }
      })

      // 检查响应
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

      // 清理过期的消息上下文缓存
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

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      feishuLog(`[飞书] ${5 * this.reconnectAttempts}秒后重连 (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      setTimeout(() => this.connect(), 5000 * this.reconnectAttempts)
    }
  }

  close(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    if (this.claudeWs) {
      this.claudeWs.close()
      this.claudeWs = null
    }
  }
}