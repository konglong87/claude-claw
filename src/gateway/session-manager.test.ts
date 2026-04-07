import { describe, it, expect, beforeEach } from 'bun:test';
import { GatewaySessionManager, LogicalSession } from './session-manager';

describe('GatewaySessionManager', () => {
  let manager: GatewaySessionManager;

  beforeEach(() => {
    manager = new GatewaySessionManager();
  });

  it('should create logical session', () => {
    const session: LogicalSession = manager.getOrCreateSession('user-123', 'chat-456');
    expect(session.userId).toBe('user-123');
    expect(session.chatId).toBe('chat-456');
    expect(session.id).toBe('user-123:chat-456');
  });

  it('should return existing session for same user+chat', () => {
    const session1 = manager.getOrCreateSession('user-123', 'chat-456');
    const session2 = manager.getOrCreateSession('user-123', 'chat-456');
    expect(session1.id).toBe(session2.id);
  });

  it('should create different sessions for different user+chat', () => {
    const session1 = manager.getOrCreateSession('user-123', 'chat-456');
    const session2 = manager.getOrCreateSession('user-789', 'chat-456');
    expect(session1.id).not.toBe(session2.id);
  });

  it('should update session state', () => {
    const session = manager.getOrCreateSession('user-123', 'chat-456');
    manager.updateSessionState(session.id, 'active');
    expect(session.state).toBe('active');
  });
});