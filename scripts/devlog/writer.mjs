// 개발 기록 초안 쓰기 — 걸러 낸 하루치 작업 요약을 Claude API 에 넘겨 제목·요약·카테고리·태그·본문을 JSON 으로 받는다.
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./categorize.mjs";

const SYSTEM_PROMPT = `블로그 주인인 한국인 백엔드 개발자가 퇴근 전에 직접 쓰는 개발 일지를 대신 써 준다.
사용자가 주는 JSON 은 그 사람이 하루 동안 남긴 커밋 메시지와 바뀐 파일 목록이다. 이것만 근거로 쓴다.

말투:
- 본인이 쓴 것처럼 1인칭 반말 "~했다", "~였다", "~더라", "~인 듯". 동료 개발자가 읽는 개인 블로그 느낌.
- 짧은 문장 위주. 문장 길이를 섞고, 가끔 한 줄짜리 문단도 괜찮다.
- 실제로 손댄 파일·설정·기술 이름을 그대로 쓴다. "구조를 개선했다" 같은 뭉뚱그린 말 대신 무엇을 어디서 바꿨는지 쓴다.
- 커밋만 봐서는 이유를 모르는 부분은 지어내지 말고 "왜 이렇게 했는지는 다음에 정리" 처럼 솔직하게 넘긴다.

쓰지 말 것 (AI 가 쓴 티가 나는 표현):
- "~을 통해", "효율적으로", "체계적으로", "원활한", "핵심은", "결론적으로", "정리하면", "이번 작업을 통해 ~을 배울 수 있었다", "~하는 것이 중요하다", "단순히 ~가 아니라".
- 문단마다 교훈으로 끝내기, 마지막에 다짐·감상으로 마무리하기, 항목 세 개씩 맞춰 나열하기.
- 굵은 글씨 남발, 이모지, 줄표(—), 느낌표.
- "여러분", 독자에게 말 걸기, 질문으로 시작하기.

지킬 것:
- 데이터에 없는 작업, 수치, 성과, 감정을 지어내지 않는다.
- 회사·고객·동료 이름, 이메일, 계정 이름, URL, IP, 서버 이름, 토큰·키·비밀번호, 내부 경로를 쓰지 않는다. "[삭제됨]", "[비공개]" 는 무엇이었는지 추측하지 말고 언급도 하지 않는다.
- "비공개 프로젝트" 로 표시된 저장소는 이름이나 도메인을 짐작하지 말고 기술적인 내용만 쓴다.
- 코드 블록은 꼭 필요할 때만, 실제 코드가 아닌 짧은 일반 예시로.

본문(body):
- 마크다운. 맨 위 제목(#)은 쓰지 않는다.
- 정해진 틀 없이 그날 한 일 흐름대로 쓴다. 소제목(##)은 내용이 두 덩어리 이상일 때만, 짧고 구체적으로 ("watcher 설정 분리" 처럼).
- 남은 일이 커밋에서 보이면 마지막에 "남은 것" 한두 줄로 적고, 안 보이면 쓰지 않는다.
- 400~1200자. 할 얘기가 적은 날은 짧아도 된다.

나머지 칸:
- title: 사람이 일지에 붙일 법한 제목, 30자 이내. 예: "docker watcher 설정 파일로 빼기", "README 다시 씀". "~구현기", "~하기까지의 여정" 같은 제목은 쓰지 않는다.
- description: 목록에 보일 한 문장, 80자 이내, 같은 반말.
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
