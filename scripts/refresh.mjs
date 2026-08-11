#!/usr/bin/env node
/**
 * Refresh src/data/registry.json + src/data/skills/ mirrors from GitHub.
 *
 *   node scripts/refresh.mjs          # full refresh (mirrors, trees, metadata, new skills)
 *   node scripts/refresh.mjs --meta   # metadata only (stars, pushed_at) — cheap
 *
 * Set GITHUB_TOKEN to raise API rate limits (60/h anonymous → 5000/h).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = join(ROOT, "src/data/registry.json");
const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
const metaOnly = process.argv.includes("--meta");

const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "skills-solana-com-refresh",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

/** Where each ecosystem repo keeps its canonical skills (path prefix filters). */
const SKILL_PATHS = {
  "sendaifun/skills": { include: [/^skills\//], exclude: [/example-skill/] },
  "sendaifun/solana-new": { include: [/^skills\//], exclude: [] },
  "helius-labs/core-ai": { include: [/^helius-skills\//], exclude: [] },
  "jup-ag/agent-skills": { include: [/^skills\//], exclude: [] },
  "metaplex-foundation/skill": { include: [/^skills\//], exclude: [] },
  "solana-mobile/solana-mobile-dev-skill": { include: [/^/], exclude: [] },
  "quiknode-labs/solana-anchor-claude-skill": { include: [/^skills\//], exclude: [] },
  "ColosseumOrg/colosseum-copilot": { include: [/^skills\//], exclude: [] },
  "QEDGen/solana-skills": { include: [/^/], exclude: [] },
  "frankcastleauditor/safe-solana-builder": { include: [/^/], exclude: [] },
  "solanabr/solana-game-skill": { include: [/^skill\/SKILL\.md$/], exclude: [/solana-dev-skill/] },
  // trailofbits/skills + solanabr/solana-ai-kit are hand-curated (highlights only)
};

let apiCalls = 0;
async function gh(path) {
  apiCalls++;
  const res = await fetch(`https://api.github.com${path}`, { headers: API_HEADERS });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`GitHub API rate-limited on ${path} — set GITHUB_TOKEN`);
  }
  if (!res.ok) return null;
  return res.json();
}

async function raw(repo, branch, path) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`);
  return res.ok ? res.text() : null;
}

function parseFrontmatter(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      cur = kv[1];
      fm[cur] = kv[2].replace(/^["']|["']$/g, "");
    } else if (cur && /^\s+\S/.test(line)) fm[cur] += " " + line.trim();
  }
  return fm;
}

async function repoMeta(repo) {
  const data = await gh(`/repos/${repo}`);
  if (!data) return null;
  return {
    stars: data.stargazers_count ?? null,
    pushedAt: data.pushed_at?.slice(0, 10) ?? null,
    license: data.license?.spdx_id ?? null,
    description: data.description ?? null,
    branch: data.default_branch ?? "main",
  };
}

// ---------- official: metadata + verbatim mirrors + file trees ----------
for (const skill of registry.official) {
  const meta = await repoMeta(skill.repo);
  if (!meta) {
    console.warn(`⚠ ${skill.repo}: repo metadata unavailable`);
    continue;
  }
  skill.stars = meta.stars;
  skill.pushedAt = meta.pushedAt;
  skill.branch = meta.branch;
  if (meta.license && meta.license !== "NOASSERTION") skill.license = meta.license;
  if (metaOnly) continue;

  const dirPart = skill.dir ? `${skill.dir}/` : "";
  const txt = await raw(skill.repo, skill.branch, `${dirPart}SKILL.md`);
  if (!txt) {
    console.warn(`⚠ ${skill.repo}: SKILL.md not found at ${dirPart}SKILL.md`);
    continue;
  }
  writeFileSync(join(ROOT, "src/data/skills", `${skill.id}.md`), txt);
  const fm = parseFrontmatter(txt);
  if (fm.name) skill.name = fm.name;
  if (fm.description) skill.description = fm.description;
  if (fm.compatibility) skill.compatibility = fm.compatibility;
  const version = (fm.metadata || "").match(/version:\s*([\d.]+)/)?.[1];
  if (version) skill.version = version;
  skill.words = txt.replace(/^---[\s\S]*?---\s*/, "").split(/\s+/).length;

  const tree = await gh(`/repos/${skill.repo}/git/trees/${skill.branch}?recursive=1`);
  if (tree?.tree) {
    const prefix = skill.dir ? `${skill.dir}/` : "";
    skill.files = tree.tree
      .filter(
        (n) =>
          n.path.startsWith(prefix) &&
          n.path !== `${prefix}SKILL.md` &&
          !n.path.slice(prefix.length).startsWith(".")
      )
      .map((n) => n.path.slice(prefix.length) + (n.type === "tree" ? "/" : ""))
      .filter((p) => (skill.dir ? true : !/^(README|LICENSE|\.)/i.test(p)))
      .sort();
    skill.multiFile = skill.files.some((f) => !f.endsWith("/"));
  }
  const dirUrl = skill.dir ? `/${skill.dir}` : "";
  skill.githubUrl = `https://github.com/${skill.repo}/tree/${skill.branch}${dirUrl}`;
  skill.skillFileUrl = `https://github.com/${skill.repo}/blob/${skill.branch}${dirUrl}/SKILL.md`;
  skill.rawUrl = `https://raw.githubusercontent.com/${skill.repo}/${skill.branch}${dirUrl}/SKILL.md`;
  console.log(`✓ official ${skill.id} (${skill.words} words, ${skill.files.length} files)`);
}

// ---------- ecosystem: metadata + new-skill discovery ----------
for (const eco of registry.ecosystem) {
  const meta = await repoMeta(eco.repo);
  if (!meta) {
    console.warn(`⚠ ${eco.repo}: repo metadata unavailable`);
    continue;
  }
  eco.stars = meta.stars;
  eco.pushedAt = meta.pushedAt;
  eco.license = meta.license === "NOASSERTION" ? null : meta.license;
  eco.description = meta.description;
  const filters = SKILL_PATHS[eco.repo];
  if (metaOnly || !filters) {
    console.log(`✓ eco ${eco.id} (meta only)`);
    continue;
  }

  const tree = await gh(`/repos/${eco.repo}/git/trees/${meta.branch}?recursive=1`);
  if (!tree?.tree) continue;
  const skillPaths = tree.tree
    .map((n) => n.path)
    .filter((p) => p.endsWith("SKILL.md"))
    .filter((p) => filters.include.some((re) => re.test(p)))
    .filter((p) => !filters.exclude.some((re) => re.test(p)));

  const known = new Map(eco.skills.map((s) => [s.url.split("/tree/main/")[1] ?? s.name, s]));
  const nextSkills = [];
  for (const path of skillPaths) {
    const dir = path.replace(/\/SKILL\.md$/, "").replace(/^SKILL\.md$/, "");
    const existing = known.get(dir) ?? [...known.values()].find((s) => s.url.endsWith(`/${dir}`));
    if (existing) {
      nextSkills.push(existing);
      continue;
    }
    const txt = await raw(eco.repo, meta.branch, path);
    if (!txt) continue;
    const fm = parseFrontmatter(txt);
    if (!fm.name) continue;
    nextSkills.push({
      name: fm.name,
      description: (fm.description ?? "").trim(),
      category: "development",
      url: `https://github.com/${eco.repo}/tree/${meta.branch}/${dir}`.replace(/\/$/, ""),
      multiFile: false,
    });
    console.log(`  + new skill ${eco.id}/${fm.name}`);
  }
  const dropped = eco.skills.length - nextSkills.filter((s) => known.has(s.url.split("/tree/main/")[1] ?? "")).length;
  eco.skills = nextSkills;
  if (!eco.highlightsOnly) eco.skillCount = nextSkills.length;
  console.log(`✓ eco ${eco.id} (${eco.skills.length} skills${dropped > 0 ? `, review drops` : ""})`);
}

registry.updated = new Date().toISOString().slice(0, 10);
writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
console.log(`\nDone — ${apiCalls} GitHub API calls. Registry updated: ${registry.updated}`);
