/**
 * 微信机器人启动器（Webhook 模式 - 企业微信）
 *
 * 使用企业微信 Webhook 模式接收消息推送
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
import { getConfig, printConfig } from './config/loader'
import { ClaudeWebSocketServer } from './websocket/server'
import { WeChatWebhookServer } from './wechat/webhook-server'

class WeChatBotLauncher {
  private config = getConfig()
  private wsServer: ClaudeWebSocketServer | null = null
  private wechatServer: WeChatWebhookServer | null = null

  async start() {
    console.log('================================================================')
    console.log('  微信机器人启动器（Webhook 模式 - 企业微信）')
    console.log('================================================================')
    console.log('')

    // 打印配置
    printConfig(this.config)

    // 1. 启动 Claude Code WebSocket Server
    console.log('1️⃣ 启动 Claude Code WebSocket Server...')
    this.wsServer = new ClaudeWebSocketServer()
    this.wsServer.start()
    console.log('   ✅ WebSocket Server 已启动')
    console.log('')

    // 2. 启动微信 Webhook 服务器
    if (this.config.wechat.enabled) {
      console.log('2️⃣ 启动微信 Webhook 服务器...')

      if (!this.config.wechat.corp_id || !this.config.wechat.corp_secret) {
        console.error('   ❌ 微信配置不完整')
        console.error('   需要配置: wechat.corp_id, wechat.corp_secret, wechat.agent_id, wechat.token')
        return
      }

      // 从配置文件读取端口，兼容旧配置
      const wechatPort = this.config.ports?.wechat || this.config.websocket.base_port || 8767

      this.wechatServer = new WeChatWebhookServer(
        this.config.wechat,
        `ws://localhost:${wechatPort}`
      )

      await this.wechatServer.start()
      console.log('   ✅ 微信 Webhook 已启动')
      console.log('')
    }

    // 3. 显示连接信息
    this.showConnectionInfo()

    // 4. 监听退出信号
    this.setupShutdown()
  }

  showConnectionInfo() {
    console.log('================================================================')
    console.log('  ✅ 微信机器人已启动！')
    console.log('================================================================')
    console.log('')
    console.log('📊 服务状态:')
    const displayPort = this.config.ports?.wechat || this.config.websocket.base_port || 8767
    console.log(`  Claude Code WebSocket: ws://${this.config.websocket.host}:${displayPort}`)
    console.log(`  微信连接模式: Webhook`)
    console.log(`  企业ID: ${this.config.wechat.corp_id}`)
    console.log(`  应用ID: ${this.config.wechat.agent_id}`)
    console.log('')
    console.log('📋 使用方式:')
    console.log('  1. 在企业微信管理后台配置Webhook URL')
    console.log('  2. URL格式: http://your-server:3000/webhook/wechat')
    console.log('  3. 在企业微信中给机器人发送消息')
    console.log('  4. 消息会自动转发到 Claude Code 执行')
    console.log('  5. 执行结果会返回到企业微信')
    console.log('')
    console.log('📝 查看日志:')
    console.log('  tail -f wechat-bot.log')
    console.log('')
    console.log('🛑 停止服务:')
    console.log('  按 Ctrl+C')
    console.log('')
  }

  setupShutdown() {
    const shutdown = () => {
      console.log('\n正在关闭服务...')

      if (this.wsServer) {
        this.wsServer.stop()
      }

      if (this.wechatServer) {
        this.wechatServer.close()
      }

      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}

// 启动
if (import.meta.main) {
  // 1. 启用配置系统（必须在访问配置之前）
  enableConfigs()

  // 2. ✅ 加载环境变量（从 ~/.claude/settings.json 读取认证信息）
  applySafeConfigEnvironmentVariables()

  console.log('[微信启动器] 环境变量已加载:')
  console.log('  - ANTHROPIC_AUTH_TOKEN:', process.env.ANTHROPIC_AUTH_TOKEN ? '已设置 ✅' : '未设置 ❌')
  console.log('  - ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || '未设置')
  console.log('  - ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || '未设置')
  console.log('')

  // 3. 创建启动器
  const launcher = new WeChatBotLauncher()
  launcher.start()
}

export { WeChatBotLauncher }