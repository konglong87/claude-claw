import { describe, it, expect } from 'bun:test';
import { ClawhubApiClient } from './api-client';

describe('ClawhubApiClient', () => {
  it('should construct with default base URL', () => {
    const client = new ClawhubApiClient();
    expect(client['baseUrl']).toBe('https://clawhub.ai');
  });

  it('should construct with custom base URL', () => {
    const client = new ClawhubApiClient('https://custom.api');
    expect(client['baseUrl']).toBe('https://custom.api');
  });

  // Note: Actual API calls would be mocked in real tests
});