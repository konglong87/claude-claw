/**
 * Channel Status Types
 */

export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export function isChannelStatus(status: string): status is ChannelStatus {
  return ['disconnected', 'connecting', 'connected', 'error'].includes(status)
}