// 사이트 공통 정보와 기술 카테고리 목록 — 메뉴·페이지·RSS 가 모두 이 값을 쓴다.
import categoryList from "./data/categories.json";

export const SITE = {
  title: "youngapi.log",
  description: "매일 만든 것과 배운 것을 기록하는 개발 블로그",
  author: "youngapi",
  github: "https://github.com/youngapi",
  locale: "ko-KR",
};

export type Category = (typeof categoryList)[number];

export const CATEGORIES: Category[] = categoryList;

// slug 로 카테고리를 찾는다. 없으면 "기타" 를 돌려준다.
export function findCategory(slug: string): Category {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[CATEGORIES.length - 1];
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
