import { describe, it, expect, beforeEach } from 'bun:test';
import { ChannelPluginManager } from './plugin-manager';
import { ChannelPlugin, ChannelStatus, MessageContext, MessageResponse } from './types';

class MockPlugin implements ChannelPlugin {
  id: string;
  name: string;
  enabled: boolean = true;
  adapter: any;
  private started: boolean = false;

  constructor(id: string) {
    this.id = id;
    this.name = `Mock ${id}`;
    this.adapter = {} as any;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async restart(): Promise<void> {
    this.started = true;
  }

  async handleMessage(context: MessageContext): Promise<MessageResponse> {
    return { type: 'text', content: 'test' };
  }

  getStatus(): ChannelStatus {
    return {
      connected: this.started,
      lastActivity: Date.now()
    };
  }
}

describe('ChannelPluginManager', () => {
  let manager: ChannelPluginManager;

  beforeEach(() => {
    manager = new ChannelPluginManager();
  });

  it('should register plugin', () => {
    const plugin = new MockPlugin('test');
    manager.registerPlugin(plugin);
    expect(manager.getPlugin('test')).toBe(plugin);
  });

  it('should start plugin', async () => {
    const plugin = new MockPlugin('test');
    manager.registerPlugin(plugin);
    await manager.startPlugin('test');
    expect(plugin.getStatus().connected).toBe(true);
  });

  it('should stop plugin', async () => {
    const plugin = new MockPlugin('test');
    manager.registerPlugin(plugin);
    await manager.startPlugin('test');
    await manager.stopPlugin('test');
    expect(plugin.getStatus().connected).toBe(false);
  });

  it('should get active channels', async () => {
    const plugin1 = new MockPlugin('channel1');
    const plugin2 = new MockPlugin('channel2');
    manager.registerPlugin(plugin1);
    manager.registerPlugin(plugin2);
    await manager.startPlugin('channel1');
    expect(manager.getActiveChannels()).toEqual(['channel1']);
  });
});