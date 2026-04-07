/**
 * Gateway Container
 *
 * Top-level orchestrator that manages the entire Gateway system lifecycle.
 * Integrates GatewayServer and ChannelPluginManager into a unified container.
 *
 * This is the main entry point for starting the Gateway system.
 */

// ✅ MACRO polyfill - 构建时注入的全局变量
declare global {
  namespace MACRO {
    export const VERSION: string
    export const BUILD_TIME: string
    export const FEEDBACK_CHANNEL: string
    export const ISSUES_EXPLAINER: string
    export const NATIVE_PACKAGE_URL: string
    export const PACKAGE_URL: string
    export const VERSION_CHANGELOG: string
  }
}

// ✅ 注入 MACRO 全局变量（开发环境 polyfill）
if (typeof (globalThis as any).MACRO === 'undefined') {
  (globalThis as any).MACRO = {
    VERSION: '1.0.0-dev',
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/issues',
    ISSUES_EXPLAINER: 'report the issue at https://github.com/anthropics/claude-code/issues',
    NATIVE_PACKAGE_URL: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
    PACKAGE_URL: 'https://www.npmjs.com/package/claude-code',
    VERSION_CHANGELOG: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  }
}

import './bootstrap/state.js'  // 初始化全局状态
import './utils/config.js'     // 初始化配置系统
import { enableConfigs } from './utils/config.js'  // 启用配置访问
import { applySafeConfigEnvironmentVariables } from './utils/managedEnv.js'  // 加载环境变量
import { GatewayServer } from './gateway/server';
import { GatewayConfig, loadConfig } from './gateway/config';
import { ChannelPluginManager } from './channels/plugin-manager';

/**
 * Gateway Container
 *
 * Top-level orchestrator that manages:
 * - GatewayServer: WebSocket server for client connections
 * - ChannelPluginManager: Manages channel plugins (Feishu/DingTalk/WeChat)
 *
 * Provides clean lifecycle management: start(), stop(), restart()
 */
export class GatewayContainer {
  private gatewayServer: GatewayServer;
  private pluginManager: ChannelPluginManager;
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.gatewayServer = new GatewayServer(config);
    this.pluginManager = new ChannelPluginManager();
  }

  /**
   * Start the Gateway system
   *
   * 1. Start Gateway WebSocket server
   * 2. Load and start channel plugins
   */
  async start(): Promise<void> {
    // Start Gateway WebSocket server
    await this.gatewayServer.start(this.config.port);

    // Load and start channel plugins
    await this.loadAndStartChannels();

    console.log(`Gateway started on port ${this.config.port}`);
    console.log(`Bind: ${this.config.bind}`);
    console.log(`Active channels: ${this.activeChannels.join(', ') || 'none'}`);
  }

  /**
   * Stop the Gateway system
   *
   * 1. Stop all channel plugins
   * 2. Stop Gateway server
   */
  async stop(): Promise<void> {
    // Stop all plugins
    await this.pluginManager.stopAllPlugins();

    // Stop Gateway server
    await this.gatewayServer.stop();

    console.log('Gateway stopped');
  }

  /**
   * Load and start channel plugins based on configuration
   */
  private async loadAndStartChannels(): Promise<void> {
    // Import channel plugins
    const { FeishuChannelPlugin } = await import('./channels/feishu/plugin.js');
    const { DingTalkChannelPlugin } = await import('./channels/dingtalk/plugin.js');
    const { WeChatChannelPlugin } = await import('./channels/wechat/plugin.js');

    // Load full config to get channel settings
    const fullConfig = await loadConfig('config.yaml');

    // Register and start Feishu if enabled
    if (fullConfig.channels?.enabled?.includes('feishu') && fullConfig.feishu?.enabled) {
      const feishuPlugin = new FeishuChannelPlugin({
        enabled: fullConfig.feishu.enabled,
        appId: fullConfig.feishu.appId,  // Use camelCase
        appSecret: fullConfig.feishu.appSecret,  // Use camelCase
        encryptKey: fullConfig.feishu.encryptKey,
        verificationToken: fullConfig.feishu.verificationToken,
        claudeWsUrl: `ws://localhost:${this.config.port}`
      });
      this.pluginManager.registerPlugin(feishuPlugin);
      await this.pluginManager.startPlugin('feishu');
    }

    // Register and start DingTalk if enabled
    if (fullConfig.channels?.enabled?.includes('dingtalk') && fullConfig.dingtalk?.enabled) {
      const dingtalkPlugin = new DingTalkChannelPlugin({
        enabled: fullConfig.dingtalk.enabled,
        app_key: fullConfig.dingtalk.appKey,  // Use camelCase
        app_secret: fullConfig.dingtalk.appSecret,  // Use camelCase
        agent_id: fullConfig.dingtalk.agentId || '',
        connection_mode: fullConfig.dingtalk.connectionMode || 'stream'
      });
      this.pluginManager.registerPlugin(dingtalkPlugin);
      await this.pluginManager.startPlugin('dingtalk');
    }

    // Register and start WeChat if enabled
    if (fullConfig.channels?.enabled?.includes('wechat') && fullConfig.wechat?.enabled) {
      const wechatPlugin = new WeChatChannelPlugin({
        enabled: fullConfig.wechat.enabled,
        corpId: fullConfig.wechat.corpId,  // Use camelCase
        corpSecret: fullConfig.wechat.corpSecret,  // Use camelCase
        agentId: fullConfig.wechat.agentId,
        token: fullConfig.wechat.token,
        encodingAesKey: fullConfig.wechat.encodingAesKey
      });
      this.pluginManager.registerPlugin(wechatPlugin);
      await this.pluginManager.startPlugin('wechat');
    }
  }

  /**
   * Restart the Gateway system
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get list of currently active channels
   */
  get activeChannels(): string[] {
    return this.pluginManager.getActiveChannels();
  }

  /**
   * Get the plugin manager instance
   * Useful for Phase 2 plugin registration
   */
  getPluginManager(): ChannelPluginManager {
    return this.pluginManager;
  }

  /**
   * Get the gateway server instance
   * Useful for advanced configuration
   */
  getGatewayServer(): GatewayServer {
    return this.gatewayServer;
  }
}

