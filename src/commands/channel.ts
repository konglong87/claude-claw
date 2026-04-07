/**
 * Channel CLI Command
 *
 * Provides a command to start a single channel independently.
 * Useful for testing, debugging, or running a single channel to save resources.
 *
 * Usage:
 *   bun run dev channel feishu    - Start Feishu channel independently
 *   bun run dev channel dingtalk  - Start DingTalk channel independently
 *   bun run dev channel wechat    - Start WeChat channel independently
 */

import type { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../gateway/config';
import type { FeishuConfig, DingTalkConfig, WeChatConfig } from '../gateway/config';
import { FeishuChannelPlugin } from '../channels/feishu/plugin';
import { DingTalkChannelPlugin } from '../channels/dingtalk/plugin';
import { WeChatChannelPlugin } from '../channels/wechat/plugin';
import type { ChannelPlugin } from '../channels/types';

const VALID_CHANNELS = ['feishu', 'dingtalk', 'wechat'];

/**
 * Start a single channel independently without the full Gateway
 *
 * @param channelId - The channel identifier (feishu, dingtalk, or wechat)
 */
export async function channelCommand(channelId: string): Promise<void> {
  // Validate channel
  if (!VALID_CHANNELS.includes(channelId)) {
    console.error(`Unknown channel: ${channelId}`);
    console.log(`Available channels: ${VALID_CHANNELS.join(', ')}`);
    process.exit(1);
  }

  // Load configuration
  const config = await loadConfig('config.yaml');

  // Get channel config based on channel type
  let plugin: ChannelPlugin | null = null;

  switch (channelId) {
    case 'feishu': {
      const feishuConfig = config.channels.feishu;
      if (!feishuConfig?.enabled) {
        console.error('[Channel] Feishu channel is not enabled in config.yaml');
        process.exit(1);
      }
      plugin = new FeishuChannelPlugin(feishuConfig);
      break;
    }
    case 'dingtalk': {
      const dingtalkConfig = config.channels.dingtalk;
      if (!dingtalkConfig?.enabled) {
        console.error('[Channel] DingTalk channel is not enabled in config.yaml');
        process.exit(1);
      }
      plugin = new DingTalkChannelPlugin(dingtalkConfig);
      break;
    }
    case 'wechat': {
      const wechatConfig = config.channels.wechat;
      if (!wechatConfig?.enabled) {
        console.error('[Channel] WeChat channel is not enabled in config.yaml');
        process.exit(1);
      }
      plugin = new WeChatChannelPlugin(wechatConfig);
      break;
    }
  }

  if (!plugin) {
    console.error(`Failed to create channel plugin for: ${channelId}`);
    process.exit(1);
  }

  // Handle shutdown signals for graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    await plugin?.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start the channel plugin
  try {
    await plugin.start();
    console.log(`Channel ${channelId} started independently`);
    console.log(`\nPress Ctrl+C to stop`);

    // Keep the process running
    await new Promise<void>((resolve) => {
      // This promise never resolves until process is terminated
      // Shutdown is handled by signal handlers above
    });
  } catch (error) {
    console.error(`Failed to start channel ${channelId}:`, error);
    await plugin.stop();
    process.exit(1);
  }
}

/**
 * Register the channel command with the Commander program
 *
 * @param program - The Commander program instance
 */
export function registerChannelCommand(program: Command): void {
  program
    .command('channel <channel-id>')
    .description('Start a single channel independently (feishu, dingtalk, or wechat)')
    .action(channelCommand);
}