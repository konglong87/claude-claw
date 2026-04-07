/**
 * Skills CLI Command
 *
 * Provides a user-facing interface to manage Clawhub skills from the command line.
 *
 * Usage:
 *   bun run dev skills search "calendar"     - Search for skills
 *   bun run dev skills install calendar-skill - Install a skill
 *   bun run dev skills install calendar-skill --version 1.2.0 - Install specific version
 *   bun run dev skills update calendar-skill - Update specific skill
 *   bun run dev skills update               - Update all installed skills
 *   bun run dev skills list                  - List installed skills
 */

import { Command } from '@commander-js/extra-typings';
import Table from 'cli-table';
import { ClawhubApiClient, SkillInstaller } from '../clawhub/index.js';
import { loadConfig } from '../gateway/config.js';

export interface SkillsOptions {
  limit?: number;
  version?: string;
  registry?: string;
}

/**
 * Main handler for the skills command
 */
export async function skillsCommand(
  action: string,
  args: string[],
  options: SkillsOptions
): Promise<void> {
  try {
    const config = await loadConfig('config.yaml');

    const apiClient = new ClawhubApiClient(
      options.registry || config.clawhub.registry_url
    );

    const installer = new SkillInstaller(
      apiClient,
      config.clawhub.skills_dir,
      config.clawhub.lockfile
    );

    switch (action) {
      case 'search':
        if (!args[0]) {
          console.error('Error: Search query is required');
          console.log('Usage: skills search <query>');
          process.exit(1);
        }
        await searchSkills(apiClient, args[0], options);
        break;
      case 'install':
        if (!args[0]) {
          console.error('Error: Skill slug is required');
          console.log('Usage: skills install <slug> [--version <version>]');
          process.exit(1);
        }
        await installer.installSkill(args[0], options.version);
        break;
      case 'update':
        if (args[0]) {
          await installer.updateSkill(args[0]);
        } else {
          await installer.updateAllSkills();
        }
        break;
      case 'list':
        await listInstalledSkills(installer);
        break;
      default:
        console.log('Unknown action. Available: search, install, update, list');
        console.log('\nUsage:');
        console.log('  skills search <query>              Search for skills');
        console.log('  skills install <slug>              Install a skill');
        console.log('  skills install <slug> -v <version> Install specific version');
        console.log('  skills update [slug]                Update skill(s)');
        console.log('  skills list                         List installed skills');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Search for skills in Clawhub registry
 */
async function searchSkills(
  client: ClawhubApiClient,
  query: string,
  options: SkillsOptions
): Promise<void> {
  console.log(`Searching for: "${query}"...\n`);

  const results = await client.searchSkills(query, { limit: options.limit || 20 });

  if (results.length === 0) {
    console.log('No skills found');
    return;
  }

  const table = new Table({
    head: ['Slug', 'Name', 'Version', 'Downloads'],
    colWidths: [25, 35, 12, 12]
  });

  for (const skill of results) {
    table.push([
      skill.slug,
      skill.name.substring(0, 33),
      skill.version,
      skill.downloads.toString()
    ]);
  }

  console.log(table.toString());
  console.log(`\nFound ${results.length} skill(s)`);
}

/**
 * List installed skills
 */
async function listInstalledSkills(installer: SkillInstaller): Promise<void> {
  const installed = await installer.listInstalled();

  if (installed.length === 0) {
    console.log('No skills installed');
    return;
  }

  const table = new Table({
    head: ['Slug', 'Version', 'Installed At'],
    colWidths: [30, 15, 25]
  });

  for (const skill of installed) {
    const date = new Date(skill.installedAt).toISOString().split('T')[0];
    table.push([skill.slug, skill.version, date]);
  }

  console.log(table.toString());
  console.log(`\n${installed.length} skill(s) installed`);
}

/**
 * Register the skills command with the Commander program
 *
 * @param program - The Commander program instance
 */
export function registerSkillsCommand(program: Command): void {
  program
    .command('skills <action> [args...]')
    .description('Manage skills from Clawhub (search, install, update, list)')
    .option('-l, --limit <number>', 'Search limit', (value) => parseInt(value, 10))
    .option('-v, --version <version>', 'Skill version to install')
    .option('-r, --registry <url>', 'Clawhub registry URL')
    .action(skillsCommand);
}