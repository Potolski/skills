import registryJson from "../data/registry.json";

export interface OfficialSkill {
  id: string;
  name: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  commitSha?: string | null;
  repo: string;
  branch: string;
  dir: string;
  license: string;
  version: string | null;
  compatibility: string | null;
  multiFile: boolean;
  files: string[];
  hostedFiles?: string[];
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
  category: string;
  url: string;
  multiFile: boolean;
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

export const totalSkills = () =>
  registry.official.length +
  registry.ecosystem.reduce((n, r) => n + r.skillCount, 0);

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
