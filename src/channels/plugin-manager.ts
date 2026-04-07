import { ChannelPlugin, ChannelConfig } from './types';

/**
 * Channel Plugin Manager
 *
 * Manages the lifecycle of all channel plugins (Feishu/DingTalk/WeChat).
 * Provides registration, start/stop/restart operations, and active channel tracking.
 *
 * Integration points:
 * - GatewayContainer - uses PluginManager to start/stop all plugins
 * - ChannelRouter - uses PluginManager.getPlugin() to route messages
 * - Single Channel CLI - uses PluginManager for independent channel operation
 */
export class ChannelPluginManager {
  private plugins: Map<string, ChannelPlugin> = new Map();
  private configs: Map<string, ChannelConfig> = new Map();

  /**
   * Register a plugin with optional configuration
   */
  registerPlugin(plugin: ChannelPlugin, config?: ChannelConfig): void {
    this.plugins.set(plugin.id, plugin);
    if (config) {
      this.configs.set(plugin.id, config);
    }
  }

  /**
   * Load plugins from configuration (stub for future dynamic loading)
   * Currently plugins are registered manually via registerPlugin()
   */
  async loadPlugins(configs: Record<string, ChannelConfig>): Promise<void> {
    // Will be implemented when we have actual plugin implementations
    // For now, plugins are registered manually
  }

  /**
   * Start a plugin by ID
   * @throws Error if plugin not found
   */
  async startPlugin(channelId: string): Promise<void> {
    const plugin = this.plugins.get(channelId);
    if (plugin && plugin.enabled) {
      await plugin.start();
      console.log(`Channel ${channelId} started`);
    } else if (!plugin) {
      throw new Error(`Plugin ${channelId} not found`);
    }
  }

  /**
   * Stop a plugin by ID
   */
  async stopPlugin(channelId: string): Promise<void> {
    const plugin = this.plugins.get(channelId);
    if (plugin) {
      await plugin.stop();
      console.log(`Channel ${channelId} stopped`);
    }
  }

  /**
   * Restart a plugin by ID (stop then start)
   */
  async restartPlugin(channelId: string): Promise<void> {
    await this.stopPlugin(channelId);
    await this.startPlugin(channelId);
  }

  /**
   * Stop all active plugins (for Gateway shutdown)
   */
  async stopAllPlugins(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.getStatus().connected) {
        await plugin.stop();
      }
    }
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(channelId: string): ChannelPlugin | undefined {
    return this.plugins.get(channelId);
  }

  /**
   * Get list of active (connected) channel IDs
   */
  getActiveChannels(): string[] {
    const active: string[] = [];
    for (const [id, plugin] of this.plugins.entries()) {
      if (plugin.getStatus().connected) {
        active.push(id);
      }
    }
    return active;
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): ChannelPlugin[] {
    return Array.from(this.plugins.values());
  }
}