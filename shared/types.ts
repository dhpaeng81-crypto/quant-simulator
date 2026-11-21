// 수집기(scripts/)와 화면(src/)이 함께 쓰는 데이터 형식.
// 수집기가 public/data/ 아래에 이 형식의 JSON을 쓰고, 화면은 그것만 읽습니다.

export type Market = "KOSPI" | "KOSDAQ";

/** 예측에 쓰는 입력 7개. 모두 한국 장이 열리기 전에 알 수 있는 값 */
export const FEATURE_KEYS = ["nasdaq", "sox", "fx", "oil", "foreign", "institution", "prevReturn"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, number>;

/** 하루치 원자료 */
export interface DailyRow {
  date: string; // YYYY-MM-DD (한국 거래일)
  close: number;
  volume: number;
  foreignNet: number | null; // 외국인 순매수 수량(주)
  institutionNet: number | null; // 기관 순매수 수량(주)
}

export interface Bar {
  date: string; // YYYY-MM-DD (해당 시장 현지 날짜)
  close: number;
}

/** 학습된 회귀 모델 (원 단위로 되돌린 계수) */
export interface FittedModel {
  intercept: number; // %
  coef: Features; // 입력 1단위당 기대 수익률(%p)
  mean: Features; // 학습 기간 평균 입력
  sd: Features; // 학습 기간 입력 표준편차
  sigma: number; // 잔차 표준편차 (%)
  n: number; // 학습 일수
  r2: number; // 학습 구간 설명력
  trainStart: string;
  trainEnd: string;
  lambda: number;
}

export interface ForecastResult {
  expectedReturn: number; // %
  pUp: number; // 0~1
  contributions: Features; // 평균적인 날 대비 각 입력이 더한 기대 수익률(%p)
}

export interface BacktestDay {
  date: string;
  actualReturn: number; // %
  expectedReturn: number; // %
  pUp: number;
  hit: boolean | null; // 보합이면 null
}

export interface BacktestSummary {
  days: BacktestDay[];
  evaluated: number;
  hits: number;
  hitRate: number | null; // %
  alwaysUpHitRate: number | null; // %
  pValue: number | null; // 적중률이 50%와 다르다고 볼 근거 (양측, 정규 근사)
  correlation: number | null; // 예측 기대수익률과 실제 수익률의 상관
  strategyReturn: number; // % 상승 확률 > 50%인 날만 보유
  holdReturn: number; // %
  trainWindow: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
}

export interface StockSummary {
  code: string;
  name: string;
  market: Market;
  rank: number; // 시가총액 순위(시장 내)
  marketValue: number; // 억 원
  close: number;
  changeRate: number; // %
  date: string;
  pUp: number | null; // 다음 거래일 상승 확률 (모델이 없으면 null)
  expectedReturn: number | null;
  hitRate: number | null; // 백테스트 적중률
}

export interface StockDetail {
  code: string;
  name: string;
  market: Market;
  history: DailyRow[]; // 최근 120거래일
  model: FittedModel | null;
  latestInputs: Features | null; // 다음 거래일 예측에 쓰는 실제 입력
  inputsAsOf: Record<FeatureKey, string | null> | null; // 각 입력의 기준 날짜
  forecast: ForecastResult | null;
  backtest: BacktestSummary | null;
  news: NewsItem[];
  notes: string[];
}

export interface MacroQuote {
  id: "kospi" | "kosdaq" | "nasdaq" | "sox" | "usdkrw" | "oil";
  name: string;
  value: number;
  changeRate: number;
  date: string;
}

export interface Briefing {
  facts: string[]; // 데이터로 만든 문장 (항상 있음)
  ai: { text: string[]; sources: { title: string; uri: string }[] } | null; // Gemini 요약 (키가 있을 때)
}

export interface IndexFile {
  generatedAt: string; // ISO
  nextTradingDayNote: string;
  macro: MacroQuote[];
  stocks: StockSummary[];
  briefing: Briefing;
  failures: string[]; // 수집에 실패한 종목 코드
}
