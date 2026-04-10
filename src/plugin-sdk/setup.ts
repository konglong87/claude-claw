/**
 * Setup Utilities
 */

export type SetupConfig = {
  requiredFields: string[]
  optionalFields?: string[]
}

export function validateSetup(config: Record<string, any>, setup: SetupConfig): boolean {
  return setup.requiredFields.every(field => config[field] != null)
}