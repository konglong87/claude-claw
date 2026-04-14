/**
 * Gateway Query Engine Integration
 *
 * Integrates Claude Code's QueryEngine into the Gateway architecture.
 * This is the core execution layer that enables AI command processing.
 */

// ✅ MACRO polyfill - 构建时注入的全局变量
declare global {
  namespace MACRO {
    export const VERSION: string
    export const BUILD_TIME: string
    export const FEEDBACK_CHANNEL: string
    export const ISSUES_EXPLAINER: string
    export const NATIVE_PACKAGE_URL: string
    export const PACKAGE_URL: string
    export const VERSION_CHANGELOG: string
  }
}

// ✅ 注入 MACRO 全局变量（开发环境 polyfill）
if (typeof (globalThis as any).MACRO === 'undefined') {
  (globalThis as any).MACRO = {
    VERSION: '1.0.0-dev',
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: 'https://github.com/anthropics/claude-code/issues',
    ISSUES_EXPLAINER: 'report the issue at https://github.com/anthropics/claude-code/issues',
    NATIVE_PACKAGE_URL: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
    PACKAGE_URL: 'https://www.npmjs.com/package/claude-code',
    VERSION_CHANGELOG: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
  }
}

import '../bootstrap/state.js';  // ← 启用全局状态和配置访问（必须在最前）
import { enableConfigs } from '../utils/config.js';  // ← 启用配置系统
import { applySafeConfigEnvironmentVariables } from '../utils/managedEnv.js';  // ← 加载环境变量

import { QueryEngine, type QueryEngineConfig } from '../QueryEngine.js';
import type { Tools, ToolPermissionContext } from '../Tool.js';
import { getCwd } from '../utils/cwd.js';
import { createAbortController } from '../utils/abortController.js';
import { createFileStateCacheWithSizeLimit, READ_FILE_STATE_CACHE_SIZE } from '../utils/fileStateCache.js';
import type { FileStateCache } from '../utils/fileStateCache.js';
import type { MCPServerConnection } from '../services/mcp/types.js';
import type { Usage } from '@anthropic-ai/sdk/resources/messages.mjs';
import { getDefaultAppState } from '../state/AppStateStore.js';
import type { AppState } from '../state/AppStateStore.js';
import type { Command } from '../commands.js';
import type { CanUseToolFn } from '../hooks/useCanUseTool.js';
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js';
import type { SDKMessage } from '../entrypoints/sdk/coreTypes.js';

/**
 * Command execution result
 */
export interface CommandResult {
  text: string;
  sessionId: string;
  duration_ms: number;
  usage?: Usage;
  toolCalls?: number;
}

/**
 * Session context for command execution
 */
export interface SessionContext {
  sessionId: string;
  userId: string;
  chatId: string;
  platform: string;
  chatType: 'private' | 'group';
}

/**
 * Gateway Query Engine Wrapper
 *
 * Manages QueryEngine instances per session and handles command execution.
 */
export class GatewayEngine {
  private sessions: Map<string, QueryEngine> = new Map();
  private sessionStates: Map<string, AppState> = new Map();

  constructor() {
    // 启用配置访问和环境变量（必须在 QueryEngine 初始化前）
    enableConfigs();
    applySafeConfigEnvironmentVariables();

    console.log('[GatewayEngine] Initialized');
  }

