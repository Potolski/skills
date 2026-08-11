import type { APIRoute } from "astro";
import { registry, SITE_URL } from "../lib/registry";

// llms.txt — a plain-text map of this site for AI agents.
export const GET: APIRoute = () => {
  const lines: string[] = [
    "# Solana Skills",
    "",
    "> Agent skills for building on Solana — official Solana Foundation skills plus an index of ecosystem skill repositories. Skills are markdown files (Agent Skills format: https://agentskills.io) usable by Claude Code, Cursor, Codex, and any agent that reads markdown.",
    "",
    "Every official skill is hosted verbatim at a stable URL. To use one without installing anything, fetch the URL and follow its instructions.",
    "",
    "## Official skills (Solana Foundation)",
    "",
  ];

  for (const s of registry.official) {
    lines.push(
      `- [${s.title}](${SITE_URL}${s.hostedPath}): ${s.description.slice(0, 220)}`,
    );
    lines.push(`  - Page: ${SITE_URL}/skills/${s.id}`);
    lines.push(`  - Source: https://github.com/${s.repo}`);
    lines.push(`  - Install: npx skills add ${s.repo}`);
  }

  lines.push("", "## Ecosystem skill repositories", "");
  for (const r of registry.ecosystem) {
    lines.push(
      `- [${r.displayName}](${r.url}): ${r.blurb.slice(0, 200)} (${r.skillCount} skills)`,
    );
  }

  lines.push(
    "",
    "## Machine-readable index",
    "",
    `- [skills.json](${SITE_URL}/api/skills.json): full JSON index of official + ecosystem skills`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
