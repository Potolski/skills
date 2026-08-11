import { readFileSync } from "node:fs";

// Rewrites relative links inside mirrored SKILL.md files at render time:
//  - relative .md links whose target we mirror  → self-hosted /s/<id>/<path>
//  - every other relative link                  → the file on GitHub
// Handles both official mirrors (src/data/skills/<id>.md) and ecosystem
// mirrors (src/data/eco-skill-files/<repoId>/<slug>/SKILL.md).
const registry = JSON.parse(
  readFileSync(new URL("../data/registry.json", import.meta.url), "utf8"),
);
const byId = Object.fromEntries(registry.official.map((o) => [o.id, o]));
const ecoByPath = {};
for (const repo of registry.ecosystem) {
  for (const s of repo.skills) {
    if (s.slug) ecoByPath[`${repo.id}/${s.slug}`] = { repo, skill: s };
  }
}

const isRelative = (url) => !!url && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

function walk(node, fn) {
  fn(node);
  if (node.children) for (const child of node.children) walk(child, fn);
}

/** Resolve which mirrored skill a rendered file belongs to. */
function metaForFile(path) {
  const norm = String(path ?? "").replaceAll("\\", "/");
  const eco = norm.match(/\/eco-skill-files\/([^/]+)\/([^/]+)\/SKILL\.md$/);
  if (eco) {
    const hit = ecoByPath[`${eco[1]}/${eco[2]}`];
    if (!hit) return null;
    const { repo, skill } = hit;
    const ref = skill.url.match(/\/(?:tree|blob)\/([^/]+)/)?.[1] ?? "HEAD";
    const dirPart = skill.dir ? `/${skill.dir}` : "";
    return {
      githubBase: `https://github.com/${repo.repo}/blob/${ref}${dirPart}/`,
      hostedPrefix: `/s/${repo.id}/${skill.slug}/`,
      hosted: new Set(skill.hostedFiles ?? []),
    };
  }
  const id = norm.split("/").pop()?.replace(/\.md$/, "");
  const official = id ? byId[id] : undefined;
  if (!official) return null;
  const dirPart = official.dir ? `/${official.dir}` : "";
  return {
    githubBase: `https://github.com/${official.repo}/blob/${official.branch}${dirPart}/`,
    hostedPrefix: `/s/${official.id}/`,
    hosted: new Set(official.hostedFiles ?? []),
  };
}

export default function rehypeGithubLinks() {
  return (tree, file) => {
    const meta = metaForFile(file.path);
    if (!meta) return;
    const { githubBase, hostedPrefix, hosted } = meta;
    const hostedBase = `https://skills.solana.com${hostedPrefix}`;

    walk(tree, (node) => {
      if (node.type !== "element") return;
      // The page supplies its own <h1>; demote body headings one level so the
      // document keeps a single h1 and a sane outline.
      const h = node.tagName?.match(/^h([1-5])$/);
      if (h) node.tagName = `h${Number(h[1]) + 1}`;
      for (const attr of ["href", "src"]) {
        const val = node.properties?.[attr];
        if (typeof val === "string" && isRelative(val)) {
          const resolved = new URL(val, hostedBase);
          const rel = decodeURIComponent(resolved.pathname.slice(hostedPrefix.length));
          node.properties[attr] =
            attr === "href" && hosted.has(rel)
              ? `${hostedPrefix}${rel}${resolved.hash}`
              : new URL(val, githubBase).href;
        }
      }
      if (
        node.tagName === "a" &&
        typeof node.properties?.href === "string" &&
        node.properties.href.startsWith("http")
      ) {
        node.properties.target = "_blank";
        node.properties.rel = "noopener";
      }
    });
  };
}
