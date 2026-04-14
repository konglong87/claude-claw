import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { GatewayServer } from './server';
import { GatewayConfig } from './config';

/**
 * Tests for OpenAI Chat Completions API endpoint (/v1/chat/completions)
 * Note: These tests focus on request validation and error handling.
 * Full integration tests with QueryEngine execution require proper setup
 * and should be run separately with API credentials.
 */
describe('GatewayServer OpenAI API', () => {
  let server: GatewayServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Use minimal heartbeat interval for faster tests
    const config: GatewayConfig = {
      port: 18765, // Use different port to avoid conflicts
      bind: 'loopback',
      auth: { token: 'test-token' },
      reload: { mode: 'off' },
      heartbeat: { interval: 60000 } // Longer interval for test stability
    };

    server = new GatewayServer(config);
    await server.start(config.port);
    baseUrl = `http://127.0.0.1:${config.port}`;

    // Wait a bit for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 100));
  }, 10000); // Set timeout to 10s

  afterAll(async () => {
    await server.stop();
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Health check endpoint', () => {
    it('should return ok status', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Request validation', () => {
    it('should reject request without messages field', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('messages array is required');
      expect(data.error.type).toBe('invalid_request_error');
      expect(data.error.code).toBe('missing_messages');
    });

    it('should reject request with empty messages array', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('messages array must not be empty');
      expect(data.error.code).toBe('empty_messages');
    });

    it('should reject request with non-user last message', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'assistant', content: 'test' }]
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('Last message must have role \'user\'');
      expect(data.error.code).toBe('invalid_last_message_role');
    });

    it('should reject request with invalid content format', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: { invalid: 'format' } }]
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('invalid_user_content');
    });

    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`${baseUrl}/v1/unknown`);
      expect(response.status).toBe(404);
    });

    it('should return error in OpenAI format structure', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();

      // Verify OpenAI error response format
      expect(data.error).toBeDefined();
      expect(data.error.message).toBeDefined();
      expect(data.error.type).toBeDefined();
      expect(data.error.code).toBeDefined();
    });
  });

  describe('SSE streaming headers', () => {
    it('should set correct headers for streaming request', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{ role: 'user', content: 'test' }],
          stream: true
        })
      });

      // Should return SSE headers (even if QueryEngine fails)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Content extraction', () => {
    it('should accept simple text content', async () => {
      // This test validates that simple text passes validation
      // It will fail later due to missing API credentials, but that's expected
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          stream: false
        })
      });

      // Should not be 400 (validation passed), will be 500 (API auth error)
      expect(response.status).not.toBe(400);
    });

    it('should accept multi-content array with text', async () => {
      // Test that array of content blocks passes validation
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,test' } }
              ]
            }
          ],
          stream: false
        })
      });

      // Should not be 400 (validation passed)
      expect(response.status).not.toBe(400);
    });

    it('should reject empty text content', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '' }]
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('invalid_user_content');
    });

    it('should reject empty array content', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: [] }]
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('invalid_user_content');
    });
  });

  describe('CORS handling', () => {
    it('should handle OPTIONS preflight request', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'OPTIONS'
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('should include CORS headers in all responses', async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
      });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});