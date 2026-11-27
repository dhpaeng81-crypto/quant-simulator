// 수집기(scripts/)와 화면(src/)이 함께 쓰는 데이터 형식.
// 수집기가 public/data/ 아래에 이 형식의 JSON을 쓰고, 화면은 그것만 읽습니다.

export type Market = "KOSPI" | "KOSDAQ";

/** 예측 입력 14개. 모두 한국 장이 열리기 전에 알 수 있는 값 */
export const FEATURE_KEYS = [
  // 밤사이 해외 시장
  "nasdaq",
  "sox",
  "ewy",
  "vix",
  "us10y",
  "dxy",
  "fx",
  "oil",
  "futLate", // 미국 장 후반 흐름: 00:00 → 06:00(장 마감 무렵) 나스닥 선물 변화
  "futPre", // 장 시작 직전: 미국 장 마감(06:00) → 08:00 나스닥 선물 변화
  // 수급
  "foreign",
  "institution",
  "foreign5",
  "institution5",
  // 종목 흐름
  "prevReturn",
  "ret5",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, number>;

/** 예측 대상: 종가→종가 수익률, 전일 종가→당일 시가(갭) */
export const TARGETS = ["close", "gap"] as const;
export type Target = (typeof TARGETS)[number];

/** 하루치 원자료 */
export interface DailyRow {
  date: string; // YYYY-MM-DD (한국 거래일)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  foreignNet: number | null; // 외국인 순매수 수량(주)
  institutionNet: number | null; // 기관 순매수 수량(주)
}

export interface Bar {
  date: string; // YYYY-MM-DD (해당 시장 현지 날짜)
  close: number;
}

/** 선형 모델 (원 단위 계수). 입력은 [lo, hi]로 잘라서 씀 */
export interface LinearModel {
  intercept: number; // %
  coef: Features; // 입력 1단위당 기대 수익률(%p)
  mean: Features; // 이 종목 학습 기간 평균 입력 (요인 기여의 기준점)
  sd: Features;
  lo: Features; // 입력 하한 (평균 − 3 표준편차)
  hi: Features; // 입력 상한
  sigma: number; // 잔차 표준편차 (%)
  n: number;
  r2: number;
  trainStart: string;
  trainEnd: string;
}

/** 확률 보정: p = 1 / (1 + exp(−(a·z + b))), z = 기대수익률 / σ */
export interface Calibration {
  a: number;
  b: number;
  n: number; // 보정에 쓴 예측 수
}

export interface ForecastResult {
  expectedReturn: number; // %
  pUp: number; // 보정한 상승 확률
  pRaw: number; // 보정 전 Φ(z)
  contributions: Features; // 평균적인 날 대비 각 입력이 더한 기대 수익률(%p)
  clipped: FeatureKey[]; // 평소 범위를 벗어나 잘라 쓴 입력
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
  strategyReturn: number; // % 상승 확률 ≥ 50%인 날만 보유
  holdReturn: number; // %
}

export interface TargetResult {
  model: LinearModel | null;
  forecast: ForecastResult | null;
  backtest: BacktestSummary | null;
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
  pUp: number | null; // 다음 거래일 종가 상승 확률
  expectedReturn: number | null;
  gapPUp: number | null; // 다음 거래일 시가 상승 출발 확률
  expectedGap: number | null;
  hitRate: number | null; // 종가 백테스트 적중률
  per: number | null;
  pbr: number | null;
  dividendYield: number | null;
}

/** 현재 투자 지표 (네이버 증권 기준, 수집 시점) */
export interface Valuation {
  per: number | null; // 배 (최근 4개 분기 이익 기준)
  cnsPer: number | null; // 배 (증권사 추정 이익 기준)
  pbr: number | null; // 배
  eps: number | null; // 원
  bps: number | null; // 원
  dividendYield: number | null; // %
  dps: number | null; // 주당배당금 (원)
  payoutRatio: number | null; // 배당성향 % (최근 결산 주당배당금 ÷ 주당순이익)
  roe: number | null; // % (최근 결산)
  debtRatio: number | null; // % (최근 결산)
  opMargin: number | null; // 영업이익률 % (최근 결산)
  high52: number | null;
  low52: number | null;
  foreignOwnership: number | null; // 외국인 소진율 %
  targetPrice: number | null; // 증권사 평균 목표주가 (원)
  targetDate: string | null; // 목표가 집계일
  fiscalYear: string | null; // 결산 지표의 기준 연도 (예: 2025.12)
}

/** 연간 실적 (억 원, %, 원, 배) */
export interface AnnualRow {
  period: string; // 2025.12
  estimate: boolean; // 증권사 추정치 여부
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  opMargin: number | null;
  roe: number | null;
  debtRatio: number | null;
  eps: number | null;
  per: number | null;
  bps: number | null;
  pbr: number | null;
  dps: number | null;
  payoutRatio: number | null;
}

export interface Fundamentals {
  valuation: Valuation;
  annual: AnnualRow[];
}

export interface StockDetail {
  code: string;
  name: string;
  market: Market;
  history: DailyRow[]; // 최근 120거래일
  latestInputs: Features | null; // 다음 거래일 예측에 쓰는 실제 입력
  inputsAsOf: Record<FeatureKey, string | null> | null; // 각 입력의 기준 날짜
  close: TargetResult;
  gap: TargetResult;
  news: NewsItem[];
  fundamentals: Fundamentals | null;
  notes: string[];
}

export interface MacroQuote {
  id: "kospi" | "kosdaq" | "nasdaq" | "sox" | "ewy" | "vix" | "us10y" | "dxy" | "usdkrw" | "oil";
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
  /** 이 전망이 대상으로 하는 거래일 (YYYY-MM-DD) */
  targetDate?: string;
  /** 만들 때 반영된 선물 신호 (%). 미국 장 마감 전이면 0 */
  futures?: { late: number | null; preOpen: number | null }; // null = 그 시간대 선물 거래 데이터 없음 (미국 휴장 등)
  model: { id: string; name: string };
  calibration: Record<Target, Calibration | null>;
  macro: MacroQuote[];
  stocks: StockSummary[];
  briefing: Briefing;
  failures: string[]; // 수집에 실패한 종목 코드
  rangeCheck?: import("./range").RangeCheck | null; // 예상 가격 범위의 과거 적중
}

/** 통합 평가 지표 (여러 종목·여러 날의 사후 예측을 합쳐서) */
export interface Metrics {
  n: number; // 평가한 예측 수
  hitRate: number; // %
  baseRate: number; // 실제 상승 비율 %
  correlation: number; // 기대수익률과 실제 수익률의 상관
  brier: number; // 확률 오차 (낮을수록 좋음)
  brierBase: number; // 항상 '기본 상승 비율'로 답했을 때
  brierSkill: number; // 1 − brier/brierBase (%). 0보다 커야 의미 있음
  topBottomSpread: number; // 매일 상승 확률 상위 20% − 하위 20% 종목의 평균 수익률 차 (%p)
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  meanP: number; // 그 구간 예측 확률 평균
  freq: number; // 실제 상승 비율
  n: number;
}

export interface ModelVariantResult {
  id: string;
  name: string;
  description: string;
  metrics: Record<Target, Metrics | null>;
  /** 기본 모델 대비 확률 오차 개선 (양수면 더 좋음)과 t값 */
  vsDefault: Record<Target, { brierDiff: number; t: number } | null>;
}

export interface EvaluationFile {
  generatedAt: string;
  testStart: string; // 보정 후 지표 구간
  testEnd: string;
  predictionsPerTarget: number;
  chosen: string;
  chosenReason: string;
  variants: ModelVariantResult[];
  calibrationBins: Record<Target, CalibrationBin[]>;
  /** 평가 기간 전체(약 1년)의 월별 방향 적중률. 확률 보정과 무관(보정은 방향을 바꾸지 않음) */
  monthly: Record<Target, Array<{ month: string; hitRate: number; n: number }>>;
  evalStart: string;
  /** '오늘 예상 가격 범위'가 과거(평가 뒤 절반)에 실제로 얼마나 맞았는지 */
  rangeCheck: import("./range").RangeCheck | null;
}
