export interface SkillSearchResult {
  slug: string;
  name: string;
  summary: string;
  tags: string[];
  version: string;
  downloads: number;
}

export interface SkillMetadata {
  slug: string;
  name: string;
  version: string;
  summary: string;
  description?: string;
  tags: string[];
  changelog?: string;
  dependencies?: string[];
  latestVersion: string;
}

export interface SkillVersion {
  version: string;
  changelog?: string;
  releasedAt: number;
}

export interface SkillBundle {
  buffer: ArrayBuffer;
  metadata: SkillMetadata;
}

export interface SearchOptions {
  limit?: number;
}

export class ClawhubApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string = 'https://clawhub.ai') {
    this.baseUrl = baseUrl;
    this.token = this.resolveAuthToken();
  }

  /**
   * Resolve Clawhub authentication token from environment or config
   * Following OpenClaw official implementation
   */
  private resolveAuthToken(): string | undefined {
    // Priority 1: Environment variables
    const envToken =
      process.env.OPENCLAW_CLAWHUB_TOKEN?.trim() ||
      process.env.CLAWHUB_TOKEN?.trim() ||
      process.env.CLAWHUB_AUTH_TOKEN?.trim();

    if (envToken) {
      return envToken;
    }

    // Priority 2: Config file (not implemented yet, can be added later)
    // ~/.config/clawhub/config.json or ~/Library/Application Support/clawhub/config.json

    return undefined;
  }

  /**
   * Build headers with auth token if available
   */
  private buildHeaders(baseHeaders: Record<string, string> = {}): Record<string, string> {
    const headers = { ...baseHeaders };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async searchSkills(query: string, options: SearchOptions = {}): Promise<SkillSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(options.limit || 20)
    });
    const response = await fetch(`${this.baseUrl}/api/v1/search?${params}`, {
      method: 'GET',
      headers: this.buildHeaders({ 'Content-Type': 'application/json' }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.results) {
      return data.results.map((r: any) => ({
        slug: r.slug,
        name: r.displayName || r.name,
        summary: r.summary || r.description || '',
        tags: r.tags || [],
        version: r.version || '1.0.0',
        downloads: r.downloads || 0
      }));
    }
    return [];
  }

  async getSkillMetadata(slug: string): Promise<SkillMetadata> {
    const response = await fetch(`${this.baseUrl}/api/v1/skills/${slug}`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get skill metadata: ${response.statusText}`);
    }

    const data = await response.json();
    // Transform API response to our format
    const skill = data.skill;
    const latest = data.latestVersion;
    return {
      slug: skill.slug,
      name: skill.displayName || skill.slug,
      version: latest?.version || '1.0.0',
      summary: skill.summary || '',
      tags: Object.keys(skill.tags || {}),
      changelog: latest?.changelog,
      latestVersion: latest?.version || '1.0.0'
    };
  }

  async downloadSkillBundle(slug: string, version: string): Promise<SkillBundle> {
    const params = new URLSearchParams({
      slug,
      version: version || 'latest'
    });
    const url = `${this.baseUrl}/api/v1/download?${params}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to download skill: ${response.statusText}`);
    }

    const metadata = await this.getSkillMetadata(slug);
    const buffer = await response.arrayBuffer();

    return { buffer, metadata };
  }

  async getSkillVersions(slug: string): Promise<SkillVersion[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/skills/${slug}/versions`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get versions: ${response.statusText}`);
    }

    return response.json();
  }
}