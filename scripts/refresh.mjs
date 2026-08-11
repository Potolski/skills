#!/usr/bin/env node
/**
 * Refresh src/data/registry.json + src/data/skills/ mirrors from GitHub.
 *
 *   node scripts/refresh.mjs          # full refresh (mirrors, trees, metadata, new skills)
 *   node scripts/refresh.mjs --meta   # metadata only (stars, pushed_at) — cheap
 *
 * Set GITHUB_TOKEN to raise API rate limits (60/h anonymous → 5000/h).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

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
  "sendaifun/skills": {
    include: [/^skills\//],
    exclude: [/example-skill/, /animation-reverse-engineering/],
  },
  "sendaifun/solana-new": {
    include: [/^skills\//],
    // generic design/video skills — not Solana content
    exclude: [
      /animation-reverse-engineering/, /page-load-animations/, /video-craft/,
      /marketing-video/, /frontend-design-guidelines/, /design-taste/,
      /brand-design/, /number-formatting/,
    ],
  },
  "helius-labs/core-ai": { include: [/^helius-skills\//], exclude: [] },
  "jup-ag/agent-skills": { include: [/^skills\//], exclude: [] },
  "metaplex-foundation/skill": { include: [/^skills\//], exclude: [] },
  "solana-mobile/solana-mobile-dev-skill": { include: [/^/], exclude: [] },
  "quiknode-labs/solana-anchor-claude-skill": { include: [/^skills\//], exclude: [] },
  "quiknode-labs/blockchain-skills": { include: [/^/], exclude: [] },
  "ColosseumOrg/colosseum-copilot": { include: [/^skills\//], exclude: [] },
  "QEDGen/solana-skills": { include: [/^/], exclude: [] },
  "frankcastleauditor/safe-solana-builder": { include: [/^/], exclude: [] },
  "solanabr/solana-game-skill": { include: [/^skill\/SKILL\.md$/], exclude: [/solana-dev-skill/] },
  "magicblock-labs/magicblock-dev-skill": { include: [/^/], exclude: [] },
  "MeteoraAg/meteora-invent": { include: [/^skills\//], exclude: [] },
  "alchemyplatform/skills": { include: [/^skills\//], exclude: [] },
  "phantom/phantom-connect-cursor-plugin": { include: [/^/], exclude: [] },
  "Lightprotocol/skills": { include: [/^/], exclude: [] },
  "DFlowProtocol/dflow_phantom-connect-skill": { include: [/^/], exclude: [] },
  // trailofbits/skills + solanabr/solana-ai-kit are hand-curated (highlights only)
};

/**
 * Repos whose skills we mirror in full (SKILL.md verbatim + every companion
 * .md) so relative links resolve on this domain — same guarantee as the
 * official skills. Everything else gets a partial mirror: SKILL.md with
 * relative links rewritten to pinned GitHub URLs (companions stay upstream).
 */
const HOSTED_FULL = new Set([
  "sendaifun/skills",
  "sendaifun/solana-new",
  "solanabr/solana-ai-kit",
]);
const ECO_FILES_DIR = join(ROOT, "src/data/eco-skill-files");

const slugify = (s) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

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

/** Strip markdown syntax that leaks into one-line descriptions. */
const cleanDescription = (s) =>
  (s ?? "")
    .replace(/^\s*[>|#*-]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

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
  const branch = data.default_branch ?? "main";
  const branchData = await gh(`/repos/${repo}/branches/${branch}`);
  return {
    stars: data.stargazers_count ?? null,
    pushedAt: data.pushed_at?.slice(0, 10) ?? null,
    license: data.license?.spdx_id ?? null,
    description: data.description ?? null,
    branch,
    commitSha: branchData?.commit?.sha ?? null,
  };
}

/** Extract the skill directory from a github tree/blob URL regardless of ref. */
const dirFromUrl = (url) => url.match(/\/tree\/[^/]+\/(.*)$/)?.[1] ?? null;

const treeCache = new Map();
/** Recursive git tree at a ref (sha or branch), cached per repo@ref. */
function treeAt(repo, ref) {
  const key = `${repo}@${ref}`;
  if (!treeCache.has(key)) {
    treeCache.set(key, gh(`/repos/${repo}/git/trees/${ref}?recursive=1`));
  }
  return treeCache.get(key);
}

/**
 * Rewrite relative markdown links/images/reference-defs to absolute URLs
 * against `base`. Skips fenced code blocks and inline code spans so example
 * snippets survive untouched.
 */
function rewriteRelativeLinks(txt, base) {
  const isRel = (u) => !!u && !/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(u);
  const resolve = (u) => {
    try {
      return new URL(u, base).href;
    } catch {
      return u;
    }
  };
  let inFence = false;
  return txt
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => {
          if (i % 2 === 1) return part; // inline code span
          return part
            .replace(
              /(!?\[[^\]]*\]\()\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?\s*\))/g,
              (m, pre, url, post) => (isRel(url) ? `${pre}${resolve(url)}${post}` : m)
            )
            .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/, (m, pre, url) =>
              isRel(url) ? `${pre}${resolve(url)}` : m
            );
        })
        .join("");
    })
    .join("\n");
}

