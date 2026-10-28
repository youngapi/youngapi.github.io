// 매일 개발 기록 초안 만들기 (실행 파일) — 하루치 커밋을 모으고, 민감정보를 지우고, Claude 로 글을 써서
// src/content/posts/devlog-YYYY-MM-DD.md 와 PR 설명(.devlog-out/pr-body.md)을 만든다.
//
// 사용법:
//   node scripts/devlog/daily-draft.mjs                  어제(KST) 작업으로 초안 생성
//   node scripts/devlog/daily-draft.mjs --date 2026-10-27
//   node scripts/devlog/daily-draft.mjs --dry-run        Claude 호출 없이 모은 데이터만 출력
// 환경 변수: GITHUB_TOKEN(필수 아님, 있으면 한도↑·비공개 저장소), ANTHROPIC_API_KEY,
//            DEVLOG_AUTHOR_EMAILS(내 커밋 이메일, 쉼표 구분), DEVLOG_REDACT_WORDS(지울 단어, 쉼표 구분)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getCommitFiles, listActiveRepos, listCommits } from "./github.mjs";
import { pickCategory, scoreCategories } from "./categorize.mjs";
import { isSensitivePath, loadRedactWords, mergeHits, redact } from "./sanitize.mjs";
import { writeDraft } from "./writer.mjs";

