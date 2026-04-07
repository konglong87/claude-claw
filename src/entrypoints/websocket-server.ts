/**
 * WebSocket Server Entrypoint - 飞书/钉钉/微信接入
 *
 * 启动一个WebSocket服务器，接收外部平台的命令并执行
 */

import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { randomUUID } from 'crypto'
import { query } from '../query'
import { getTools } from '../tools'
import { createAbortController } from '../utils/abortController'
import { getDefaultAppState } from '../state/AppStateStore'
import type { Message } from '../types/message'
import type { ToolUseContext } from '../Tool'

// ========== 配置 ==========
const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8765
const HOST = process.env.WS_HOST || '0.0.0.0'
const API_KEY = process.env.WS_API_KEY || '' // 可选的API密钥验证

// ========== 类型定义 ==========
type ClientMessage = {
  type: 'command' | 'ping' | 'auth'
  id?: string
  command?: string
  apiKey?: string
}

type ServerMessage = {
  type: 'response' | 'error' | 'pong' | 'auth_success' | 'auth_failed'
  id?: string
  result?: string
  error?: string
}

type ClientInfo = {
  id: string
  ws: WebSocket
  authenticated: boolean
  platform?: string // 'feishu' | 'dingtalk' | 'wechat'
}

// ========== 全局状态 ==========
const clients = new Map<string, ClientInfo>()

// ========== 创建HTTP服务器 ==========
const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      clients: clients.size,
      uptime: process.uptime()
    }))
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

// ========== 创建WebSocket服务器 ==========
const wss = new WebSocketServer({ server })

// ========== 连接处理 ==========
wss.on('connection', (ws, req) => {
  const clientId = randomUUID()
  const clientIp = req.socket.remoteAddress

  console.log(`[WS] Client connected: ${clientId} from ${clientIp}`)

  const clientInfo: ClientInfo = {
    id: clientId,
    ws,
    authenticated: API_KEY === '' // 如果没有设置API_KEY，默认已认证
  }

  clients.set(clientId, clientInfo)

  // 发送欢迎消息
  sendMessage(ws, {
    type: 'auth_success',
    id: clientId
  })

  // ========== 消息处理 ==========
  ws.on('message', async (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString())

      // 认证检查
      if (!clientInfo.authenticated) {
        if (message.type === 'auth' && message.apiKey === API_KEY) {
          clientInfo.authenticated = true
          sendMessage(ws, { type: 'auth_success', id: message.id })
          console.log(`[WS] Client authenticated: ${clientId}`)
          return
        } else {
          sendMessage(ws, { type: 'auth_failed', id: message.id })
          return
        }
      }

      // 心跳
      if (message.type === 'ping') {
        sendMessage(ws, { type: 'pong', id: message.id })
        return
      }

      // 命令执行
      if (message.type === 'command' && message.command) {
        console.log(`[WS] Command from ${clientId}: ${message.command}`)

        try {
          const result = await executeCommand(message.command, clientInfo)
          sendMessage(ws, {
            type: 'response',
            id: message.id,
            result
          })
        } catch (error) {
          console.error(`[WS] Command error:`, error)
          sendMessage(ws, {
            type: 'error',
            id: message.id,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    } catch (error) {
      console.error(`[WS] Message parse error:`, error)
      sendMessage(ws, {
        type: 'error',
        error: 'Invalid message format'
      })
    }
  })

  // ========== 断开连接 ==========
  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientId}`)
    clients.delete(clientId)
  })

  ws.on('error', (error) => {
    console.error(`[WS] Client error ${clientId}:`, error)
    clients.delete(clientId)
  })
})

// ========== 命令执行 ==========
async function executeCommand(command: string, client: ClientInfo): Promise<string> {
  // 使用query()函数执行命令
  const messages: Message[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: command }]
    }
  ]

  const toolPermissionContext = {
    isNonInteractiveSession: true,
    permissionMode: 'auto' as const,
    allowedTools: undefined,
    disallowedTools: undefined,
  }

  const abortController = createAbortController()

  const toolUseContext: ToolUseContext = {
    abortController,
    options: {
      commands: [],
      tools: getTools(toolPermissionContext),
      mainLoopModel: 'claude-sonnet-4-6',
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      debug: false,
      verbose: false,
      agentDefinitions: { activeAgents: [], allAgents: [] }
    },
    getAppState: () => getDefaultAppState(),
    setAppState: () => {},
    messages: [],
    readFileState: new Map(),
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {}
  }

  // 执行query
  const result = await query({
    messages,
    toolUseContext,
    systemPrompt: 'You are Claude Code, a CLI assistant. Execute the user command and provide results.',
    model: 'claude-sonnet-4-6'
  })

  // 提取响应文本
  const lastMessage = result.messages[result.messages.length - 1]
  if (lastMessage && lastMessage.role === 'assistant') {
    const textBlocks = lastMessage.content.filter(block => block.type === 'text')
    return textBlocks.map(block => (block as any).text).join('\n')
  }

  return 'Command executed successfully'
}

// ========== 辅助函数 ==========
function sendMessage(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

// ========== 启动服务器 ==========
server.listen(PORT, HOST, () => {
  console.log('================================================================')
  console.log('  Claude Code WebSocket Server')
  console.log('================================================================')
  console.log(`WebSocket: ws://${HOST}:${PORT}`)
  console.log(`Health Check: http://${HOST}:${PORT}/health`)
  console.log(`API Key: ${API_KEY ? 'Required' : 'Not required'}`)
  console.log('================================================================')
  console.log('')
  console.log('Ready to accept connections from:')
  console.log('  - Feishu (飞书)')
  console.log('  - DingTalk (钉钉)')
  console.log('  - WeChat (微信)')
  console.log('  - Custom integrations')
  console.log('')
  console.log('Press Ctrl+C to stop')
})

// ========== 优雅关闭 ==========
process.on('SIGTERM', () => {
  console.log('\n[WS] Shutting down...')
  wss.clients.forEach(client => client.close())
  server.close(() => {
    console.log('[WS] Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  process.emit('SIGTERM')
})