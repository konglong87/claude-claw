import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { basename } from 'path'
import { getRoleplayFilePath, loadRoleplayFile, writeRoleplayFile, getCurrentRoleplayFilePath } from '../roleplay.js'
import { setCurrentUserId } from '../../bootstrap/state.js'
import { getFsImplementation } from '../fsOperations.js'

// Mock the settings module
vi.mock('../settings/settings.js', () => ({
  isRoleplayEnabled: vi.fn()
}))

import { isRoleplayEnabled } from '../settings/settings.js'

const mockIsRoleplayEnabled = isRoleplayEnabled as ReturnType<typeof vi.fn>

describe('getRoleplayFilePath', () => {
  test('returns correct path for feishu user', () => {
    const path = getRoleplayFilePath('ou_test123', 'feishu')
    expect(path).toMatch(/\.claude\/roleplay\/feishu_ou_test123\.md$/)
  })

  test('sanitizes illegal characters in userId', () => {
    const path = getRoleplayFilePath('user/with:special*chars', 'feishu')
    const filename = basename(path)
    expect(filename).toBe('feishu_user_with_special_chars.md')
    // Verify that the sanitized characters are not in the filename
    expect(filename).not.toMatch(/[:*]/)
  })

  test('handles all special characters', () => {
    const path = getRoleplayFilePath('user\\with?all"illegal<chars>|test', 'dingtalk')
    const filename = basename(path)
    // Each special character is replaced with _
    expect(filename).toBe('dingtalk_user_with_all_illegal_chars__test.md')
    // Verify no special characters remain in filename
    expect(filename).not.toMatch(/[\\?"<>|]/)
  })
})

describe('loadRoleplayFile', () => {
  const testUserId = 'ou_test123'
  const testChannel = 'feishu'

  beforeEach(async () => {
    // Set current user context and mock enabled
    setCurrentUserId(testUserId, testChannel)
    mockIsRoleplayEnabled.mockReturnValue(true)
  })

  afterEach(async () => {
    setCurrentUserId(null, null)
    vi.clearAllMocks()
  })

  test('returns null when file does not exist', async () => {
    const content = await loadRoleplayFile('nonexistent_user', 'feishu')
    expect(content).toBeNull()
  })

  test('returns content when file exists', async () => {
    const testContent = '# Test Role\n\nYou are a test assistant.'
    await writeRoleplayFile(testContent, testUserId, testChannel)

    const content = await loadRoleplayFile(testUserId, testChannel)
    expect(content).toBe(testContent)
  })

  test('returns null when userId is null', async () => {
    setCurrentUserId(null, null)
    const content = await loadRoleplayFile()
    expect(content).toBeNull()
  })

  test('trims whitespace from content', async () => {
    const testContent = '  Test content with spaces  \n\n'
    await writeRoleplayFile(testContent, testUserId, testChannel)

    const content = await loadRoleplayFile(testUserId, testChannel)
    expect(content).toBe('Test content with spaces')
  })
})

describe('getCurrentRoleplayFilePath', () => {
  beforeEach(() => {
    mockIsRoleplayEnabled.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns null when userId is null', () => {
    setCurrentUserId(null, null)
    const path = getCurrentRoleplayFilePath()
    expect(path).toBeNull()
  })

  test('returns path when user context is set', () => {
    setCurrentUserId('ou_test', 'feishu')
    const path = getCurrentRoleplayFilePath()
    expect(path).toMatch(/\.claude\/roleplay\/feishu_ou_test\.md$/)
  })
})

describe('Feature Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('loadRoleplayFile returns null when disabled', async () => {
    // Mock feature disabled
    mockIsRoleplayEnabled.mockReturnValue(false)

    setCurrentUserId('test_user', 'feishu')
    const content = await loadRoleplayFile('test_user', 'feishu')

    expect(content).toBeNull()
    expect(isRoleplayEnabled).toHaveBeenCalled()
  })

  test('writeRoleplayFile does not write when disabled', async () => {
    // Mock feature disabled
    mockIsRoleplayEnabled.mockReturnValue(false)

    setCurrentUserId('test_user', 'feishu')

    // Should not throw, just return early
    await writeRoleplayFile('test content', 'test_user', 'feishu')

    expect(isRoleplayEnabled).toHaveBeenCalled()

    // Verify file was not created
    const filePath = getRoleplayFilePath('test_user', 'feishu')
    const fs = getFsImplementation()
    await expect(fs.readFile(filePath, { encoding: 'utf-8' })).rejects.toThrow()
  })

  test('getCurrentRoleplayFilePath returns null when disabled', () => {
    mockIsRoleplayEnabled.mockReturnValue(false)

    setCurrentUserId('test_user', 'feishu')
    const path = getCurrentRoleplayFilePath()

    expect(path).toBeNull()
    expect(isRoleplayEnabled).toHaveBeenCalled()
  })
})