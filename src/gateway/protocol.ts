export enum MessageType {
  REQ = 'req',
  RES = 'res',
  EVENT = 'event'
}

export interface GatewayRequest {
  type: 'req';
  id: string;
  method: string;
  params: any;
}

export interface GatewayResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: any;
  error?: GatewayError;
}

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload: any;
  seq?: number;
  stateVersion?: number;
}

export interface GatewayError {
  code: string;
  message: string;
  details?: any;
}

export interface ClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: 'operator' | 'node';
}

export interface ConnectRequest {
  minProtocol: number;
  maxProtocol: number;
  client: ClientInfo;
  role: 'operator' | 'node';
  scopes: string[];
  auth: { token?: string; password?: string };
  locale: string;
  userAgent: string;
}

export interface ConnectResponse {
  protocol: number;
  policy: GatewayPolicy;
  auth?: {
    deviceToken?: string;
    role: string;
    scopes: string[];
  };
}

export interface GatewayPolicy {
  tickIntervalMs: number;
  maxMessageSize?: number;
  heartbeatTimeout?: number;
}

export const PROTOCOL_VERSION = 3;