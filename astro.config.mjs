// Astro 설정 파일 — 사이트 주소, 사이트맵, 코드 하이라이트 테마를 정한다.
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://youngapi.github.io",
  // 관리 페이지는 사이트맵에서 뺀다
  integrations: [sitemap({ filter: (page) => !page.includes("/admin") })],
  markdown: {
    shikiConfig: {
      // 라이트/다크 모드 각각에 맞는 코드 색을 함께 만든다
      themes: { light: "github-light", dark: "github-dark" },
    },
  },
});
