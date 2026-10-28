// 기본 OG 이미지 만들기 — 링크를 공유할 때 보이는 1200x630 미리보기 이미지를 public/og-default.png 로 만든다.
// 디자인을 바꿀 때만 `node scripts/og-image.mjs` 로 다시 만든다.
import sharp from "sharp";

const colors = ["#3b6ef5", "#8b5cf6", "#10a37f", "#e8890c", "#0e9fa8", "#e0457b", "#6b7280"];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0f1115"/>
  <circle cx="1120" cy="0" r="420" fill="#1b2540"/>
  <rect x="80" y="120" width="88" height="88" rx="22" fill="#eceef2"/>
  <text x="124" y="184" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="#0f1115" text-anchor="middle">y</text>
  <text x="80" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="92" font-weight="800" fill="#eceef2">youngapi<tspan fill="#8b93a1">.log</tspan></text>
  <text x="84" y="400" font-family="Consolas, monospace" font-size="34" fill="#8b93a1">backend developer's dev log</text>
  ${colors.map((c, i) => `<rect x="${84 + i * 64}" y="490" width="48" height="10" rx="5" fill="${c}"/>`).join("")}
  <text x="84" y="570" font-family="Consolas, monospace" font-size="28" fill="#6b7380">youngapi.github.io</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL("../public/og-default.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
console.log("public/og-default.png 생성");
