// 기술 카테고리 추정 — 바뀐 파일 확장자·경로·저장소 언어로 점수를 매겨 글의 카테고리 후보를 고른다.
// 카테고리 목록은 블로그와 같은 src/data/categories.json 을 쓴다.
import { readFileSync } from "node:fs";

export const CATEGORIES = JSON.parse(readFileSync(new URL("../../src/data/categories.json", import.meta.url), "utf8"));

// 저장소 대표 언어가 가리키는 카테고리
const LANGUAGE_HINT = {
  Java: "backend", Kotlin: "backend", Go: "backend", Python: "backend", PHP: "backend", Ruby: "backend", "C#": "backend",
  Vue: "frontend", Svelte: "frontend", Astro: "frontend", CSS: "frontend", SCSS: "frontend", HTML: "frontend",
  Swift: "mobile", Dart: "mobile", "Objective-C": "mobile",
  HCL: "devops", Shell: "devops", PowerShell: "devops", Dockerfile: "devops",
  PLpgSQL: "database", TSQL: "database",
  "Jupyter Notebook": "ai",
};

// 파일 경로에서 확장자를 뽑는다. Dockerfile 처럼 확장자 없는 이름은 이름 자체를 쓴다.
function extOf(path) {
  const base = path.split("/").pop().toLowerCase();
  if (base.startsWith("dockerfile")) return "dockerfile";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : base;
}

// 경로에 키워드가 들어 있는지 본다. "ai"·"db" 처럼 짧은 키워드는 단어 경계에서만 인정한다.
function hasKeyword(text, keyword) {
  if (keyword.length > 3) return text.includes(keyword);
  return new RegExp(`(^|[^a-z])${keyword.replace(/[^a-z0-9]/g, "\\$&")}([^a-z]|$)`).test(text);
}

// 저장소별 작업 묶음을 받아 카테고리 점수표를 만들고, 높은 순으로 [{slug, score}] 를 돌려준다.
export function scoreCategories(repos) {
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c.slug, 0]));
  for (const repo of repos) {
    const hint = LANGUAGE_HINT[repo.language];
    if (hint) scores[hint] += 3;
    const repoName = repo.name.toLowerCase();
    for (const c of CATEGORIES) if (c.keywords.some((k) => hasKeyword(repoName, k))) scores[c.slug] += 2;

    for (const commit of repo.commits) {
      for (const file of commit.files) {
        const path = file.path.toLowerCase();
        const ext = extOf(path);
        const weight = Math.min(5, 1 + Math.log10(1 + (file.additions ?? 0) + (file.deletions ?? 0)));
        for (const c of CATEGORIES) {
          if (c.extensions.includes(ext)) scores[c.slug] += 2 * weight;
          if (c.keywords.some((k) => hasKeyword(path, k))) scores[c.slug] += weight;
        }
      }
    }
  }
  // 문서만 바뀐 날이 아니면 "기타" 가 이기지 않도록 낮춘다
  scores.etc *= 0.5;
  return Object.entries(scores)
    .map(([slug, score]) => ({ slug, score: Math.round(score * 10) / 10 }))
    .sort((a, b) => b.score - a.score);
}

// 점수표에서 가장 높은 카테고리를 고른다. 모두 0 이면 "기타".
export function pickCategory(scored) {
  return scored[0]?.score > 0 ? scored[0].slug : "etc";
}
