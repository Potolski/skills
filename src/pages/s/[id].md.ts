import type { APIRoute } from "astro";
import { registry } from "../../lib/registry";

// Verbatim per-file hosting: /s/<id>.md serves the mirrored SKILL.md exactly as
// published upstream, so agents can consume a skill from a single URL.
const files = import.meta.glob<string>("../../data/skills/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export function getStaticPaths() {
  return registry.official.map((skill) => ({ params: { id: skill.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const body = files[`../../data/skills/${params.id}.md`];
  if (body === undefined) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
