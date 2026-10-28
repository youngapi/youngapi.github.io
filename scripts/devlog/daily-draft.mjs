// 매일 개발 기록 초안 만들기 (실행 파일) — 하루치 커밋을 모으고, 민감정보를 지우고, 글을 받아
// src/content/posts/devlog-YYYY-MM-DD.md 와 PR 설명(.devlog-out/YYYY-MM-DD/pr-body.md)을 만든다.
//
// 글을 쓰는 방법은 두 가지다.
//   A. Claude Code 예약 작업(구독, 추가 비용 없음) — 지금 쓰는 방법
//      1) node scripts/devlog/daily-draft.mjs --collect --date 2026-10-27
//         → .devlog-out/2026-10-27/activity.json 에 걸러 낸 작업 데이터를 남긴다 (작업이 없으면 NO_ACTIVITY)
//      2) Claude Code 가 scripts/devlog/style-guide.md 대로 .devlog-out/2026-10-27/draft.json 을 쓴다
//      3) node scripts/devlog/daily-draft.mjs --finalize .devlog-out/2026-10-27/draft.json --date 2026-10-27
//         → 다시 걸러 내고 글 파일과 PR 설명을 만든다
//   B. Claude API (GitHub Actions, ANTHROPIC_API_KEY 필요)
//      node scripts/devlog/daily-draft.mjs [--date 2026-10-27]
//   --dry-run 은 어느 쪽이든 모은 데이터만 화면에 보여 준다.
//
// 환경 변수: GITHUB_TOKEN(있으면 한도↑·비공개 저장소), ANTHROPIC_API_KEY(B 만),
//            DEVLOG_AUTHOR_EMAILS(내 커밋 이메일, 쉼표 구분), DEVLOG_REDACT_WORDS(지울 단어, 쉼표 구분)
// 로컬에서는 저장소에 올라가지 않는 devlog.local.json 의 authorEmails·redactWords 로 대신할 수 있다.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getCommitFiles, listActiveRepos, listCommits } from "./github.mjs";
import { CATEGORIES, pickCategory, scoreCategories } from "./categorize.mjs";
import { isSensitivePath, loadRedactWords, mergeHits, redact } from "./sanitize.mjs";
import { writeDraft } from "./writer.mjs";

