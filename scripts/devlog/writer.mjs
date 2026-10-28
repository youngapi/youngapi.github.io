// 개발 기록 초안 쓰기 — 걸러 낸 하루치 작업 요약을 Claude API 에 넘겨 제목·요약·카테고리·태그·본문을 JSON 으로 받는다.
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./categorize.mjs";

const SYSTEM_PROMPT = `너는 한국어 개발 블로그의 하루 작업 기록을 쓰는 작가다.
사용자가 주는 JSON 은 블로그 주인이 하루 동안 남긴 커밋 메시지와 바뀐 파일 목록이다. 이것만 근거로 글을 쓴다.

지켜야 할 것:
- 데이터에 없는 작업, 수치, 성과를 지어내지 않는다. 의도가 분명하지 않으면 일반적인 말로 짧게 쓴다.
- 회사·고객·동료 이름, 이메일, 계정 이름, URL, IP, 서버 이름, 토큰·키·비밀번호, 내부 경로를 쓰지 않는다. 데이터의 "[삭제됨]", "[비공개]" 는 무엇이었는지 추측하지 말고 언급하지 않는다.
- "비공개 프로젝트" 로 표시된 저장소는 이름이나 도메인을 짐작하지 말고 기술적인 내용만 쓴다.
- 코드 블록은 개념 설명에 꼭 필요할 때만, 실제 코드가 아닌 짧은 일반 예시로 쓴다.
- 문체는 "~했다" 체. 담백하고 구체적으로, 읽는 개발자에게 도움이 되는 고민과 배운 점을 살린다.

본문(body) 형식:
- 마크다운. 맨 위 제목(#)은 쓰지 않는다.
- "## 오늘 한 일", "## 고민하고 배운 것", "## 다음에 할 일" 세 부분으로 쓴다. 저장소가 여럿이면 "오늘 한 일" 안에서 "### 저장소 이름" 으로 나눈다.
- 600~1500자.

나머지 칸:
- title: 그날 작업의 핵심이 드러나는 40자 이내 제목.
- description: 목록에 보일 한두 문장 요약, 120자 이내.
- category: 주어진 후보 중 그날 작업을 가장 잘 나타내는 slug 하나. categoryHint 를 참고하되 내용이 다르면 바꿔도 된다.
- tags: 기술 이름 위주 소문자 태그 2~5개 (예: spring, mysql, docker).`;

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
