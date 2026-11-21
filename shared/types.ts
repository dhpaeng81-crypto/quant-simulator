// 서버와 화면이 함께 쓰는 타입 정의

export type Direction = "UP" | "DOWN";
export type Market = "KOSPI" | "KOSDAQ";
export type SectorKey = "semiconductor" | "auto" | "platform" | "battery" | "bio" | "game" | "default";

/** 시나리오 입력값 6개 */
export interface Scenario {
  usdKrw: number; // 원/달러 환율 (원)
  nasdaqChange: number; // 나스닥 전일 대비 등락률 (%)
  semiconductorChange: number; // 필라델피아 반도체 지수 등락률 (%)
  oilPrice: number; // WTI 유가 (달러)
  foreignFlow: number; // 외국인 수급 강도 -5(강한 순매도) ~ +5(강한 순매수), 사용자 입력
  newsSentiment: number; // 뉴스 분위기 -100 ~ +100, 사용자 입력
}

/** 환율·유가는 '기준값' 대비 변화로 점수를 낸다. 기준값 = 전일 종가 */
export interface ScenarioReference {
  usdKrw: number;
  oilPrice: number;
}

export interface Stock {
  code: string; // 6자리 종목코드
  name: string;
  market: Market;
  sector: SectorKey;
}

export interface Quote {
  price: number;
  previousClose: number;
  change: number;
  changeRate: number; // %
  volume: number | null;
  asOf: string | null; // ISO 시각
}

export interface StockWithQuote extends Stock {
  quote: Quote | null; // null = 시세를 가져오지 못함
}

export interface MacroValue {
  id: "nasdaq" | "sox" | "usdkrw" | "oil";
  name: string;
  unit: string;
  value: number | null;
  previousClose: number | null;
  changeRate: number | null;
  asOf: string | null;
}

export type SignalLabel = "STRONG_UP" | "UP" | "NEUTRAL" | "DOWN" | "STRONG_DOWN";

export interface FactorContribution {
  id: "foreign" | "nasdaq" | "semiconductor" | "fx" | "sentiment" | "oil" | "momentum";
  name: string;
  beta: number;
  input: number; // 정규화된 입력값 (-5 ~ +5)
  contribution: number; // beta × input
  share: number; // 점수에서 차지하는 절대 비중 % (합계 100)
}

export interface TrajectoryPoint {
  day: string; // D+1 ...
  dailyChangeRate: number;
  cumulativeChangeRate: number;
  price: number;
}

export interface Prediction {
  score: number;
  direction: Direction;
  pUp: number; // 0~1, 점수를 시그모이드로 바꾼 값 (보정된 확률 아님)
  confidence: number; // 50~90 (%)
  signal: SignalLabel;
  factors: FactorContribution[];
  trajectory: TrajectoryPoint[];
}

export interface BacktestRecord {
  date: string; // 한국 거래일 YYYY-MM-DD
  close: number;
  changeRate: number;
  predicted: Direction;
  actual: Direction | "FLAT";
  correct: boolean | null; // FLAT이면 null (평가 제외)
  score: number;
  inputs: {
    nasdaqChange: number | null;
    semiconductorChange: number | null;
    usdKrwChangeRate: number | null;
    oilChangeRate: number | null;
    prevDayChangeRate: number;
  };
}

export interface BacktestResult {
  code: string;
  name: string;
  records: BacktestRecord[];
  evaluatedDays: number;
  correctDays: number;
  accuracy: number | null; // %
  alwaysUpAccuracy: number | null; // 비교 기준: 매일 '상승'이라고만 했을 때 적중률
  strategyReturn: number; // %
  holdReturn: number; // %
  notes: string[];
}

export interface NewsItem {
  title: string;
  link: string;
  source: string | null;
  publishedAt: string | null;
}

export interface Commentary {
  usMarket: string[];
  macroNews: string[];
  strategy: string;
  sources: { title: string; uri: string }[];
  generatedAt: string;
}

export interface Narrative {
  analysis: string;
  risks: string[];
  generatedBy: "gemini" | "rules";
}
