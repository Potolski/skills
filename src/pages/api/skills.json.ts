import type { APIRoute } from "astro";
import {
  registry,
  SITE_URL,
  CATEGORY_LABELS,
  totalSkills,
  rawSkillUrl,
} from "../../lib/registry";

// Stable machine-readable index of everything the site knows about.
export const GET: APIRoute = () => {
  const payload = {
    schemaVersion: 1,
    name: "Solana Skills",
    url: SITE_URL,
    generated: registry.updated,
    counts: {
      official: registry.official.length,
      ecosystemRepos: registry.ecosystem.length,
      skillsIndexed: totalSkills(),
    },
    categories: CATEGORY_LABELS,
    official: registry.official.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      summary: s.summary ?? s.tagline,
      description: s.description,
      category: s.category,
      repo: s.repo,
      license: s.license,
      version: s.version,
      multiFile: s.multiFile,
      bytes: s.bytes ?? null,
      refsBytes: s.refsBytes ?? null,
      page: `${SITE_URL}/skills/${s.id}`,
      hosted: `${SITE_URL}${s.hostedPath}`,
      hostedDir: `${SITE_URL}/s/${s.id}/`,
      hostedFiles: s.hostedFiles ?? [],
      commit: s.commitSha,
      sourceUpdated: s.pushedAt,
      raw: s.rawUrl,
      github: s.githubUrl,
      install: `npx skills add ${s.repo}`,
    })),
    ecosystem: registry.ecosystem.map((r) => ({
      id: r.id,
      repo: r.repo,
      name: r.displayName,
      vendor: r.vendor,
      type: r.type,
      description: r.blurb,
      url: r.url,
      homepage: r.homepage,
      logo: r.logo ? `${SITE_URL}${r.logo}` : null,
      stars: r.stars,
      license: r.license,
      sourceUpdated: r.pushedAt,
      commit: r.commitSha ?? null,
      skillCount: r.skillCount,
      skillsIndexed: r.skills.length,
      skills: r.skills.map((s) => ({
        name: s.name,
        description: s.description,
        category: s.category,
        url: s.url,
        raw: rawSkillUrl(s.url),
        multiFile: s.multiFile,
        page: s.slug ? `${SITE_URL}/skills/${r.id}/${s.slug}` : null,
        // Mirror of SKILL.md on this domain. Full-host repos also mirror
        // companion .md files (hostedFiles, relative to hostedDir); for the
        // rest, links inside the mirror point at GitHub pinned to `url`.
        hosted: s.hostedPath ? `${SITE_URL}${s.hostedPath}` : null,
        hostedDir: s.hosted ? `${SITE_URL}/s/${r.id}/${s.slug}/` : null,
        hostedFiles: s.hostedFiles ?? [],
        bytes: s.bytes ?? null,
      })),
    })),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
