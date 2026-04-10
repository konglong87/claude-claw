/**
 * Reply History
 */

export type ReplyHistoryEntry = {
  messageId: string
  timestamp: number
  content: string
}

export type ReplyHistory = {
  add: (entry: ReplyHistoryEntry) => void
  get: (messageId: string) => ReplyHistoryEntry | undefined
  list: () => ReplyHistoryEntry[]
}

export function createReplyHistory(): ReplyHistory {
  const history: Map<string, ReplyHistoryEntry> = new Map()

  return {
    add: (entry) => { history.set(entry.messageId, entry) },
    get: (messageId) => history.get(messageId),
    list: () => Array.from(history.values())
  }
}