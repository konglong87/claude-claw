/**
 * 飞书消息格式化工具
 *
 * 参考 OpenClaw 官方源码实现，支持优化的消息显示格式：
 * - 富文本消息解析（粗体、斜体、链接、代码块等）
 * - 富文本消息发送（Markdown渲染）
 * - 交互式卡片消息（更好的代码块和表格显示）
 */

import { feishuLog, feishuError } from './log.js'

// ============================================================================
// 富文本消息解析（参考 OpenClaw post.ts）
// ============================================================================

const FALLBACK_POST_TEXT = '[富文本消息]'
const MARKDOWN_SPECIAL_CHARS = /([\\`*_{}\[\]()#+\-!|>~])/g

type PostParseResult = {
  textContent: string
  imageKeys: string[]
  mediaKeys: Array<{ fileKey: string; fileName?: string }>
  mentionedOpenIds: string[]
}

type PostPayload = {
  title: string
  content: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function escapeMarkdownText(text: string): string {
  return text.replace(MARKDOWN_SPECIAL_CHARS, '\\$1')
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

function isStyleEnabled(style: Record<string, unknown> | undefined, key: string): boolean {
  if (!style) return false
  return toBoolean(style[key])
}

function wrapInlineCode(text: string): string {
  const maxRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(maxRun + 1)
  const needsPadding = text.startsWith('`') || text.endsWith('`')
  const body = needsPadding ? ` ${text} ` : text
  return `${fence}${body}${fence}`
}

function sanitizeFenceLanguage(language: string): string {
  return language.trim().replace(/[^A-Za-z0-9_+#.-]/g, '')
}

function renderTextElement(element: Record<string, unknown>): string {
  const text = toStringOrEmpty(element.text)
  const style = isRecord(element.style) ? element.style : undefined

  if (isStyleEnabled(style, 'code')) {
    return wrapInlineCode(text)
  }

  let rendered = escapeMarkdownText(text)
  if (!rendered) return ''

  if (isStyleEnabled(style, 'bold')) {
    rendered = `**${rendered}**`
  }
  if (isStyleEnabled(style, 'italic')) {
    rendered = `*${rendered}*`
  }
  if (isStyleEnabled(style, 'underline')) {
    rendered = `<u>${rendered}</u>`
  }
  if (
    isStyleEnabled(style, 'strikethrough') ||
    isStyleEnabled(style, 'line_through') ||
    isStyleEnabled(style, 'lineThrough')
  ) {
    rendered = `~~${rendered}~~`
  }
  return rendered
}

function renderLinkElement(element: Record<string, unknown>): string {
  const href = toStringOrEmpty(element.href).trim()
  const rawText = toStringOrEmpty(element.text)
  const text = rawText || href
  if (!text) return ''
  if (!href) return escapeMarkdownText(text)
  return `[${escapeMarkdownText(text)}](${href})`
}

function renderMentionElement(element: Record<string, unknown>): string {
  const mention =
    toStringOrEmpty(element.user_name) ||
    toStringOrEmpty(element.user_id) ||
    toStringOrEmpty(element.open_id)
  if (!mention) return ''
  return `@${escapeMarkdownText(mention)}`
}

function renderEmotionElement(element: Record<string, unknown>): string {
  const text =
    toStringOrEmpty(element.emoji) ||
    toStringOrEmpty(element.text) ||
    toStringOrEmpty(element.emoji_type)
  return escapeMarkdownText(text)
}

function renderCodeBlockElement(element: Record<string, unknown>): string {
  const language = sanitizeFenceLanguage(
    toStringOrEmpty(element.language) || toStringOrEmpty(element.lang)
  )
  const code = (toStringOrEmpty(element.text) || toStringOrEmpty(element.content)).replace(
    /\r\n/g,
    '\n'
  )
  const trailingNewline = code.endsWith('\n') ? '' : '\n'
  return `\`\`\`${language}\n${code}${trailingNewline}\`\`\``
}

function renderElement(
  element: unknown,
  imageKeys: string[],
  mediaKeys: Array<{ fileKey: string; fileName?: string }>,
  mentionedOpenIds: string[]
): string {
  if (!isRecord(element)) {
    return escapeMarkdownText(toStringOrEmpty(element))
  }

  const tag = toStringOrEmpty(element.tag).toLowerCase()
  switch (tag) {
    case 'text':
      return renderTextElement(element)
    case 'a':
      return renderLinkElement(element)
    case 'at': {
      const mentioned = toStringOrEmpty(element.open_id) || toStringOrEmpty(element.user_id)
      if (mentioned) mentionedOpenIds.push(mentioned)
      return renderMentionElement(element)
    }
    case 'img': {
      const imageKey = toStringOrEmpty(element.image_key)
      if (imageKey) imageKeys.push(imageKey)
      return '![image]'
    }
    case 'media': {
      const fileKey = toStringOrEmpty(element.file_key)
      if (fileKey) {
        const fileName = toStringOrEmpty(element.file_name) || undefined
        mediaKeys.push({ fileKey, fileName })
      }
      return '[media]'
    }
    case 'emotion':
      return renderEmotionElement(element)
    case 'br':
      return '\n'
    case 'hr':
      return '\n\n---\n\n'
    case 'code': {
      const code = toStringOrEmpty(element.text) || toStringOrEmpty(element.content)
      return code ? wrapInlineCode(code) : ''
    }
    case 'code_block':
    case 'pre':
      return renderCodeBlockElement(element)
    default:
      return escapeMarkdownText(toStringOrEmpty(element.text))
  }
}

function toPostPayload(candidate: unknown): PostPayload | null {
  if (!isRecord(candidate) || !Array.isArray(candidate.content)) {
    return null
  }
  return {
    title: toStringOrEmpty(candidate.title),
    content: candidate.content,
  }
}

function resolveLocalePayload(candidate: unknown): PostPayload | null {
  const direct = toPostPayload(candidate)
  if (direct) return direct
  if (!isRecord(candidate)) return null

  for (const value of Object.values(candidate)) {
    const localePayload = toPostPayload(value)
    if (localePayload) return localePayload
  }
  return null
}

function resolvePostPayload(parsed: unknown): PostPayload | null {
  const direct = toPostPayload(parsed)
  if (direct) return direct

  if (!isRecord(parsed)) return null

  const wrappedPost = resolveLocalePayload(parsed.post)
  if (wrappedPost) return wrappedPost

  return resolveLocalePayload(parsed)
}

/**
 * 解析飞书富文本消息内容（post类型）
 *
 * 参考: OpenClaw post.ts parsePostContent
 *
 * @param content - 飞书富文本消息JSON字符串
 * @returns 解析结果，包含文本内容、图片key、媒体key、提及的用户ID
 */
export function parsePostContent(content: string): PostParseResult {
  try {
    const parsed = JSON.parse(content)
    const payload = resolvePostPayload(parsed)
    if (!payload) {
      return {
        textContent: FALLBACK_POST_TEXT,
        imageKeys: [],
        mediaKeys: [],
        mentionedOpenIds: [],
      }
    }

    const imageKeys: string[] = []
    const mediaKeys: Array<{ fileKey: string; fileName?: string }> = []
    const mentionedOpenIds: string[] = []
    const paragraphs: string[] = []

    for (const paragraph of payload.content) {
      if (!Array.isArray(paragraph)) continue
      let renderedParagraph = ''
      for (const element of paragraph) {
        renderedParagraph += renderElement(element, imageKeys, mediaKeys, mentionedOpenIds)
      }
      paragraphs.push(renderedParagraph)
    }

    const title = escapeMarkdownText(payload.title.trim())
    const body = paragraphs.join('\n').trim()
    const textContent = [title, body].filter(Boolean).join('\n\n').trim()

    return {
      textContent: textContent || FALLBACK_POST_TEXT,
      imageKeys,
      mediaKeys,
      mentionedOpenIds,
    }
  } catch {
    return {
      textContent: FALLBACK_POST_TEXT,
      imageKeys: [],
      mediaKeys: [],
      mentionedOpenIds: [],
    }
  }
}

// ============================================================================
// 富文本消息构建（参考 OpenClaw send.ts）
// ============================================================================

/**
 * 构建飞书富文本消息 payload（post类型）
 *
 * 参考: OpenClaw send.ts buildFeishuPostMessagePayload
 *
 * @param messageText - Markdown格式的消息文本
 * @returns 飞书消息API所需的 content 和 msg_type
 */
export function buildFeishuPostMessagePayload(params: { messageText: string }): {
  content: string
  msgType: string
} {
  const { messageText } = params
  return {
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            {
              tag: 'md',
              text: messageText,
            },
          ],
        ],
      },
    }),
    msgType: 'post',
  }
}

