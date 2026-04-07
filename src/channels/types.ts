/**
 * Channel Plugin Types
 *
 * Defines the plugin architecture for multi-channel support in Gateway.
 * Allows Gateway to support multiple platforms (Feishu/DingTalk/WeChat)
 * through a unified abstraction.
 */

// ============================================================================
// Core Plugin Interfaces
// ============================================================================

/**
 * Main channel plugin interface
 * Each platform (Feishu/DingTalk/WeChat) implements this interface
 */
export interface ChannelPlugin {
  /** Unique identifier for the plugin */
  id: string;
  /** Display name */
  name: string;
  /** Whether the plugin is enabled */
  enabled: boolean;

  /** Start the plugin (initialize connections, WebSocket, etc.) */
  start(): Promise<void>;
  /** Stop the plugin (cleanup connections, etc.) */
  stop(): Promise<void>;
  /** Restart the plugin (stop then start) */
  restart(): Promise<void>;

  /** Handle incoming message from the platform */
  handleMessage(context: MessageContext): Promise<MessageResponse>;

  /** Get current channel status */
  getStatus(): ChannelStatus;

  /** Platform-specific adapter */
  adapter: PlatformAdapter;
}

// ============================================================================
// Adapter Interfaces
// ============================================================================

/**
 * Platform adapter for message transformation
 * Transforms platform-specific messages to/from unified format
 */
export interface PlatformAdapter {
  /**
   * Transform platform-specific raw message to unified format
   */
  normalizeMessage(rawMessage: any): UnifiedMessage;

  /**
   * Transform unified response to platform-specific format
   */
  formatResponse(response: MessageResponse): any;

  /**
   * Optional: Detect platform from incoming request headers
   */
  detectPlatform?(headers: any): string | null;

  /**
   * Optional: Verify authentication credentials
   */
  verifyAuth?(credentials: any): boolean;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Unified message format across all platforms
 */
export interface UnifiedMessage {
  /** Platform identifier (e.g., 'feishu', 'dingtalk', 'wechat') */
  platform: string;
  /** Message type */
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  /** Message content (text or URL for media) */
  content: string;
  /** User ID from the platform */
  userId: string;
  /** Chat/room ID */
  chatId: string;
  /** Message timestamp (Unix epoch ms) */
  timestamp: number;
  /** Additional platform-specific metadata */
  metadata?: Record<string, any>;
}

/**
 * Context for message processing
 * Contains the message plus session and AI response information
 */
export interface MessageContext {
  /** The unified message */
  message: UnifiedMessage;
  /** Session from session-manager */
  session: any;
  /** User ID for routing */
  userId: string;
  /** Chat ID for routing */
  chatId: string;
  /** Optional: AI response text (for rich message types) */
  aiResponse?: string;
}

/**
 * Standard response format for channel plugins
 */
export interface MessageResponse {
  /** Response type */
  type: 'text' | 'card' | 'image' | 'file';
  /** Response content */
  content: string;
  /** Additional response metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// Status & Configuration Types
// ============================================================================

/**
 * Channel status information
 */
export interface ChannelStatus {
  /** Whether connected to the platform */
  connected: boolean;
  /** Last activity timestamp (Unix epoch ms) */
  lastActivity: number;
  /** Error message if disconnected */
  error?: string;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  /** Whether the channel is enabled */
  enabled: boolean;
  /** Additional configuration key-value pairs */
  [key: string]: any;
}