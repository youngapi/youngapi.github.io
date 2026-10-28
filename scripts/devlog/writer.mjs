// 개발 기록 초안 쓰기 — 걸러 낸 하루치 작업 요약을 Claude API 에 넘겨 제목·요약·카테고리·태그·본문을 JSON 으로 받는다.
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./categorize.mjs";

// 말투·금지 표현·형식 규칙은 Claude Code 예약 작업과 같이 쓰도록 style-guide.md 에 둔다
const SYSTEM_PROMPT = readFileSync(new URL("./style-guide.md", import.meta.url), "utf8");

// 응답 JSON 의 모양. category 는 블로그 카테고리 slug 중 하나만 허용한다.
const POST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "category", "tags", "body"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string", enum: CATEGORIES.map((c) => c.slug) },
    tags: { type: "array", items: { type: "string" } },
    body: { type: "string" },
  },
};

// 하루치 작업 요약을 받아 글 초안 {title, description, category, tags, body} 와 사용량을 돌려준다.
export async function writeDraft(activity, { model, effort }) {
  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // 안전 분류기가 요청을 거절하면 서버가 다른 모델로 다시 시도하게 한다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema: POST_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `카테고리 후보:\n${JSON.stringify(CATEGORIES.map(({ slug, name, description }) => ({ slug, name, description })))}\n\n오늘의 작업 데이터:\n${JSON.stringify(activity, null, 2)}`,
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error("ANTHROPIC_API_KEY 가 올바르지 않습니다.");
    if (error instanceof Anthropic.RateLimitError) throw new Error("Claude API 사용 한도에 걸렸습니다. 나중에 다시 실행하세요.");
    if (error instanceof Anthropic.APIError) throw new Error(`Claude API 오류 ${error.status}: ${error.message}`);
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude 가 글쓰기를 거절했습니다: ${response.stop_details?.category ?? "이유 없음"}`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("응답이 max_tokens 에서 잘렸습니다.");

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Claude 응답에 본문이 없습니다.");
  const draft = JSON.parse(text);
  draft.tags = [...new Set(draft.tags.map((t) => t.toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 5);
  return { draft, usage: response.usage, model: response.model };
}
