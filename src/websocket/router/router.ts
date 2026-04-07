/**
 * Command Router
 *
 * 命令路由系统 - 路由和执行命令
 */

import type { ClientSession } from '../session/types'
import { query } from '../../query'
import { getTools } from '../../tools'
import { createAbortController } from '../../utils/abortController'
import type { ToolUseContext } from '../../Tool'
import type { Message } from '../../types/message'
import type { PlatformType } from '../protocol/types'

// ========== 命令上下文 ==========

export interface CommandContext {
  session: ClientSession
  platform: PlatformType
  userId: string
  chatId: string
  content: string
  metadata?: Record<string, any>
}

// ========== 命令处理器 ==========

export type CommandHandler = (ctx: CommandContext) => Promise<string>

// ========== 命令路由 ==========

export interface CommandRoute {
  pattern: RegExp | string
  handler: CommandHandler
  permission?: string
  timeout?: number
}

// ========== 命令路由器 ==========

export class CommandRouter {
  private routes: CommandRoute[] = []
  private defaultTimeout = 60000 // 60秒

  /**
   * 注册命令路由
   */
  register(route: CommandRoute): void {
    this.routes.push(route)
  }

  /**
   * 路由并执行命令
   */
  async route(ctx: CommandContext): Promise<string> {
    const { content } = ctx

    // 匹配路由
    for (const route of this.routes) {
      if (this.match(route.pattern, content)) {
        // 权限检查
        if (route.permission && !this.hasPermission(ctx, route.permission)) {
          throw new Error(`Permission denied: ${route.permission}`)
        }

        // 执行命令（带超时）
        return await this.withTimeout(
          route.handler(ctx),
          route.timeout || this.defaultTimeout
        )
      }
    }

    // 默认：使用Claude Code执行
    return await this.executeWithClaude(ctx)
  }

  /**
   * 匹配命令模式
   */
  private match(pattern: RegExp | string, content: string): boolean {
    if (typeof pattern === 'string') {
      return content.startsWith(pattern)
    } else {
      return pattern.test(content)
    }
  }

  /**
   * 权限检查
   */
  private hasPermission(ctx: CommandContext, permission: string): boolean {
    // 简化实现：所有已认证用户都有所有权限
    // 实际应该检查session.metadata.permissions
    return ctx.session.authenticated
  }

  /**
   * 带超时执行
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Command timeout')), timeoutMs)
      )
    ])
  }

  /**
   * 使用Claude Code执行命令
   */
  private async executeWithClaude(ctx: CommandContext): Promise<string> {
    const { content, session } = ctx

    console.log(`[CommandRouter] Executing with Claude: ${content}`)

    // 构建消息
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: content }]
      }
    ]

    // 构建系统提示
    const systemPrompt = this.buildSystemPrompt(ctx)

    // 构建工具使用上下文
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
      getAppState: () => ({}) as any,
      setAppState: () => {},
      messages: [],
      readFileState: new Map(),
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      updateFileHistoryState: () => {},
      updateAttributionState: () => {}
    }

    try {
      // 执行query
      const result = await query({
        messages,
        toolUseContext,
        systemPrompt,
        model: 'claude-sonnet-4-6'
      })

      // 提取响应
      const lastMessage = result.messages[result.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        const textBlocks = lastMessage.content.filter(
          block => block.type === 'text'
        )
        return textBlocks.map(block => (block as any).text).join('\n')
      }

      return 'Command executed successfully'
    } catch (error) {
      console.error('[CommandRouter] Execution error:', error)
      throw error
    }
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(ctx: CommandContext): string {
    const { platform, userId, chatId, session } = ctx

    return `You are Claude Code, an AI assistant integrated with ${platform}.

Platform: ${platform}
User ID: ${userId}
Chat ID: ${chatId}
Session ID: ${session.id}

Execute the user's command and provide a clear, helpful response.`
  }
}

// 单例实例
export const commandRouter = new CommandRouter()