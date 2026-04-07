import { describe, it, expect } from 'bun:test';
import { MessageType, GatewayRequest, GatewayResponse, GatewayEvent } from './protocol';

describe('Gateway Protocol Types', () => {
  it('should define MessageType enum', () => {
    expect(MessageType.REQ).toBe('req');
    expect(MessageType.RES).toBe('res');
    expect(MessageType.EVENT).toBe('event');
  });

  it('should create valid GatewayRequest', () => {
    const request: GatewayRequest = {
      type: 'req',
      id: 'test-123',
      method: 'connect',
      params: { test: true }
    };
    expect(request.type).toBe('req');
    expect(request.id).toBe('test-123');
    expect(request.method).toBe('connect');
  });

  it('should create valid GatewayResponse', () => {
    const response: GatewayResponse = {
      type: 'res',
      id: 'test-123',
      ok: true,
      payload: { protocol: 3 }
    };
    expect(response.ok).toBe(true);
    expect(response.payload.protocol).toBe(3);
  });

  it('should create valid GatewayEvent', () => {
    const event: GatewayEvent = {
      type: 'event',
      event: 'tick',
      payload: { timestamp: Date.now() }
    };
    expect(event.type).toBe('event');
    expect(event.event).toBe('tick');
  });
});