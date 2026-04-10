#!/usr/bin/env bun
/**
 * 测试 @larksuite/openclaw-lark 插件加载
 */

import { createPluginApi } from './src/plugin-host/api.js'
import { loadOpenclawLarkPlugin } from './src/plugin-host/loader.js'
import { ClaudeWebSocketServer } from './src/websocket/server.js'

console.log('====================================')
console.log('测试 OpenClaw 插件加载')
console.log('====================================\n')

// 创建一个简单的 logger
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`)
}

// 创建一个简单的 WebSocket Server（用于测试）
const wsServer = {
  broadcast: (msg: string) => {
    logger.info(`[WebSocket] Broadcasting: ${msg.substring(0, 50)}...`)
  },
  start: () => {
    logger.info('[WebSocket] Server started')
  },
  stop: () => {
    logger.info('[WebSocket] Server stopped')
  }
} as any

// 测试配置
const config = {
  channels: {
    feishu: [{
      app_id: 'cli_test',
      app_secret: 'test_secret',
      enabled: true,
      connection_mode: 'websocket'
    }]
  }
}

async function testPluginLoad() {
  try {
    console.log('1️⃣ 创建 Plugin API...\n')
    const api = createPluginApi({
      config,
      wsServer,
      logger
    })
    console.log('✅ Plugin API 创建成功\n')

    console.log('2️⃣ 加载 @larksuite/openclaw-lark 插件...\n')
    await loadOpenclawLarkPlugin(api)
    console.log('✅ 插件加载成功\n')

    console.log('====================================')
    console.log('测试结果: 成功 ✅')
    console.log('====================================')
    console.log('\n插件已成功注册并初始化。')
    console.log('注意: Gateway 启动可能失败，因为缺少真实飞书凭证。')
    console.log('这是预期行为。要使用真实凭证，请更新 config.yaml 中的飞书配置。\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ 测试失败:', error)
    process.exit(1)
  }
}

testPluginLoad()