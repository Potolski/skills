import type { APIRoute } from "astro";
import {
  registry,
  SITE_URL,
  totalSkills,
  rawSkillUrl,
} from "../../lib/registry";

// Token-lean index: one row per skill — fetchable raw URL + the commit it
// was pinned at. For descriptions and repo metadata use /api/skills.json.
export const GET: APIRoute = () => {
  const rows = [
    ...registry.official.map((s) => ({
      name: s.name,
      vendor: "Solana Foundation",
      official: true,
      category: s.category,
      raw: `${SITE_URL}${s.hostedPath}`,
      commit: s.commitSha ?? null,
    })),
    ...registry.ecosystem.flatMap((r) =>
      r.skills.map((s) => ({
        name: s.name,
        vendor: r.vendor,
        official: false,
        category: s.category,
        // Prefer the on-domain mirror (stable, links resolve); fall back to
        // GitHub raw pinned to the indexed commit.
        raw: s.hostedPath ? `${SITE_URL}${s.hostedPath}` : rawSkillUrl(s.url),
        commit: s.commitSha ?? null,
      })),
    ),
  ];
  const payload = {
    schemaVersion: 1,
    generated: registry.updated,
    total: totalSkills(),
    full: `${SITE_URL}/api/skills.json`,
    skills: rows,
  };
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
