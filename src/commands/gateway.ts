/**
 * Gateway CLI Command
 *
 * Provides a user-facing interface to start the Gateway server from the command line.
 *
 * Usage:
 *   bun run dev gateway           - Start Gateway with default config
 *   bun run dev gateway --port 9000 - Start on custom port
 *   bun run dev gateway --channels feishu,dingtalk - Start with specific channels
 */

import { Command } from '@commander-js/extra-typings';
import { GatewayContainer } from '../bot.js';
import { loadConfig } from '../gateway/config.js';

export interface GatewayOptions {
  port?: number;
  channels?: string;
}

/**
 * Start the Gateway server with configuration from config.yaml
 *
 * @param options - Command line options
 */
export async function gatewayCommand(options: GatewayOptions): Promise<void> {
  // Load config from file
  const config = await loadConfig('config.yaml');

  // Override port if specified
  if (options.port) {
    config.gateway.port = options.port;
  }

  // Override channels if specified
  if (options.channels) {
    config.channels.enabled = options.channels.split(',').map(c => c.trim());
  }

  // Create and start Gateway container
  const gateway = new GatewayContainer(config.gateway);

  // Handle shutdown signals for graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    await gateway.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start Gateway
  await gateway.start();

  console.log(`Gateway started on port ${config.gateway.port}`);
  console.log(`Active channels: ${gateway.activeChannels.join(', ') || 'none'}`);
  console.log('\nPress Ctrl+C to stop the Gateway');

  // Keep the process running
  await new Promise<void>((resolve) => {
    // This promise never resolves until process is terminated
    // Shutdown is handled by signal handlers above
  });
}

/**
 * Register the gateway command with the Commander program
 *
 * @param program - The Commander program instance
 */
export function registerGatewayCommand(program: Command): void {
  program
    .command('gateway')
    .description('Start Gateway server with multiple channels')
    .option('-p, --port <port>', 'Gateway port', (value) => parseInt(value, 10))
    .option('-c, --channels <channels>', 'Comma-separated list of channels to start')
    .action(gatewayCommand);
}