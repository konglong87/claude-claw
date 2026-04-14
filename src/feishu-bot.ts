/**
 * 飞书机器人启动器（WebSocket 长连接模式）
 *
 * 使用飞书官方 WebSocket 长连接，不需要 Webhook
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

// ✅ 注入MACRO全局变量（开发环境polyfill）
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
import { getConfig, printConfig } from './config/loader'
import { ClaudeWebSocketServer } from './websocket/server'
import { FeishuWebSocketClient } from './feishu/websocket-client'
import { feishuLog, feishuError } from './feishu/log.js'
import { createPluginApi } from './plugin-host/api.js'
import { loadOpenclawLarkPlugin } from './plugin-host/loader.js'

class FeishuBotLauncher {
  private config = getConfig()
  private wsServer: ClaudeWebSocketServer | null = null
  private feishuClient: FeishuWebSocketClient | null = null

  async start() {
    feishuLog('================================================================')
    feishuLog('  飞书机器人启动器（WebSocket 长连接模式）')
    feishuLog('================================================================')
    feishuLog('')

    // 打印配置
    printConfig(this.config)

    // 1. 启动 Claude Code WebSocket Server
    feishuLog('1️⃣ 启动 Claude Code WebSocket Server...')
    this.wsServer = new ClaudeWebSocketServer()
    this.wsServer.start()
    feishuLog('   ✅ WebSocket Server 已启动')
    feishuLog('')

    // 2. 启动飞书 WebSocket 长连接
    if (this.config.feishu.enabled) {
      feishuLog('2️⃣ 连接到飞书 WebSocket...')

      if (!this.config.feishu.app_id || !this.config.feishu.app_secret) {
        feishuError('   ❌ 飞书配置不完整')
        feishuError('   需要配置: feishu.app_id, feishu.app_secret')
        return
      }

      // 从配置文件读取端口，兼容旧配置
      const feishuPort = this.config.ports?.feishu || this.config.websocket.base_port || 8765

      this.feishuClient = new FeishuWebSocketClient(
        {
          appId: this.config.feishu.app_id,
          appSecret: this.config.feishu.app_secret,
          encryptKey: this.config.feishu.encrypt_key,
          verificationToken: this.config.feishu.verification_token
        },
        `ws://127.0.0.1:${feishuPort}`
      )

      await this.feishuClient.connect()
      feishuLog('   ✅ 飞书 WebSocket 已连接')
      feishuLog('')
    }

    // 3. 显示连接信息
    this.showConnectionInfo()

    // 4. 监听退出信号
    this.setupShutdown()
  }

  async startWithPlugin() {
    feishuLog('================================================================')
    feishuLog('  飞书机器人启动器（OpenClaw 插件模式）')
    feishuLog('================================================================')
    feishuLog('')

    // 1. 启动 Gateway Server（替代旧的 WebSocket Server）
    feishuLog('1️⃣ 启动 Gateway Server...')
    const { GatewayServer } = await import('./gateway/server.js')
    const gatewayPort = this.config.websocket.base_port || this.config.ports?.feishu || 8765
    const gatewayServer = new GatewayServer({
      port: gatewayPort,
      bind: 'loopback',
      auth: {},
      reload: { mode: 'off' },
      heartbeat: { interval: 15000 }
    })
    await gatewayServer.start(gatewayPort)
    feishuLog(`   ✅ Gateway Server 已启动 (端口: ${gatewayPort})`)
    feishuLog('')

    // 2. 转换配置格式（确保 channels.feishu 存在）
    feishuLog('2️⃣ 转换配置格式...')
    if (!this.config.channels) {
      this.config.channels = {} as any
    }
    // 转换 feishu 配置到 channels.feishu（插件期望的结构）
    if (this.config.feishu) {
      // 直接使用顶层 feishu 配置，不经过任何解析
      const feishuConfig = {
        enabled: this.config.feishu.enabled,
        app_id: this.config.feishu.app_id,
        app_secret: this.config.feishu.app_secret,
        encrypt_key: this.config.feishu.encrypt_key || '',
        verification_token: this.config.feishu.verification_token || '',
        connection_mode: this.config.feishu.connection_mode || 'websocket',
        heartbeat_interval: this.config.feishu.heartbeat_interval || 30000
      }
      this.config.channels.feishu = feishuConfig
    }
    feishuLog('   ✅ 配置转换完成')
    feishuLog('')

    // 3. 启动 FeishuWebSocketClient（直接连接到 Gateway）
    feishuLog('3️⃣ 启动 FeishuWebSocketClient...')
    const feishuPort = gatewayPort
    const feishuClient = new FeishuWebSocketClient(
      {
        appId: this.config.feishu.app_id,
        appSecret: this.config.feishu.app_secret,
        encryptKey: this.config.feishu.encrypt_key,
        verificationToken: this.config.feishu.verification_token
      },
      `ws://127.0.0.1:${feishuPort}`
    )
    await feishuClient.connect()
    feishuLog(`   ✅ FeishuWebSocketClient 已启动 (连接端口: ${feishuPort})`)
    feishuLog('')

    // 4. 显示连接信息
    this.showConnectionInfo()

    // 5. 监听退出信号
    const shutdown = () => {
      feishuLog('\n正在关闭服务...')
      gatewayServer.stop()
      feishuClient.close()
      process.exit(0)
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }

  showConnectionInfo() {
    feishuLog('================================================================')
    feishuLog('  ✅ 飞书机器人已启动！')
    feishuLog('================================================================')
    feishuLog('')
    feishuLog('📊 服务状态:')
    const displayPort = this.config.ports?.feishu || this.config.websocket.base_port || 8765
    feishuLog(`  Claude Code WebSocket: ws://${this.config.websocket.host}:${displayPort}`)
    feishuLog(`  飞书连接模式: WebSocket 长连接`)
    feishuLog(`  飞书 App ID: ${this.config.feishu.app_id}`)
    feishuLog('')
    feishuLog('📋 使用方式:')
    feishuLog('  1. 在飞书中给机器人发送消息')
    feishuLog('  2. 消息会自动转发到 Claude Code 执行')
    feishuLog('  3. 执行结果会返回到飞书')
    feishuLog('')
    feishuLog('📝 查看日志:')
    feishuLog('  tail -f feishu-bot.log')
    feishuLog('')
    feishuLog('🛑 停止服务:')
    feishuLog('  按 Ctrl+C')
    feishuLog('')
  }

  setupShutdown() {
    const shutdown = () => {
      feishuLog('\n正在关闭服务...')

      if (this.wsServer) {
        this.wsServer.stop()
      }

      if (this.feishuClient) {
        this.feishuClient.close()
      }

      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}

// 启动
if (import.meta.main) {
  enableConfigs()
  applySafeConfigEnvironmentVariables()

  const launcher = new FeishuBotLauncher()

  // 使用新的插件模式启动
  launcher.startWithPlugin()
}

export { FeishuBotLauncher }
