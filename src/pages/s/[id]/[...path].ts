import type { APIRoute } from "astro";
import { registry } from "../../../lib/registry";

// Dir-style hosting: /s/<id>/SKILL.md plus every companion .md at
// /s/<id>/<relpath>. Relative links inside the files resolve naturally,
// so an agent can walk an entire skill without leaving this domain.
const companions = import.meta.glob<string>(
  "../../../data/skill-files/**/*.md",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);
const skillFiles = import.meta.glob<string>("../../../data/skills/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export function getStaticPaths() {
  return registry.official.flatMap((skill) => [
    { params: { id: skill.id, path: "SKILL.md" } },
    ...(skill.hostedFiles ?? []).map((f) => ({
      params: { id: skill.id, path: f },
    })),
  ]);
}

export const GET: APIRoute = ({ params }) => {
  const { id, path } = params as { id: string; path: string };
  const body =
    path === "SKILL.md"
      ? skillFiles[`../../../data/skills/${id}.md`]
      : companions[`../../../data/skill-files/${id}/${path}`];
  if (body === undefined) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
