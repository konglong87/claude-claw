/**
 * Authentication Middleware
 *
 * 认证中间件 - 验证客户端身份
 */

import type { Middleware, RequestContext } from './types'
import type { ErrorCode } from '../protocol/types'
import { createErrorResponse, ErrorCode as EC } from '../protocol/types'

export class AuthMiddleware implements Middleware {
  name = 'auth'
  priority = 100  // 最高优先级

  private apiKey: string | undefined

  constructor(apiKey?: string) {
    this.apiKey = apiKey
  }

  async processRequest(
    ctx: RequestContext,
    next: () => Promise<void>
  ): Promise<void> {
    const { message, session, ws } = ctx

    // 如果没有配置API Key，跳过认证
    if (!this.apiKey) {
      session!.authenticated = true
      await next()
      return
    }

    // 已认证的会话直接通过
    if (session?.authenticated) {
      await next()
      return
    }

    // 认证请求
    if (message.method === 'auth') {
      const { apiKey } = message.params

      if (apiKey === this.apiKey) {
        session!.authenticated = true
        session!.authenticatedAt = Date.now()

        // 发送认证成功响应
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            sessionId: session!.id,
            content: 'Authentication successful'
          }
        }))

        console.log(`[AuthMiddleware] Session authenticated: ${session!.id}`)
        return  // 不调用next()，认证请求到此结束
      } else {
        // 认证失败
        ws.send(JSON.stringify(
          createErrorResponse(
            message.id,
            EC.Unauthorized,
            'Invalid API key'
          )
        ))
        return
      }
    }

    // 未认证的请求
    if (!session?.authenticated) {
      ws.send(JSON.stringify(
        createErrorResponse(
          message.id,
          EC.Unauthorized,
          'Authentication required'
        )
      ))
      return
    }

    await next()
  }
}