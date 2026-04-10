/**
 * Plugin Registry
 * 管理已注册的插件实例
 */

import type { ChannelPlugin } from '../plugin-sdk/core.js'

export class PluginRegistry {
  private channels: Map<string, ChannelPlugin> = new Map()

  register(plugin: ChannelPlugin): void {
    this.channels.set(plugin.id, plugin)
    console.log(`[PluginRegistry] Channel registered: ${plugin.id}`)
  }

  getChannel(id: string): ChannelPlugin | undefined {
    return this.channels.get(id)
  }

  getAllChannels(): ChannelPlugin[] {
    return Array.from(this.channels.values())
  }
}

// 单例实例
let instance: PluginRegistry | null = null

export function getPluginRegistry(): PluginRegistry {
  if (!instance) {
    instance = new PluginRegistry()
  }
  return instance
}