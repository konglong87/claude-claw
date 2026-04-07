export type SessionState = 'connected' | 'active' | 'disconnected' | 'error';

export interface LogicalSession {
  id: string;
  userId: string;
  chatId: string;
  state: SessionState;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
}

export class GatewaySessionManager {
  private sessions: Map<string, LogicalSession> = new Map();

  getOrCreateSession(userId: string, chatId: string): LogicalSession {
    const sessionId = `${userId}:${chatId}`;

    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      return session;
    }

    const session: LogicalSession = {
      id: sessionId,
      userId,
      chatId,
      state: 'connected',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  updateSessionState(sessionId: string, state: SessionState): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
      session.lastActivity = Date.now();
    }
  }

  recordMessage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      session.lastActivity = Date.now();
    }
  }

  cleanupDisconnectedSessions(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.state === 'disconnected' && (now - session.lastActivity) > maxAge) {
        this.sessions.delete(id);
      }
    }
  }

  getSession(sessionId: string): LogicalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): LogicalSession[] {
    return Array.from(this.sessions.values());
  }
}