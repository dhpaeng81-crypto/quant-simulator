// 예측 점수 공식 — 서버(백테스트)와 화면(실시간 시뮬레이션)이 이 파일 하나를 같이 씁니다.
//
// 주의: 아래 베타(민감도) 값은 데이터로 학습한 값이 아니라 업종 특성을 보고 사람이 정한 값입니다.
// 이 점수는 "시나리오가 이 종목에 유리한지 불리한지"를 보여 주는 지표이지, 검증된 확률이 아닙니다.

import type {
  FactorContribution,
  Prediction,
  Scenario,
  ScenarioReference,
  SectorKey,
  SignalLabel,
  TrajectoryPoint,
} from "./types";

export interface Betas {
  fx: number;
  nasdaq: number;
  foreign: number;
  semiconductor: number;
  sentiment: number;
  oil: number;
}

const DEFAULT_BETAS: Betas = { fx: -0.2, nasdaq: 0.35, foreign: 0.45, semiconductor: 0.05, sentiment: 0.3, oil: -0.1 };

export const SECTOR_BETAS: Record<SectorKey, Betas> = {
  // 반도체: 필라델피아 반도체·외국인·나스닥 민감, 환율 부담은 수출로 일부 상쇄
  semiconductor: { fx: -0.15, nasdaq: 0.4, foreign: 0.55, semiconductor: 0.75, sentiment: 0.3, oil: -0.1 },
  // 자동차: 고환율이면 수출 이익 증가, 유가는 비용 부담
  auto: { fx: 0.45, nasdaq: 0.2, foreign: 0.35, semiconductor: 0.05, sentiment: 0.3, oil: -0.25 },
  // 인터넷 플랫폼: 금리·환율 민감, 나스닥 동조
  platform: { fx: -0.55, nasdaq: 0.6, foreign: 0.3, semiconductor: -0.05, sentiment: 0.45, oil: -0.1 },
  // 이차전지·소재
  battery: { fx: -0.25, nasdaq: 0.3, foreign: 0.4, semiconductor: 0.15, sentiment: 0.5, oil: -0.15 },
  // 바이오: 달러 계약 비중, 심리 민감
  bio: { fx: 0.15, nasdaq: 0.3, foreign: 0.45, semiconductor: -0.1, sentiment: 0.5, oil: -0.1 },
  // 게임: 해외 매출 비중으로 환율 수혜
  game: { fx: 0.2, nasdaq: 0.4, foreign: 0.35, semiconductor: 0.0, sentiment: 0.45, oil: -0.05 },
  default: DEFAULT_BETAS,
};

export const SECTOR_LABELS: Record<SectorKey, string> = {
  semiconductor: "반도체",
  auto: "자동차",
  platform: "인터넷 플랫폼",
  battery: "이차전지·소재",
  bio: "바이오",
  game: "게임",
  default: "기타 업종",
};

/** 전일 등락률(모멘텀)의 가중치 */
export const MOMENTUM_BETA = 0.2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** 입력값을 대략 -5 ~ +5 범위로 맞춘다 */
export function normalizeInputs(s: Scenario, ref: ScenarioReference, prevDayChangeRate: number) {
  const fxPct = ref.usdKrw > 0 ? ((s.usdKrw - ref.usdKrw) / ref.usdKrw) * 100 : 0;
  const oilPct = ref.oilPrice > 0 ? ((s.oilPrice - ref.oilPrice) / ref.oilPrice) * 100 : 0;
  return {
    // 환율·유가는 '오른 정도'를 그대로 입력하고, 좋고 나쁨의 방향은 업종 베타의 부호가 정함
    // (원본은 입력도 뒤집고 베타에도 부호를 줘서 자동차·유가 효과가 반대로 계산되던 문제가 있었음)
    // 환율 1% 상승 → +0.9
    fx: clamp(fxPct * 0.9, -5, 5),
    nasdaq: clamp(s.nasdaqChange * 2, -5, 5),
    semiconductor: clamp(s.semiconductorChange * 2, -5, 5),
    // 유가 1% 상승 → +0.22
    oil: clamp(oilPct * 0.22, -5, 5),
    foreign: clamp(s.foreignFlow, -5, 5),
    sentiment: clamp(s.newsSentiment / 20, -5, 5),
    momentum: clamp(prevDayChangeRate, -5, 5),
  };
}

const FACTOR_NAMES: Record<FactorContribution["id"], string> = {
  foreign: "외국인 수급",
  nasdaq: "나스닥",
  semiconductor: "필라델피아 반도체",
  fx: "원/달러 환율",
  sentiment: "뉴스 분위기",
  oil: "국제 유가",
  momentum: "직전 거래일 흐름",
};

