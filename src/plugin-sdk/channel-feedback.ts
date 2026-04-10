/**
 * Channel Feedback
 */

export type ChannelFeedback = {
  type: 'typing' | 'thinking' | 'error' | 'success'
  message?: string
}

export function sendFeedback(feedback: ChannelFeedback): void {
  console.log(`[ChannelFeedback] ${feedback.type}: ${feedback.message || ''}`)
}