/** Partial mirror: verbatim body, but relative links resolve to pinned GitHub. */
function partialMirror(txt, repo, ref, dir) {
  const base = `https://github.com/${repo}/blob/${ref}/${dir ? `${dir}/` : ""}`;
  const rewritten = rewriteRelativeLinks(txt, base);
  const note = `<!--\n  Mirror of ${base}SKILL.md hosted by skills.solana.com.\n  Relative links were rewritten to GitHub URLs pinned to the mirrored commit —\n  companion files are not hosted here; the upstream repo is the source of truth.\n-->\n\n`;
  const fm = rewritten.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return fm ? fm[0] + "\n" + note + rewritten.slice(fm[0].length) : note + rewritten;
}

/**
 * Mirror an ecosystem repo's indexed skills for on-site hosting + detail
 * pages. Mirrors from each skill's *pinned* URL ref (url ↔ mirror always
 * agree). Repos without a real license are never republished (links only).
 */
async function mirrorEcoSkills(eco) {
  const repoDir = join(ECO_FILES_DIR, eco.id);
  rmSync(repoDir, { recursive: true, force: true });
  const fullHost = HOSTED_FULL.has(eco.repo);
  const licensed = !!eco.license;
  if (!licensed) console.warn(`⚠ ${eco.id}: no upstream license — skills linked, not mirrored`);
  const seen = new Set();
  let hosted = 0;
  for (const s of eco.skills) {
    delete s.hostedPath;
    delete s.hostedFiles;
    s.hosted = false;
    // Two upstream shapes: a skill directory (…/tree/<ref>/<dir>, SKILL.md
    // inside) or a single flat file (…/blob/<ref>/<path>.md).
    const treeM = s.url.match(/\/tree\/([^/]+)\/?(.*)$/);
    const blobM = s.url.match(/\/blob\/([^/]+)\/(.+\.md)$/);
    if (!treeM && !blobM) {
      console.warn(`⚠ ${eco.id}/${s.name}: unparsable url ${s.url}`);
      continue;
    }
    const ref = (treeM ?? blobM)[1];
    const skillFilePath = blobM
      ? blobM[2]
      : `${treeM[2].replace(/\/$/, "") ? `${treeM[2].replace(/\/$/, "")}/` : ""}SKILL.md`;
    const dir = blobM
      ? skillFilePath.split("/").slice(0, -1).join("/")
      : treeM[2].replace(/\/$/, "");
    s.dir = dir;
    let slug = slugify(s.name) || slugify(dir.split("/").pop()) || "skill";
    while (seen.has(slug)) slug = `${slug}-2`;
    seen.add(slug);
    s.slug = slug;

    const txt = await raw(eco.repo, ref, skillFilePath);
    if (!txt) {
      console.warn(`⚠ ${eco.id}/${s.name}: ${skillFilePath} unreachable at ${ref.slice(0, 7)}`);
      continue;
    }
    s.bytes = Buffer.byteLength(txt);
    s.words = txt.replace(/^---[\s\S]*?---\s*/, "").split(/\s+/).length;

    if (blobM) {
      s.files = [];
      s.multiFile = false;
    }
    const tree = blobM ? null : await treeAt(eco.repo, ref);
    if (tree?.tree) {
      const prefix = dir ? `${dir}/` : "";
      s.files = tree.tree
        .filter(
          (n) =>
            n.path.startsWith(prefix) &&
            n.path !== `${prefix}SKILL.md` &&
            n.path.slice(prefix.length) !== "" &&
            !n.path.slice(prefix.length).startsWith(".")
        )
        .map((n) => n.path.slice(prefix.length) + (n.type === "tree" ? "/" : ""))
        .filter((p) => (dir ? true : !/^(README|LICENSE|\.)/i.test(p)))
        .sort();
      s.multiFile = s.files.some((f) => !f.endsWith("/"));
    }

    if (!licensed) continue;
    try {
      matter(txt); // Astro's content layer parses this — reject what would break the build
    } catch (e) {
      console.warn(`⚠ ${eco.id}/${slug}: malformed frontmatter — not hosting (${e.message})`);
      continue;
    }

    const destDir = join(repoDir, slug);
    mkdirSync(destDir, { recursive: true });
    s.hostedFiles = [];
    if (fullHost) {
      writeFileSync(join(destDir, "SKILL.md"), txt);
      const companions = (s.files ?? []).filter((f) => f.endsWith(".md"));
      for (const rel of companions) {
        const body = await raw(eco.repo, ref, `${dir ? `${dir}/` : ""}${rel}`);
        if (!body) {
          console.warn(`⚠ ${eco.id}/${slug}: companion missing ${rel}`);
          continue;
        }
        const dest = join(destDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, body);
        s.hostedFiles.push(rel);
      }
    } else {
      writeFileSync(join(destDir, "SKILL.md"), partialMirror(txt, eco.repo, ref, dir));
    }
    s.hosted = true;
    s.hostedPath = `/s/${eco.id}/${slug}/SKILL.md`;
    hosted++;
  }
  return hosted;
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
  skill.commitSha = meta.commitSha;
  if (meta.license && meta.license !== "NOASSERTION") skill.license = meta.license;
  if (metaOnly) continue;

  const tree = await gh(`/repos/${skill.repo}/git/trees/${skill.branch}?recursive=1`);
  const skillFiles = (tree?.tree ?? [])
    .map((n) => n.path)
    .filter((p) => p.endsWith("SKILL.md"));

  // Auto-heal upstream restructures: if the recorded dir no longer holds a
  // SKILL.md, adopt the tree's actual location (prefer a path containing the id).
  let dirPart = skill.dir ? `${skill.dir}/` : "";
  if (!skillFiles.includes(`${dirPart}SKILL.md`) && skillFiles.length > 0) {
    const next =
      skillFiles.find((p) => p.includes(skill.id)) ??
      skillFiles.find((p) => p.includes(skill.name)) ??
      (skillFiles.length === 1 ? skillFiles[0] : null);
    if (next) {
      skill.dir = next.replace(/\/?SKILL\.md$/, "");
      dirPart = skill.dir ? `${skill.dir}/` : "";
      console.warn(`⚠ ${skill.repo}: SKILL.md moved — dir now "${skill.dir}"`);
    }
  }

  const txt = await raw(skill.repo, skill.branch, `${dirPart}SKILL.md`);
  if (!txt) {
    console.warn(`⚠ ${skill.repo}: SKILL.md not found at ${dirPart}SKILL.md — mirror NOT updated`);
    continue;
  }
  writeFileSync(join(ROOT, "src/data/skills", `${skill.id}.md`), txt);
  skill.hostedPath = `/s/${skill.id}/SKILL.md`;
  const skillBlob = tree?.tree?.find((n) => n.path === `${dirPart}SKILL.md`);
  skill.bytes = skillBlob?.size ?? txt.length;
  const fm = parseFrontmatter(txt);
  if (fm.name) skill.name = fm.name;
  if (fm.description) skill.description = fm.description;
  if (fm.compatibility) skill.compatibility = fm.compatibility;
  const version = (fm.metadata || "").match(/version:\s*"?([\d.]+)"?/)?.[1];
  if (version) skill.version = version;
  skill.words = txt.replace(/^---[\s\S]*?---\s*/, "").split(/\s+/).length;

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

    // Mirror companion .md files so the whole skill is consumable from this
    // domain: /s/<id>/SKILL.md + /s/<id>/<relpath> (relative links resolve).
    const skillFilesDir = join(ROOT, "src/data/skill-files", skill.id);
    rmSync(skillFilesDir, { recursive: true, force: true });
    skill.hostedFiles = [];
    let refsBytes = 0;
    const companions = skill.files.filter((f) => !f.endsWith("/") && f.endsWith(".md"));
    for (const rel of companions) {
      const body = await raw(skill.repo, skill.branch, `${prefix}${rel}`);
      if (!body) {
        console.warn(`⚠ ${skill.repo}: companion missing ${rel}`);
        continue;
      }
      const dest = join(skillFilesDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      skill.hostedFiles.push(rel);
      refsBytes += Buffer.byteLength(body);
    }
    skill.refsBytes = refsBytes;
  }
  const dirUrl = skill.dir ? `/${skill.dir}` : "";
  skill.githubUrl = `https://github.com/${skill.repo}/tree/${skill.branch}${dirUrl}`;
  skill.skillFileUrl = `https://github.com/${skill.repo}/blob/${skill.branch}${dirUrl}/SKILL.md`;
  skill.rawUrl = `https://raw.githubusercontent.com/${skill.repo}/${skill.branch}${dirUrl}/SKILL.md`;
  console.log(`✓ official ${skill.id} (${skill.words} words, ${skill.files.length} files)`);
}

