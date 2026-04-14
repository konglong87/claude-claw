/**
 * 配置格式转换器
 * 将 snake_case 转换为 camelCase，适配 OpenClaw 插件
 */

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

export function convertObjectToCamelCase(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(convertObjectToCamelCase)
  }

  const converted: any = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = snakeToCamel(key)
      converted[camelKey] = convertObjectToCamelCase(obj[key])
    }
  }
  return converted
}

/**
 * 将对象的所有键转换为 snake_case 格式
 * 用于将 camelCase 配置转换为 OpenClaw 插件期望的 snake_case 格式
 */
export function convertObjectToSnakeCase(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(convertObjectToSnakeCase)
  }

  const converted: any = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const snakeKey = camelToSnake(key)
      converted[snakeKey] = convertObjectToSnakeCase(obj[key])
    }
  }
  return converted
}

export function convertFeishuConfig(config: any): any {
  const converted = convertObjectToCamelCase(config)

  // 辅助函数：确保是数组
  const ensureArray = (val: any): string[] => {
    if (Array.isArray(val)) return val
    if (typeof val === 'object' && val !== null) {
      // 如果是对象（YAML 解析的空数组会变成 {}），返回空数组
      return Object.keys(val).length === 0 ? [] : Object.values(val)
    }
    return []
  }

  // 处理 channels.feishu 配置（如果存在）
  if (converted.channels?.feishu) {
    const feishu = converted.channels.feishu

    // 处理 allowFrom 和 groupAllowFrom
    feishu.allowFrom = ensureArray(feishu.allowFrom)
    feishu.groupAllowFrom = ensureArray(feishu.groupAllowFrom)

    // 如果没有配置 allowFrom，使用扫码用户的 open_id
    if (feishu.allowFrom.length === 0) {
      feishu.allowFrom.push('ou_cea7b86375ad211fc67ce157420b15c3')
    }
    if (feishu.groupAllowFrom.length === 0) {
      feishu.groupAllowFrom.push('ou_cea7b86375ad211fc67ce157420b15c3')
    }

    // 确保其他字段有默认值
    feishu.enabled = feishu.enabled ?? true
    feishu.domain = feishu.domain || 'feishu'
    feishu.dmPolicy = feishu.dmPolicy || 'allowlist'
    feishu.groupPolicy = feishu.groupPolicy || 'allowlist'
    feishu.groups = feishu.groups || { '*': { enabled: true } }
  }

  // 特殊处理：如果只有 feishu 顶级配置，创建 channels.feishu
  else if (converted.feishu) {
    if (!converted.channels) {
      converted.channels = {}
    }

    // 处理 allowFrom 和 groupAllowFrom
    const allowFrom = ensureArray(converted.feishu.allowFrom)
    const groupAllowFrom = ensureArray(converted.feishu.groupAllowFrom)

    // 如果没有配置 allowFrom，使用扫码用户的 open_id
    if (allowFrom.length === 0) {
      allowFrom.push('ou_cea7b86375ad211fc67ce157420b15c3')
    }
    if (groupAllowFrom.length === 0) {
      groupAllowFrom.push('ou_cea7b86375ad211fc67ce157420b15c3')
    }

    converted.channels.feishu = {
      enabled: converted.feishu.enabled ?? true,
      appId: converted.feishu.appId,
      appSecret: converted.feishu.appSecret,
      encryptKey: converted.feishu.encryptKey || '',
      verificationToken: converted.feishu.verificationToken || '',
      connectionMode: converted.feishu.connectionMode || 'websocket',
      heartbeatInterval: converted.feishu.heartbeatInterval || 30000,
      domain: converted.feishu.domain || 'feishu',
      dmPolicy: converted.feishu.dmPolicy || 'allowlist',
      allowFrom: allowFrom,
      groupPolicy: converted.feishu.groupPolicy || 'allowlist',
      groupAllowFrom: groupAllowFrom,
      groups: converted.feishu.groups || { '*': { enabled: true } }
    }
  }

  return converted
}