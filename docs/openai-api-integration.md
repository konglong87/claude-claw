# OpenAI API Integration

## Overview

This project implements an OpenAI-compatible Chat Completions API endpoint that allows OpenClaw Gateway (and other OpenAI SDK clients) to use our AI service.

## Architecture

```
Feishu/DingTalk/WeChat Message
  ↓
OpenClaw Gateway (Message routing, session management)
  ↓
Our Service (localhost:8765/v1/chat/completions)
  ├─ Parse OpenAI request format
  ├─ Create temporary LogicalSession
  ├─ Call QueryEngine with tools
  └─ Return OpenAI-formatted response (streaming or non-streaming)
  ↓
Kimi K2.5 (AI inference via moonshot API)
```

## API Endpoint

**URL:** `POST http://localhost:8765/v1/chat/completions`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer <api-key>` (optional, check config.websocket.api_key)

**Request Format:** OpenAI Chat Completions API format

**Request Body:**
```json
{
  "model": "moonshotai/kimi-k2.5",
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "stream": false,
  "tools": [] // optional
}
```

**Supported Features:**
- Multi-turn conversations (messages array)
- Streaming responses (SSE format)
- Image input (base64 data URLs, placeholder handling)
- Tool/function calling (uses default tools for MVP)

**Response Format:**

**Non-streaming:**
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1776049041,
  "model": "moonshotai/kimi-k2.5",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "AI response text"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

**Streaming (SSE):**
```
data: {"id":"chatcmpl-...","choices":[{"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-...","choices":[{"finish_reason":"stop"}]}

data: [DONE]
```

## Testing

### Simple Text Request (Non-streaming)

```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/kimi-k2.5",
    "messages": [{"role": "user", "content": "你好，请介绍自己"}],
    "stream": false
  }'
```

### Streaming Request

```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/kimi-k2.5",
    "messages": [{"role": "user", "content": "写一首关于春天的诗"}],
    "stream": true
  }'
```

### Error Testing

```bash
# Missing messages field (expect 400)
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{}'

# Empty messages array (expect 400)
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": []}'

# Invalid last message role (expect 400)
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "assistant", "content": "test"}]}'
```

## Configuration

### OpenClaw Gateway Configuration

Edit `~/.openclaw/openclaw.json`:

**Add custom provider:**
```json
{
  "models": {
    "providers": {
      "custom": {
        "baseUrl": "http://localhost:8765",
        "apiKey": "",
        "api": "openai-completions",
        "models": [{
          "id": "moonshotai/kimi-k2.5",
          "name": "Kimi K2.5",
          "api": "openai-completions",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 262144,
          "maxTokens": 65535,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "custom/moonshotai/kimi-k2.5"
      }
    }
  }
}
```

### Our Service Configuration

Edit `config.yaml` (for Kimi K2.5 API credentials):

```yaml
claude:
  model: moonshotai/kimi-k2.5
  api_key: <your-kimi-api-key>
  api_base: https://api.moonshot.cn/v1
```

## Implementation Details

**File Structure:**
- `src/gateway/server.ts` - Gateway server with OpenAI endpoint implementation
- HTTP route handler in `handleHttpRequest` method
- Helper methods:
  - `handleOpenAIRequest` - Main request handler
  - `streamOpenAIResponse` - SSE streaming implementation
  - `extractUserContent` - Message content extraction
  - `formatOpenAIResponse` - Response formatting
  - `sendOpenAIError` - Error response helper

**Key Design Decisions:**
1. **Session Management**: Each OpenAI request creates a temporary LogicalSession with unique ID (`chatcmpl-...`). Session is deleted after response.
2. **Tool Conversion**: MVP uses default tools from QueryEngineSetup. Future: convert OpenAI tool definitions.
3. **Image Handling**: Placeholder text for images (future: pass to QueryEngine when vision supported).
4. **QueryEngine Integration**: Reuses existing QueryEngine and session management infrastructure.

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check API key in `config.yaml` and `Authorization` header
2. **500 Internal Error**: Check QueryEngine logs, verify Kimi API is accessible
3. **SSE format errors**: Verify streaming chunks follow OpenAI spec (`data: {JSON}\n\n`)
4. **Empty response**: Check server logs for QueryEngine errors

### Debug Logs

- **Our service**: Check console output for `[Gateway]`, `[OpenAI API]` logs
- **OpenClaw Gateway**: Check `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
- **QueryEngine**: Check console for message processing logs

### Health Check

```bash
# Check server is running
curl http://localhost:8765/health

# Check OpenAI endpoint
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"test"}],"stream":false}'
```

## Future Enhancements

1. **Tool Definition Conversion**: Convert OpenAI tool schemas to QueryEngine format
2. **Vision Support**: Pass image data to QueryEngine when supported
3. **Rate Limiting**: Implement request throttling per API key
4. **Multi-turn Context**: Support conversation history beyond single message
5. **Streaming Tool Calls**: Implement proper SSE format for tool call streaming

## References

- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Streaming Guide](https://platform.openai.com/docs/api-reference/streaming)
- [QueryEngine Documentation](../src/queryEngine/README.md)