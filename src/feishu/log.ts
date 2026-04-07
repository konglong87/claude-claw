/**
 * 飞书日志工具 - 自动添加时间前缀
 */

/**
 * 获取当前时间字符串 (格式: HH:MM:SS)
 */
function getTimePrefix(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * 带时间前缀的日志输出
 */
export function feishuLog(...args: any[]): void {
  console.log(`[${getTimePrefix()}]`, ...args)
}

/**
 * 带时间前缀的错误日志
 */
export function feishuError(...args: any[]): void {
  console.error(`[${getTimePrefix()}]`, ...args)
}