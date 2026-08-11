import registryJson from "../data/registry.json";

export interface OfficialSkill {
  id: string;
  name: string;
  title: string;
  tagline: string;
  /** Human-written blurb; `description` is the agent trigger string. */
  summary?: string;
  description: string;
  category: string;
  commitSha?: string | null;
  bytes?: number;
  refsBytes?: number;
  repo: string;
  branch: string;
  dir: string;
  license: string;
  version: string | null;
  compatibility: string | null;
  multiFile: boolean;
  files: string[];
  hostedFiles?: string[];
  logo?: string | null;
  words: number;
  githubUrl: string;
  skillFileUrl: string;
  rawUrl: string;
  hostedPath: string;
  stars: number | null;
  pushedAt: string | null;
}

export interface EcosystemSkill {
  name: string;
  description: string;
  category: string | null;
  url: string;
  multiFile: boolean;
  /** URL-safe id — set by refresh; pages/hosting exist only when present. */
  slug?: string;
  /** Path of the skill dir inside the upstream repo ("" = repo root). */
  dir?: string;
  /** SKILL.md mirrored on this domain (licensed repos only). */
  hosted?: boolean;
  hostedPath?: string;
  /** Companion .md files also mirrored (full-host repos only). */
  hostedFiles?: string[];
  /** Every file in the skill dir upstream (dirs end with /). */
  files?: string[];
  words?: number;
  bytes?: number;
}

export interface EcosystemRepo {
  id: string;
  repo: string;
  displayName: string;
  vendor: string;
  type: "aggregator" | "toolkit" | "vendor" | "community";
  homepage: string | null;
  categories: string[];
  blurb: string;
  url: string;
  stars: number | null;
  pushedAt: string | null;
  commitSha?: string | null;
  license: string | null;
  description: string | null;
  skillCount: number;
  highlightsOnly: boolean;
  /** Self-hosted GitHub org avatar, e.g. /logos/sendaifun.png. */
  logo?: string | null;
  skills: EcosystemSkill[];
}

export interface FoundationResource {
  name: string;
  repo: string;
  url: string;
  description: string;
  kind: string;
}

export interface CommunityEntry {
  name: string;
  repo: string;
  description: string;
  logo?: string | null;
}

export interface Registry {
  updated: string;
  official: OfficialSkill[];
  ecosystem: EcosystemRepo[];
  foundationResources: FoundationResource[];
  communityIndex: CommunityEntry[];
}

export const registry = registryJson as unknown as Registry;
export const SITE_URL = "https://skills.solana.com";

export const CATEGORY_LABELS: Record<string, string> = {
  development: "Development",
  migration: "Migration",
  defi: "DeFi & Trading",
  "nft-tokens": "NFTs & Tokens",
  "infra-data": "Infra & Data",
  "wallets-mobile": "Wallets & Mobile",
  security: "Security",
  gaming: "Gaming",
  research: "Ideas & Launch",
};

/** Skills actually browsable on this site (not upstream marketing totals). */
export const totalSkills = () =>
  registry.official.length +
  registry.ecosystem.reduce((n, r) => n + r.skills.length, 0);

export function installCommands(skill: OfficialSkill) {
  const hosted = `${SITE_URL}${skill.hostedPath}`;
  const dirPart = skill.dir ? `/${skill.dir}` : "";
  return {
    cli: `npx skills add ${skill.repo}`,
    claudeGlobal: `mkdir -p ~/.claude/skills/${skill.name} && curl -fsSL ${hosted} -o ~/.claude/skills/${skill.name}/SKILL.md`,
    claudeProject: `mkdir -p .claude/skills/${skill.name} && curl -fsSL ${hosted} -o .claude/skills/${skill.name}/SKILL.md`,
    git: `npx degit ${skill.repo}${dirPart} .claude/skills/${skill.name}`,
    noInstall: `Read ${hosted} and apply it to this task: `,
    hosted,
  };
}

export function repoInstallCommand(repo: EcosystemRepo): string {
  return `npx skills add ${repo.repo}`;
}

/** Convert a pinned github tree/blob URL into a raw SKILL.md URL agents can fetch. */
export function rawSkillUrl(treeUrl: string): string {
  const raw = treeUrl
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace(/\/(tree|blob)\//, "/");
  return treeUrl.includes("/blob/") ? raw : `${raw}/SKILL.md`;
}

/** On-site detail page for an indexed ecosystem skill (slug set by refresh). */
export function ecoSkillPage(
  repo: EcosystemRepo,
  skill: EcosystemSkill,
): string | null {
  return skill.slug ? `/skills/${repo.id}/${skill.slug}` : null;
}

export function ecoInstallCommands(repo: EcosystemRepo, skill: EcosystemSkill) {
  const hosted = skill.hostedPath ? `${SITE_URL}${skill.hostedPath}` : null;
  const rawGithub = rawSkillUrl(skill.url);
  const fetchable = hosted ?? rawGithub;
  const dirPart = skill.dir ? `/${skill.dir}` : "";
  return {
    cli: `npx skills add ${repo.repo}`,
    oneShot: `npx skills use ${repo.repo}@${skill.name}`,
    claudeGlobal: `mkdir -p ~/.claude/skills/${skill.name} && curl -fsSL ${fetchable} -o ~/.claude/skills/${skill.name}/SKILL.md`,
    claudeProject: `mkdir -p .claude/skills/${skill.name} && curl -fsSL ${fetchable} -o .claude/skills/${skill.name}/SKILL.md`,
    git: `npx degit ${repo.repo}${dirPart} .claude/skills/${skill.name}`,
    hosted,
    rawGithub,
    fetchable,
  };
}
