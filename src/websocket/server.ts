/**
 * WebSocket Server Main Entry
 *
 * 企业级多平台接入 WebSocket 服务器
 */

import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage } from 'http'
import { randomUUID } from 'crypto'

// 导入核心组件
import { sessionManager } from './session/manager'
import { configLoader } from './config/types'
import { MiddlewarePipeline } from './middleware/types'
import { AuthMiddleware } from './middleware/auth'
import { RateLimitMiddleware } from './middleware/rate-limit'
import {
  parseMessage,
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  validateParams,
  type RequestMessage,
  type ResponseMessage
} from './protocol/types'
import { detectPlatform } from './adapters/types'
import type { PlatformType } from './protocol/types'
import { collectQueryResult } from './utils/responseExtractor.js'
import { logError } from '../utils/log.js'

// ========== WebSocket Server ==========

export class ClaudeWebSocketServer {
  private wss: WebSocketServer
  private server: ReturnType<typeof createServer>
  private config = configLoader.getConfig()
  private middlewarePipeline = new MiddlewarePipeline()
  private port: number

  constructor(port: number = 8765) {
    this.port = port

    // 创建HTTP服务器
    this.server = createServer(this.handleHttpRequest.bind(this))

    // 创建WebSocket服务器
    this.wss = new WebSocketServer({ server: this.server })

    // 设置中间件
    this.setupMiddleware()

    // 设置WebSocket事件处理
    this.setupWebSocketHandlers()

    // 定期清理过期会话
    setInterval(() => {
      sessionManager.cleanupExpired()
    }, 60000) // 每分钟清理一次
  }

  /**
   * 设置中间件
   */
  private setupMiddleware(): void {
    // 认证中间件
    if (this.config.auth.enabled) {
      this.middlewarePipeline.use(new AuthMiddleware(this.config.auth.apiKey))
    }

    // 限流中间件
    this.middlewarePipeline.use(new RateLimitMiddleware(
      this.config.limits.rateLimit.windowMs,
      this.config.limits.rateLimit.maxRequests
    ))
  }