// ---------- ecosystem: metadata + new-skill discovery ----------
const skippedNoName = [];
for (const eco of registry.ecosystem) {
  const meta = await repoMeta(eco.repo);
  if (!meta) {
    console.warn(`⚠ ${eco.repo}: repo metadata unavailable`);
    continue;
  }
  eco.stars = meta.stars;
  eco.pushedAt = meta.pushedAt;
  eco.commitSha = meta.commitSha;
  eco.license = meta.license === "NOASSERTION" ? null : meta.license;
  eco.description = meta.description;
  const ref = meta.commitSha ?? meta.branch;
  const pinnedUrl = (dir) =>
    dir ? `https://github.com/${eco.repo}/tree/${ref}/${dir}` : `https://github.com/${eco.repo}/tree/${ref}`;
  const filters = SKILL_PATHS[eco.repo];
  if (metaOnly) {
    console.log(`✓ eco ${eco.id} (meta only)`);
    continue;
  }

  let dropped = 0;
  if (filters) {
    const tree = await treeAt(eco.repo, ref);
    if (!tree?.tree) continue;
    const skillPaths = tree.tree
      .map((n) => n.path)
      .filter((p) => p.endsWith("SKILL.md"))
      .filter((p) => filters.include.some((re) => re.test(p)))
      .filter((p) => !filters.exclude.some((re) => re.test(p)));

    const known = new Map(eco.skills.map((s) => [dirFromUrl(s.url) ?? "", s]));
    const nextSkills = [];
    let added = 0;
    for (const path of skillPaths) {
      const dir = path.replace(/\/SKILL\.md$/, "").replace(/^SKILL\.md$/, "");
      const existing = known.get(dir);
      if (existing) {
        nextSkills.push({ ...existing, url: pinnedUrl(dir) });
        continue;
      }
      const txt = await raw(eco.repo, ref, path);
      if (!txt) continue;
      const fm = parseFrontmatter(txt);
      if (!fm.name) {
        skippedNoName.push(`${eco.repo}/${path}`);
        continue;
      }
      if (nextSkills.some((s) => s.name === fm.name)) continue; // same skill vendored at two paths
      nextSkills.push({
        name: fm.name,
        description: cleanDescription(fm.description),
        category: null, // curate by hand — auto-bucketing everything as "development" pollutes filters
        url: pinnedUrl(dir),
        multiFile: dir !== "" && tree.tree.some((n) => n.path.startsWith(`${dir}/`) && n.path !== path),
      });
      added++;
      console.log(`  + new skill ${eco.id}/${fm.name} (category: curate me)`);
    }
    dropped = eco.skills.length + added - nextSkills.length;
    eco.skills = nextSkills;
    if (!eco.highlightsOnly) eco.skillCount = nextSkills.length;
  }

  const hosted = await mirrorEcoSkills(eco);
  console.log(
    `✓ eco ${eco.id} (${eco.skills.length} skills, ${hosted} mirrored${dropped > 0 ? `, ${dropped} dropped — review` : ""})`
  );
}

