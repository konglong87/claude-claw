/**
 * OpenClaw Plugin API Implementation
 * Phase 1: 空实现，让插件能成功注册
 */

import type { OpenClawPluginApi, OpenClawConfig, PluginRuntime, PluginLogger } from '../plugin-sdk/core.js'
import { createToolRuntime, ToolRuntime } from '../plugin-sdk/index.js'
import { getPluginRegistry } from './registry.js'
import { createRuntimeBridge, RuntimeBridge } from './runtime-bridge.js'
import type { ClaudeWebSocketServer } from '../websocket/server.js'

export interface CreatePluginApiParams {
  config: OpenClawConfig
  wsServer: ClaudeWebSocketServer
  runtime?: PluginRuntime
  logger?: PluginLogger
}

export function createPluginApi(params: CreatePluginApiParams): OpenClawPluginApi {
  const { config, wsServer, runtime, logger = console } = params
  const registry = getPluginRegistry()

  // 创建运行时桥接器
  const runtimeBridge = createRuntimeBridge({
    wsServer,
    logger
  })

  // 创建工具运行时
  const toolRuntime = createToolRuntime(logger)
  const registeredTools: Map<string, any> = new Map()

  return {
    config,
    runtime: runtime || {
      logger,
      env: {},
      channel: runtimeBridge.getChannelRuntime(),
      reply: runtimeBridge.getReplyRuntime(),
      streaming: runtimeBridge.getStreamingRuntime(),
      tool: toolRuntime
    },
    logger,

    registerChannel: (params) => {
      const plugin = params.plugin
      registry.register(plugin)

      // 如果插件提供了gateway，启动它
      if (plugin.gateway) {
        logger.info(`[PluginApi] Starting gateway for ${plugin.id}...`)

        const accountIds = plugin.config?.listAccountIds?.(config) || ['default']
        const accountId = accountIds[0]

        plugin.gateway.startAccount({
          cfg: config,
          accountId,
          runtime: {
            logger,
            env: {},
            channel: runtimeBridge.getChannelRuntime(),
            reply: runtimeBridge.getReplyRuntime(),
            streaming: runtimeBridge.getStreamingRuntime()
          },
          setStatus: (status) => {
            logger.info(`[PluginApi] Gateway status: ${JSON.stringify(status)}`)
          },
          log: logger
        }).then(() => {
          logger.info(`[PluginApi] Gateway started successfully for ${plugin.id}`)
        }).catch(error => {
          logger.error(`[PluginApi] Gateway start failed: ${error}`)
        })
      }
    },

    registerTool: (tool) => {
      registeredTools.set(tool.id, tool)
      logger.info(`[PluginApi] Tool registered: ${tool.id} - ${tool.name}`)
    },

    registerCli: (fn) => {
      logger.info('[PluginApi] registerCli called (not implemented in Phase 2)')
    },

    registerCommand: (command) => {
      logger.info(`[PluginApi] registerCommand called for ${command.name} (not implemented in Phase 2)`)
    },

    on: (event, handler) => {
      logger.info(`[PluginApi] on('${event}') called (not implemented in Phase 2)`)
    }
  }
}