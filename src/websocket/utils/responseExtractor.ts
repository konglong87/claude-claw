/**
 * 响应提取工具
 *
 * 从QueryEngine的消息流中提取文本结果
 */

import type { AssistantMessage } from '../../types/message.js'
import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.generated.js'
import { EMPTY_USAGE } from '../../services/api/emptyUsage.js'
import type { NonNullableUsage } from '../../entrypoints/sdk/sdkUtilityTypes.js'

/**
 * 从Assistant消息中提取文本内容
 */
export function extractAssistantText(msg: AssistantMessage): string {
  if (!msg.message?.content) return ''

  const content = Array.isArray(msg.message.content)
    ? msg.message.content
    : [msg.message.content]

  const textBlocks = content.filter(
    (block: any) => block.type === 'text'
  )

  return textBlocks
    .map((block: any) => block.text || '')
    .join('\n')
}

/**
 * 从SDK消息流中提取最终结果
 *
 * 遍历整个消息流，收集完整响应文本和元数据
 */
export async function collectQueryResult(
  generator: AsyncGenerator<SDKMessage>
): Promise<{
  text: string
  sessionId: string
  usage: NonNullableUsage
  duration_ms: number
}> {
  let fullText = ''
  let sessionId = ''
  let usage = EMPTY_USAGE
  let duration_ms = 0

  try {
    for await (const msg of generator) {
      // 收集assistant消息的文本
      if (msg.type === 'assistant') {
        fullText += extractAssistantText(msg as AssistantMessage)
      }

      // 从result消息提取元数据
      if (msg.type === 'result') {
        const resultMsg = msg as any
        sessionId = resultMsg.session_id || ''
        usage = resultMsg.usage || EMPTY_USAGE
        duration_ms = resultMsg.duration_ms || 0
      }
    }
  } catch (error) {
    console.error('[ResponseExtractor] Error collecting query result:', error)
    throw error
  }

  return {
    text: fullText,
    sessionId,
    usage,
    duration_ms
  }
}