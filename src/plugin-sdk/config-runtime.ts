/**
 * Config Runtime
 */

export type ConfigRuntime = {
  get: (key: string) => any
  set: (key: string, value: any) => void
  reload: () => void
}

export function createConfigRuntime(initialConfig: Record<string, any>): ConfigRuntime {
  let config = initialConfig

  return {
    get: (key) => config[key],
    set: (key, value) => { config[key] = value },
    reload: () => { console.log('[ConfigRuntime] Placeholder reload') }
  }
}