# youngapi.github.io

[youngapi.log](https://youngapi.github.io) — Astro 로 만든 개발 블로그입니다. 매일 GitHub 작업 내역으로 개발 기록 초안이 PR 로 올라옵니다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/content/posts/` | 글(마크다운). frontmatter 의 `category` 로 기술 메뉴가 나뉜다 |
| `src/data/categories.json` | 기술 카테고리 목록. 메뉴와 자동 분류가 함께 쓴다 |
| `src/pages/` | 홈, 전체 글, 카테고리, 태그, 소개, RSS |
| `scripts/devlog/` | 매일 초안 만들기 (수집 → 민감정보 제거 → 글쓰기 → 다시 검사), 말투 규칙 `style-guide.md` |
| `devlog.config.json` | 초안 대상 계정, 비공개 저장소 포함 여부, 모델 |
| `.github/workflows/deploy.yml` | `main` 에 push 하면 빌드해서 Pages 에 배포 |
| `.github/workflows/daily-draft.yml` | Claude API 로 초안 PR 생성 (지금은 수동 실행만) |

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

지금은 **PC 의 Claude Code 예약 작업**(Claude 앱 → Scheduled, `youngapi-devlog-daily`, 매일 09:00)이 초안을 씁니다. Claude 구독 안에서 돌아서 API 비용이 들지 않습니다. 그 시간에 앱이 꺼져 있으면 다음에 켤 때 돌고, 밀린 날은 최근 7일까지 채웁니다.

1. **수집** `node scripts/devlog/daily-draft.mjs --collect --date YYYY-MM-DD`
   `youngapi` 의 공개 저장소에 그날 올라온 커밋을 모든 브랜치에서 모읍니다. 커밋 메시지와 바뀐 파일 목록만 쓰고 **코드 내용은 가져오지 않습니다.** 키·토큰·이메일·IP·URL·DB 접속 문자열·`.env` 같은 파일과 지정한 단어를 지운 뒤 `.devlog-out/YYYY-MM-DD/activity.json` 에 남깁니다.
2. **글쓰기** Claude Code 가 [`scripts/devlog/style-guide.md`](scripts/devlog/style-guide.md) 규칙(반말 일지체, AI 티 나는 표현 금지, 지어내지 않기)대로 `draft.json` 을 씁니다.
3. **마무리** `node scripts/devlog/daily-draft.mjs --finalize .devlog-out/YYYY-MM-DD/draft.json --date YYYY-MM-DD`
   완성된 글을 다시 걸러 내고 `src/content/posts/devlog-YYYY-MM-DD.md` 와 PR 설명을 만듭니다.
4. 빌드가 되는지 확인하고 `devlog/YYYY-MM-DD` 브랜치로 PR 을 올립니다. **머지해야 게시됩니다.**

### 개인 설정 `devlog.local.json` (저장소에 올라가지 않음)

```json
{
  "authorEmails": ["커밋에 쓴 이메일", "회사 이메일"],
  "redactWords": ["글에서 지울 회사·고객 이름"]
}
```

계정에 연결되지 않은 이메일로 커밋했으면 `authorEmails` 에 넣어야 커밋이 잡힙니다.

### 나중에 Claude API 로 옮길 때

[`.github/workflows/daily-draft.yml`](.github/workflows/daily-draft.yml) 이 같은 스크립트로 API(`claude-opus-5-5`)를 불러 초안 PR 을 만듭니다. 지금은 자동 실행(schedule)을 꺼 두었고 수동 실행만 됩니다. 옮길 때는 아래 Secrets 를 넣고 워크플로 맨 위 주석대로 `schedule` 을 다시 켠 뒤 예약 작업을 끄면 됩니다. PC 가 꺼져 있어도 돌지만 작업한 날 한 번에 100원 안팎이 듭니다.

| 이름 | 필수 | 내용 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `DEVLOG_AUTHOR_EMAILS` | | `devlog.local.json` 의 `authorEmails` 와 같은 값(쉼표 구분) |
| `DEVLOG_REDACT_WORDS` | | `redactWords` 와 같은 값(쉼표 구분) |
| `DEVLOG_GITHUB_TOKEN` | | 비공개 저장소까지 읽을 토큰. `devlog.config.json` 의 `includePrivate: true` 와 함께 쓴다 |

비공개 저장소를 켜면 저장소 이름은 "비공개 프로젝트 A" 로 바뀌고 파일은 확장자만 남습니다.

### 직접 돌려 보기

```bash
GITHUB_TOKEN=$(gh auth token --user youngapi) node scripts/devlog/daily-draft.mjs --dry-run --date 2026-10-27
```

`--dry-run` 은 걸러 낸 입력만 화면에 보여 줍니다.

```bash
npm run test:sanitize
```

민감정보 필터 시험입니다.
