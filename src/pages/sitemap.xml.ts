import type { APIRoute } from "astro";
import { registry, SITE_URL } from "../lib/registry";

export const GET: APIRoute = () => {
  const routes = [
    "/",
    "/skills",
    "/ecosystem",
    ...registry.official.map((s) => `/skills/${s.id}`),
    ...registry.ecosystem.flatMap((r) =>
      r.skills.filter((s) => s.slug).map((s) => `/skills/${r.id}/${s.slug}`),
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) =>
      `  <url><loc>${SITE_URL}${r === "/" ? "" : r}</loc><lastmod>${registry.updated}</lastmod></url>`,
  )
  .join("\n")}
</urlset>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
