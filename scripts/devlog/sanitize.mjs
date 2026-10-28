// 민감정보 걸러 내기 — 커밋 메시지·파일 경로·완성된 글에서 키, 토큰, 이메일, IP, 내부 주소, 비공개 단어를 지운다.
// 글을 쓰기 전(입력)과 쓴 뒤(출력) 두 번 모두 이 파일을 통과시킨다.

// 지울 패턴 목록. 위에서부터 차례로 적용하므로 구체적인 패턴을 먼저 둔다.
const PATTERNS = [
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{10,}/g },
  { name: "openai-key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: "google-key", re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { name: "aws-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
  { name: "connection-string", re: /\b(?:jdbc:)?(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|sqlserver):\/\/[^\s'"`)]+/gi },
  { name: "credential-assign", re: /\b\w*(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\w*\s*[:=]\s*['"]?[^\s'"`,;]{4,}/gi },
  { name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: "ipv4", re: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?::\d{2,5})?\b/g },
  { name: "url", re: /\bhttps?:\/\/[^\s'"`)>\]]+/gi },
  { name: "kr-phone", re: /\b01[016789]-?\d{3,4}-?\d{4}\b/g },
  { name: "long-secret", re: /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}\b/g },
];

// 공개해도 되는 주소. 이 앞부분으로 시작하는 URL 은 남긴다.
const SAFE_URL_PREFIXES = ["https://github.com/youngapi", "https://youngapi.github.io"];

// 아예 글에 담지 않을 파일 경로(비밀값이 들어 있을 만한 파일).
const SENSITIVE_PATH = /(^|\/)(\.env(\.[\w-]+)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.jks|id_rsa.*|id_ed25519.*|credentials?(\.\w+)?|secrets?(\.\w+)?|.*serviceaccount.*\.json|.*-sa\.json|kubeconfig|\.npmrc|\.pypirc)$/i;

// 문자열을 정규식에서 글자 그대로 쓰도록 바꾼다.
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 환경 변수 DEVLOG_REDACT_WORDS(쉼표 구분)에 적은 회사·고객·사람 이름 같은 비공개 단어를 읽는다.
export function loadRedactWords(env = process.env) {
  return (env.DEVLOG_REDACT_WORDS ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

// 텍스트에서 민감정보를 지우고, 무엇을 몇 번 지웠는지 함께 돌려준다.
export function redact(text, { words = [] } = {}) {
  if (!text) return { text: "", hits: {} };
  let out = String(text);
  const hits = {};
  const count = (name) => (hits[name] = (hits[name] ?? 0) + 1);

  for (const { name, re } of PATTERNS) {
    out = out.replace(re, (match) => {
      if (name === "url" && SAFE_URL_PREFIXES.some((p) => match.startsWith(p))) return match;
      count(name);
      return "[삭제됨]";
    });
  }
  for (const word of words) {
    out = out.replace(new RegExp(escapeRegExp(word), "gi"), () => {
      count("redact-word");
      return "[비공개]";
    });
  }
  return { text: out, hits };
}

// 여러 번 지운 결과의 횟수를 하나로 합친다.
export function mergeHits(...list) {
  const total = {};
  for (const hits of list) for (const [k, v] of Object.entries(hits)) total[k] = (total[k] ?? 0) + v;
  return total;
}

// 비밀값이 들어 있을 만한 파일 경로인지 확인한다.
export function isSensitivePath(path) {
  return SENSITIVE_PATH.test(path);
}
