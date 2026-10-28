// 사이트 공통 정보, 기술 카테고리 목록, 프로젝트 목록 — 메뉴·페이지·RSS 가 모두 이 값을 쓴다.
import categoryList from "./data/categories.json";
import projectList from "./data/projects.json";

export const SITE = {
  title: "youngapi.log",
  description: "개발하면서 배운 것들을 기록합니다",
  author: "youngapi",
  github: "https://github.com/youngapi",
  locale: "ko-KR",
  // 링크 공유 미리보기 기본 이미지 (scripts/og-image.mjs 로 만든다)
  ogImage: "/og-default.png",
  // GoatCounter 사이트 코드 (https://<코드>.goatcounter.com). 비워 두면 조회수 수집·표시를 하지 않는다
  goatcounter: "",
  // 검색엔진 소유 확인 값. Google Search Console·네이버 서치어드바이저에서 받은 content 값만 넣는다
  verification: {
    google: "",
    naver: "",
  },
};

export type Category = (typeof categoryList)[number];
export type Subcategory = Category["children"][number];

export const CATEGORIES: Category[] = categoryList;

// slug 로 카테고리를 찾는다. 없으면 "기타" 를 돌려준다.
export function findCategory(slug: string): Category {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[CATEGORIES.length - 1];
}

// 글의 하위 카테고리를 정한다. frontmatter 의 subcategory 가 있으면 그것을,
// 없으면 태그가 가장 많이 겹치는 하위 카테고리를 고른다(같으면 앞에 있는 것). 아무것도 안 맞으면 undefined.
export function resolveSubcategory(data: { category: string; subcategory?: string; tags: string[] }): Subcategory | undefined {
  const category = findCategory(data.category);
  if (data.subcategory) return category.children.find((s) => s.slug === data.subcategory);
  let best: Subcategory | undefined;
  let bestScore = 0;
  for (const sub of category.children) {
    const score = sub.tags.filter((t) => data.tags.includes(t)).length;
    if (score > bestScore) [best, bestScore] = [sub, score];
  }
  return best;
}

// 프로젝트 하나. 글의 frontmatter `project` 에 slug 를 적으면 그 프로젝트 글로 모인다.
export interface Project {
  slug: string;
  name: string;
  summary: string;
  // "2026.02 ~ 2026.05" 처럼 자유 형식
  period?: string;
  stack?: string[];
  status?: "진행 중" | "완료" | "중단";
  // 공개 저장소 이름(있을 때만 링크)
  repo?: string;
}

export const PROJECTS: Project[] = projectList as Project[];

// slug 로 프로젝트를 찾는다. 없으면 undefined.
export function findProject(slug?: string): Project | undefined {
  return slug ? PROJECTS.find((p) => p.slug === slug) : undefined;
}

// 날짜를 "2026년 10월 28일" 형태로 바꾼다.
export function formatDate(date: Date): string {
  return date.toLocaleDateString(SITE.locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}
