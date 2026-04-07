import { join } from 'path'
import { writeFile as writeFilePromise, mkdir as mkdirPromise } from 'fs/promises'
import { getCurrentUserId, getCurrentChannel, getProjectRoot } from '../bootstrap/state.js'
import { isRoleplayEnabled } from './settings/settings.js'
import { getFsImplementation } from './fsOperations.js'
import { logEvent } from '../services/analytics/index.js'

/**
 * Get Role-play file path for a specific user and channel
 * @param userId User identifier (will be sanitized for filesystem safety)
 * @param channel Channel identifier (feishu, dingtalk, wechat, etc.)
 * @returns Absolute path to role-play file
 */
export function getRoleplayFilePath(userId: string, channel: string): string {
  // Sanitize userId to remove filesystem-illegal characters
  const safeUserId = userId.replace(/[\/\\:*\?"<>|]/g, '_')
  const projectRoot = getProjectRoot()
  return join(projectRoot, '.claude', 'roleplay', `${channel}_${safeUserId}.md`)
}

/**
 * Load Role-play file content
 * @param userId Optional user ID (defaults to current user)
 * @param channel Optional channel (defaults to current channel)
 * @returns File content or null if disabled/not found
 */
export async function loadRoleplayFile(
  userId?: string,
  channel?: string
): Promise<string | null> {
  // Feature toggle check
  if (!isRoleplayEnabled()) {
    return null
  }

  const currentUserId = userId || getCurrentUserId()
  const currentChannel = channel || getCurrentChannel()

  if (!currentUserId || !currentChannel) {
    return null
  }

  const filePath = getRoleplayFilePath(currentUserId, currentChannel)
  const fs = getFsImplementation()

  try {
    const content = await fs.readFile(filePath, { encoding: 'utf-8' })
    logEvent('roleplay_file_loaded', {
      channel: currentChannel,
      file_exists: true,
      content_length: content.length
    })
    return content.trim() || null
  } catch (error: any) {
    const code = error?.code
    if (code === 'ENOENT') {
      return null // File doesn't exist - normal case
    }
    if (code === 'EACCES') {
      logEvent('roleplay_file_permission_error', {
        channel: currentChannel,
        error_code: code
      })
    }
    return null
  }
}

/**
 * Write Role-play file
 * @param content Role-play content (free-form Markdown)
 * @param userId Optional user ID (defaults to current user)
 * @param channel Optional channel (defaults to current channel)
 */
export async function writeRoleplayFile(
  content: string,
  userId?: string,
  channel?: string
): Promise<void> {
  // Feature toggle check
  if (!isRoleplayEnabled()) {
    logEvent('roleplay_write_disabled', {})
    return
  }

  const currentUserId = userId || getCurrentUserId()
  const currentChannel = channel || getCurrentChannel()

  if (!currentUserId || !currentChannel) {
    throw new Error('Cannot write roleplay file: userId or channel not set')
  }

  const filePath = getRoleplayFilePath(currentUserId, currentChannel)
  const projectRoot = getProjectRoot()
  const roleplayDir = join(projectRoot, '.claude', 'roleplay')

  try {
    // Ensure directory exists
    await mkdirPromise(roleplayDir, { recursive: true })

    // Write file
    await writeFilePromise(filePath, content.trim(), { encoding: 'utf-8' })

    logEvent('roleplay_file_written', {
      channel: currentChannel,
      content_length: content.length
    })
  } catch (error: any) {
    logEvent('roleplay_file_write_error', {
      channel: currentChannel,
      error: error?.message || 'unknown'
    })
    throw error
  }
}

/**
 * Get current user's Role-play file path (convenience function)
 * @returns File path or null if disabled/no user context
 */
export function getCurrentRoleplayFilePath(): string | null {
  if (!isRoleplayEnabled()) {
    return null
  }

  const userId = getCurrentUserId()
  const channel = getCurrentChannel()

  if (!userId || !channel) {
    return null
  }

  return getRoleplayFilePath(userId, channel)
}