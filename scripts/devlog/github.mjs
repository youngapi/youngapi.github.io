// GitHub API 로 하루치 작업 내역을 모은다 — 저장소 목록, 브랜치별 커밋, 커밋마다 바뀐 파일 목록.
// 코드 내용(patch)은 가져오지 않는다.

import { execFileSync } from "node:child_process";

const API = "https://api.github.com";

// 클라우드 세션처럼 HTTPS 프록시가 있는 곳에서는 curl 로 부른다.
// Node fetch 는 프록시를 안 거쳐 공용 IP 한도(시간당 60회)에 걸리지만, curl 은 프록시를 거쳐 인증된 한도를 쓴다.
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;

// 받은 토큰이 GitHub API 에서 거부되면(클라우드 세션의 git 전용 토큰 등) 그 뒤로는 토큰 없이 부른다
let tokenRejected = false;

// HTTP 요청 하나를 보내고 {status, text} 를 돌려준다. 프록시가 있으면 curl, 없으면 fetch.
async function request(url, headers) {
  if (!PROXY) {
    const res = await fetch(url, { headers });
    return { status: res.status, text: await res.text() };
  }
  const args = ["-sS", "-w", "\n%{http_code}"];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  const out = execFileSync("curl", [...args, url], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const cut = out.lastIndexOf("\n");
  return { status: Number(out.slice(cut + 1)), text: out.slice(0, cut) };
}

// GitHub API 를 한 번 호출해서 JSON 을 돌려준다. 실패하면 상태 코드와 함께 오류를 낸다.
async function gh(path, token) {
  const useToken = token && !tokenRejected;
  const { status, text } = await request(path.startsWith("http") ? path : `${API}${path}`, {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(useToken ? { Authorization: `Bearer ${token}` } : {}),
  });
  if (status === 401 && useToken) {
    console.warn("GitHub 토큰이 거부되어 토큰 없이 다시 시도합니다.");
    tokenRejected = true;
    return gh(path, token);
  }
  if (status === 409) return []; // 빈 저장소
  if (status < 200 || status >= 300) throw new Error(`GitHub API ${status} ${path}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// 목록 API 를 끝 페이지까지 넘기며 모두 모은다(최대 limit 개).
async function ghAll(path, token, limit = 500) {
  const items = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; items.length < limit; page++) {
    const batch = await gh(`${path}${sep}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items.slice(0, limit);
}

// 저장소 응답에서 필요한 칸만 남긴다.
function toRepo(r) {
  return {
    fullName: r.full_name,
    name: r.name,
    private: r.private,
    fork: r.fork,
    language: r.language,
    pushedAt: r.pushed_at,
  };
}

// 대상 저장소 목록을 만든다. 기본은 owner 의 공개 저장소, includePrivate 면 owner 가 소유한 비공개 저장소까지.
// 회사 조직 저장소는 넣지 않는다. 토큰이 비공개 목록을 못 보면(개인 토큰 없음) 공개 저장소만 쓴다.
// since 이후에 push 가 있었던 저장소만 남긴다.
export async function listActiveRepos({ owner, includePrivate, extraRepos, excludeRepos, since, token }) {
  let raw;
  let privateOk = false;
  if (includePrivate && token) {
    try {
      raw = (await ghAll("/user/repos?affiliation=owner&sort=pushed", token)).filter(
        (r) => r.owner?.login?.toLowerCase() === owner.toLowerCase(),
      );
      privateOk = true;
    } catch (error) {
      console.warn(`비공개 저장소 목록을 못 읽어 공개 저장소만 모읍니다: ${error.message.slice(0, 120)}`);
    }
  }
  raw ??= await ghAll(`/users/${owner}/repos?type=owner&sort=pushed`, token);

  const repos = raw.map(toRepo);
  for (const full of extraRepos) {
    if (!repos.some((r) => r.fullName.toLowerCase() === full.toLowerCase())) {
      repos.push(toRepo(await gh(`/repos/${full}`, token)));
    }
  }
  const excluded = new Set(excludeRepos.map((r) => r.toLowerCase()));
  return repos.filter(
    (r) => !excluded.has(r.fullName.toLowerCase()) && (!r.private || privateOk) && new Date(r.pushedAt) >= since,
  );
}

// 한 저장소에서 기간 안에 authors(계정 이름이나 커밋 이메일) 가 만든 커밋을 모든 브랜치에서 모은다
// (같은 커밋은 한 번만, merge 커밋 제외).
export async function listCommits(repo, { authors, since, until, maxBranches, token }) {
  const branches = await ghAll(`/repos/${repo.fullName}/branches`, token, maxBranches);
  const bySha = new Map();
  for (const branch of branches) {
    for (const author of authors) {
      const query = new URLSearchParams({ sha: branch.name, author, since: since.toISOString(), until: until.toISOString() });
      const commits = await ghAll(`/repos/${repo.fullName}/commits?${query}`, token, 100);
      for (const c of commits) {
        if ((c.parents?.length ?? 0) > 1 || bySha.has(c.sha)) continue;
        bySha.set(c.sha, { sha: c.sha, message: c.commit.message, date: c.commit.author?.date, branch: branch.name });
      }
    }
  }
  return [...bySha.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// 커밋 하나에서 바뀐 파일의 경로·상태·추가/삭제 줄 수만 가져온다.
export async function getCommitFiles(repo, sha, { maxFiles, token }) {
  const detail = await gh(`/repos/${repo.fullName}/commits/${sha}`, token);
  return (detail.files ?? []).slice(0, maxFiles).map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
  }));
}
