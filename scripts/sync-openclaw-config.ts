#!/usr/bin/env bun
/**
 * 从 OpenClaw 配置同步飞书凭证到项目配置
 * Sync Feishu credentials from OpenClaw config to project config
 */

import { parse, stringify } from 'yaml'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json')
const PROJECT_CONFIG = 'config.yaml'

interface OpenClawConfig {
  channels?: {
    feishu?: {
      appId?: string
      appSecret?: string | { file?: string; jsonPointer?: string }
      enabled?: boolean
      connectionMode?: string
      domain?: string
    }
  }
}

interface ProjectConfig {
  channels?: {
    feishu?: Array<{
      app_id: string
      app_secret: string
      enabled: boolean
      connection_mode: string
    }>
  }
}

function resolveSecret(
  secret: string | { file?: string; jsonPointer?: string; source?: string; provider?: string; id?: string } | undefined,
  config?: any
): string | null {
  if (!secret) return null

  if (typeof secret === 'string') {
    return secret
  }

  // OpenClaw 新版 SecretRef 格式
  // { source: "file", provider: "lark-secrets", id: "/lark/appSecret" }
  if (secret.source === 'file' && secret.provider && secret.id) {
    try {
      // 从 config 中获取 provider 路径
      const providerConfig = config?.secrets?.providers?.[secret.provider]
      if (!providerConfig || providerConfig.source !== 'file' || !providerConfig.path) {
        console.error('❌ 未找到 secret provider 配置')
        return null
      }

      const filePath = providerConfig.path.replace('~', homedir())
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)

      // 解析 JSON Pointer (例如: "/lark/appSecret")
      const pointer = secret.id.startsWith('/')
        ? secret.id.slice(1).split('/')
        : secret.id.split('/')

      let value = data
      for (const key of pointer) {
        value = value[key]
      }

      return typeof value === 'string' ? value : null
    } catch (error) {
      console.error('❌ 无法解析 SecretRef (新版格式):', error)
      return null
    }
  }

  // 旧版 SecretRef 格式
  // { file: "~/.openclaw/secrets.json", jsonPointer: "/feishu/appSecret" }
  if (secret.file && secret.jsonPointer) {
    try {
      const filePath = secret.file.replace('~', homedir())
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)

      // 解析 JSON Pointer (例如: "/feishu/appSecret")
      const pointer = secret.jsonPointer.startsWith('/')
        ? secret.jsonPointer.slice(1).split('/')
        : secret.jsonPointer.split('/')

      let value = data
      for (const key of pointer) {
        value = value[key]
      }

      return typeof value === 'string' ? value : null
    } catch (error) {
      console.error('❌ 无法解析 SecretRef (旧版格式):', error)
      return null
    }
  }

  return null
}

export function syncFromOpenClaw(): boolean {
  console.log('🔄 正在从 OpenClaw 同步飞书凭证...\n')

  // 1. 检查 OpenClaw 配置是否存在
  if (!existsSync(OPENCLAW_CONFIG)) {
    console.error('❌ OpenClaw 配置文件不存在')
    console.error('   请先运行: npx @larksuite/openclaw-lark-tools install')
    return false
  }

  // 2. 读取 OpenClaw 配置
  let openclawConfig: OpenClawConfig
  try {
    const content = readFileSync(OPENCLAW_CONFIG, 'utf-8')
    openclawConfig = JSON.parse(content)
  } catch (error) {
    console.error('❌ 无法读取 OpenClaw 配置:', error)
    return false
  }

  // 3. 提取飞书凭证
  const feishuChannel = openclawConfig.channels?.feishu
  if (!feishuChannel || !feishuChannel.appId) {
    console.error('❌ OpenClaw 配置中没有飞书凭证')
    console.error('   请先运行: npx @larksuite/openclaw-lark-tools install')
    return false
  }

  const appId = feishuChannel.appId
  const appSecret = resolveSecret(feishuChannel.appSecret, openclawConfig)

  if (!appSecret) {
    console.error('❌ 无法解析 App Secret')
    console.error('   App Secret 格式:', typeof feishuChannel.appSecret)
    return false
  }

  console.log('✅ 找到飞书凭证:')
  console.log(`   App ID: ${appId}`)
  console.log(`   App Secret: ${appSecret.substring(0, 8)}...${appSecret.substring(appSecret.length - 4)}`)
  console.log()

  // 4. 读取或创建项目配置
  let projectConfig: any = {}
  if (existsSync(PROJECT_CONFIG)) {
    try {
      const content = readFileSync(PROJECT_CONFIG, 'utf-8')
      projectConfig = parse(content)
    } catch (error) {
      console.warn('⚠️  无法读取现有配置，将创建新配置')
    }
  }

  // 5. 更新项目配置
  if (!projectConfig.channels) {
    projectConfig.channels = {}
  }

  projectConfig.channels.feishu = [{
    app_id: appId,
    app_secret: appSecret,
    enabled: feishuChannel.enabled ?? true,
    connection_mode: feishuChannel.connectionMode ?? 'websocket',
    ...(feishuChannel.domain && feishuChannel.domain !== 'feishu' && { domain: feishuChannel.domain })
  }]

  // 6. 写入项目配置
  try {
    const content = stringify(projectConfig)
    writeFileSync(PROJECT_CONFIG, content, 'utf-8')
    console.log('✅ 已同步到项目配置: config.yaml')
    return true
  } catch (error) {
    console.error('❌ 无法写入配置文件:', error)
    return false
  }
}

// CLI 入口
if (import.meta.main) {
  const success = syncFromOpenClaw()
  process.exit(success ? 0 : 1)
}