/**
 * 完整飞书机器人启动器
 *
 * 从 config.yaml 读取配置并启动所有服务
 */

import { getConfig, printConfig } from './config/loader'
import { ClaudeWebSocketServer } from './websocket/server'
import { spawn } from 'child_process'

class FeishuBotLauncher {
  private config = getConfig()
  private wsServer: ClaudeWebSocketServer | null = null
  private webhookProcess: any = null

  async start() {
    console.log('================================================================')
    console.log('  飞书机器人启动器')
    console.log('================================================================')
    console.log('')

    // 打印配置
    printConfig(this.config)

    // 1. 启动 WebSocket Server
    if (this.config.websocket) {
      console.log('1️⃣ 启动 Claude Code WebSocket Server...')
      this.wsServer = new ClaudeWebSocketServer()
      this.wsServer.start()
      console.log('   ✅ WebSocket Server 已启动')
      console.log('')
    }

    // 2. 启动飞书 Webhook 服务器
    if (this.config.feishu.enabled && this.config.webhook.enabled) {
      console.log('2️⃣ 启动飞书 Webhook 服务器...')

      if (!this.config.feishu.app_id || !this.config.feishu.app_secret) {
        console.error('   ❌ 飞书配置不完整，跳过 Webhook 启动')
        console.error('   需要配置: feishu.app_id, feishu.app_secret')
        return
      }

      // 设置环境变量
      process.env.FEISHU_APP_ID = this.config.feishu.app_id
      process.env.FEISHU_APP_SECRET = this.config.feishu.app_secret
      process.env.FEISHU_VERIFICATION_TOKEN = this.config.feishu.verification_token
      process.env.FEISHU_ENCRYPT_KEY = this.config.feishu.encrypt_key || ''
      process.env.WS_URL = `ws://localhost:${this.config.websocket.port}`
      process.env.PORT = String(this.config.webhook.port)

      // 启动 Webhook 服务器（子进程）
      this.webhookProcess = spawn('node', ['examples/feishu-webhook-server.js'], {
        stdio: 'inherit',
        env: process.env
      })

      console.log('   ✅ Webhook 服务器已启动')
      console.log('')
    }

    // 3. 显示连接信息
    this.showConnectionInfo()

    // 4. 监听退出信号
    this.setupShutdown()
  }

  showConnectionInfo() {
    console.log('================================================================')
    console.log('  ✅ 飞书机器人已启动！')
    console.log('================================================================')
    console.log('')
    console.log('📊 服务状态:')
    console.log(`  WebSocket: ws://${this.config.websocket.host}:${this.config.websocket.port}`)
    console.log(`  Health: http://${this.config.websocket.host}:${this.config.websocket.port}/health`)

    if (this.config.feishu.enabled) {
      console.log(`  Webhook: http://${this.config.webhook.host}:${this.config.webhook.port}/feishu/webhook`)
    }
    console.log('')
    console.log('🔗 飞书配置:')
    console.log(`  App ID: ${this.config.feishu.app_id}`)
    console.log(`  连接模式: ${this.config.feishu.connection_mode}`)
    console.log('')
    console.log('📋 下一步:')
    console.log('  1. 在飞书开放平台配置事件订阅:')
    console.log(`     URL: https://your-domain.com:${this.config.webhook.port}/feishu/webhook`)
    console.log('  2. 订阅事件: im.message.receive_v1')
    console.log('  3. 发布版本并测试')
    console.log('')
    console.log('📝 查看日志:')
    console.log('  tail -f websocket-server.log')
    console.log('  tail -f feishu-webhook.log')
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

      if (this.webhookProcess) {
        this.webhookProcess.kill()
      }

      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}

// 启动
if (import.meta.main) {
  const launcher = new FeishuBotLauncher()
  launcher.start()
}

export { FeishuBotLauncher }