  /**
   * Get or create a QueryEngine for a session
   */
  private getOrCreateEngine(sessionContext: SessionContext): QueryEngine {
    const { sessionId } = sessionContext;

    if (!this.sessions.has(sessionId)) {
      console.log(`[GatewayEngine] Creating new QueryEngine for session: ${sessionId}`);

      // Initialize session state with default app state
      const initialAppState = getDefaultAppState();
      this.sessionStates.set(sessionId, initialAppState);

      // Create a fresh file state cache for this session
      const fileStateCache = createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE);

      // Get tool permission context from environment
      const toolPermissionContext: ToolPermissionContext = {
        mode: 'auto',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      };

      // Create QueryEngine configuration
      const config: QueryEngineConfig = {
        cwd: getCwd(),
        tools: [],  // Will be populated by QueryEngine from appState
        commands: [] as Command[],
        mcpClients: [] as MCPServerConnection[],
        agents: [] as AgentDefinition[],
        canUseTool: async () => ({ behavior: 'allow' }), // Auto-approve in gateway mode
        getAppState: () => this.sessionStates.get(sessionId)!,
        setAppState: (updater) => {
          const currentState = this.sessionStates.get(sessionId)!;
          const newState = updater(currentState);
          this.sessionStates.set(sessionId, newState);
        },
        readFileCache: fileStateCache,
        abortController: createAbortController(),
      };

      const engine = new QueryEngine(config);
      this.sessions.set(sessionId, engine);
    }

    return this.sessions.get(sessionId)!;
  }

  /**
   * Get the QueryEngine generator for streaming responses
   * Public method for external streaming access
   */
  async *getMessageGenerator(
    sessionContext: SessionContext,
    content: string
  ): AsyncGenerator<SDKMessage, void, unknown> {
    const engine = this.getOrCreateEngine(sessionContext);
    yield* engine.submitMessage(content);
  }

  /**
   * Execute a command and return the result
   */
  async executeCommand(
    content: string,
    sessionContext: SessionContext
  ): Promise<CommandResult> {
    const startTime = Date.now();
    const { sessionId } = sessionContext;

    console.log(`[GatewayEngine] Executing command for session ${sessionId}: ${content.substring(0, 50)}...`);

    try {
      const engine = this.getOrCreateEngine(sessionContext);

      // Submit message and collect results
      const generator = engine.submitMessage(content);

      // Collect all results
      let fullText = '';
      let usage: Usage | undefined;
      let toolCalls = 0;
      let chunkCount = 0;

      for await (const chunk of generator) {
        chunkCount++;

        // Debug: log each chunk type and structure
        if (chunkCount <= 10) {
          console.log(`[GatewayEngine] Chunk #${chunkCount}: type=${chunk.type}`);
          if (chunk.type === 'assistant') {
            console.log(`[GatewayEngine] Assistant chunk content:`, JSON.stringify(chunk).substring(0, 200));
          }
        }

        if (chunk.type === 'assistant') {
          // Accumulate text from assistant messages
          // Note: chunk structure is { type: 'assistant', message: { content: [...] } }
          const messageContent = (chunk as any).message?.content;
          if (messageContent && Array.isArray(messageContent)) {
            for (const block of messageContent) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
              }
            }
          }
        }

        // Track usage
        if (chunk.type === 'result') {
          usage = (chunk as any).usage;
          console.log(`[GatewayEngine] Result chunk received, usage:`, usage);
        }

        // Count tool calls
        if (chunk.type === 'assistant' && chunk.content) {
          for (const block of chunk.content as any[]) {
            if (block.type === 'tool_use') {
              toolCalls++;
            }
          }
        }
      }

      const duration_ms = Date.now() - startTime;

      console.log(
        `[GatewayEngine] Command completed: ${fullText.length} chars, ` +
        `${duration_ms}ms, ${toolCalls} tool calls, ${chunkCount} chunks`
      );

      // If no text was generated, provide a fallback
      if (fullText.length === 0) {
        console.log(`[GatewayEngine] Warning: No text generated, using fallback`);
        fullText = '抱歉，我无法生成回复。请稍后重试。';
      }

      return {
        text: fullText,
        sessionId,
        duration_ms,
        usage,
        toolCalls,
      };
    } catch (error) {
      console.error(`[GatewayEngine] Command execution error:`, error);
      throw error;
    }
  }

  /**
   * Clear a session
   */
  clearSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      console.log(`[GatewayEngine] Clearing session: ${sessionId}`);
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    console.log(`[GatewayEngine] Clearing all sessions (${this.sessions.size})`);
    this.sessions.clear();
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}