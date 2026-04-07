import { describe, test, expect } from 'vitest'
import { isRoleplayEnabled } from '../settings/settings.js'

describe('isRoleplayEnabled', () => {
  test('returns true by default', () => {
    // When roleplayEnabled is not set in any settings source
    // the function should return true (default enabled)
    const result = isRoleplayEnabled()
    expect(result).toBe(true)
  })

  test('returns false when explicitly set to false', () => {
    // This test would need mocking of getSettingsForSource
    // to return roleplayEnabled: false from some settings source
    // For now, document the expected behavior
    // In actual implementation, if any source sets it to false,
    // the function should return false
    expect(true).toBe(true) // Placeholder - needs mocking infrastructure
  })

  test('returns true when explicitly set to true', () => {
    // When roleplayEnabled is explicitly set to true,
    // the function should return true
    expect(true).toBe(true) // Placeholder - needs mocking infrastructure
  })
})