// ============================================================================
// 交互式卡片消息构建（参考 OpenClaw send.ts）
// ============================================================================

const FEISHU_CARD_TEMPLATES = new Set([
  'blue',
  'green',
  'red',
  'orange',
  'purple',
  'indigo',
  'wathet',
  'turquoise',
  'yellow',
  'grey',
  'carmine',
  'violet',
  'lime',
])

export type CardHeaderConfig = {
  /** 标题文本，例如 "💻 Claude Code" */
  title: string
  /** 飞书卡片颜色模板（blue, green, red, orange, purple, grey等）。默认 "blue" */
  template?: string
}

function resolveFeishuCardTemplate(template?: string): string | undefined {
  const normalized = template?.trim().toLowerCase()
  if (!normalized || !FEISHU_CARD_TEMPLATES.has(normalized)) {
    return undefined
  }
  return normalized
}

/**
 * 构建飞书交互式卡片（Markdown渲染）
 *
 * 参考: OpenClaw send.ts buildMarkdownCard
 * 卡片能正确渲染 Markdown（代码块、表格、链接等）
 * 使用 schema 2.0 格式
 *
 * @param text - Markdown格式的消息内容
 * @returns 卡片JSON对象
 */
export function buildMarkdownCard(text: string): Record<string, unknown> {
  return {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          content: text,
        },
      ],
    },
  }
}

