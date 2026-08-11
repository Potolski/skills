import { readFileSync } from "node:fs";

// Rewrites relative links inside mirrored SKILL.md files at render time:
//  - relative .md links whose target we mirror  → self-hosted /s/<id>/<path>
//  - every other relative link                  → the file on GitHub
const registry = JSON.parse(
  readFileSync(new URL("../data/registry.json", import.meta.url), "utf8"),
);
const byId = Object.fromEntries(registry.official.map((o) => [o.id, o]));

const isRelative = (url) => !!url && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

function walk(node, fn) {
  fn(node);
  if (node.children) for (const child of node.children) walk(child, fn);
}

export default function rehypeGithubLinks() {
  return (tree, file) => {
    const id = String(file.path ?? "")
      .split("/")
      .pop()
      ?.replace(/\.md$/, "");
    const meta = id ? byId[id] : undefined;
    if (!meta) return;
    const dirPart = meta.dir ? `/${meta.dir}` : "";
    const githubBase = `https://github.com/${meta.repo}/blob/${meta.branch}${dirPart}/`;
    const hostedBase = `https://skills.solana.com/s/${meta.id}/`;
    const hosted = new Set(meta.hostedFiles ?? []);

    walk(tree, (node) => {
      if (node.type !== "element") return;
      for (const attr of ["href", "src"]) {
        const val = node.properties?.[attr];
        if (typeof val === "string" && isRelative(val)) {
          const resolved = new URL(val, hostedBase);
          const rel = decodeURIComponent(resolved.pathname.slice(`/s/${meta.id}/`.length));
          node.properties[attr] =
            attr === "href" && hosted.has(rel)
              ? `/s/${meta.id}/${rel}${resolved.hash}`
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
