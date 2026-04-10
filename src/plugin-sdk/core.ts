/**
 * OpenClaw Plugin SDK Core Types
 * 复制自 OpenClaw 源码的核心类型定义
 */

export type OpenClawConfig = Record<string, any>

/** @deprecated Use OpenClawConfig instead */
export type ClawdbotConfig = OpenClawConfig

export type RuntimeEnv = {
  agentDir?: string
  workspaceDir?: string
  configPath?: string
  dataDir?: string
  cacheDir?: string
  tempDir?: string
}

export type PluginRuntime = {
  logger: PluginLogger
  env: RuntimeEnv
  channel?: any  // ChannelRuntime for message handling
  reply?: any    // ReplyRuntime for sending replies
}

export type PluginLogger = {
  debug?: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

export type ChannelPlugin<T = any> = {
  id: string
  meta: ChannelMeta
  capabilities: ChannelCapabilities
  gateway?: ChannelGatewayAdapter<T>
  config?: ChannelConfigAdapter<T>
  outbound?: ChannelOutboundAdapter
}

export type ChannelMeta = {
  id: string
  label: string
  selectionLabel: string
  docsPath?: string
  docsLabel?: string
  blurb?: string
  aliases?: string[]
  order?: number
}

export type ChannelCapabilities = {
  chatTypes: Array<'direct' | 'group'>
  media: boolean
  reactions: boolean
  threads: boolean
  polls: boolean
  nativeCommands: boolean
  blockStreaming: boolean
}

export type ChannelGatewayAdapter<T = any> = {
  startAccount: (ctx: {
    cfg: ClawdbotConfig
    runtime?: PluginRuntime
    accountId: string
    setStatus: (status: any) => void
    log?: PluginLogger
    abortSignal?: AbortSignal
  }) => Promise<void>
  stopAccount?: (ctx: {
    cfg: ClawdbotConfig
    runtime?: PluginRuntime
    accountId: string
    log?: PluginLogger
  }) => Promise<void>
}

export type ChannelConfigAdapter<T = any> = {
  listAccountIds: (cfg: ClawdbotConfig) => string[]
  resolveAccount: (cfg: ClawdbotConfig, accountId: string) => T | undefined
  defaultAccountId: (cfg: ClawdbotConfig) => string | undefined
}

export type ChannelOutboundAdapter = {
  sendMessage?: (params: any) => Promise<void>
}

export type OpenClawPluginApi = {
  registerChannel: (params: { plugin: ChannelPlugin }) => void
  registerTool: (tool: any) => void
  registerCli?: (fn: any) => void
  registerCommand?: (command: any) => void
  on: (event: string, handler: any) => void
  config: OpenClawConfig
  runtime: PluginRuntime
  logger: PluginLogger
}

/**
 * Empty plugin config schema (placeholder)
 */
export function emptyPluginConfigSchema(): any {
  return {
    type: 'object',
    properties: {},
    required: []
  }
}