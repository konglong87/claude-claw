/**
 * WebSocket Server Main Entry
 *
 * 企业级多平台接入 WebSocket 服务器
 */

import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage, ServerResponse } from 'http'
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
import { buildDefaultTools } from './utils/queryEngineSetup.js'
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

  /**
   * Send OpenAI-formatted error response
   */
  private sendOpenAIError(
    res: ServerResponse,
    statusCode: number,
    message: string,
    type: string,
    code: string
  ): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      error: {
        message: message,
        type: type,
        code: code
      }
    }))
  }

  /**
   * Extract user content from OpenAI message format
   * Supports: simple text, multi-content (text + images)
   */
  private extractUserContent(message: any): string | null {
    const content = message.content

    // Format 1: Simple text string
    if (typeof content === 'string') {
      return content.trim() || null
    }

    // Format 2: Array of content blocks (text + images)
    if (Array.isArray(content)) {
      const parts: string[] = []

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          parts.push(block.text)
        }
        else if (block.type === 'image_url' && block.image_url?.url) {
          const imageUrl = block.image_url.url

          // Handle base64 data URLs
          if (imageUrl.startsWith('data:image/')) {
            const base64Data = imageUrl.split(',')[1]
            if (base64Data) {
              // Placeholder for images (TODO: pass to QueryEngine when vision supported)
              parts.push(`[Image: ${base64Data.substring(0, 50)}...]`)
            }
          }
        }
      }

      return parts.length > 0 ? parts.join('\n') : null
    }

    return null
  }

  /**
   * Convert OpenAI tools to QueryEngine format
   * For MVP: Use default tools (Bash, FileEdit, etc.)
   */
  private convertOpenAIToolsToQueryEngine(openaiTools: any[]): any {
    // OpenAI format: {type: "function", function: {name, description, parameters}}
    // QueryEngine format: Tool objects from src/Tool.ts

    // For MVP: Use default tools from queryEngineSetup.ts
    // Future: Implement proper tool conversion if needed
    return buildDefaultTools()
  }

  /**
   * Format response in OpenAI Chat Completions format
   */
  private formatOpenAIResponse(
    content: string,
    sessionId: string,
    model: string,
    usage?: any,
    toolCalls?: any[]
  ): object {
    const timestamp = Math.floor(Date.now() / 1000)

    const message: any = {
      role: 'assistant'
    }

    if (toolCalls && toolCalls.length > 0) {
      message.content = null
      message.tool_calls = toolCalls
    } else {
      message.content = content
    }

    return {
      id: sessionId,
      object: 'chat.completion',
      created: timestamp,
      model: model,
      choices: [{
        index: 0,
        message: message,
        finish_reason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop'
      }],
      usage: {
        prompt_tokens: usage?.input || 0,
        completion_tokens: usage?.output || 0,
        total_tokens: (usage?.input || 0) + (usage?.output || 0)
      }
    }
  }

  /**
   * Stream response in OpenAI Server-Sent Events format
   */
  private async streamOpenAIResponse(
    res: ServerResponse,
    logicalSession: any,
    userContent: string,
    sessionId: string,
    model: string,
    tools: any
  ): Promise<void> {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    const timestamp = Math.floor(Date.now() / 1000)

    // Send initial chunk (role: assistant)
    res.write(`data: ${JSON.stringify({
      id: sessionId,
      object: 'chat.completion.chunk',
      created: timestamp,
      model: model,
      choices: [{index: 0, delta: {role: 'assistant'}, finish_reason: null}]
    })}\n\n`)

    try {
      // Call QueryEngine
      const generator = logicalSession.queryEngine.submitMessage(userContent, {tools})

      let totalContent = ''
      let inputTokens = 0
      let outputTokens = 0
      let finishReason = 'stop'
      let toolCalls: any[] = []

      // Stream chunks from QueryEngine
      for await (const chunk of generator) {
        // Handle partial_assistant (streaming events)
        if (chunk.type === 'partial_assistant' && chunk.event) {
          const event = chunk.event

          // Handle content_block_delta with text_delta
          if (event.type === 'content_block_delta') {
            const delta = event.delta
            if (delta.type === 'text_delta' && delta.text) {
              totalContent += delta.text

              res.write(`data: ${JSON.stringify({
                id: sessionId,
                object: 'chat.completion.chunk',
                created: timestamp,
                model: model,
                choices: [{index: 0, delta: {content: delta.text}, finish_reason: null}]
              })}\n\n`)
            }
            // Handle tool call deltas
            else if (delta.type === 'input_json_delta' && delta.partial_json) {
              // Tool call streaming - TODO: format according to OpenAI spec
              finishReason = 'tool_calls'
            }
          }

          // Handle usage info from partial messages
          if (chunk.partial?.usage) {
            inputTokens = chunk.partial.usage.input_tokens || 0
            outputTokens = chunk.partial.usage.output_tokens || 0
          }
        }

        // Handle tool_use in assistant message
        if (chunk.type === 'assistant' && chunk.message?.content) {
          const content = chunk.message.content
          for (const block of content) {
            if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input || {})
                }
              })
            }
          }
          if (toolCalls.length > 0) {
            finishReason = 'tool_calls'
          }
        }
      }

      // Send finish chunk
      res.write(`data: ${JSON.stringify({
        id: sessionId,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: model,
        choices: [{index: 0, delta: {}, finish_reason: finishReason}],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        }
      })}\n\n`)

      // Send [DONE]
      res.write('data: [DONE]\n\n')
      res.end()

    } catch (error) {
      console.error('[OpenAI API] Stream error:', error)

      // Send error chunk
      res.write(`data: ${JSON.stringify({
        id: sessionId,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: model,
        choices: [{
          index: 0,
          delta: {content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`},
          finish_reason: 'error'
        }]
      })}\n\n`)

      res.write('data: [DONE]\n\n')
      res.end()
    }
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