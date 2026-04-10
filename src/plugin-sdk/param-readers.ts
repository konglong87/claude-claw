/**
 * Parameter Readers
 */

export function readStringParam(params: any, key: string, defaultValue?: string): string {
  return params[key] ?? defaultValue ?? ''
}

export function readNumberParam(params: any, key: string, defaultValue?: number): number {
  return params[key] ?? defaultValue ?? 0
}

export function readBooleanParam(params: any, key: string, defaultValue?: boolean): boolean {
  return params[key] ?? defaultValue ?? false
}

export function readArrayParam(params: any, key: string, defaultValue?: any[]): any[] {
  return params[key] ?? defaultValue ?? []
}