const ROOT = new URL("../../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("devlog.config.json", ROOT), "utf8"));
loadLocalSecrets();

// 로컬 전용 devlog.local.json(커밋 이메일·지울 단어)이 있으면 환경 변수가 비어 있을 때만 채운다.
function loadLocalSecrets() {
  const file = new URL("devlog.local.json", ROOT);
  if (!existsSync(file)) return;
  const local = JSON.parse(readFileSync(file, "utf8"));
  if (!process.env.DEVLOG_AUTHOR_EMAILS && local.authorEmails) process.env.DEVLOG_AUTHOR_EMAILS = local.authorEmails.join(",");
  if (!process.env.DEVLOG_REDACT_WORDS && local.redactWords) process.env.DEVLOG_REDACT_WORDS = local.redactWords.join(",");
}

// 명령줄 인자(--date, --dry-run, --collect, --finalize <draft.json>)를 읽는다.
function parseArgs(argv) {
  const valueOf = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    collect: argv.includes("--collect"),
    finalize: valueOf("--finalize"),
    date: valueOf("--date"),
  };
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
function toPrBody({ date, repos, inputHits, outputHits, writer }) {
  const lines = [
    `${date} 작업으로 만든 개발 기록 초안입니다. 읽고 고친 뒤 머지하면 게시됩니다.`,
    "",
    "### 사용한 작업",
    ...repos.map((r) => `- ${r.displayName}: 커밋 ${r.commitCount}개`),
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
    `<sub>${writer}</sub>`,
  ];
  return lines.join("\n");
}

// 날짜별 작업 폴더 .devlog-out/YYYY-MM-DD/ 를 돌려준다(없으면 만든다).
function outDirOf(date) {
  const dir = new URL(`.devlog-out/${date}/`, ROOT);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// 글 초안을 검사하고 다시 걸러 낸 뒤 글 파일과 PR 설명을 쓴다. 두 방법(A·B)이 함께 쓰는 마무리 단계.
function finalizeDraft({ date, draft, meta, writer }) {
  const words = loadRedactWords();
  const slugs = CATEGORIES.map((c) => c.slug);
  for (const key of ["title", "description", "body"]) {
    if (typeof draft[key] !== "string" || !draft[key].trim()) throw new Error(`초안에 ${key} 가 없습니다.`);
  }
  if (!slugs.includes(draft.category)) throw new Error(`카테고리가 잘못됐습니다: ${draft.category} (가능: ${slugs.join(", ")})`);

  const outputHits = [];
  for (const key of ["title", "description", "body"]) {
    const r = redact(draft[key], { words });
    draft[key] = r.text;
    outputHits.push(r.hits);
  }
  draft.tags = [...new Set((draft.tags ?? []).map((t) => redact(String(t).toLowerCase().trim().replace(/\s+/g, "-"), { words }).text))]
    .filter((t) => t && !t.includes("["))
    .slice(0, 5);

  const postPath = new URL(`src/content/posts/devlog-${date}.md`, ROOT);
  const publicRepos = meta.repos.filter((r) => !r.private).map((r) => r.name);
  writeFileSync(postPath, toMarkdown(date, draft, publicRepos));
  writeFileSync(
    new URL("pr-body.md", outDirOf(date)),
    toPrBody({ date, repos: meta.repos, inputHits: meta.inputHits, outputHits: mergeHits(...outputHits), writer }),
  );
  console.log(`초안 생성: src/content/posts/devlog-${date}.md — ${draft.title}`);
  setOutput({ created: "true", date, title: draft.title.replace(/[\r\n]/g, " ") });
}

// 전체 흐름: 날짜 정하기 → (finalize 면 마무리만) → 수집 → 걸러 내기 → dry-run/collect 면 남기고 끝 → API 로 글쓰기 → 마무리.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date ?? yesterdayKst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`날짜 형식이 잘못됐습니다: ${date}`);

  if (args.finalize) {
    const meta = JSON.parse(readFileSync(new URL("activity.json", outDirOf(date)), "utf8")).meta;
    const draft = JSON.parse(readFileSync(args.finalize, "utf8"));
    return finalizeDraft({ date, draft, meta, writer: "Claude Code 예약 작업" });
  }

  const since = new Date(`${date}T00:00:00+09:00`);
  const until = new Date(since.getTime() + 24 * 3600 * 1000);
  const token = process.env.GITHUB_TOKEN || undefined;

  if (existsSync(new URL(`src/content/posts/devlog-${date}.md`, ROOT))) {
    console.log(`이미 ${date} 글이 있습니다. EXISTS`);
    return setOutput({ created: "false", date, status: "EXISTS" });
  }

  const repos = await collect({ since, until, token });
  if (repos.length === 0) {
    console.log(`${date} 에는 작업한 커밋이 없습니다. NO_ACTIVITY`);
    return setOutput({ created: "false", date, status: "NO_ACTIVITY" });
  }

  const { activity, inputHits } = buildActivity(date, repos, loadRedactWords());
  const meta = {
    inputHits,
    repos: repos.map((r) => ({ displayName: r.displayName, name: r.private ? null : r.name, private: r.private, commitCount: r.commits.length })),
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ activity, inputHits }, null, 2));
    return setOutput({ created: "false", date, status: "DRY_RUN" });
  }
  if (args.collect) {
    writeFileSync(new URL("activity.json", outDirOf(date)), JSON.stringify({ activity, meta }, null, 2));
    console.log(`수집 완료: .devlog-out/${date}/activity.json (저장소 ${repos.length}개) COLLECTED`);
    return setOutput({ created: "false", date, status: "COLLECTED" });
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 가 없습니다. --collect 나 --dry-run 으로만 실행할 수 있습니다.");
  const { draft, usage, model } = await writeDraft(activity, { model: config.model, effort: config.effort });
  finalizeDraft({ date, draft, meta, writer: `${model} · 입력 ${usage?.input_tokens ?? "?"} / 출력 ${usage?.output_tokens ?? "?"} 토큰` });
}

main().catch((error) => {
  console.error(`실패: ${error.message}`);
  process.exit(1);
});
