/**
 * Plugin Loader
 * 加载并初始化 openclaw-lark 插件
 */

import type { OpenClawPluginApi } from '../plugin-sdk/core.js'

export async function loadOpenclawLarkPlugin(api: OpenClawPluginApi): Promise<void> {
  try {
    // 动态导入 openclaw-lark 插件
    // package.json 已修复，直接使用 index.js (main 字段)
    const pluginModule = await import('@larksuite/openclaw-lark')

    // 兼容 CommonJS 和 ES Module 导出格式
    const plugin = pluginModule.default || pluginModule

    if (!plugin || typeof plugin.register !== 'function') {
      throw new Error('Invalid plugin format: missing register function')
    }

    api.logger.info('[PluginLoader] Loading @larksuite/openclaw-lark...')

    // 调用插件的 register 函数
    await plugin.register(api)

    api.logger.info('[PluginLoader] Plugin loaded successfully')
  } catch (error) {
    api.logger.error(`[PluginLoader] Failed to load plugin: ${error}`)
    throw error
  }
}