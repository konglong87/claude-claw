/**
 * Plugin Loader
 * 加载并初始化 openclaw-lark 插件
 */

import type { OpenClawPluginApi } from '../plugin-sdk/core.js'

export async function loadOpenclawLarkPlugin(api: OpenClawPluginApi): Promise<void> {
  try {
    // 动态导入 openclaw-lark 插件
    // 插件导出格式: export default { register }
    const pluginModule = await import('@larksuite/openclaw-lark')

    if (!pluginModule.default || typeof pluginModule.default.register !== 'function') {
      throw new Error('Invalid plugin format: missing register function')
    }

    api.logger.info('[PluginLoader] Loading @larksuite/openclaw-lark...')

    // 调用插件的 register 函数
    await pluginModule.default.register(api)

    api.logger.info('[PluginLoader] Plugin loaded successfully')
  } catch (error) {
    api.logger.error(`[PluginLoader] Failed to load plugin: ${error}`)
    throw error
  }
}