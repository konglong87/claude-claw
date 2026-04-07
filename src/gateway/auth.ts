import { ConnectRequest } from './protocol';

export interface GatewayAuthConfig {
  token?: string;
  password?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

export class GatewayAuth {
  constructor(private config: GatewayAuthConfig) {}

  authenticate(connectRequest: ConnectRequest, bindMode: string = 'loopback'): AuthResult {
    // Token authentication
    if (this.config.token) {
      if (connectRequest.auth.token !== this.config.token) {
        return { success: false, error: 'AUTH_TOKEN_MISMATCH' };
      }
      return { success: true };
    }

    // Password authentication
    if (this.config.password) {
      if (connectRequest.auth.password !== this.config.password) {
        return { success: false, error: 'AUTH_PASSWORD_MISMATCH' };
      }
      return { success: true };
    }

    // No authentication configured (only allow loopback bind)
    if (!this.config.token && !this.config.password) {
      if (bindMode !== 'loopback') {
        return { success: false, error: 'AUTH_REQUIRED_FOR_NON_LOOPBACK' };
      }
    }

    return { success: true };
  }
}