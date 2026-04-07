/**
 * Middleware Types
 *
 * 中间件类型定义
 */

import type { WebSocket } from 'ws'
import type { RequestMessage, ResponseMessage } from '../protocol/types'
import type { ClientSession } from '../session/types'

// ========== 中间件接口 ==========

/**
 * 中间件接口
 */
export interface Middleware {
  name: string      // 中间件名称
  priority: number  // 优先级（数字越大越先执行）

  /**
   * 处理请求
   */
  processRequest?(
    ctx: RequestContext,
    next: () => Promise<void>
  ): Promise<void>

  /**
   * 处理响应
   */
  processResponse?(
    ctx: ResponseContext,
    next: () => Promise<void>
  ): Promise<void>
}

// ========== 上下文类型 ==========

/**
 * 请求上下文
 */
export interface RequestContext {
  ws: WebSocket                     // WebSocket连接
  session?: ClientSession           // 会话信息
  message: RequestMessage           // 请求消息
  startTime: number                 // 开始时间
  metadata: Record<string, any>     // 元数据
}

/**
 * 响应上下文
 */
export interface ResponseContext {
  ws: WebSocket                     // WebSocket连接
  session?: ClientSession           // 会话信息
  request: RequestMessage           // 原始请求
  response: ResponseMessage         // 响应消息
  processingTime: number            // 处理时间(ms)
  metadata: Record<string, any>     // 元数据
}

// ========== 中间件管道 ==========

/**
 * 中间件管道
 */
export class MiddlewarePipeline {
  private middlewares: Middleware[] = []

  /**
   * 添加中间件
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware)
    // 按优先级排序（降序）
    this.middlewares.sort((a, b) => b.priority - a.priority)
  }

  /**
   * 执行请求中间件链
   */
  async executeRequest(ctx: RequestContext): Promise<void> {
    const processors = this.middlewares
      .filter(m => m.processRequest)
      .map(m => m.processRequest!.bind(m))  // ✅ 保持this绑定

    await this.executeChain(processors, ctx)
  }

  /**
   * 执行响应中间件链
   */
  async executeResponse(ctx: ResponseContext): Promise<void> {
    const processors = this.middlewares
      .filter(m => m.processResponse)
      .map(m => m.processResponse!.bind(m))  // ✅ 保持this绑定

    await this.executeChain(processors, ctx)
  }

  /**
   * 执行中间件链
   */
  private async executeChain<T>(
    processors: Array<(ctx: T, next: () => Promise<void>) => Promise<void>>,
    ctx: T
  ): Promise<void> {
    let index = 0

    const next = async (): Promise<void> => {
      if (index < processors.length) {
        const processor = processors[index++]
        await processor(ctx, next)
      }
    }

    await next()
  }

  /**
   * 获取中间件列表
   */
  getMiddlewares(): Middleware[] {
    return [...this.middlewares]
  }
}