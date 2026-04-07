/**
 * QueryEngine配置构建工具
 *
 * 为飞书会话创建适合自动化场景的QueryEngine配置
 */

import { getCwd } from '../../utils/cwd.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import type { Tools } from '../../Tool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { AppState } from '../../state/AppState.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import { createFileStateCacheWithSizeLimit } from '../../utils/fileStateCache.js'

// 导入默认工具
import { BashTool } from '../../tools/BashTool/BashTool.js'
import { FileEditTool } from '../../tools/FileEditTool/FileEditTool.js'
import { FileWriteTool } from '../../tools/FileWriteTool/FileWriteTool.js'
import { GrepTool } from '../../tools/GrepTool/GrepTool.js'
import { GlobTool } from '../../tools/GlobTool/GlobTool.js'
import { FileReadTool } from '../../tools/FileReadTool/FileReadTool.js'

/**
 * 构建飞书会话的默认工具集
 *
 * 选择适合自动化场景的工具，排除需要交互式UI的工具
 */
export function buildDefaultTools(): Tools {
  return [
    BashTool,
    FileEditTool,
    FileWriteTool,
    GrepTool,
    GlobTool,
    FileReadTool,
    // 注意: 不包含AskUserQuestion等需要UI交互的工具
  ]
}

/**
 * 构建canUseTool函数
 *
 * 飞书场景: 自动批准大部分工具调用(无需用户确认)
 */
export function buildCanUseTool(): CanUseToolFn {
  return async (tool, input, context, assistantMessage, toolUseID, forceDecision) => {
    const toolName = tool.name

    // 危险操作黑名单
    const dangerousPatterns = [
      /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/,  // rm -rf, rm -fr
      /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,  // SQL DROP
      /\bTRUNCATE\s+(TABLE)?\b/i,  // SQL TRUNCATE
      /\bDELETE\s+FROM\b/i,  // SQL DELETE
      /\bmkfs\b/,  // 格式化文件系统
      /\bdd\s+if=/,  // 磁盘复制
      /\b(sudo|chmod|chown)\b/,  // 权限操作
    ]

    // 检查输入是否包含危险模式
    const inputStr = JSON.stringify(input)
    for (const pattern of dangerousPatterns) {
      if (pattern.test(inputStr)) {
        return {
          behavior: 'deny',
          message: `Dangerous operation detected: ${pattern.source}`,
          decisionReason: {
            type: 'other',
            reason: 'dangerous_operation'
          }
        }
      }
    }

    // 其他操作自动批准
    return { behavior: 'allow' }
  }
}

/**
 * 构建AppState获取函数
 *
 * 返回简化的AppState，使用bypassPermissions模式自动批准
 */
export function buildGetAppState(): () => AppState {
  let appState = {
    ...getDefaultAppState(),
    toolPermissionContext: {
      ...getDefaultAppState().toolPermissionContext,
      mode: 'bypassPermissions' as const,
      isBypassPermissionsModeAvailable: false,
    }
  }

  return () => appState
}

/**
 * 构建AppState更新函数
 *
 * 飞书场景: 无需持久化AppState到UI，仅在内存中更新
 */
export function buildSetAppState(): (f: (prev: AppState) => AppState) => void {
  let appState = buildGetAppState()()

  return (updater) => {
    appState = updater(appState)
  }
}

/**
 * 构建初始FileStateCache
 */
export function buildReadFileCache(): FileStateCache {
  return createFileStateCacheWithSizeLimit(100, 10 * 1024 * 1024) // 100 files, 10MB
}

export const QueryEngineSetup = {
  buildDefaultTools,
  buildCanUseTool,
  buildGetAppState,
  buildSetAppState,
  buildReadFileCache,
}