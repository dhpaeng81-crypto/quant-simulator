// Gemini: 예측 해설과 시황 브리핑 문장만 만듭니다. 예측 숫자는 절대 Gemini가 정하지 않습니다.

import { GoogleGenAI, Type } from "@google/genai";
import type { Commentary, Narrative, Prediction, Scenario, StockWithQuote } from "../../shared/types";
import { SECTOR_LABELS, SIGNAL_TEXT } from "../../shared/model";

const apiKey = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const geminiEnabled = () => ai !== null;

// 429(할당량 초과)를 받으면 15분 동안 호출하지 않음
let cooldownUntil = 0;
const COOLDOWN_MS = 15 * 60 * 1000;

function isQuotaError(err: unknown) {
  const msg = String((err as any)?.message ?? err);
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
}

function available() {
  return ai !== null && Date.now() >= cooldownUntil;
}

function handleError(err: unknown, where: string) {
  if (isQuotaError(err)) cooldownUntil = Date.now() + COOLDOWN_MS;
  console.warn(`[gemini:${where}]`, String((err as any)?.message ?? err).slice(0, 200));
}

/** 응답 텍스트에서 JSON 객체 부분만 꺼냄 (```json 블록이 섞여 와도 처리) */
export function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON not found");
  return JSON.parse(text.slice(start, end + 1));
}

const fmtSigned = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

export async function generateNarrative(
  stock: StockWithQuote,
  scenario: Scenario,
  prediction: Prediction,
): Promise<Narrative | null> {
  if (!available()) return null;
  const top = [...prediction.factors].sort((a, b) => b.share - a.share).slice(0, 3);
  const prompt = `당신은 한국 주식 시장을 설명하는 애널리스트입니다. 아래는 규칙 기반 점수 모델의 계산 결과입니다.
이 결과를 바꾸거나 새 숫자를 지어내지 말고, 왜 이런 점수가 나왔는지 쉬운 한국어로 설명하세요.
투자 권유 표현(매수하세요, 매도하세요 등)은 쓰지 마세요.

[종목] ${stock.name} (${stock.code}), 업종: ${SECTOR_LABELS[stock.sector]}
[현재가] ${stock.quote ? `${Math.round(stock.quote.price).toLocaleString("ko-KR")}원 (${fmtSigned(stock.quote.changeRate)}%)` : "시세 없음"}
[시나리오] 환율 ${scenario.usdKrw}원, 나스닥 ${fmtSigned(scenario.nasdaqChange)}%, 필라델피아 반도체 ${fmtSigned(scenario.semiconductorChange)}%, WTI ${scenario.oilPrice}달러, 외국인 수급 ${scenario.foreignFlow}(-5~+5), 뉴스 분위기 ${scenario.newsSentiment}(-100~+100)
[모델 결과] 점수 ${prediction.score}, ${SIGNAL_TEXT[prediction.signal]}, 신뢰도 지표 ${prediction.confidence}%
[영향이 큰 요인] ${top.map((f) => `${f.name}(기여 ${fmtSigned(f.contribution, 3)}, 비중 ${f.share}%)`).join(", ")}

JSON으로만 답하세요:
{"analysis": "3~4문장 설명", "risks": ["이 시나리오에서 주의할 점 1", "2", "3"]}`;

  try {
    const res = await ai!.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["analysis", "risks"],
        },
      },
    });
    const parsed = extractJson(res.text ?? "");
    if (typeof parsed.analysis !== "string" || !Array.isArray(parsed.risks)) return null;
    return { analysis: parsed.analysis, risks: parsed.risks.slice(0, 3).map(String), generatedBy: "gemini" };
  } catch (err) {
    handleError(err, "narrative");
    return null;
  }
}

export async function generateCommentary(marketContext: string): Promise<Commentary | null> {
  if (!available()) return null;
  const today = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "full" }).format(new Date());
  const prompt = `오늘은 ${today}(한국 시간)입니다. 웹 검색으로 직전 미국 증시 마감과 주요 경제 뉴스를 확인한 뒤,
한국 주식 투자자를 위한 아침 브리핑을 써 주세요. 확인하지 못한 사실은 쓰지 마세요. 투자 권유 표현은 피하세요.

[참고: 시스템이 수집한 지표]
${marketContext || "(수집 실패)"}

JSON으로만 답하세요:
{"usMarket": ["직전 미국 증시 변동 요인 3개, 각 120자 이내"], "macroNews": ["환율·유가·금리 등 주요 지표와 뉴스 3개, 각 120자 이내"], "strategy": "오늘 한국 시장에서 살펴볼 점 1~2문장"}`;

  const toCommentary = (parsed: any, sources: Commentary["sources"]): Commentary | null => {
    if (!Array.isArray(parsed?.usMarket) || !Array.isArray(parsed?.macroNews) || typeof parsed?.strategy !== "string") return null;
    return {
      usMarket: parsed.usMarket.slice(0, 3).map(String),
      macroNews: parsed.macroNews.slice(0, 3).map(String),
      strategy: parsed.strategy,
      sources,
      generatedAt: new Date().toISOString(),
    };
  };

  // 1단계: 구글 검색 연동(출처 포함)
  try {
    const res = await ai!.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks
      .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
      .filter((s) => s.uri)
      .slice(0, 6);
    const out = toCommentary(extractJson(res.text ?? ""), sources);
    if (out) return out;
  } catch (err) {
    handleError(err, "commentary-grounded");
    if (!available()) return null;
  }

  // 2단계: 검색 없이 지표만으로 (출처 없음 → 화면에서 '검색 없이 작성' 표시)
  try {
    const res = await ai!.models.generateContent({
      model: MODEL,
      contents: prompt.replace("웹 검색으로 직전 미국 증시 마감과 주요 경제 뉴스를 확인한 뒤,", "아래 지표만을 근거로,"),
      config: { responseMimeType: "application/json" },
    });
    return toCommentary(extractJson(res.text ?? ""), []);
  } catch (err) {
    handleError(err, "commentary-plain");
    return null;
  }
}
