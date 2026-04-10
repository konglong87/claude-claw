/**
 * Agent Runtime
 * Placeholder for agent execution runtime
 */

export type AgentRuntime = {
  execute: (prompt: string, context?: any) => Promise<string>
  stream?: (prompt: string, context?: any) => Promise<void>
}

export function createAgentRuntime(): AgentRuntime {
  return {
    execute: async (prompt, context) => {
      console.log('[AgentRuntime] Placeholder execute called')
      return 'placeholder response'
    }
  }
}