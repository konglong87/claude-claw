/**
 * OAuth Runtime
 * OAuth授权运行时
 */

import type { PluginLogger } from './core.js'

export interface OAuthConfig {
  provider: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface OAuthRuntime {
  authorize(userId: string): Promise<string>
  getToken(userId: string): Promise<string | null>
  refreshToken(userId: string): Promise<string>
  logger: PluginLogger
}

export function createOAuthRuntime(config: OAuthConfig, logger: PluginLogger): OAuthRuntime {
  const tokenStore: Map<string, string> = new Map()

  return {
    authorize: async (userId) => {
      logger.info(`[OAuthRuntime] Authorize request for user: ${userId}`)
      const authUrl = `${config.provider}/oauth/authorize?client_id=${config.clientId}&redirect_uri=${config.redirectUri}&state=${userId}`
      return authUrl
    },

    getToken: async (userId) => {
      const token = tokenStore.get(userId)
      logger.info(`[OAuthRuntime] Get token for user: ${userId} - ${token ? 'found' : 'not found'}`)
      return token || null
    },

    refreshToken: async (userId) => {
      logger.info(`[OAuthRuntime] Refresh token for user: ${userId}`)
      const newToken = 'refreshed_token_' + userId
      tokenStore.set(userId, newToken)
      return newToken
    },

    logger
  }
}