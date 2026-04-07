/**
 * Rate Limit Middleware
 *
 * 限流中间件 - 防止请求过载
 */

import type { Middleware, RequestContext } from './types'
import { createErrorResponse, ErrorCode } from '../protocol/types'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export class RateLimitMiddleware implements Middleware {
  name = 'rate-limit'
  priority = 90

  private windowMs: number      // 时间窗口（毫秒）
  private maxRequests: number   // 最大请求数
  private requests = new Map<string, RateLimitEntry>()

  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests

    // 每分钟清理过期记录
    setInterval(() => this.cleanup(), 60000)
  }

  async processRequest(
    ctx: RequestContext,
    next: () => Promise<void>
  ): Promise<void> {
    const { message, session, ws } = ctx

    // 心跳和健康检查不受限流限制
    if (message.method === 'ping' || message.method === 'health') {
      await next()
      return
    }

    // 使用 userId 或 sessionId 作为限流key
    const key = session?.userId || session?.id || 'anonymous'

    if (this.isRateLimited(key)) {
      ws.send(JSON.stringify(
        createErrorResponse(
          message.id,
          ErrorCode.RateLimitExceeded,
          'Rate limit exceeded. Please try again later.',
          {
            retryAfter: this.getRetryAfter(key)
          }
        )
      ))
      return
    }

    this.recordRequest(key)
    await next()
  }

  /**
   * 检查是否被限流
   */
  private isRateLimited(key: string): boolean {
    const entry = this.requests.get(key)
    if (!entry) return false

    const now = Date.now()

    // 重置时间窗口
    if (now >= entry.resetAt) {
      this.requests.delete(key)
      return false
    }

    return entry.count >= this.maxRequests
  }

  /**
   * 记录请求
   */
  private recordRequest(key: string): void {
    const now = Date.now()
    const entry = this.requests.get(key)

    if (!entry || now >= entry.resetAt) {
      // 新窗口
      this.requests.set(key, {
        count: 1,
        resetAt: now + this.windowMs
      })
    } else {
      // 增加计数
      entry.count++
    }
  }

  /**
   * 获取重试等待时间（秒）
   */
  private getRetryAfter(key: string): number {
    const entry = this.requests.get(key)
    if (!entry) return 0

    return Math.ceil((entry.resetAt - Date.now()) / 1000)
  }

  /**
   * 清理过期记录
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.requests.entries()) {
      if (now >= entry.resetAt) {
        this.requests.delete(key)
      }
    }
  }
}