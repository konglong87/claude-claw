/**
 * WebSocket Protocol Types
 *
 * 统一消息协议 - 基于 JSON-RPC 2.0 风格
 */

// ========== JSON-RPC 2.0 消息类型 ==========

/**
 * 请求消息
 */
export interface RequestMessage {
  jsonrpc: '2.0'
  id: string
  method: MethodType
  params: RequestParams
}

/**
 * 成功响应
 */
export interface SuccessResponse {
  jsonrpc: '2.0'
  id: string
  result: ResponseResult
}

/**
 * 错误响应
 */
export interface ErrorResponse {
  jsonrpc: '2.0'
  id: string
  error: ErrorInfo
}

/**
 * 响应消息（联合类型）
 */
export type ResponseMessage = SuccessResponse | ErrorResponse

// ========== 方法类型 ==========

export type MethodType =
  | 'auth'      // 认证
  | 'command'   // 执行命令
  | 'ping'      // 心跳
  | 'health'    // 健康检查
  | 'subscribe' // 订阅事件
  | 'unsubscribe' // 取消订阅

// ========== 请求参数 ==========

export interface RequestParams {
  // 认证参数
  apiKey?: string

  // 命令参数
  platform?: PlatformType
  userId?: string
  userName?: string
  chatId?: string
  chatType?: 'private' | 'group'
  content?: string
  metadata?: Record<string, any>
}

// ========== 响应结果 ==========

export interface ResponseResult {
  content?: string
  mentions?: string[]
  replyTo?: string
  metadata?: Record<string, any>

  // 健康检查特有
  status?: 'ok' | 'error'
  uptime?: number
  clients?: number

  // 认证特有
  sessionId?: string
}

// ========== 错误信息 ==========

export interface ErrorInfo {
  code: ErrorCode
  message: string
  data?: any
}

export enum ErrorCode {
  // JSON-RPC 标准错误
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // 自定义错误
  Unauthorized = -32001,
  Forbidden = -32003,
  RateLimitExceeded = -32004,
  Timeout = -32005,
  PlatformNotSupported = -32006,
  CommandError = -32007,
}

// ========== 平台类型 ==========

export type PlatformType =
  | 'feishu'
  | 'dingtalk'
  | 'wechat'
  | 'slack'
  | 'custom'

// ========== 消息工具函数 ==========

/**
 * 创建成功响应
 */
export function createSuccessResponse(
  id: string,
  result: ResponseResult
): SuccessResponse {
  return {
    jsonrpc: '2.0',
    id,
    result
  }
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  id: string,
  code: ErrorCode,
  message: string,
  data?: any
): ErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  }
}

/**
 * 解析消息
 */
export function parseMessage(data: string): RequestMessage | null {
  try {
    const msg = JSON.parse(data)

    // 验证基本结构
    if (
      msg.jsonrpc !== '2.0' ||
      typeof msg.id !== 'string' ||
      typeof msg.method !== 'string'
    ) {
      return null
    }

    return msg as RequestMessage
  } catch {
    return null
  }
}

/**
 * 验证请求参数
 */
export function validateParams(
  method: string,
  params: any
): { valid: boolean; error?: string } {
  switch (method) {
    case 'auth':
      if (!params.apiKey) {
        return { valid: false, error: 'Missing apiKey' }
      }
      break

    case 'command':
      if (!params.platform) {
        return { valid: false, error: 'Missing platform' }
      }
      if (!params.userId) {
        return { valid: false, error: 'Missing userId' }
      }
      if (!params.chatId) {
        return { valid: false, error: 'Missing chatId' }
      }
      if (!params.content) {
        return { valid: false, error: 'Missing content' }
      }
      break
  }

  return { valid: true }
}