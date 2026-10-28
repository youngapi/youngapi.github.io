// 민감정보 걸러 내기 시험 — `npm run test:sanitize` 로 실행한다. 하나라도 새면 실패로 끝난다.
import assert from "node:assert/strict";
import { isSensitivePath, redact } from "./sanitize.mjs";

// 걸러져야 하는 값. 모두 가짜 값이다.
const leaks = [
  "ghp_" + "a".repeat(36),
  "github_pat_" + "B1".repeat(20),
  "sk-ant-api03-" + "x".repeat(30),
  "AKIA" + "ABCDEFGHIJKLMNOP",
  "AIza" + "S".repeat(35),
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "jdbc:mysql://db.internal:3306/app?user=root&password=pw",
  "redis://:pass@10.0.0.5:6379",
  "DB_PASSWORD=hunter2hunter2",
  "api_key: \"abcd1234efgh\"",
  "someone@example.com",
  "192.168.1.48:9000",
  "https://admin.internal-company.example/login",
  "010-1234-5678",
];

for (const value of leaks) {
  const { text } = redact(`commit: ${value} fixed`);
  assert.ok(!text.includes(value), `새어 나감: ${value} -> ${text}`);
}

// 남아야 하는 값
assert.equal(redact("https://github.com/youngapi/blog 수정").text, "https://github.com/youngapi/blog 수정");
assert.equal(redact("Spring Boot 3 로 올림, 페이지 크기 20").text, "Spring Boot 3 로 올림, 페이지 크기 20");

// 비공개 단어
assert.equal(redact("AcmeCorp 결제 연동", { words: ["acmecorp"] }).text, "[비공개] 결제 연동");

// 민감 파일 경로
for (const p of [".env", "config/.env.production", "keys/server.pem", "deploy/gcp-sa.json", "id_ed25519"]) {
  assert.ok(isSensitivePath(p), `민감 파일로 못 잡음: ${p}`);
}
for (const p of ["src/env.ts", "README.md", "docker-compose.yml"]) {
  assert.ok(!isSensitivePath(p), `민감 파일로 잘못 잡음: ${p}`);
}

console.log("sanitize: 모든 시험 통과");
