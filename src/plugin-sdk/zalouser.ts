/**
 * Zalo User Utilities
 */

export type ZaloUser = {
  userId: string
  displayName?: string
  avatarUrl?: string
}

export function parseZaloUser(data: any): ZaloUser {
  return {
    userId: data.userId || data.id || '',
    displayName: data.displayName || data.name,
    avatarUrl: data.avatarUrl || data.avatar
  }
}