// 선택 기능: GEMINI_API_KEY가 있으면 데이터 요약 문장을 바탕으로 짧은 시황 해설을 만듭니다.
// 숫자는 수집한 데이터에서만 나오고, Gemini는 문장과 맥락(웹 검색 출처 포함)만 보탭니다.

import { GoogleGenAI } from "@google/genai";
import type { Briefing } from "../../shared/types";

export async function aiBriefing(facts: string[]): Promise<Briefing["ai"]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const ai = new GoogleGenAI({ apiKey: key });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const today = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "full" }).format(new Date());
  const prompt = `오늘은 ${today}(한국 시간)입니다. 아래는 수집한 시장 데이터입니다.

${facts.map((f) => `- ${f}`).join("\n")}

웹 검색으로 이 움직임의 배경(직전 미국 증시, 환율·유가, 주요 뉴스)을 확인하고, 한국 주식 투자자를 위한 해설을 한국어 문장 3개로 쓰세요.
- 위 데이터와 다른 숫자를 쓰지 마세요. 확인하지 못한 내용은 쓰지 마세요.
- 매수·매도 권유 표현은 쓰지 마세요.
- 각 문장은 120자 이내. 문장마다 줄을 바꾸고, 다른 글은 쓰지 마세요.`;

  try {
    const res = await ai.models.generateContent({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
    const text = (res.text ?? "")
      .split("\n")
      .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter((l) => l.length > 10)
      .slice(0, 3);
    if (text.length === 0) return null;
    const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
      .filter((s) => s.uri.startsWith("https://"))
      .slice(0, 6);
    return { text, sources };
  } catch (e) {
    console.warn("[gemini] 브리핑 생성 실패:", String((e as Error)?.message ?? e).slice(0, 200));
    return null;
  }
}
