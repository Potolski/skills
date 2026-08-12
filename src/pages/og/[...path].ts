import type { APIRoute } from "astro";
import { registry, totalSkills } from "../../lib/registry";
import { renderOgPng, logoDataUri, type OgSpec } from "../../lib/og-template";

// Per-page social cards, generated at build: /og/<route>.png mirrors the
// page route it belongs to (e.g. /og/skills/solana-dev.png).
function specs(): Record<string, OgSpec> {
  const out: Record<string, OgSpec> = {
    "skills.png": {
      title: "Browse skills",
      subtitle: `${totalSkills()} agent skills for building on Solana — official Solana Foundation skills plus the ecosystem, each pinned to the commit we indexed.`,
      path: "/skills",
    },
    "ecosystem.png": {
      title: "Ecosystem skill repositories",
      subtitle: `Skills from ${registry.ecosystem.length} repositories maintained by Solana teams and the community — aggregators, toolkits, and protocol vendors.`,
      path: "/ecosystem",
    },
  };
  for (const s of registry.official) {
    out[`skills/${s.id}.png`] = {
      title: s.title,
      subtitle: s.summary ?? s.tagline,
      badge: "Official",
      badge2: s.name,
      path: `/skills/${s.id}`,
      logo: logoDataUri(s.logo),
    };
  }
  for (const r of registry.ecosystem) {
    for (const s of r.skills) {
      if (!s.slug) continue;
      out[`skills/${r.id}/${s.slug}.png`] = {
        title: s.name,
        subtitle: s.description || r.blurb,
        badge: r.vendor,
        badge2: r.repo,
        path: `/skills/${r.id}/${s.slug}`,
        logo: logoDataUri(r.logo),
      };
    }
  }
  return out;
}

export function getStaticPaths() {
  return Object.keys(specs()).map((path) => ({ params: { path } }));
}

export const GET: APIRoute = async ({ params }) => {
  const spec = specs()[params.path as string];
  if (!spec) return new Response("Not found", { status: 404 });
  const png = await renderOgPng(spec);
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
};
