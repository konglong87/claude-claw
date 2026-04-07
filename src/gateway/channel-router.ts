import { ChannelPluginManager } from '../channels/plugin-manager';
import { GatewaySessionManager } from './session-manager';
import { UnifiedMessage, MessageContext } from '../channels/types';

/**
 * Channel Message Router
 *
 * The central routing hub that connects channel plugins to the Gateway.
 * Receives UnifiedMessages from plugins, manages sessions, and routes
 * responses back to the correct channel.
 *
 * Message flow:
 * 1. Plugin receives message from platform (Feishu/DingTalk/WeChat)
 * 2. Plugin normalizes to UnifiedMessage via adapter
 * 3. Plugin calls setMessageCallback (registered by ChannelRouter)
 * 4. ChannelRouter.routeMessage() receives UnifiedMessage
 * 5. Router gets/creates session via SessionManager
 * 6. Router builds MessageContext
 * 7. Router calls plugin.handleMessage() for AI processing
 * 8. Plugin returns MessageResponse
 * 9. Router formats response via adapter
 * 10. Router sends response through plugin
 *
 * Integration points:
 * - ChannelPluginManager (Task 10) - router gets plugins and registers callbacks
 * - GatewaySessionManager (Task 4) - router manages sessions
 * - ChannelPlugin (Tasks 11-13) - router calls handleMessage and uses adapter
 * - UnifiedMessage/MessageContext (Task 6) - router uses these types
 */
export class ChannelRouter {
  constructor(
    private pluginManager: ChannelPluginManager,
    private sessionManager: GatewaySessionManager
  ) {}

  /**
   * Route an incoming unified message through the Gateway
   *
   * This is the main entry point for processing incoming messages
   * from any channel plugin. It handles session management, message
   * processing, and response routing.
   */
  async routeMessage(unifiedMessage: UnifiedMessage): Promise<void> {
    try {
      // 1. Get or create session
      const session = this.sessionManager.getOrCreateSession(
        unifiedMessage.userId,
        unifiedMessage.chatId
      );

      // 2. Build message context
      const context: MessageContext = {
        message: unifiedMessage,
        session,
        userId: unifiedMessage.userId,
        chatId: unifiedMessage.chatId
      };

      // 3. Find source plugin
      const sourcePlugin = this.pluginManager.getPlugin(unifiedMessage.platform);
      if (!sourcePlugin) {
        console.error(`[ChannelRouter] No plugin found for platform: ${unifiedMessage.platform}`);
        return;
      }

      // 4. Handle message (plugin processes and responds)
      // Note: This is a simplified implementation. The actual AI processing
      // (QueryEngine integration) will be added in future enhancements.
      const response = await sourcePlugin.handleMessage(context);

      // 5. Format response through adapter
      const formattedResponse = sourcePlugin.adapter.formatResponse(response);

      // 6. Send response (implementation depends on plugin's send mechanism)
      console.log(`[ChannelRouter] Response sent to ${unifiedMessage.platform}`);

    } catch (error) {
      console.error('[ChannelRouter] Error routing message:', error);
    }
  }

  /**
   * Register message handlers with all active plugins
   *
   * This should be called during Gateway startup to connect
   * each plugin's message callback to the router's routeMessage method.
   */
  registerMessageHandlers(): void {
    for (const plugin of this.pluginManager.getAllPlugins()) {
      if ('setMessageCallback' in plugin) {
        (plugin as any).setMessageCallback((message: UnifiedMessage) => {
          this.routeMessage(message);
        });
      }
    }
    console.log('[ChannelRouter] Message handlers registered for all plugins');
  }
}