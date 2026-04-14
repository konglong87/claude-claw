// Gateway Configuration Loader
// Loads configuration from YAML file with environment variable overrides

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

export interface GatewayConfig {
  port: number;
  bind: 'loopback' | 'all';
  auth: {
    token?: string;
    password?: string;
  };
  reload: {
    mode: 'off' | 'hot' | 'restart' | 'hybrid';
  };
  heartbeat: {
    interval: number;
  };
}

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  connectionMode?: string;
  heartbeatInterval?: number;
}

export interface DingTalkConfig {
  enabled: boolean;
  appKey: string;
  appSecret: string;
  agentId?: string;
  connectionMode?: string;
}

export interface WeChatConfig {
  enabled: boolean;
  corpId: string;
  corpSecret: string;
  agentId: string;
  token?: string;
  encodingAesKey?: string;
  connectionMode?: string;
}

export interface ChannelsConfig {
  enabled: string[];
  feishu?: FeishuConfig;
  dingtalk?: DingTalkConfig;
  wechat?: WeChatConfig;
}

export interface ClawhubConfig {
  registry_url: string;
  skills_dir: string;
  lockfile: string;
  auto_update: boolean;
}

export interface AppConfig {
  gateway: GatewayConfig;
  channels: ChannelsConfig;
  clawhub: ClawhubConfig;
  feishu?: FeishuConfig;
  dingtalk?: DingTalkConfig;
  wechat?: WeChatConfig;
}

/**
 * Load configuration from YAML file with environment variable overrides.
 * Environment variables take precedence over YAML values for sensitive data.
 *
 * @param configPath - Path to the YAML config file (default: 'config.yaml')
 * @returns AppConfig object
 */
export async function loadConfig(configPath: string = 'config.yaml'): Promise<AppConfig> {
  const content = readFileSync(configPath, 'utf-8');
  const rawConfig = parseYaml(content) as any;

  // Map snake_case fields from YAML to camelCase for TypeScript
  const config: AppConfig = {
    gateway: rawConfig.gateway,
    channels: rawConfig.channels,
    clawhub: rawConfig.clawhub,
    // Map Feishu config (snake_case -> camelCase)
    feishu: rawConfig.feishu ? {
      enabled: rawConfig.feishu.enabled,
      appId: rawConfig.feishu.app_id,
      appSecret: rawConfig.feishu.app_secret,
      encryptKey: rawConfig.feishu.encrypt_key,
      verificationToken: rawConfig.feishu.verification_token,
      connectionMode: rawConfig.feishu.connection_mode,
      heartbeatInterval: rawConfig.feishu.heartbeat_interval
    } : undefined,
    // Map DingTalk config (snake_case -> camelCase)
    dingtalk: rawConfig.dingtalk ? {
      enabled: rawConfig.dingtalk.enabled,
      appKey: rawConfig.dingtalk.app_key,
      appSecret: rawConfig.dingtalk.app_secret,
      agentId: rawConfig.dingtalk.agent_id,
      connectionMode: rawConfig.dingtalk.connection_mode
    } : undefined,
    // Map WeChat config (snake_case -> camelCase)
    wechat: rawConfig.wechat ? {
      enabled: rawConfig.wechat.enabled,
      corpId: rawConfig.wechat.corp_id,
      corpSecret: rawConfig.wechat.corp_secret,
      agentId: rawConfig.wechat.agent_id,
      token: rawConfig.wechat.token,
      encodingAesKey: rawConfig.wechat.encoding_aes_key,
      connectionMode: rawConfig.wechat.connection_mode
    } : undefined
  };

  // Apply environment variable overrides (for sensitive data)
  if (process.env.GATEWAY_TOKEN) {
    config.gateway.auth.token = process.env.GATEWAY_TOKEN;
  }
  if (process.env.GATEWAY_PASSWORD) {
    config.gateway.auth.password = process.env.GATEWAY_PASSWORD;
  }
  if (process.env.GATEWAY_PORT) {
    config.gateway.port = parseInt(process.env.GATEWAY_PORT, 10);
  }
  if (process.env.GATEWAY_BIND) {
    config.gateway.bind = process.env.GATEWAY_BIND as 'loopback' | 'all';
  }
  if (process.env.GATEWAY_RELOAD_MODE) {
    config.gateway.reload.mode = process.env.GATEWAY_RELOAD_MODE as 'off' | 'hot' | 'restart' | 'hybrid';
  }
  if (process.env.GATEWAY_HEARTBEAT_INTERVAL) {
    config.gateway.heartbeat.interval = parseInt(process.env.GATEWAY_HEARTBEAT_INTERVAL, 10);
  }

  // Clawhub config overrides
  if (process.env.CLAWHUB_REGISTRY_URL) {
    config.clawhub.registry_url = process.env.CLAWHUB_REGISTRY_URL;
  }
  if (process.env.CLAWHUB_SKILLS_DIR) {
    config.clawhub.skills_dir = process.env.CLAWHUB_SKILLS_DIR;
  }
  if (process.env.CLAWHUB_LOCKFILE) {
    config.clawhub.lockfile = process.env.CLAWHUB_LOCKFILE;
  }
  if (process.env.CLAWHUB_AUTO_UPDATE) {
    config.clawhub.auto_update = process.env.CLAWHUB_AUTO_UPDATE === 'true';
  }

  // Sync root-level channel configs to channels object for backward compatibility
  // Also convert snake_case from YAML to camelCase for plugin compatibility
  if (config.feishu) {
    config.channels.feishu = convertFeishuConfig(config.feishu);
    config.feishu = config.channels.feishu;
  }
  if (config.dingtalk) {
    config.channels.dingtalk = convertDingTalkConfig(config.dingtalk);
    config.dingtalk = config.channels.dingtalk;
  }
  if (config.wechat) {
    config.channels.wechat = convertWeChatConfig(config.wechat);
    config.wechat = config.channels.wechat;
  }

  return config;
}

