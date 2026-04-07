import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ClawhubApiClient, SkillMetadata } from './api-client';
import { LockfileManager, InstalledSkill } from './lockfile';
import { MetadataManager } from './metadata';

export class SkillInstaller {
  private apiClient: ClawhubApiClient;
  private lockfile: LockfileManager;
  private metadataManager: MetadataManager;
  private skillsDir: string;

  constructor(
    apiClient: ClawhubApiClient,
    skillsDir: string = 'skills',
    lockfilePath: string = '.clawhub/lock.json'
  ) {
    this.apiClient = apiClient;
    this.skillsDir = skillsDir;
    this.lockfile = new LockfileManager(skillsDir, lockfilePath);
    this.metadataManager = new MetadataManager();
  }

  async installSkill(slug: string, version?: string): Promise<void> {
    console.log(`Installing skill: ${slug}`);

    // 1. Get metadata
    const metadata = await this.apiClient.getSkillMetadata(slug);
    const targetVersion = version || metadata.latestVersion;

    // 2. Check dependencies
    if (metadata.dependencies && metadata.dependencies.length > 0) {
      const missing = await this.checkDependencies(metadata.dependencies);
      if (missing.length > 0) {
        console.log(`Warning: Missing dependencies: ${missing.join(', ')}`);
        console.log(`Please install them first: bun run dev skills install <slug>`);
      }
    }

    // 3. Download bundle
    console.log(`Downloading ${slug}@${targetVersion}...`);
    const bundle = await this.apiClient.downloadSkillBundle(slug, targetVersion);

    // 4. Extract to skills directory
    const skillPath = join(this.skillsDir, slug);
    await this.extractBundle(bundle.buffer, skillPath);

    // 5. Save metadata
    await this.metadataManager.saveMetadata(skillPath, metadata);

    // 6. Record in lockfile
    const installedSkill: InstalledSkill = {
      slug,
      version: targetVersion,
      installedAt: Date.now(),
      source: 'clawhub',
      path: skillPath
    };
    await this.lockfile.recordInstall(installedSkill);

    console.log(`✓ Skill ${slug}@${targetVersion} installed successfully`);
    console.log(`  Path: ${skillPath}`);
    console.log(`  Restart your session to load the new skill`);
  }

  async updateSkill(slug: string): Promise<void> {
    console.log(`Updating skill: ${slug}`);

    // 1. Get local metadata
    const localSkill = await this.lockfile.getInstalledSkill(slug);
    if (!localSkill) {
      console.log(`Skill ${slug} is not installed`);
      return;
    }

    // 2. Get remote metadata
    const remoteMetadata = await this.apiClient.getSkillMetadata(slug);

    // 3. Check version
    if (remoteMetadata.latestVersion === localSkill.version) {
      console.log(`Skill ${slug} is already up to date (${localSkill.version})`);
      return;
    }

    // 4. Backup (simple version - just note the old version)
    console.log(`Updating from ${localSkill.version} to ${remoteMetadata.latestVersion}...`);

    // 5. Install new version
    await this.installSkill(slug, remoteMetadata.latestVersion);

    console.log(`✓ Skill ${slug} updated successfully`);
  }

  async updateAllSkills(): Promise<void> {
    const installed = await this.lockfile.getInstalledSkills();

    if (installed.length === 0) {
      console.log('No skills installed');
      return;
    }

    console.log(`Updating ${installed.length} skill(s)...`);

    for (const skill of installed) {
      await this.updateSkill(skill.slug);
    }

    console.log('✓ All skills updated');
  }

  async listInstalled(): Promise<InstalledSkill[]> {
    return await this.lockfile.getInstalledSkills();
  }

  private async checkDependencies(dependencies: string[]): Promise<string[]> {
    const installed = await this.lockfile.getInstalledSkills();
    const installedSlugs = installed.map(s => s.slug);

    return dependencies.filter(dep => !installedSlugs.includes(dep));
  }

  private async extractBundle(buffer: ArrayBuffer, targetPath: string): Promise<void> {
    // Create target directory
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }

    // Write zip to temp file
    const tempZip = join(tmpdir(), `skill-${Date.now()}.zip`);
    writeFileSync(tempZip, Buffer.from(buffer));

    // Extract using unzip command
    try {
      execSync(`unzip -q "${tempZip}" -d "${targetPath}"`, { stdio: 'inherit' });
    } catch (error) {
      console.error('Failed to extract skill bundle:', error);
      throw error;
    } finally {
      // Cleanup temp file
      try {
        execSync(`rm "${tempZip}"`);
      } catch {}
    }
  }
}