  /**
   * WebSocket事件处理
   */
  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req)
    })
  }

  /**
   * 处理HTTP请求
   */
  private async handleHttpRequest(
    req: IncomingMessage,
    res: ReturnType<typeof createServer>['response']
  ): Promise<void> {
    // CORS支持
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // 健康检查endpoint
    if (req.url === '/health') {
      const stats = sessionManager.getStats()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        clients: stats.total,
        authenticated: stats.authenticated,
        active: stats.active,
        byPlatform: stats.byPlatform
      }))
      return
    }

    // 配置endpoint（需要认证）
    if (req.url === '/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        platforms: Object.keys(this.config.platforms).filter(
          p => this.config.platforms[p as PlatformType]?.enabled
        )
      }))
      return
    }

    // OpenAI Chat Completions API endpoint
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      await this.handleOpenAIRequest(req, res)
      return
    }

    // 404
    res.writeHead(404)
    res.end('Not Found')
  }

  /**
   * 处理WebSocket连接
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientIp = req.socket.remoteAddress
    const userAgent = req.headers['user-agent'] || ''

    // 检测平台
    const platform = detectPlatform(userAgent) || 'custom'

    // 创建会话
    const session = sessionManager.createSession(ws, platform, clientIp)

    console.log(
      `[WebSocket] Client connected: ${session.id} ` +
      `from ${clientIp} (${platform})`
    )

    // 发送欢迎消息
    this.sendMessage(ws, createSuccessResponse(session.id, {
      sessionId: session.id,
      content: 'Connected to Claude Code WebSocket Server'
    }))

    // 消息处理
    ws.on('message', (data: Buffer) => {
      this.handleMessage(ws, session.id, data)
    })

    // 错误处理
    ws.on('error', (error) => {
      console.error(`[WebSocket] Client error ${session.id}:`, error)
      sessionManager.updateSessionState(session.id, 'disconnected')
    })

    // 断开连接
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected: ${session.id}`)
      sessionManager.deleteSession(session.id)
    })
  }

  /**
   * 处理消息
   */
  private async handleMessage(
    ws: WebSocket,
    sessionId: string,
    data: Buffer
  ): Promise<void> {
    const startTime = Date.now()

    try {
      // 解析消息
      const rawMessage = data.toString()
      const message = parseMessage(rawMessage)

      if (!message) {
        ws.send(JSON.stringify(
          createErrorResponse(
            'unknown',
            ErrorCode.ParseError,
            'Invalid message format'
          )
        ))
        return
      }

      // 获取会话
      const session = sessionManager.getSession(sessionId)
      if (!session) {
        ws.send(JSON.stringify(
          createErrorResponse(
            message.id,
            ErrorCode.InternalError,
            'Session not found'
          )
        ))
        return
      }

      // 记录消息
      sessionManager.recordMessage(
        sessionId,
        'in',
        message.method,
        rawMessage
      )

      // 构建请求上下文
      const ctx = {
        ws,
        session,
        message,
        startTime,
        metadata: {}
      }

      // 执行中间件管道
      await this.middlewarePipeline.executeRequest(ctx)

      // 处理消息
      const response = await this.processMessage(message, session)

      // 发送响应
      this.sendMessage(ws, response)

      // 记录响应
      sessionManager.recordMessage(
        sessionId,
        'out',
        'response',
        JSON.stringify(response)
      )

    } catch (error) {
      console.error('[WebSocket] Message handling error:', error)

      ws.send(JSON.stringify(
        createErrorResponse(
          'unknown',
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Internal error'
        )
      ))
    }
  }

  /**
   * 处理消息（路由）
   */
  private async processMessage(
    message: RequestMessage,
    session: any
  ): Promise<ResponseMessage> {
    const { id, method, params } = message

    // 验证参数
    const validation = validateParams(method, params)
    if (!validation.valid) {
      return createErrorResponse(id, ErrorCode.InvalidParams, validation.error!)
    }

    // 路由到不同的处理器
    switch (method) {
      case 'ping':
        return createSuccessResponse(id, { content: 'pong' })

      case 'health':
        const stats = sessionManager.getStats()
        return createSuccessResponse(id, {
          status: 'ok',
          uptime: process.uptime(),
          clients: stats.total
        })

      case 'command':
        // 更新会话信息
        sessionManager.updateSession(session.id, {
          userId: params.userId,
          userName: params.userName,
          chatId: params.chatId,
          chatType: params.chatType
        })

        // 获取或创建逻辑会话
        const logicalSession = sessionManager.getOrCreateLogicalSession(
          session.id,
          params.userId!,
          params.chatId!,
          params.chatType || 'private'
        )

        if (!logicalSession) {
          return createErrorResponse(
            id,
            ErrorCode.InternalError,
            'Failed to create logical session'
          )
        }

        // 执行命令
        try {
          console.log(
            `[WebSocket] Processing command from ${params.userId}:${params.chatId}`
          )

          // 调用QueryEngine
          const generator = logicalSession.queryEngine.submitMessage(params.content!)

          // 收集结果
          const result = await collectQueryResult(generator)

          console.log(
            `[WebSocket] Command completed: ${result.text.length} chars, ` +
            `${result.duration_ms}ms, session=${result.sessionId}`
          )

          return createSuccessResponse(id, {
            content: result.text,
            sessionId: result.sessionId,
            duration_ms: result.duration_ms,
            usage: result.usage
          })
        } catch (error) {
          logError(error)

          // 标记逻辑会话错误状态
          logicalSession.lastError = {
            timestamp: Date.now(),
            message: error instanceof Error ? error.message : 'Unknown error'
          }

          return createErrorResponse(
            id,
            ErrorCode.CommandError,
            error instanceof Error ? error.message : 'Command execution failed'
          )
        }

      default:
        return createErrorResponse(
          id,
          ErrorCode.MethodNotFound,
          `Method not found: ${method}`
        )
    }
  }

  /**
   * 发送消息
   */
  private sendMessage(ws: WebSocket, message: ResponseMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    const host = this.config.server.host
    const port = this.port || this.config.server.port

    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        console.log(`[WebSocket Server] Listening on ws://${host}:${port}`)
        console.log(`[WebSocket Server] Health check: http://localhost:${port}/health`)
        resolve()
      })
    })
  }

  /**
   * 停止服务器
   */
  stop(): void {
    console.log('\n[WebSocket] Shutting down...')

    // 关闭所有客户端连接
    this.wss.clients.forEach(client => {
      client.close()
    })

    // 关闭服务器
    this.server.close(() => {
      console.log('[WebSocket] Server stopped')
      process.exit(0)
    })
  }
}

// ========== 启动服务器 ==========

// ✅ 注释掉自动启动代码，避免与bot.ts的多实例架构冲突
// if (import.meta.main) {
//   const port = parseInt(process.env.WS_PORT || '8765', 10)
//   const server = new ClaudeWebSocketServer(port)
//   server.start()
//   process.on('SIGTERM', () => server.stop())
//   process.on('SIGINT', () => server.stop())
// }