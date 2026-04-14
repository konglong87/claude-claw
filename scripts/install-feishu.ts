#!/usr/bin/env bun
/**
 * 一键安装飞书插件并配置
 * One-click Feishu plugin installation and configuration
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { syncFromOpenClaw } from './sync-openclaw-config'

const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json')

console.log('╔════════════════════════════════════════════╗')
console.log('║   飞书插件一键安装配置工具                 ║')
console.log('║   Feishu Plugin Quick Setup               ║')
console.log('╚════════════════════════════════════════════╝')
console.log()

// 步骤 1: 运行官方安装工具
console.log('📱 步骤 1/3: 启动飞书应用配置向导')
console.log('   Step 1/3: Starting Feishu app configuration wizard')
console.log()
console.log('   即将显示二维码，请使用飞书 App 扫描...')
console.log('   QR code will be displayed, please scan with Feishu App...')
console.log()

try {
  execSync('npx @larksuite/openclaw-lark-tools install', {
    stdio: 'inherit',
    env: { ...process.env }
  })
} catch (error) {
  // 用户取消或失败
  console.log()
  console.log('⚠️  安装工具已退出')
  console.log('   Installation tool exited')
  process.exit(1)
}

console.log()
console.log('✅ 步骤 1/3: 完成')
console.log()

// 步骤 2: 检查凭证是否已保存
console.log('🔍 步骤 2/3: 检查 OpenClaw 配置')
console.log('   Step 2/3: Checking OpenClaw configuration')

if (!existsSync(OPENCLAW_CONFIG)) {
  console.error('❌ 未找到 OpenClaw 配置文件')
  console.error('   OpenClaw config not found')
  process.exit(1)
}

console.log('   ✅ OpenClaw 配置文件已找到')
console.log()

// 步骤 3: 同步凭证到项目
console.log('🔄 步骤 3/3: 同步凭证到项目配置')
console.log('   Step 3/3: Syncing credentials to project config')
console.log()

const success = syncFromOpenClaw()

if (success) {
  console.log()
  console.log('╔════════════════════════════════════════════╗')
  console.log('║          🎉 安装配置完成！                 ║')
  console.log('║       Installation Complete!              ║')
  console.log('╚════════════════════════════════════════════╝')
  console.log()
  console.log('📋 下一步 Next Steps:')
  console.log()
  console.log('   1. 启动服务 Start service:')
  console.log('      bun run feishu-bot')
  console.log()
  console.log('   2. 在飞书中给机器人发送消息测试')
  console.log('      Send a message to your bot in Feishu')
  console.log()
  console.log('   3. 查看配置文件 View config:')
  console.log('      cat config.yaml')
  console.log()
  process.exit(0)
} else {
  console.error()
  console.error('❌ 凭证同步失败')
  console.error('   Credential sync failed')
  console.error()
  console.error('💡 你可以手动配置:')
  console.error('   You can manually configure:')
  console.error('   编辑 config.yaml 添加飞书凭证')
  process.exit(1)
}