/**
 * Convert Feishu config from snake_case (YAML) to camelCase (plugin)
 * Handles both object format and array format (channels.feishu can be an array in YAML)
 */
function convertFeishuConfig(input: Record<string, unknown>): FeishuConfig {
  // Handle array format: channels.feishu = [{ app_id: ..., app_secret: ..., ... }]
  if (Array.isArray(input) && input.length > 0) {
    const first = input[0] as Record<string, unknown>;
    return {
      enabled: Boolean(first.enabled),
      appId: String(first.app_id || first.appId || ''),
      appSecret: String(first.app_secret || first.appSecret || ''),
      encryptKey: String(first.encrypt_key || first.encryptKey || ''),
      verificationToken: String(first.verification_token || first.verificationToken || ''),
      connectionMode: String(first.connection_mode || first.connectionMode || 'websocket'),
      heartbeatInterval: Number(first.heartbeat_interval || first.heartbeatInterval || 30000)
    };
  }
  return {
    enabled: Boolean(input.enabled),
    appId: String(input.app_id || input.appId || ''),
    appSecret: String(input.app_secret || input.appSecret || ''),
    encryptKey: String(input.encrypt_key || input.encryptKey || ''),
    verificationToken: String(input.verification_token || input.verificationToken || ''),
    connectionMode: String(input.connection_mode || input.connectionMode || 'websocket'),
    heartbeatInterval: Number(input.heartbeat_interval || input.heartbeatInterval || 30000)
  };
}

/**
 * Convert DingTalk config from snake_case (YAML) to camelCase (plugin)
 */
function convertDingTalkConfig(input: Record<string, unknown>): DingTalkConfig {
  return {
    enabled: Boolean(input.enabled),
    appKey: String(input.app_key || input.appKey || ''),
    appSecret: String(input.app_secret || input.appSecret || ''),
    agentId: String(input.agent_id || input.agentId || ''),
    connectionMode: String(input.connection_mode || input.connectionMode || 'stream')
  };
}

/**
 * Convert WeChat config from snake_case (YAML) to camelCase (plugin)
 */
function convertWeChatConfig(input: Record<string, unknown>): WeChatConfig {
  return {
    enabled: Boolean(input.enabled),
    corpId: String(input.corp_id || input.corpId || ''),
    corpSecret: String(input.corp_secret || input.corpSecret || ''),
    agentId: String(input.agent_id || input.agentId || ''),
    token: String(input.token || ''),
    encodingAesKey: String(input.encoding_aes_key || input.encodingAesKey || ''),
    connectionMode: String(input.connection_mode || input.connectionMode || 'webhook')
  };
}

/**
 * Get the default configuration values.
 * These are used when no config file is provided.
 *
 * @returns Default AppConfig object
 */
export function getDefaultConfig(): AppConfig {
  return {
    gateway: {
      port: 8765,
      bind: 'loopback',
      auth: {},
      reload: { mode: 'hybrid' },
      heartbeat: { interval: 15000 }
    },
    channels: {
      enabled: []
    },
    clawhub: {
      registry_url: 'https://clawhub.ai/api',
      skills_dir: 'skills',
      lockfile: '.clawhub/lock.json',
      auto_update: false
    },
    feishu: { enabled: false, appId: '', appSecret: '' },
    dingtalk: { enabled: false, appKey: '', appSecret: '' },
    wechat: { enabled: false, corpId: '', corpSecret: '', agentId: '' }
  };
}

// Allow running directly for testing
if (import.meta.main) {
  (async () => {
    try {
      const config = await loadConfig();
      console.log('Config loaded successfully:');
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to load config:', error);
      process.exit(1);
    }
  })();
}