/**
 * Session Manager
 *
 * 会话管理器 - 管理所有客户端会话
 */

import type { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import type {
  ClientSession,
  LogicalSession,
  LogicalSessionStats,
  SessionQueryOptions,
  SessionStats,
  SessionState
} from './types.js'
import type { PlatformType } from '../protocol/types'
import { QueryEngine } from '../../QueryEngine.js'
import {
  buildDefaultTools,
  buildCanUseTool,
  buildGetAppState,
  buildSetAppState,
  buildReadFileCache,
} from '../utils/queryEngineSetup.js'
import { getCwd } from '../../utils/cwd.js'
import { logError } from '../../utils/log.js'

export class SessionManager {
  private sessions = new Map<string, ClientSession>()

  // 会话过期时间（毫秒）
  private readonly SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000 // 24小时

  /**
   * 创建新会话
   */
  createSession(
    ws: WebSocket,
    platform: PlatformType,
    clientIp?: string
  ): ClientSession {
    const sessionId = randomUUID()

    const session: ClientSession = {
      id: sessionId,
      platform,
      userId: '',  // 稍后通过认证填充
      chatId: '',
      chatType: 'private',
      ws,
      clientIp,
      connectedAt: Date.now(),
      authenticated: false,
      logicalSessions: new Map<string, LogicalSession>(),
      context: {
        messageHistory: [],
        preferences: {}
      },
      state: 'active',
      lastActivityAt: Date.now(),
      metadata: {}
    }

    this.sessions.set(sessionId, session)
    console.log(`[SessionManager] Created session: ${sessionId}`)

    return session
  }

  /**
   * 获取会话
   */
  getSession(id: string): ClientSession | undefined {
    return this.sessions.get(id)
  }

  /**
   * 更新会话
   */
  updateSession(
    id: string,
    updates: Partial<ClientSession>
  ): ClientSession | undefined {
    const session = this.sessions.get(id)
    if (!session) return undefined

    Object.assign(session, updates, {
      lastActivityAt: Date.now()
    })

    return session
  }

  /**
   * 删除会话
   */
  deleteSession(id: string): boolean {
    const deleted = this.sessions.delete(id)
    if (deleted) {
      console.log(`[SessionManager] Deleted session: ${id}`)
    }
    return deleted
  }

  /**
   * 按平台查询会话
   */
  getSessionsByPlatform(platform: PlatformType): ClientSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.platform === platform)
  }

  /**
   * 按用户查询会话
   */
  getSessionsByUser(
    platform: PlatformType,
    userId: string
  ): ClientSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.platform === platform && s.userId === userId)
  }

  /**
   * 按条件查询会话
   */
  querySessions(options: SessionQueryOptions): ClientSession[] {
    let result = Array.from(this.sessions.values())

    if (options.platform) {
      result = result.filter(s => s.platform === options.platform)
    }
    if (options.userId) {
      result = result.filter(s => s.userId === options.userId)
    }
    if (options.chatId) {
      result = result.filter(s => s.chatId === options.chatId)
    }
    if (options.state) {
      result = result.filter(s => s.state === options.state)
    }
    if (options.authenticated !== undefined) {
      result = result.filter(s => s.authenticated === options.authenticated)
    }

    return result
  }

  /**
   * 更新会话状态
   */
  updateSessionState(id: string, state: SessionState): void {
    const session = this.sessions.get(id)
    if (session) {
      session.state = state
      session.lastActivityAt = Date.now()
    }
  }

  /**
   * 记录消息
   */
  recordMessage(
    sessionId: string,
    direction: 'in' | 'out',
    type: string,
    content: string,
    metadata?: Record<string, any>
  ): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const record = {
      id: randomUUID(),
      direction,
      type,
      content,
      timestamp: Date.now(),
      metadata
    }

    // 保持最近100条消息
    session.context.messageHistory.push(record)
    if (session.context.messageHistory.length > 100) {
      session.context.messageHistory.shift()
    }

    session.lastActivityAt = Date.now()
  }

  /**
   * 清理过期会话
   */
  cleanupExpired(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, session] of this.sessions.entries()) {
      // 会话过期或连接已关闭
      if (
        now - session.lastActivityAt > this.SESSION_EXPIRE_MS ||
        session.ws.readyState !== session.ws.OPEN
      ) {
        this.sessions.delete(id)
        cleaned++
      }
    }

    // 清理超时逻辑会话
    const logicalCleaned = this.cleanupIdleLogicalSessions()

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned ${cleaned} expired sessions`)
    }

    return cleaned + logicalCleaned
  }

  /**
   * 获取会话统计
   */
  getStats(): SessionStats {
    const all = Array.from(this.sessions.values())

    const stats: SessionStats = {
      total: all.length,
      authenticated: all.filter(s => s.authenticated).length,
      active: all.filter(s => s.state === 'active').length,
      byPlatform: {
        feishu: 0,
        dingtalk: 0,
        wechat: 0,
        slack: 0,
        custom: 0
      }
    }

    for (const session of all) {
      stats.byPlatform[session.platform]++
    }

    return stats
  }

  /**
   * 获取或创建逻辑会话
   *
   * key: userId:chatId 组合
   * 如果逻辑会话不存在，创建新的QueryEngine实例
   */
  getOrCreateLogicalSession(
    clientSessionId: string,
    userId: string,
    chatId: string,
    chatType: 'private' | 'group'
  ): LogicalSession | undefined {
    const clientSession = this.sessions.get(clientSessionId)
    if (!clientSession) {
      console.error(`[SessionManager] Client session not found: ${clientSessionId}`)
      return undefined
    }

    const key = `${userId}:${chatId}`

    // 已存在则返回
    if (clientSession.logicalSessions.has(key)) {
      const session = clientSession.logicalSessions.get(key)!
      session.lastActivityAt = Date.now()
      console.log(`[SessionManager] Reusing logical session: ${key}`)
      return session
    }

    // 创建新逻辑会话
    const logicalSessionId = randomUUID()

    try {
      // 创建QueryEngine
      const queryEngine = new QueryEngine({
        cwd: getCwd(),
        tools: buildDefaultTools(),
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: buildCanUseTool(),
        getAppState: buildGetAppState(),
        setAppState: buildSetAppState(),
        readFileCache: buildReadFileCache(),
        verbose: false,
        initialMessages: [],
      })

      const logicalSession: LogicalSession = {
        sessionId: logicalSessionId,
        userId,
        chatId,
        chatType,
        queryEngine,
        messageHistory: [],
        lastActivityAt: Date.now(),
        createdAt: Date.now()
      }

      clientSession.logicalSessions.set(key, logicalSession)

      console.log(
        `[SessionManager] Created logical session: ${key} (${logicalSessionId})`
      )

      return logicalSession
    } catch (error) {
      logError(error)
      console.error(`[SessionManager] Failed to create logical session: ${key}`)
      return undefined
    }
  }

  /**
   * 获取逻辑会话
   */
  getLogicalSession(
    clientSessionId: string,
    userId: string,
    chatId: string
  ): LogicalSession | undefined {
    const clientSession = this.sessions.get(clientSessionId)
    if (!clientSession) return undefined

    const key = `${userId}:${chatId}`
    return clientSession.logicalSessions.get(key)
  }

  /**
   * 删除逻辑会话
   */
  deleteLogicalSession(
    clientSessionId: string,
    userId: string,
    chatId: string
  ): boolean {
    const clientSession = this.sessions.get(clientSessionId)
    if (!clientSession) return false

    const key = `${userId}:${chatId}`
    const deleted = clientSession.logicalSessions.delete(key)

    if (deleted) {
      console.log(`[SessionManager] Deleted logical session: ${key}`)
    }

    return deleted
  }

  /**
   * 创建临时逻辑会话（用于 OpenAI API 等无需 WebSocket client session 的场景）
   *
   * 注意：这种会话不会被持久化管理，调用方需要自行清理
   */
  createLogicalSession(
    sessionId: string,
    userId: string,
    chatId: string,
    chatType: 'private' | 'group' = 'private'
  ): LogicalSession {
    try {
      // 创建QueryEngine
      const queryEngine = new QueryEngine({
        cwd: getCwd(),
        tools: buildDefaultTools(),
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: buildCanUseTool(),
        getAppState: buildGetAppState(),
        setAppState: buildSetAppState(),
        readFileCache: buildReadFileCache(),
        verbose: false,
        initialMessages: [],
      })

      const logicalSession: LogicalSession = {
        sessionId,
        userId,
        chatId,
        chatType,
        queryEngine,
        messageHistory: [],
        lastActivityAt: Date.now(),
        createdAt: Date.now()
      }

      console.log(
        `[SessionManager] Created temporary logical session: ${sessionId}`
      )

      return logicalSession
    } catch (error) {
      logError(error)
      console.error(`[SessionManager] Failed to create temporary logical session`)
      throw error
    }
  }

  /**
   * 清理超时逻辑会话
   *
   * 超时时间: 24小时无活动
   */
  cleanupIdleLogicalSessions(): number {
    const now = Date.now()
    const TIMEOUT_MS = 24 * 60 * 60 * 1000 // 24小时
    let cleaned = 0

    for (const clientSession of this.sessions.values()) {
      for (const [key, logicalSession] of clientSession.logicalSessions) {
        if (now - logicalSession.lastActivityAt > TIMEOUT_MS) {
          clientSession.logicalSessions.delete(key)
          cleaned++
          console.log(`[SessionManager] Cleaned idle logical session: ${key}`)
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned ${cleaned} idle logical sessions`)
    }

    return cleaned
  }

  /**
   * 获取活跃逻辑会话统计
   */
  getLogicalSessionStats(): LogicalSessionStats {
    const stats: LogicalSessionStats = {
      total: 0,
      byUser: new Map<string, number>(),
      byChat: new Map<string, number>()
    }

    for (const clientSession of this.sessions.values()) {
      for (const logicalSession of clientSession.logicalSessions.values()) {
        stats.total++

        // 按用户统计
        const userCount = stats.byUser.get(logicalSession.userId) || 0
        stats.byUser.set(logicalSession.userId, userCount + 1)

        // 按聊天统计
        const chatCount = stats.byChat.get(logicalSession.chatId) || 0
        stats.byChat.set(logicalSession.chatId, chatCount + 1)
      }
    }

    return stats
  }

  /**
   * 广播消息给指定平台的所有会话
   */
  broadcast(platform: PlatformType, message: any): void {
    const sessions = this.getSessionsByPlatform(platform)

    for (const session of sessions) {
      if (session.ws.readyState === session.ws.OPEN) {
        session.ws.send(JSON.stringify(message))
      }
    }
  }

  /**
   * 广播消息给所有会话
   */
  broadcastAll(message: any): void {
    for (const session of this.sessions.values()) {
      if (session.ws.readyState === session.ws.OPEN) {
        session.ws.send(JSON.stringify(message))
      }
    }
  }

  /**
   * 获取会话数量
   */
  size(): number {
    return this.sessions.size
  }
}

// 单例实例
export const sessionManager = new SessionManager()