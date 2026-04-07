/**
 * Session Management Types
 *
 * 客户端会话管理
 */

import type { WebSocket } from 'ws'
import type { PlatformType } from '../protocol/types'
import type { Message } from '../../types/message.js'
import type { QueryEngine } from '../../QueryEngine.js'

// ========== 会话类型 ==========

/**
 * 逻辑会话
 * userId+chatId组合键标识的对话上下文
 */
export interface LogicalSession {
  sessionId: string              // 唯一标识 (UUID)
  userId: string                 // 飞书用户ID
  chatId: string                 // 群聊ID或私聊ID
  chatType: 'private' | 'group'  // 聊天类型

  // 核心组件
  queryEngine: QueryEngine       // QueryEngine实例
  messageHistory: Message[]      // 消息历史

  // 状态跟踪
  lastActivityAt: number         // 最后活动时间戳
  createdAt: number              // 创建时间

  // 可选: 持久化元数据
  persistedSessionId?: string    // sessionStorage中的session_id
  lastError?: {
    timestamp: number
    message: string
  }
}

/**
 * 客户端会话
 */
export interface ClientSession {
  // 基本信息
  id: string                    // 会话ID
  platform: PlatformType        // 平台标识
  userId: string                // 用户ID
  userName?: string             // 用户名
  chatId: string                // 聊天ID
  chatType: 'private' | 'group' // 聊天类型

  // 连接信息
  ws: WebSocket                 // WebSocket连接
  clientIp?: string             // 客户端IP
  connectedAt: number           // 连接时间

  // 认证状态
  authenticated: boolean        // 是否已认证
  authenticatedAt?: number      // 认证时间

  // 逻辑会话池
  logicalSessions: Map<string, LogicalSession> // key: userId:chatId

  // 会话上下文
  context: SessionContext

  // 会话状态
  state: SessionState
  lastActivityAt: number        // 最后活动时间

  // 元数据
  metadata: Record<string, any>
}

/**
 * 会话上下文
 */
export interface SessionContext {
  // 项目相关
  projectId?: string            // 当前项目ID
  projectName?: string          // 项目名称

  // 命令历史
  lastCommand?: string          // 最后执行的命令
  lastCommandAt?: number        // 最后命令时间

  // 消息历史（最近100条）
  messageHistory: MessageRecord[]

  // 用户偏好
  preferences: {
    language?: string           // 语言
    timezone?: string           // 时区
    outputFormat?: 'text' | 'markdown' | 'json'
  }
}

/**
 * 消息记录
 */
export interface MessageRecord {
  id: string                    // 消息ID
  direction: 'in' | 'out'       // 方向
  type: string                  // 消息类型
  content: string               // 内容
  timestamp: number             // 时间戳
  metadata?: Record<string, any>
}

/**
 * 会话状态
 */
export type SessionState =
  | 'active'        // 活跃
  | 'idle'          // 空闲
  | 'disconnected'  // 已断开

// ========== 会话查询选项 ==========

export interface SessionQueryOptions {
  platform?: PlatformType
  userId?: string
  chatId?: string
  state?: SessionState
  authenticated?: boolean
}

// ========== 会话统计 ==========

export interface SessionStats {
  total: number                 // 总会话数
  authenticated: number         // 已认证会话数
  active: number                // 活跃会话数
  byPlatform: Record<PlatformType, number>  // 按平台统计
}

/**
 * 逻辑会话统计
 */
export interface LogicalSessionStats {
  total: number                           // 总逻辑会话数
  byUser: Record<string, number>          // 按用户统计
  byChat: Record<string, number>          // 按聊天统计
}