// ---------- logos: GitHub org/user avatars, self-hosted ----------
const owners = new Set(
  [
    ...registry.official.map((s) => s.repo),
    ...registry.ecosystem.map((e) => e.repo),
    ...registry.communityIndex.map((c) => c.repo),
  ].map((repo) => repo.split("/")[0])
);
const LOGO_DIR = join(ROOT, "public/logos");
mkdirSync(LOGO_DIR, { recursive: true });
for (const owner of owners) {
  const dest = join(LOGO_DIR, `${owner}.png`);
  try {
    const res = await fetch(`https://github.com/${owner}.png?size=128`, {
      headers: { "User-Agent": API_HEADERS["User-Agent"] },
    });
    if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    } else if (!existsSync(dest)) {
      console.warn(`⚠ logo unavailable for ${owner}`);
    }
  } catch {
    if (!existsSync(dest)) console.warn(`⚠ logo fetch failed for ${owner}`);
  }
}
const logoFor = (repo) => {
  const owner = repo.split("/")[0];
  return existsSync(join(LOGO_DIR, `${owner}.png`)) ? `/logos/${owner}.png` : null;
};
for (const s of registry.official) s.logo = logoFor(s.repo);
for (const e of registry.ecosystem) e.logo = logoFor(e.repo);
for (const c of registry.communityIndex) c.logo = logoFor(c.repo);
console.log(`✓ logos for ${owners.size} orgs`);

registry.updated = new Date().toISOString().slice(0, 10);
writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");

// Legacy flat URLs 301 to dir-style hosting (Cloudflare/Netlify; Vercel uses vercel.json).
writeFileSync(
  join(ROOT, "public/_redirects"),
  registry.official.map((s) => `/s/${s.id}.md /s/${s.id}/SKILL.md 301`).join("\n") + "\n"
);
if (skippedNoName.length > 0) {
  console.warn(
    `\n⚠ SKIPPED — SKILL.md without a frontmatter name (fix upstream or exclude):\n  ${skippedNoName.join("\n  ")}`
  );
}
console.log(`\nDone — ${apiCalls} GitHub API calls. Registry updated: ${registry.updated}`);
