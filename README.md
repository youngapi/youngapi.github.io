# youngapi.github.io

[youngapi.log](https://youngapi.github.io) — Astro 로 만든 개발 블로그입니다. 매일 GitHub 작업 내역으로 개발 기록 초안이 PR 로 올라옵니다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/content/posts/` | 글(마크다운). frontmatter 의 `category` 로 기술 메뉴가 나뉜다 |
| `src/data/categories.json` | 기술 카테고리 목록. 메뉴와 자동 분류가 함께 쓴다 |
| `src/pages/` | 홈, 전체 글, 카테고리, 태그, 소개, RSS |
| `scripts/devlog/` | 매일 초안 만들기 (수집 → 민감정보 제거 → Claude 글쓰기 → 다시 검사) |
| `devlog.config.json` | 초안 대상 계정, 비공개 저장소 포함 여부, 모델 |
| `.github/workflows/deploy.yml` | `main` 에 push 하면 빌드해서 Pages 에 배포 |
| `.github/workflows/daily-draft.yml` | 매일 09:00 KST 에 어제 작업으로 초안 PR 생성 |

## 글 쓰기

`src/content/posts/YYYY-MM-DD-제목.md` 를 만들고 아래 frontmatter 를 채웁니다.

```yaml
---
title: "제목"
description: "목록에 보일 한두 문장"
date: 2026-10-28
category: backend   # backend | frontend | mobile | devops | database | ai | etc
tags: ["spring", "mysql"]
---
```

카테고리를 추가하거나 바꾸려면 `src/data/categories.json` 만 고치면 됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

`npm run build` 로 `dist/` 에 정적 파일을 만듭니다.

## 매일 초안 자동화

1. 어제(KST) `youngapi` 의 공개 저장소에 올라온 커밋을 모든 브랜치에서 모읍니다. 커밋 메시지와 바뀐 파일 목록만 쓰고, **코드 내용은 가져오지 않습니다.**
2. `scripts/devlog/sanitize.mjs` 가 키·토큰·이메일·IP·URL·DB 접속 문자열·`.env` 같은 파일과 `DEVLOG_REDACT_WORDS` 의 단어를 지웁니다.
3. Claude API(`claude-opus-5-5`)가 제목·요약·카테고리·태그·본문을 씁니다. 말투는 본인이 쓴 개발 일지처럼 반말 "~했다" 체이고, AI 티 나는 표현 목록을 피하게 합니다(`scripts/devlog/writer.mjs` 의 `SYSTEM_PROMPT`).
4. 완성된 글을 다시 한 번 걸러 내고, 빌드가 되는지 확인한 뒤 `devlog/YYYY-MM-DD` 브랜치로 PR 을 올립니다.
5. PR 을 읽고 고쳐서 머지하면 게시됩니다. 작업이 없는 날에는 아무것도 만들지 않습니다.

### 저장소 Secrets

| 이름 | 필수 | 내용 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `DEVLOG_AUTHOR_EMAILS` | | 계정에 연결되지 않은 내 커밋 이메일(쉼표 구분). 회사 메일로 커밋했다면 넣는다 |
| `DEVLOG_REDACT_WORDS` | | 글에서 지울 회사·고객·사람 이름(쉼표 구분) |
| `DEVLOG_GITHUB_TOKEN` | | 비공개 저장소까지 읽을 토큰. `devlog.config.json` 의 `includePrivate: true` 와 함께 쓴다 |

비공개 저장소를 켜면 저장소 이름은 "비공개 프로젝트 A" 로 바뀌고 파일은 확장자만 남습니다.

### 직접 돌려 보기

```bash
GITHUB_TOKEN=$(gh auth token --user youngapi) node scripts/devlog/daily-draft.mjs --dry-run --date 2026-10-27
```

`--dry-run` 은 Claude 를 부르지 않고 걸러 낸 입력만 보여 줍니다. Actions 에서는 **Actions → Daily devlog draft → Run workflow** 로 날짜를 지정해 돌릴 수 있습니다.

```bash
npm run test:sanitize
```

민감정보 필터 시험입니다. 초안 워크플로도 매번 먼저 이 시험을 돌립니다.
