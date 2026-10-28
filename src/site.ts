// 사이트 공통 정보와 기술 카테고리 목록 — 메뉴·페이지·RSS 가 모두 이 값을 쓴다.
import categoryList from "./data/categories.json";

export const SITE = {
  title: "youngapi.log",
  description: "백엔드 개발자의 작업 일지",
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
