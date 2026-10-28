// RSS 피드 — 공개된 글 전체를 최신순으로 내보낸다.
import rss from "@astrojs/rss";
import { getPublishedPosts } from "../lib/posts";
import { SITE } from "../site";

// /rss.xml 요청에 피드를 만들어 돌려준다.
export async function GET(context) {
  const posts = await getPublishedPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      categories: [post.data.category, ...post.data.tags],
      link: `/posts/${post.id}/`,
    })),
  });
}
