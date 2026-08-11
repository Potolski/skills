import { readFileSync } from 'node:fs';

// Rewrites relative links inside mirrored SKILL.md files so the rendered page
// points at the file on GitHub (companion references/, examples/, etc. are not
// mirrored — only the SKILL.md itself is hosted at /s/<id>.md).
const registry = JSON.parse(
  readFileSync(new URL('../data/registry.json', import.meta.url), 'utf8')
);
const byId = Object.fromEntries(registry.official.map((o) => [o.id, o]));

const isRelative = (url) =>
  !!url &&
  !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

function walk(node, fn) {
  fn(node);
  if (node.children) for (const child of node.children) walk(child, fn);
}

export default function rehypeGithubLinks() {
  return (tree, file) => {
    const id = String(file.path ?? '')
      .split('/')
      .pop()
      ?.replace(/\.md$/, '');
    const meta = id ? byId[id] : undefined;
    if (!meta) return;
    const dirPart = meta.dir ? `/${meta.dir}` : '';
    const base = `https://github.com/${meta.repo}/blob/${meta.branch}${dirPart}/`;
    walk(tree, (node) => {
      if (node.type !== 'element') return;
      for (const attr of ['href', 'src']) {
        const val = node.properties?.[attr];
        if (typeof val === 'string' && isRelative(val)) {
          node.properties[attr] = new URL(val, base).href;
        }
      }
      if (node.tagName === 'a' && typeof node.properties?.href === 'string' && node.properties.href.startsWith('http')) {
        node.properties.target = '_blank';
        node.properties.rel = 'noopener';
      }
    });
  };
}
