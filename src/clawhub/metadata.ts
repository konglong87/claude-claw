import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SkillMetadata } from './api-client';

export class MetadataManager {
  async saveMetadata(skillPath: string, metadata: SkillMetadata): Promise<void> {
    const metadataDir = join(skillPath, '.clawhub');
    if (!existsSync(metadataDir)) {
      mkdirSync(metadataDir, { recursive: true });
    }

    const metadataPath = join(metadataDir, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Also save install info
    const installInfo = {
      installedAt: Date.now(),
      source: 'clawhub'
    };
    const installPath = join(metadataDir, 'install.json');
    writeFileSync(installPath, JSON.stringify(installInfo, null, 2));
  }

  async loadMetadata(skillPath: string): Promise<SkillMetadata | null> {
    const metadataPath = join(skillPath, '.clawhub', 'metadata.json');

    if (!existsSync(metadataPath)) {
      return null;
    }

    const content = readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content);
  }
}