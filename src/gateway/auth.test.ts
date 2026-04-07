import { describe, it, expect, beforeEach } from 'bun:test';
import { GatewayAuth, AuthResult } from './auth';
import { ConnectRequest } from './protocol';

describe('GatewayAuth', () => {
  let auth: GatewayAuth;

  describe('token authentication', () => {
    beforeEach(() => {
      auth = new GatewayAuth({
        token: 'test-token-123',
        password: undefined
      });
    });

    it('should authenticate with valid token', () => {
      const request: ConnectRequest = {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'test', version: '1.0', platform: 'test', mode: 'operator' },
        role: 'operator',
        scopes: ['operator.read'],
        auth: { token: 'test-token-123' },
        locale: 'en-US',
        userAgent: 'test/1.0'
      };

      const result: AuthResult = auth.authenticate(request);
      expect(result.success).toBe(true);
    });

    it('should reject with invalid token', () => {
      const request: ConnectRequest = {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'test', version: '1.0', platform: 'test', mode: 'operator' },
        role: 'operator',
        scopes: ['operator.read'],
        auth: { token: 'wrong-token' },
        locale: 'en-US',
        userAgent: 'test/1.0'
      };

      const result: AuthResult = auth.authenticate(request);
      expect(result.success).toBe(false);
      expect(result.error).toBe('AUTH_TOKEN_MISMATCH');
    });
  });

  describe('password authentication', () => {
    beforeEach(() => {
      auth = new GatewayAuth({
        token: undefined,
        password: 'test-password'
      });
    });

    it('should authenticate with valid password', () => {
      const request: ConnectRequest = {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'test', version: '1.0', platform: 'test', mode: 'operator' },
        role: 'operator',
        scopes: ['operator.read'],
        auth: { password: 'test-password' },
        locale: 'en-US',
        userAgent: 'test/1.0'
      };

      const result: AuthResult = auth.authenticate(request);
      expect(result.success).toBe(true);
    });

    it('should reject with invalid password', () => {
      const request: ConnectRequest = {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'test', version: '1.0', platform: 'test', mode: 'operator' },
        role: 'operator',
        scopes: ['operator.read'],
        auth: { password: 'wrong-password' },
        locale: 'en-US',
        userAgent: 'test/1.0'
      };

      const result: AuthResult = auth.authenticate(request);
      expect(result.success).toBe(false);
      expect(result.error).toBe('AUTH_PASSWORD_MISMATCH');
    });
  });

  describe('no authentication (loopback only)', () => {
    beforeEach(() => {
      auth = new GatewayAuth({
        token: undefined,
        password: undefined
      });
    });

    it('should allow loopback bind without auth', () => {
      const request: ConnectRequest = {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'test', version: '1.0', platform: 'test', mode: 'operator' },
        role: 'operator',
        scopes: ['operator.read'],
        auth: {},
        locale: 'en-US',
        userAgent: 'test/1.0'
      };

      const result: AuthResult = auth.authenticate(request, 'loopback');
      expect(result.success).toBe(true);
    });

    it('should reject non-loopback bind without auth', () => {
      const request: ConnectRequest = {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'test', version: '1.0', platform: 'test', mode: 'operator' },
        role: 'operator',
        scopes: ['operator.read'],
        auth: {},
        locale: 'en-US',
        userAgent: 'test/1.0'
      };

      const result: AuthResult = auth.authenticate(request, 'all');
      expect(result.success).toBe(false);
      expect(result.error).toBe('AUTH_REQUIRED_FOR_NON_LOOPBACK');
    });
  });
});