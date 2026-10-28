// 글(posts) 컬렉션 정의 — frontmatter 형식을 검사해서 잘못된 카테고리나 날짜를 빌드 단계에서 막는다.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { CATEGORIES } from "./site";

const categorySlugs = CATEGORIES.map((c) => c.slug) as [string, ...string[]];

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(categorySlugs),
    // 하위 카테고리 slug. 비우면 태그로 자동으로 정한다(site.ts resolveSubcategory)
    subcategory: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // 작업한 repo 이름 — 매일 기록 글에서 채운다
    repos: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