/**
 * Main entry point (for backwards compatibility)
 *
 * Usage:
 *   bun run src/bot.ts
 *   bun run src/bot.ts config.yaml
 */
export async function startGateway(configPath: string = 'config.yaml'): Promise<GatewayContainer> {
  const config = await loadConfig(configPath);
  const gateway = new GatewayContainer(config.gateway);
  await gateway.start();
  return gateway;
}

// Main entry point
if (import.meta.main) {
  // 1. 启用配置系统（必须在访问配置之前）
  enableConfigs();

  // 2. 加载环境变量（从 ~/.claude/settings.json 读取认证信息）
  applySafeConfigEnvironmentVariables();

  console.log('[Gateway] 环境变量已加载:');
  console.log('  - ANTHROPIC_AUTH_TOKEN:', process.env.ANTHROPIC_AUTH_TOKEN ? '已设置 ✅' : '未设置 ❌');
  console.log('  - ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || '未设置');
  console.log('  - ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || '未设置');
  console.log('');

  console.log('================================================================');
  console.log('  Gateway 启动器');
  console.log('================================================================');
  console.log('');

  // 3. Start Gateway
  const gateway = await startGateway();

  console.log('================================================================');
  console.log('  ✅ Gateway 已启动！');
  console.log('================================================================');
  console.log('');
  console.log('📊 服务状态:');
  console.log(`  Gateway: ws://${gateway.activeChannels.length > 0 ? 'localhost' : '127.0.0.1'}:${(await loadConfig()).gateway.port}`);
  console.log('');
  console.log('📋 使用方式:');
  console.log('  1. 通过 WebSocket 客户端连接 Gateway');
  console.log('  2. 消息会通过 Channel Router 分发到对应平台');
  console.log('  3. 执行结果会返回到客户端');
  console.log('');
  console.log('🛑 停止服务:');
  console.log('  按 Ctrl+C');
  console.log('');

  // Keep process running until explicitly terminated
  await new Promise<void>((resolve) => {
    process.on('SIGTERM', async () => {
      console.log('\n正在关闭 Gateway...');
      await gateway.stop();
      process.exit(0);
    });
    process.on('SIGINT', async () => {
      console.log('\n正在关闭 Gateway...');
      await gateway.stop();
      process.exit(0);
    });
  });
}

export { GatewayContainer as default };