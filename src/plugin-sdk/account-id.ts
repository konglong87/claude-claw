/**
 * Account ID utilities
 */

export const DEFAULT_ACCOUNT_ID = 'default'

export function normalizeAccountId(id: string | undefined): string {
  if (!id) return DEFAULT_ACCOUNT_ID
  return id.trim() || DEFAULT_ACCOUNT_ID
}