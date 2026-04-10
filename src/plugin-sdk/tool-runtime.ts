/**
 * Tool Runtime
 * 工具调用运行时
 */

import type { PluginLogger } from './core.js'

export interface ToolPayload {
  toolId: string
  toolName: string
  parameters: Record<string, any>
  accountId: string
  userId: string
  messageId: string
}

export interface ToolResult {
  toolId: string
  result: any
  error?: string
}

export interface ToolRuntime {
  executeTool(payload: ToolPayload): Promise<ToolResult>
  logger: PluginLogger
}

export function createToolRuntime(logger: PluginLogger): ToolRuntime {
  const toolRegistry: Map<string, any> = new Map()

  return {
    executeTool: async (payload) => {
      logger.info(`[ToolRuntime] Execute tool: ${payload.toolName}`)

      const tool = toolRegistry.get(payload.toolId)
      if (!tool) {
        return {
          toolId: payload.toolId,
          result: null,
          error: `Tool not found: ${payload.toolId}`
        }
      }

      try {
        const result = await tool.execute(payload.parameters)
        return {
          toolId: payload.toolId,
          result
        }
      } catch (error) {
        return {
          toolId: payload.toolId,
          result: null,
          error: String(error)
        }
      }
    },

    logger
  }
}