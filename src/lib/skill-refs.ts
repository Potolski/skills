import matter from "gray-matter";

// Metadata for mirrored companion files — many ship their own frontmatter
// (title/description), which lets us surface them as a browsable reference
// library instead of a bare path list.
const rawFiles = import.meta.glob<string>("../data/skill-files/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface SkillRef {
  path: string;
  title: string;
  description: string | null;
}

export function refsFor(id: string): SkillRef[] {
  const prefix = `../data/skill-files/${id}/`;
  return Object.entries(rawFiles)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, body]) => {
      const rel = key.slice(prefix.length);
      let data: Record<string, unknown> = {};
      try {
        data = matter(body).data;
      } catch {
        /* malformed frontmatter — fall back to filename */
      }
      const fallback = (rel.split("/").pop() ?? rel)
        .replace(/\.md$/, "")
        .replace(/[-_]/g, " ")
        .replace(/^\d+\s*/, "");
      return {
        path: rel,
        title: typeof data.title === "string" ? data.title : fallback,
        description:
          typeof data.description === "string" ? data.description : null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