const ROOT = new URL("../../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("devlog.config.json", ROOT), "utf8"));

// 명령줄 인자(--date, --dry-run)를 읽는다.
function parseArgs(argv) {
  const args = { dryRun: argv.includes("--dry-run"), date: null };
  const i = argv.indexOf("--date");
  if (i >= 0) args.date = argv[i + 1];
  return args;
}

// KST 기준 어제 날짜를 YYYY-MM-DD 로 돌려준다.
function yesterdayKst() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

// GitHub Actions 의 다음 단계가 읽을 출력 값을 남긴다. 로컬에서는 화면에만 찍는다.
function setOutput(values) {
  for (const [k, v] of Object.entries(values)) {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
    console.log(`::${k}=${v}`);
  }
}

// 하루치 작업을 GitHub 에서 모은다. 비공개 저장소는 이름을 가리고 파일은 확장자만 남긴다.
async function collect({ since, until, token }) {
  const repos = await listActiveRepos({
    owner: config.owner,
    includePrivate: config.includePrivate,
    extraRepos: config.extraRepos,
    excludeRepos: config.excludeRepos,
    since,
    token,
  });

  // 계정에 연결되지 않은 커밋 이메일(회사 메일 등)은 공개 설정 파일 대신 DEVLOG_AUTHOR_EMAILS 로 받는다
  const authors = [
    config.owner,
    ...(process.env.DEVLOG_AUTHOR_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
  ];

  const result = [];
  let total = 0;
  let privateIndex = 0;
  for (const repo of repos) {
    if (total >= config.maxCommits) break;
    const commits = await listCommits(repo, {
      authors,
      since,
      until,
      maxBranches: config.maxBranchesPerRepo,
      token,
    });
    if (commits.length === 0) continue;

    const picked = commits.slice(0, config.maxCommits - total);
    total += picked.length;
    for (const c of picked) {
      c.files = (await getCommitFiles(repo, c.sha, { maxFiles: config.maxFilesPerCommit, token }))
        .filter((f) => !isSensitivePath(f.path))
        .map((f) => (repo.private ? { ...f, path: `*.${f.path.split(".").pop()}` } : f));
    }
    result.push({
      ...repo,
      displayName: repo.private ? `비공개 프로젝트 ${String.fromCharCode(65 + privateIndex++)}` : repo.name,
      commits: picked,
    });
  }
  return result;
}

// 모은 데이터를 Claude 에 보낼 모양으로 줄이고, 모든 글자에서 민감정보를 지운다.
function buildActivity(date, repos, words) {
  const hits = [];
  const clean = (s) => {
    const r = redact(s, { words });
    hits.push(r.hits);
    return r.text;
  };
  const activity = {
    date,
    categoryHint: pickCategory(scoreCategories(repos)),
    repos: repos.map((repo) => ({
      name: repo.displayName,
      private: repo.private,
      language: repo.language,
      commits: repo.commits.map((c) => ({
        message: clean(c.message).slice(0, 1500),
        branch: repo.private ? undefined : clean(c.branch),
        files: c.files.map((f) => ({ path: clean(f.path), status: f.status, additions: f.additions, deletions: f.deletions })),
      })),
    })),
  };
  return { activity, inputHits: mergeHits(...hits) };
}

// frontmatter 와 본문을 합쳐 마크다운 파일 내용을 만든다. 문자열은 JSON 따옴표로 감싸 YAML 로도 안전하게 한다.
function toMarkdown(date, draft, repoNames) {
  return [
    "---",
    `title: ${JSON.stringify(draft.title)}`,
    `description: ${JSON.stringify(draft.description)}`,
    `date: ${date}`,
    `category: ${draft.category}`,
    `tags: ${JSON.stringify(draft.tags)}`,
    `repos: ${JSON.stringify(repoNames)}`,
    "---",
    "",
    draft.body.trim(),
    "",
  ].join("\n");
}

// PR 설명을 만든다 — 어떤 저장소에서 몇 개의 커밋을 썼는지, 무엇을 지웠는지, 검토할 것.
function toPrBody({ date, repos, inputHits, outputHits, usage, model }) {
  const lines = [
    `${date} 작업으로 만든 개발 기록 초안입니다. 읽고 고친 뒤 머지하면 게시됩니다.`,
    "",
    "### 사용한 작업",
    ...repos.map((r) => `- ${r.displayName}: 커밋 ${r.commits.length}개`),
    "",
    "### 지운 민감정보",
    `- 입력에서: ${Object.keys(inputHits).length ? JSON.stringify(inputHits) : "없음"}`,
    `- 완성된 글에서: ${Object.keys(outputHits).length ? JSON.stringify(outputHits) + " ⚠️ 본문을 꼭 확인하세요" : "없음"}`,
    "",
    "### 확인할 것",
    "- [ ] 회사·고객·사람 이름이나 내부 정보가 없다",
    "- [ ] 사실과 다른 내용이 없다",
    "- [ ] 카테고리와 태그가 맞다",
    "",
    `<sub>${model} · 입력 ${usage?.input_tokens ?? "?"} / 출력 ${usage?.output_tokens ?? "?"} 토큰</sub>`,
  ];
  return lines.join("\n");
}

// 전체 흐름: 날짜 정하기 → 수집 → 걸러 내기 → (dry-run 이면 출력하고 끝) → 글쓰기 → 다시 걸러 내기 → 파일 쓰기.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date ?? yesterdayKst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`날짜 형식이 잘못됐습니다: ${date}`);

  const since = new Date(`${date}T00:00:00+09:00`);
  const until = new Date(since.getTime() + 24 * 3600 * 1000);
  const postPath = new URL(`src/content/posts/devlog-${date}.md`, ROOT);
  const token = process.env.GITHUB_TOKEN || undefined;

  if (existsSync(postPath)) {
    console.log(`이미 ${date} 글이 있습니다. 건너뜁니다.`);
    return setOutput({ created: "false", date });
  }

  const repos = await collect({ since, until, token });
  if (repos.length === 0) {
    console.log(`${date} 에는 작업한 커밋이 없습니다.`);
    return setOutput({ created: "false", date });
  }

  const words = loadRedactWords();
  const { activity, inputHits } = buildActivity(date, repos, words);
  if (args.dryRun) {
    console.log(JSON.stringify({ activity, inputHits }, null, 2));
    return setOutput({ created: "false", date });
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 가 없습니다. --dry-run 으로만 실행할 수 있습니다.");

  const { draft, usage, model } = await writeDraft(activity, { model: config.model, effort: config.effort });

  // 완성된 글도 한 번 더 걸러 낸다
  const outputHits = [];
  for (const key of ["title", "description", "body"]) {
    const r = redact(draft[key], { words });
    draft[key] = r.text;
    outputHits.push(r.hits);
  }
  draft.tags = draft.tags.map((t) => redact(t, { words }).text).filter((t) => !t.includes("["));
  const outHits = mergeHits(...outputHits);

  const publicRepos = repos.filter((r) => !r.private).map((r) => r.name);
  writeFileSync(postPath, toMarkdown(date, draft, publicRepos));

  const outDir = new URL(".devlog-out/", ROOT);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL("pr-body.md", outDir), toPrBody({ date, repos, inputHits, outputHits: outHits, usage, model }));

  console.log(`초안 생성: src/content/posts/devlog-${date}.md — ${draft.title}`);
  setOutput({ created: "true", date, title: draft.title.replace(/[\r\n]/g, " ") });
}

main().catch((error) => {
  console.error(`실패: ${error.message}`);
  process.exit(1);
});