export function signalFor(direction: "UP" | "DOWN", confidence: number): SignalLabel {
  if (confidence < 55) return "NEUTRAL";
  if (direction === "UP") return confidence >= 75 ? "STRONG_UP" : "UP";
  return confidence >= 75 ? "STRONG_DOWN" : "DOWN";
}

export function predict(params: {
  sector: SectorKey;
  price: number;
  prevDayChangeRate: number;
  scenario: Scenario;
  reference: ScenarioReference;
}): Prediction {
  const b = SECTOR_BETAS[params.sector] ?? DEFAULT_BETAS;
  const n = normalizeInputs(params.scenario, params.reference, params.prevDayChangeRate);

  const raw: Array<[FactorContribution["id"], number, number]> = [
    ["foreign", b.foreign, n.foreign],
    ["nasdaq", b.nasdaq, n.nasdaq],
    ["semiconductor", b.semiconductor, n.semiconductor],
    ["fx", b.fx, n.fx],
    ["sentiment", b.sentiment, n.sentiment],
    ["oil", b.oil, n.oil],
    ["momentum", MOMENTUM_BETA, n.momentum],
  ];

  const contributions = raw.map(([id, beta, input]) => ({ id, beta, input, contribution: beta * input }));
  const score = contributions.reduce((sum, c) => sum + c.contribution, 0);
  const totalAbs = contributions.reduce((sum, c) => sum + Math.abs(c.contribution), 0);

  const factors: FactorContribution[] = contributions.map((c) => ({
    id: c.id,
    name: FACTOR_NAMES[c.id],
    beta: c.beta,
    input: round(c.input),
    contribution: round(c.contribution, 3),
    share: totalAbs > 0 ? round((Math.abs(c.contribution) / totalAbs) * 100, 1) : 0,
  }));

  // 기울기 0.5: 평범한 하루(나스닥 ±1%)가 곧바로 "강한 신호"로 표시되지 않도록 완만하게
  const pUp = 1 / (1 + Math.exp(-0.5 * score));
  const direction = score >= 0 ? "UP" : "DOWN";
  const confidence = Math.round(clamp(Math.max(pUp, 1 - pUp) * 100, 50, 90));

  return {
    score: round(score, 3),
    direction,
    pUp: round(pUp, 3),
    confidence,
    signal: signalFor(direction, confidence),
    factors,
    trajectory: extrapolate(params.price, score),
  };
}

/**
 * 점수를 5거래일로 단순 외삽한 '시나리오 경로'. 영향이 하루 15%씩 줄어든다고 가정.
 * 가격 예측이 아니라 점수의 크기를 가격 단위로 보여 주는 참고선.
 */
export function extrapolate(price: number, score: number): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  let p = price;
  for (let i = 0; i < 5; i++) {
    const daily = clamp(score * (1 - i * 0.15) * 0.5, -10, 10);
    p = p * (1 + daily / 100);
    points.push({
      day: `D+${i + 1}`,
      dailyChangeRate: round(daily),
      cumulativeChangeRate: round((p / price - 1) * 100),
      price: Math.round(p),
    });
  }
  return points;
}

/** 프리셋: 기준값(오늘 시세)에 더하는 변화량 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  apply: (base: Scenario) => Scenario;
}

export const PRESETS: Preset[] = [
  {
    id: "tech-rally",
    name: "기술주 강세",
    description: "나스닥·반도체 상승, 원화 강세, 외국인 순매수",
    apply: (s) => ({ ...s, nasdaqChange: 2, semiconductorChange: 2.5, usdKrw: s.usdKrw - 10, foreignFlow: 3, newsSentiment: 40 }),
  },
  {
    id: "fx-outflow",
    name: "고환율·외국인 매도",
    description: "환율 급등, 외국인 대량 순매도, 심리 악화",
    apply: (s) => ({ ...s, usdKrw: s.usdKrw + 30, foreignFlow: -4, nasdaqChange: -0.5, newsSentiment: -30 }),
  },
  {
    id: "chip-cycle",
    name: "반도체 호황",
    description: "반도체 지수 급등, 외국인 매수 집중",
    apply: (s) => ({ ...s, semiconductorChange: 4, nasdaqChange: 1.5, foreignFlow: 4, newsSentiment: 50 }),
  },
  {
    id: "cost-shock",
    name: "비용 충격",
    description: "유가·환율 동반 상승, 미국 증시 약세",
    apply: (s) => ({
      ...s,
      oilPrice: s.oilPrice + 12,
      usdKrw: s.usdKrw + 20,
      nasdaqChange: -1.5,
      semiconductorChange: -2,
      foreignFlow: -2,
      newsSentiment: -40,
    }),
  },
];

export const SIGNAL_TEXT: Record<SignalLabel, string> = {
  STRONG_UP: "강한 상승 신호",
  UP: "상승 신호",
  NEUTRAL: "뚜렷한 신호 없음",
  DOWN: "하락 신호",
  STRONG_DOWN: "강한 하락 신호",
};
