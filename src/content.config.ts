import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const skills = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/data/skills" }),
  schema: z
    .object({
      name: z.string(),
      description: z.string(),
      license: z.string().optional(),
    })
    .passthrough(),
});

export const collections = { skills };
