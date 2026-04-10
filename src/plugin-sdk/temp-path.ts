/**
 * Temporary Path Utilities
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function getTempPath(...segments: string[]): string {
  return join(tmpdir(), 'openclaw', ...segments)
}

export function createTempFile(prefix: string = 'openclaw'): string {
  const timestamp = Date.now()
  return getTempPath(`${prefix}-${timestamp}.tmp`)
}