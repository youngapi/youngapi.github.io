// 글 목록을 가져오는 공통 함수 — 초안(draft) 은 빼고 최신순으로 정렬하고, 태그 수·읽는 시간을 계산한다.
import { getCollection, type CollectionEntry } from "astro:content";

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

// 본문 길이로 읽는 시간(분)을 어림한다. 한국어 기준 1분에 500자 정도로 잡는다.
export function readingMinutes(post: Post): number {
  const text = (post.body ?? "").replace(/```[\s\S]*?```/g, "").replace(/[#>*`\-\[\]()!]/g, "");
  return Math.max(1, Math.round(text.replace(/\s+/g, "").length / 500));
}
