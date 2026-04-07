/**
 * 配置加载器
 *
 * 从 config.yaml 读取配置
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface Config {
  websocket: {
    host: string
    base_port?: number  // 废弃字段（兼容旧配置）
    api_key?: string
    max_connections: number
    command_timeout: number
  }
  ports: {
    feishu: number
    dingtalk: number
    wechat: number
    webhook: number
  }
  rate_limit: {
    enabled: boolean
    window_ms: number
    max_requests: number
  }
  feishu: {
    enabled: boolean
    app_id: string
    app_secret: string
    encrypt_key?: string
    verification_token: string
    connection_mode: string
  }
  dingtalk: {
    enabled: boolean
    app_key: string
    app_secret: string
    agent_id: string
    connection_mode: 'stream' | 'webhook'
  }
  wechat: {
    enabled: boolean
    corp_id: string
    corp_secret: string
    agent_id: string
    token: string
    encoding_aes_key?: string
    connection_mode: 'webhook'
  }
  webhook: {
    enabled: boolean
    host: string
    port: number
  }
  logging: {
    level: string
    file?: string
  }
  claude: {
    model: string
    api_key?: string
    api_base?: string
    max_tokens?: number
    temperature?: number
    enable_cache?: boolean
  }
  // 环境变量配置（优先级高于 settings.json）
  env?: Record<string, string>
}

// 简单的YAML解析器（仅支持基本格式）
function parseYaml(content: string): any {
  const lines = content.split('\n')
  const result: any = {}
  let currentKey = ''
  let currentObj: any = result
  const stack: any[] = [result]

  for (const line of lines) {
    // 跳过注释和空行
    if (line.trim().startsWith('#') || line.trim() === '') continue

    // 计算缩进
    const indent = line.search(/\S/)
    const trimmed = line.trim()

    // 处理键值对
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':')
      const keyStr = key.trim()
      const valueStr = valueParts.join(':').trim()

      // 根据缩进调整当前对象
      const level = Math.floor(indent / 2)
      while (stack.length > level + 1) {
        stack.pop()
      }
      currentObj = stack[stack.length - 1]

      if (valueStr === '' || valueStr === '{}') {
        // 嵌套对象
        currentObj[keyStr] = {}
        stack.push(currentObj[keyStr])
      } else {
        // 键值对
        let value: any = valueStr

        // 解析引号字符串
        if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
          value = valueStr.slice(1, -1)
        } else if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
          value = valueStr.slice(1, -1)
        } else if (valueStr === 'true') {
          value = true
        } else if (valueStr === 'false') {
          value = false
        } else if (!isNaN(Number(valueStr))) {
          value = Number(valueStr)
        }

        currentObj[keyStr] = value
      }
    }
  }

  return result
}

// 环境变量覆盖
function overrideWithEnv(config: Config): Config {
  return {
    ...config,
    websocket: {
      ...config.websocket,
      host: process.env.WS_HOST || config.websocket.host,
      base_port: parseInt(process.env.WS_PORT || '') || config.websocket.base_port,
      api_key: process.env.WS_API_KEY || config.websocket.api_key,
    },
    feishu: {
      ...config.feishu,
      app_id: process.env.FEISHU_APP_ID || config.feishu.app_id,
      app_secret: process.env.FEISHU_APP_SECRET || config.feishu.app_secret,
      encrypt_key: process.env.FEISHU_ENCRYPT_KEY || config.feishu.encrypt_key,
      verification_token: process.env.FEISHU_VERIFICATION_TOKEN || config.feishu.verification_token,
    },
    dingtalk: {
      ...config.dingtalk,
      app_key: process.env.DINGTALK_APP_KEY || config.dingtalk.app_key,
      app_secret: process.env.DINGTALK_APP_SECRET || config.dingtalk.app_secret,
      agent_id: process.env.DINGTALK_AGENT_ID || config.dingtalk.agent_id,
    },
    wechat: {
      ...config.wechat,
      corp_id: process.env.WECHAT_CORP_ID || config.wechat.corp_id,
      corp_secret: process.env.WECHAT_CORP_SECRET || config.wechat.corp_secret,
      agent_id: process.env.WECHAT_AGENT_ID || config.wechat.agent_id,
      token: process.env.WECHAT_TOKEN || config.wechat.token,
      encoding_aes_key: process.env.WECHAT_ENCODING_AES_KEY || config.wechat.encoding_aes_key,
    },
    webhook: {
      ...config.webhook,
      port: parseInt(process.env.WEBHOOK_PORT || '') || config.webhook.port,
    },
    claude: {
      ...config.claude,
      api_key: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || config.claude.api_key,
      api_base: process.env.CLAUDE_API_BASE || config.claude.api_base,
      model: process.env.CLAUDE_MODEL || config.claude.model,
    }
  }
}

// 加载配置
export function loadConfig(): Config {
  const configPath = join(process.cwd(), 'config.yaml')

  if (!existsSync(configPath)) {
    console.warn('[Config] config.yaml 不存在，使用默认配置')
    return getDefaultConfig()
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const config = parseYaml(content) as Config

    // 环境变量覆盖
    const finalConfig = overrideWithEnv(config)

    console.log('[Config] ✅ 配置加载成功')

    // 🔍 测试日志：打印 env 字段
    if (finalConfig.env) {
      console.log('[Config] 🔍 检测到 env 配置:')
      console.log('[Config] 🔍 env 字段内容:', JSON.stringify(finalConfig.env, null, 2))
      console.log('[Config] 🔍 env 变量数量:', Object.keys(finalConfig.env).length)
    } else {
      console.log('[Config] 🔍 未检测到 env 配置字段')
    }

    return finalConfig
  } catch (error) {
    console.error('[Config] ❌ 配置加载失败:', error)
    return getDefaultConfig()
  }
}

// 默认配置
function getDefaultConfig(): Config {
  return {
    websocket: {
      host: '0.0.0.0',
      port: 8765,
      max_connections: 1000,
      command_timeout: 60000,
    },
    rate_limit: {
      enabled: true,
      window_ms: 60000,
      max_requests: 100,
    },
    feishu: {
      enabled: false,
      app_id: '',
      app_secret: '',
      verification_token: '',
      connection_mode: 'websocket',
    },
    dingtalk: {
      enabled: false,
      app_key: '',
      app_secret: '',
      agent_id: '',
      connection_mode: 'stream',
    },
    wechat: {
      enabled: false,
      corp_id: '',
      corp_secret: '',
      agent_id: '',
      token: '',
      connection_mode: 'webhook',
    },
    webhook: {
      enabled: false,
      host: '0.0.0.0',
      port: 3000,
    },
    logging: {
      level: 'info',
    },
    claude: {
      model: 'claude-sonnet-4-6',
      api_base: 'https://api.anthropic.com',
      max_tokens: 4096,
      temperature: 0.7,
      enable_cache: true,
    },
    // 默认不设置环境变量
    env: undefined,
  }
}

// 打印配置（隐藏敏感信息）
export function printConfig(config: Config): void {
  console.log('================================================================')
  console.log('  当前配置')
  console.log('================================================================')

  // 显示端口配置（兼容新旧配置）
  const displayPort = config.ports?.feishu || config.websocket.base_port || 8765
  console.log(`WebSocket: ws://${config.websocket.host}:${displayPort}`)

  // 飞书配置
  console.log(`飞书启用: ${config.feishu.enabled ? '✅' : '❌'}`)
  if (config.feishu.enabled) {
    console.log(`  AppID: ${config.feishu.app_id.substring(0, 10)}...`)
    console.log(`  连接模式: ${config.feishu.connection_mode}`)
  }

  // 钉钉配置
  console.log(`钉钉启用: ${config.dingtalk.enabled ? '✅' : '❌'}`)
  if (config.dingtalk.enabled) {
    console.log(`  AppKey: ${config.dingtalk.app_key.substring(0, 10)}...`)
    console.log(`  AgentID: ${config.dingtalk.agent_id}`)
    console.log(`  连接模式: ${config.dingtalk.connection_mode}`)
  }

  // 微信配置
  console.log(`微信启用: ${config.wechat.enabled ? '✅' : '❌'}`)
  if (config.wechat.enabled) {
    console.log(`  CorpID: ${config.wechat.corp_id.substring(0, 10)}...`)
    console.log(`  AgentID: ${config.wechat.agent_id}`)
    console.log(`  连接模式: ${config.wechat.connection_mode}`)
  }

  console.log('')
  console.log(`Claude模型: ${config.claude.model}`)
  console.log(`API Base: ${config.claude.api_base || 'https://api.anthropic.com'}`)
  console.log(`API Key: ${config.claude.api_key ? config.claude.api_key.substring(0, 10) + '...' : '未设置'}`)
  console.log(`Max Tokens: ${config.claude.max_tokens || 4096}`)
  console.log(`Temperature: ${config.claude.temperature || 0.7}`)
  console.log('')
  console.log(`限流: ${config.rate_limit.enabled ? '✅' : '❌'} (${config.rate_limit.max_requests} req/${config.rate_limit.window_ms/1000}s)`)
  console.log(`日志级别: ${config.logging.level}`)
  console.log('================================================================')
  console.log('')
}

// 单例实例
let configInstance: Config | null = null

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig()
  }
  return configInstance
}

export function reloadConfig(): Config {
  configInstance = loadConfig()
  return configInstance
}