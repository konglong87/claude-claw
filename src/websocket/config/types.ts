/**
 * WebSocket Server Configuration
 *
 * 配置管理
 */

import type { PlatformType } from '../protocol/types'

// ========== 服务器配置 ==========

export interface WebSocketConfig {
  server: {
    host: string
    port: number
    ssl?: {
      cert: string
      key: string
    }
  }

  auth: {
    enabled: boolean
    apiKey?: string
    jwtSecret?: string
  }

  platforms: {
    feishu: PlatformConfig
    dingtalk: PlatformConfig
    wechat: PlatformConfig
    slack: PlatformConfig
    custom: PlatformConfig
  }

  limits: {
    maxConnections: number
    rateLimit: {
      windowMs: number
      maxRequests: number
    }
    commandTimeout: number
    sessionExpireMs: number
  }

  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    file?: string
  }
}

export interface PlatformConfig {
  enabled: boolean
  appId?: string
  appSecret?: string
  appKey?: string
  appToken?: string
  webhookUrl?: string
  [key: string]: any
}

// ========== 默认配置 ==========

export const DEFAULT_CONFIG: WebSocketConfig = {
  server: {
    host: process.env.WS_HOST || '0.0.0.0',
    port: parseInt(process.env.WS_PORT || '8765')
  },

  auth: {
    enabled: !!process.env.WS_API_KEY,
    apiKey: process.env.WS_API_KEY
  },

  platforms: {
    feishu: {
      enabled: !!process.env.FEISHU_APP_ID,
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET
    },
    dingtalk: {
      enabled: !!process.env.DINGTALK_AGENT_ID,
      agentId: process.env.DINGTALK_AGENT_ID,
      appKey: process.env.DINGTALK_APP_KEY
    },
    wechat: {
      enabled: !!process.env.WECHAT_CORP_ID,
      corpId: process.env.WECHAT_CORP_ID,
      agentId: process.env.WECHAT_AGENT_ID
    },
    slack: {
      enabled: !!process.env.SLACK_BOT_TOKEN,
      botToken: process.env.SLACK_BOT_TOKEN
    },
    custom: {
      enabled: true
    }
  },

  limits: {
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '1000'),
    rateLimit: {
      windowMs: parseInt(process.env.WS_RATE_WINDOW || '60000'),
      maxRequests: parseInt(process.env.WS_RATE_MAX || '100')
    },
    commandTimeout: parseInt(process.env.WS_COMMAND_TIMEOUT || '60000'),
    sessionExpireMs: parseInt(process.env.WS_SESSION_EXPIRE || '86400000') // 24小时
  },

  logging: {
    level: (process.env.WS_LOG_LEVEL as any) || 'info',
    file: process.env.WS_LOG_FILE
  }
}

// ========== 配置加载器 ==========

export class ConfigLoader {
  private config: WebSocketConfig

  constructor(config?: Partial<WebSocketConfig>) {
    this.config = this.mergeConfig(config)
  }

  /**
   * 合并配置
   */
  private mergeConfig(overrides?: Partial<WebSocketConfig>): WebSocketConfig {
    if (!overrides) return DEFAULT_CONFIG

    return {
      server: { ...DEFAULT_CONFIG.server, ...overrides.server },
      auth: { ...DEFAULT_CONFIG.auth, ...overrides.auth },
      platforms: { ...DEFAULT_CONFIG.platforms, ...overrides.platforms },
      limits: { ...DEFAULT_CONFIG.limits, ...overrides.limits },
      logging: { ...DEFAULT_CONFIG.logging, ...overrides.logging }
    }
  }

  /**
   * 获取配置
   */
  getConfig(): WebSocketConfig {
    return this.config
  }

  /**
   * 获取平台配置
   */
  getPlatformConfig(platform: PlatformType): PlatformConfig {
    return this.config.platforms[platform]
  }

  /**
   * 检查平台是否启用
   */
  isPlatformEnabled(platform: PlatformType): boolean {
    return this.config.platforms[platform]?.enabled || false
  }

  /**
   * 从环境变量重新加载
   */
  reload(): void {
    this.config = this.mergeConfig()
    console.log('[ConfigLoader] Configuration reloaded')
  }
}

// 单例实例
export const configLoader = new ConfigLoader()