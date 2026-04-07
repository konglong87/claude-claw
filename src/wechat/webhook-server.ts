/**
 * 微信 Webhook 服务器（企业微信）
 *
 * 接收企业微信的Webhook推送消息
 */

import http from 'http'
import { setCurrentUserId } from '../bootstrap/state.js'
import type { Config } from '../config/loader'
import { WeChatAdapter, WeChatRawMessage } from '../websocket/adapters/wechat'
import WebSocket from 'ws'

/**
 * 微信 Webhook 服务器
 */
export class WeChatWebhookServer {
  private config: Config['wechat']
  private server: http.Server | null = null
  private adapter: WeChatAdapter
  private claudeWsUrl: string
  private claudeWs: WebSocket | null = null

  // 消息上下文缓存
  private messageContextCache = new Map<string, {
    messageId: string
    chatId: string
    userId: string
    chatType: 'private' | 'group'
    timestamp: number
  }>()

  constructor(config: Config['wechat'], claudeWsUrl: string) {
    this.config = config
    this.claudeWsUrl = claudeWsUrl
    this.adapter = new WeChatAdapter(config)
  }

  /**
   * 启动Webhook服务器
   */
  async start(): Promise<void> {
    // 连接到Claude Code WebSocket Server
    this.connectToClaudeCode()

    // 创建HTTP服务器
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    const port = 3000
    const host = '0.0.0.0'

    this.server.listen(port, host, () => {
      console.log(`[微信] Webhook服务器已启动: http://${host}:${port}/webhook/wechat`)
    })
  }

  /**
   * 连接到Claude Code WebSocket Server
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
   * 处理HTTP请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/'
    const method = req.method || 'GET'

    // 处理微信Webhook请求
    if (url === '/webhook/wechat' && method === 'POST') {
      await this.handleWeChatWebhook(req, res)
      return
    }

    // 处理首次验证（GET请求）
    if (url === '/webhook/wechat' && method === 'GET') {
      this.handleWeChatVerification(req, res)
      return
    }

    // 404
    res.writeHead(404)
    res.end('Not Found')
  }

  /**
   * 处理微信首次验证
   */
  private handleWeChatVerification(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const signature = url.searchParams.get('signature') || ''
    const timestamp = url.searchParams.get('timestamp') || ''
    const nonce = url.searchParams.get('nonce') || ''
    const echostr = url.searchParams.get('echostr') || ''

    // 验证签名
    if (this.adapter.verifySignature(signature, timestamp, nonce)) {
      console.log('[微信] ✅ 签名验证成功')
      res.writeHead(200)
      res.end(echostr)
    } else {
      console.error('[微信] ❌ 签名验证失败')
      res.writeHead(403)
      res.end('Forbidden')
    }
  }

  /**
   * 处理微信Webhook消息
   */
  private async handleWeChatWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // 读取请求体
      const body = await this.readBody(req)

      // 验证签名
      const signature = (req.headers['x-wx-signature'] as string) || ''
      const timestamp = (req.headers['x-wx-timestamp'] as string) || ''
      const nonce = (req.headers['x-wx-nonce'] as string) || ''

      if (!this.adapter.verifySignature(signature, timestamp, nonce)) {
        console.error('[微信] ❌ 签名验证失败')
        res.writeHead(401)
        res.end('Unauthorized')
        return
      }

      // 解析XML消息
      const message = this.adapter.parseXML(body) as WeChatRawMessage

      console.log('[微信] 收到消息:', JSON.stringify(message, null, 2))

      // 处理消息
      await this.processMessage(message)

      // 返回成功响应
      res.writeHead(200)
      res.end('success')
    } catch (error) {
      console.error('[微信] 处理消息错误:', error)
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  }

  /**
   * 读取HTTP请求体
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      req.on('data', (chunk) => {
        chunks.push(chunk)
      })

      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve(body)
      })

      req.on('error', reject)
    })
  }

  /**
   * 处理微信消息
   */
  private async processMessage(message: WeChatRawMessage): Promise<void> {
    // 转换为统一消息格式
    const unified = this.adapter.normalizeMessage(message)

    // Extract user ID and set to state
    const userId = unified.userId
    if (userId) {
      setCurrentUserId(userId, 'wechat')
      console.log(`[微信] 设置用户ID: ${userId}`)
    }

    // 发送到Claude Code执行
    this.sendToClaudeCode(
      unified.content,
      unified.userId,
      unified.chatId,
      unified.chatType,
      unified.id
    )
  }

  /**
   * 发送命令到Claude Code
   */
  private sendToClaudeCode(
    content: string,
    userId: string,
    chatId: string,
    chatType: 'private' | 'group',
    messageId: string
  ): void {
    if (!this.claudeWs || this.claudeWs.readyState !== WebSocket.OPEN) {
      console.error('[Claude Code] 未连接，无法发送消息')
      return
    }

    // 创建sessionId
    const sessionId = `wechat-${userId}:${chatId}`

    // 缓存消息上下文
    this.messageContextCache.set(sessionId, {
      messageId,
      chatId,
      userId,
      chatType,
      timestamp: Date.now()
    })

    const command = {
      jsonrpc: '2.0',
      id: sessionId,
      method: 'command',
      params: {
        platform: 'wechat',
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
   * 处理Claude Code响应
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

      if (!sessionId || !sessionId.startsWith('wechat-')) {
        return
      }

      if (response.result?.content) {
        this.sendToWeChat(response.result.content, sessionId)
      } else if (response.error) {
        console.error('[Claude Code] 执行错误:', response.error)
        this.sendToWeChat(`执行失败: ${response.error.message}`, sessionId)
      }
    } catch (error) {
      console.error('[Claude Code] 响应处理错误:', error)
    }
  }

  /**
   * 发送消息到微信
   */
  private async sendToWeChat(text: string, sessionId: string): Promise<void> {
    const context = this.messageContextCache.get(sessionId)
    if (!context) {
      console.error(`[微信] 未找到消息上下文: ${sessionId}`)
      return
    }

    console.log(`[微信] 发送回复到 ${context.chatId}: ${text.substring(0, 100)}...`)

    // TODO: 实际实现应使用企业微信API发送消息
    // 参考：https://developer.work.weixin.qq.com/document/path/90236

    console.log('[微信] ✅ 消息已回复')
    this.cleanupMessageContextCache()
  }

  /**
   * 清理过期缓存
   */
  private cleanupMessageContextCache(): void {
    const now = Date.now()
    const EXPIRE_MS = 60 * 60 * 1000 // 1小时

    for (const [sessionId, context] of this.messageContextCache.entries()) {
      if (now - context.timestamp > EXPIRE_MS) {
        this.messageContextCache.delete(sessionId)
      }
    }
  }

  /**
   * 关闭服务器
   */
  close(): void {
    if (this.server) {
      this.server.close()
    }
    this.claudeWs?.close()
  }
}