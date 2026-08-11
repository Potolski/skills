# skills.solana.com

Agent skills for building on Solana — a curated registry of **official Solana Foundation skills** (hosted verbatim, per-file) plus an explorer for **ecosystem skill repositories** (Jupiter, Helius, Metaplex, SendAI, Solana Mobile, Trail of Bits, and more).

Built with [Astro](https://astro.build) as a fully static site. No client framework — a few hundred bytes of vanilla JS for search, tabs, and copy buttons.

## What the site does

- **`/`** — landing: official skills, three ways to use a skill, ecosystem highlights.
- **`/skills`** — searchable catalog of every indexed skill (official pinned first, category filters).
- **`/skills/<id>`** — official skill detail: rendered `SKILL.md`, install tabs (skills CLI / Claude Code / no-install / git), companion-file tree, metadata.
- **`/s/<id>/SKILL.md`** — **per-file hosting**: the official skill served verbatim with `text/markdown` + CORS, so any agent can consume it from a single URL — no install:
  ```
  Read https://skills.solana.com/s/solana-dev/SKILL.md and follow it for this task: …
  ```
  (The legacy flat form `/s/<id>.md` 301s here; it survives as a plain-file fallback on hosts without redirect support, but its relative links only resolve from the dir-style URL.)
- **`/s/<id>/SKILL.md` + `/s/<id>/<companion>.md`** — dir-style hosting of the whole skill, companion reference files included, so relative links resolve and an agent can walk the entire skill without leaving the domain. Detail pages surface these as a **Reference library** (title + description parsed from each file's frontmatter).
- **`/skills/<repo-id>/<skill>`** — ecosystem skill detail: same layout as official pages (rendered `SKILL.md`, install tabs, file tree, vendor logo) with an explicit *not official* disclaimer.
- **`/s/<repo-id>/<skill>/SKILL.md`** — ecosystem mirrors. Three hosting tiers:
  - **Full** (`sendaifun/skills`, `sendaifun/solana-new`, `solanabr/solana-ai-kit`): `SKILL.md` verbatim + every companion `.md`, relative links resolve on-domain — same guarantee as official skills.
  - **Partial** (every other repo with a license): `SKILL.md` mirrored with relative links rewritten to GitHub URLs pinned at the indexed commit, plus a provenance comment; companions stay upstream.
  - **Link-only** (repos with no declared license): never republished — pages link to the pinned source instead.
- **Commit-SHA pinning** — every ecosystem skill link and repo badge points at the exact commit the registry indexed, so what you review is exactly what we listed. Mirrors are fetched from that same pin. (Install commands like `npx skills add` pull the repo's current HEAD — diff against the pin if that matters to you.)
- **`/ecosystem`** — ecosystem repo explorer grouped by aggregators/toolkits, teams & protocols, community; expandable per-repo skill lists that deep-link to the on-site detail pages.
- **`/api/skills.json`** — machine-readable index of everything (CORS-enabled); `/api/skills-min.json` is the token-lean variant with one fetchable URL per skill (on-domain mirror preferred).
- **`/llms.txt`** — plain-text site map for AI agents.
- **`/og/**.png`** — per-page social cards generated at build time (satori + resvg): Solana gradient, vendor logo, adaptive title.
- `sitemap.xml`, `robots.txt`, OpenGraph meta on every page.
- **Logos** — GitHub org avatars are downloaded at refresh time into `public/logos/` and shown on repo cards, catalog cards, and detail pages (no third-party requests at render time).

## Data model

Everything renders from one committed snapshot:

```
src/data/registry.json                    # official skills + ecosystem repos/skills, stars, commit SHAs
src/data/skills/*.md                      # verbatim mirrors of official SKILL.md files
src/data/skill-files/<id>/…               # verbatim mirrors of official companion .md files (reference library)
src/data/eco-skill-files/<repo>/<skill>/… # ecosystem mirrors (full or partial — see hosting tiers above)
public/logos/<owner>.png                  # GitHub org avatars, refreshed with the registry
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

Add an entry to `registry.json → ecosystem` (id, repo, displayName, vendor, type, categories, blurb), plus a path filter in `scripts/refresh.mjs → SKILL_PATHS` if its skills should be auto-discovered. The next `npm run refresh` discovers skills, mirrors them (per the licensing tiers above), downloads the org logo, and slugs everything for detail pages. Repos listed in the Foundation's [awesome-solana-ai](https://github.com/solana-foundation/awesome-solana-ai) are the natural funnel.

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
