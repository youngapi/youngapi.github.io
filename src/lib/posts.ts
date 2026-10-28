// 글 목록을 가져오는 공통 함수 — 초안(draft) 은 빼고 최신순으로 정렬하고, 태그 수·하위 카테고리·월별 글 수·읽는 시간을 계산한다.
import { getCollection, type CollectionEntry } from "astro:content";
import { resolveSubcategory } from "../site";

export type Post = CollectionEntry<"posts">;

// 공개된 글 전체를 최신순으로 돌려준다.
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

// 모든 글에 쓰인 태그와 글 수를 많은 순으로 돌려준다.
export function countTags(posts: Post[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// 한 프로젝트의 글을 오래된 순으로 돌려준다(소개 글 먼저). 프로젝트 페이지와 글의 "프로젝트 안 이전/다음" 이 쓴다.
export function postsOfProject(posts: Post[], slug: string): Post[] {
  return posts
    .filter((p) => p.data.project === slug)
    .sort((a, b) =>
      a.data.kind !== b.data.kind ? (a.data.kind === "overview" ? -1 : 1) : a.data.date.getTime() - b.data.date.getTime(),
    );
}

// 글의 하위 카테고리(없으면 undefined).
export function subOf(post: Post) {
  return resolveSubcategory(post.data);
}

// 연도 → 월(1~12) 별 글 수 표를 만든다. 첫 화면의 기록 표와 전체 글 페이지가 쓴다.
export function countByMonth(posts: Post[]): Map<number, number[]> {
  const years = new Map<number, number[]>();
  for (const post of posts) {
    const kst = new Date(post.data.date.getTime() + 9 * 3600 * 1000);
    const y = kst.getUTCFullYear();
    if (!years.has(y)) years.set(y, Array(12).fill(0));
    years.get(y)![kst.getUTCMonth()]++;
  }
  return new Map([...years.entries()].sort((a, b) => b[0] - a[0]));
}

// 본문 길이로 읽는 시간(분)을 어림한다. 한국어 기준 1분에 500자 정도로 잡는다.
export function readingMinutes(post: Post): number {
  const text = (post.body ?? "").replace(/```[\s\S]*?```/g, "").replace(/[#>*`\-\[\]()!]/g, "");
  return Math.max(1, Math.round(text.replace(/\s+/g, "").length / 500));
}
