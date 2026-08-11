# skills.solana.com

Agent skills for building on Solana — a curated registry of **official Solana Foundation skills** (hosted verbatim, per-file) plus an explorer for **ecosystem skill repositories** (Jupiter, Helius, Metaplex, SendAI, Solana Mobile, Trail of Bits, and more).

Built with [Astro](https://astro.build) as a fully static site. No client framework — a few hundred bytes of vanilla JS for search, tabs, and copy buttons.

## What the site does

- **`/`** — landing: official skills, three ways to use a skill, ecosystem highlights.
- **`/skills`** — searchable catalog of every indexed skill (official pinned first, category filters).
- **`/skills/<id>`** — official skill detail: rendered `SKILL.md`, install tabs (skills CLI / Claude Code / no-install / git), companion-file tree, metadata.
- **`/s/<id>.md`** — **per-file hosting**: the official `SKILL.md` served verbatim with `text/markdown` + CORS, so any agent can consume a skill from a single URL — no install:
  ```
  Read https://skills.solana.com/s/solana-dev.md and follow it for this task: …
  ```
- **`/s/<id>/SKILL.md` + `/s/<id>/<companion>.md`** — dir-style hosting of the whole skill, companion reference files included, so relative links resolve and an agent can walk the entire skill without leaving the domain. Detail pages surface these as a **Reference library** (title + description parsed from each file's frontmatter).
- **Commit-SHA pinning** — every ecosystem skill link and repo badge points at the exact commit the registry indexed: what you audit is what you install.
- **`/ecosystem`** — ecosystem repo explorer grouped by aggregators/toolkits, teams & protocols, community; expandable per-repo skill lists that deep-link to GitHub.
- **`/api/skills.json`** — machine-readable index of everything (CORS-enabled).
- **`/llms.txt`** — plain-text site map for AI agents.
- `sitemap.xml`, `robots.txt`, OpenGraph meta on every page.

## Data model

Everything renders from one committed snapshot:

```
src/data/registry.json       # official skills + ecosystem repos/skills, stars, commit SHAs
src/data/skills/*.md         # verbatim mirrors of official SKILL.md files
src/data/skill-files/<id>/…  # verbatim mirrors of companion .md files (reference library)
```

The snapshot keeps builds deterministic and the site immune to GitHub hiccups. It is refreshed by:

```bash
npm run refresh            # full: mirrors, file trees, frontmatter, stars, new-skill discovery
node scripts/refresh.mjs --meta   # cheap: stars + pushed_at only
```

`GITHUB_TOKEN` is optional but raises rate limits. A weekly GitHub Action (`.github/workflows/refresh.yml`) runs the full refresh and commits changes; CI (`ci.yml`) builds every PR and asserts hosted files remain byte-identical mirrors.

### Adding an official skill

When the Foundation publishes a new skill repo, add an entry to `registry.json → official` (id, repo, dir, title, tagline, category) and run `npm run refresh` — mirror, frontmatter, file tree, and metadata fill in automatically.

### Adding an ecosystem repo

Add an entry to `registry.json → ecosystem` (id, repo, displayName, vendor, type, categories, blurb), plus a path filter in `scripts/refresh.mjs → SKILL_PATHS` if its skills should be auto-discovered. Repos listed in the Foundation's [awesome-solana-ai](https://github.com/solana-foundation/awesome-solana-ai) are the natural funnel.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview
```

Deploy `dist/` to any static host (Vercel / Cloudflare Pages / Netlify — zero config, no server runtime).

## Design

Follows solana.com branding: black canvas, `#9945FF` → `#14F195` brand gradient, Inter, pill buttons, glass cards. All tokens live in `src/styles/global.css`.

## License

Site code: MIT. Skill content belongs to its authors under their repository licenses (each skill page links to its source and license).
