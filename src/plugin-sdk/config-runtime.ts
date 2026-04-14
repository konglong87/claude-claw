/**
 * Config Runtime
 */

export type ConfigRuntime = {
  get: (key: string) => any
  set: (key: string, value: any) => void
  reload: () => void
  loadConfig: () => Record<string, any>  // ← 新增：OpenClaw 配置加载方法
}

export function createConfigRuntime(initialConfig: Record<string, any>): ConfigRuntime {
  let config = initialConfig

  return {
    get: (key) => config[key],
    set: (key, value) => { config[key] = value },
    reload: () => { console.log('[ConfigRuntime] Placeholder reload') },
    loadConfig: () => config  // ← 新增：返回完整配置对象
  }
}