import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export interface InstalledSkill {
  slug: string
  version: string
  installedAt: number
  source: string
  path: string
}

export interface Lockfile {
  version: string
  installed: InstalledSkill[]
}

export class LockfileManager {
  private lockfilePath: string

  constructor(
    _skillsDir: string = 'skills',
    lockfilePath: string = '.clawhub/lock.json',
  ) {
    // _skillsDir kept for future use - when lockfile needs to support relative paths
    this.lockfilePath = lockfilePath
  }

  async load(): Promise<Lockfile> {
    if (!existsSync(this.lockfilePath)) {
      return { version: '1.0', installed: [] }
    }

    const content = readFileSync(this.lockfilePath, 'utf-8')
    return JSON.parse(content)
  }

  async save(lockfile: Lockfile): Promise<void> {
    const dir = dirname(this.lockfilePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(this.lockfilePath, JSON.stringify(lockfile, null, 2))
  }

  async recordInstall(skill: InstalledSkill): Promise<void> {
    const lockfile = await this.load()

    // Remove existing entry if present
    lockfile.installed = lockfile.installed.filter(s => s.slug !== skill.slug)

    // Add new entry
    lockfile.installed.push(skill)

    await this.save(lockfile)
  }

  async removeInstall(slug: string): Promise<void> {
    const lockfile = await this.load()
    lockfile.installed = lockfile.installed.filter(s => s.slug !== slug)
    await this.save(lockfile)
  }

  async getInstalledSkills(): Promise<InstalledSkill[]> {
    const lockfile = await this.load()
    return lockfile.installed
  }

  async getInstalledSkill(slug: string): Promise<InstalledSkill | undefined> {
    const lockfile = await this.load()
    return lockfile.installed.find(s => s.slug === slug)
  }
}
