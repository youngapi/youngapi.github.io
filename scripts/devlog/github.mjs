// GitHub API 로 하루치 작업 내역을 모은다 — 저장소 목록, 브랜치별 커밋, 커밋마다 바뀐 파일 목록.
// 코드 내용(patch)은 가져오지 않는다.

const API = "https://api.github.com";

// GitHub API 를 한 번 호출해서 JSON 을 돌려준다. 실패하면 상태 코드와 함께 오류를 낸다.
async function gh(path, token) {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 409) return []; // 빈 저장소
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
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

// 대상 저장소 목록을 만든다. 기본은 owner 의 공개 저장소, includePrivate 면 토큰으로 볼 수 있는 저장소 전체.
// since 이후에 push 가 있었던 저장소만 남긴다.
export async function listActiveRepos({ owner, includePrivate, extraRepos, excludeRepos, since, token }) {
  const raw = includePrivate
    ? await ghAll("/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed", token)
    : await ghAll(`/users/${owner}/repos?type=owner&sort=pushed`, token);

  const repos = raw.map(toRepo);
  for (const full of extraRepos) {
    if (!repos.some((r) => r.fullName.toLowerCase() === full.toLowerCase())) {
      repos.push(toRepo(await gh(`/repos/${full}`, token)));
    }
  }
  const excluded = new Set(excludeRepos.map((r) => r.toLowerCase()));
  return repos.filter(
    (r) => !excluded.has(r.fullName.toLowerCase()) && (!r.private || includePrivate) && new Date(r.pushedAt) >= since,
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