/**
 * 构建带标题和脚注的飞书交互式卡片
 *
 * 参考: OpenClaw send.ts buildStructuredCard
 *
 * @param text - Markdown格式的消息内容
 * @param options - 可选配置（标题、脚注）
 * @returns 卡片JSON对象
 */
export function buildStructuredCard(
  text: string,
  options?: {
    header?: CardHeaderConfig
    note?: string
  }
): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [{ tag: 'markdown', content: text }]

  if (options?.note) {
    elements.push({ tag: 'hr' })
    elements.push({ tag: 'markdown', content: `<font color='grey'>${options.note}</font>` })
  }

  const card: Record<string, unknown> = {
    schema: '2.0',
    config: { wide_screen_mode: true },
    body: { elements },
  }

  if (options?.header) {
    card.header = {
      title: { tag: 'plain_text', content: options.header.title },
      template: resolveFeishuCardTemplate(options.header.template) ?? 'blue',
    }
  }

  return card
}

// ============================================================================
// 消息类型检测与格式选择
// ============================================================================

/**
 * 分析消息内容，决定使用哪种发送格式
 */
export type MessageFormatType = 'text' | 'post' | 'card'

export function determineMessageFormat(text: string): MessageFormatType {
  // 检测是否包含 Markdown 特殊元素
  const hasCodeBlock = text.includes('```')
  const hasTable = text.includes('|') && text.includes('\n|')
  const hasComplexFormatting =
    text.includes('**') ||
    text.includes('*') ||
    text.includes('~~') ||
    text.includes('`') ||
    text.includes('[') &&
    text.includes('](')

  // 包含代码块或表格时使用卡片（最佳渲染效果）
  if (hasCodeBlock || hasTable) {
    return 'card'
  }

  // 包含其他复杂格式时使用富文本
  if (hasComplexFormatting) {
    return 'post'
  }

  // 简单文本保持原样
  return 'text'
}

