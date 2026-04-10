/**
 * OpenClaw Plugin API Implementation
 * Phase 1: 空实现，让插件能成功注册
 */

import type { OpenClawPluginApi, OpenClawConfig, PluginRuntime, PluginLogger } from '../plugin-sdk/core.js'
import { getPluginRegistry } from './registry.js'

export interface CreatePluginApiParams {
  config: OpenClawConfig
  runtime?: PluginRuntime
  logger?: PluginLogger
}

export function createPluginApi(params: CreatePluginApiParams): OpenClawPluginApi {
  const { config, runtime, logger = console } = params
  const registry = getPluginRegistry()

  return {
    config,
    runtime: runtime || {
      logger,
      env: {}
    },
    logger,

    // Phase 1: 空实现
    registerChannel: (params) => {
      registry.register(params.plugin)
    },

    registerTool: (tool) => {
      // Phase 4: 实现工具注册
      logger.info('[PluginApi] registerTool called (not implemented in Phase 1)')
    },

    on: (event, handler) => {
      // Phase 2: 实现事件监听
      logger.info(`[PluginApi] on('${event}') called (not implemented in Phase 1)`)
    }
  }
}