/**
 * 根据消息内容自动选择最佳格式构建飞书消息 payload
 *
 * @param text - 消息文本（可以是Markdown）
 * @returns 飞书消息API所需的 content 和 msg_type
 */
export function buildOptimizedMessagePayload(text: string): {
  content: string
  msgType: string
} {
  const formatType = determineMessageFormat(text)

  switch (formatType) {
    case 'card':
      // 使用交互式卡片（最佳 Markdown 渲染）
      feishuLog('[飞书] 使用卡片格式发送消息')
      return {
        content: JSON.stringify(buildMarkdownCard(text)),
        msgType: 'interactive',
      }

    case 'post':
      // 使用富文本消息（支持基本 Markdown）
      feishuLog('[飞书] 使用富文本格式发送消息')
      return buildFeishuPostMessagePayload({ messageText: text })

    case 'text':
      // 保持简单文本格式（备用方案）
      feishuLog('[飞书] 使用纯文本格式发送消息')
      return {
        content: JSON.stringify({ text }),
        msgType: 'text',
      }
  }
}

// ============================================================================
// 消息内容解析（统一处理不同消息类型）
// ============================================================================

/**
 * 解析飞书消息内容（统一处理 text、post、interactive 等类型）
 *
 * 参考: OpenClaw send.ts parseFeishuMessageContent
 *
 * @param rawContent - 飞书消息原始 content 字段
 * @param msgType - 消息类型（text、post、interactive等）
 * @returns 解析后的文本内容
 */
export function parseFeishuMessageContent(rawContent: string, msgType: string): string {
  if (!rawContent) return ''

  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch {
    return rawContent
  }

  if (msgType === 'text') {
    const text = (parsed as { text?: unknown })?.text
    return typeof text === 'string' ? text : '[文本消息]'
  }

  if (msgType === 'post') {
    return parsePostContent(rawContent).textContent
  }

  if (msgType === 'interactive') {
    return parseInteractiveCardContent(parsed)
  }

  if (typeof parsed === 'string') {
    return parsed
  }

  // 尝试提取通用字段
  const genericText = (parsed as { text?: unknown; title?: unknown } | null)?.text
  if (typeof genericText === 'string' && genericText.trim()) {
    return genericText
  }

  const genericTitle = (parsed as { title?: unknown } | null)?.title
  if (typeof genericTitle === 'string' && genericTitle.trim()) {
    return genericTitle
  }

  return `[${msgType || 'unknown'}消息]`
}

/**
 * 解析交互式卡片消息内容
 *
 * 参考: OpenClaw send.ts parseInteractiveCardContent
 */
function parseInteractiveCardContent(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') {
    return '[交互式卡片]'
  }

  // 支持 schema 1.0 (顶层 elements) 和 2.0 (body.elements)
  const candidate = parsed as { elements?: unknown; body?: { elements?: unknown } }
  const elements = Array.isArray(candidate.elements)
    ? candidate.elements
    : Array.isArray(candidate.body?.elements)
      ? candidate.body!.elements
      : null

  if (!elements) {
    return '[交互式卡片]'
  }

  const texts: string[] = []
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue

    const item = element as {
      tag?: string
      content?: string
      text?: { content?: string }
    }

    if (item.tag === 'div' && typeof item.text?.content === 'string') {
      texts.push(item.text.content)
      continue
    }

    if (item.tag === 'markdown' && typeof item.content === 'string') {
      texts.push(item.content)
    }
  }

  return texts.join('\n').trim() || '[交互式卡片]'
}