// 예측 모델. 수집기(학습·평가)와 화면(시나리오 재계산)이 이 파일을 같이 씁니다.
//
// - 선형 모델(릿지 회귀). 입력은 학습 기간 평균 ± 3 표준편차로 잘라 씀(극단값 과장 방지).
// - 패널 모델: 모든 종목을 합쳐 공통 계수를 구하고, 종목별 차이는 작게만 허용(수축).
// - 상승 확률: z = 기대수익률/σ 에 사후 평가로 맞춘 보정 곡선을 적용.

import type { Sample } from "./features";
import { correlation, mean, normalCdf, ridge, sd } from "./stats";
import {
  FEATURE_KEYS,
  type BacktestDay,
  type BacktestSummary,
  type Calibration,
  type CalibrationBin,
  type FeatureKey,
  type Features,
  type ForecastResult,
  type LinearModel,
  type Metrics,
  type Target,
} from "./types";

export const TRAIN_WINDOW = 250;
const DEFAULT_CLIP_SD = 3;

export const FEATURE_LABELS: Record<FeatureKey, { name: string; hint: string; unit: string }> = {
  nasdaq: { name: "나스닥", hint: "직전 미국 거래일 등락률", unit: "%" },
  sox: { name: "필라델피아 반도체", hint: "직전 미국 거래일 등락률", unit: "%" },
  ewy: { name: "EWY (미국 상장 한국 ETF)", hint: "우리 장이 닫힌 뒤 미국에서 거래된 한국 주식 바스켓", unit: "%" },
  vix: { name: "VIX (공포지수)", hint: "미국 변동성 지수 변화율", unit: "%" },
  us10y: { name: "미국 10년 금리", hint: "전일 대비 변화 (bp)", unit: "bp" },
  dxy: { name: "달러지수", hint: "전일 대비 변화율", unit: "%" },
  fx: { name: "원/달러 환율", hint: "전일 대비 변화율 (+는 원화 약세)", unit: "%" },
  oil: { name: "WTI 유가", hint: "전일 대비 변화율", unit: "%" },
  foreign: { name: "외국인 순매수 (1일)", hint: "전 거래일 순매수량 ÷ 20일 평균 거래량", unit: "%" },
  institution: { name: "기관 순매수 (1일)", hint: "전 거래일 순매수량 ÷ 20일 평균 거래량", unit: "%" },
  foreign5: { name: "외국인 순매수 (5일)", hint: "최근 5거래일 누적 ÷ 20일 평균 거래량", unit: "%" },
  institution5: { name: "기관 순매수 (5일)", hint: "최근 5거래일 누적 ÷ 20일 평균 거래량", unit: "%" },
  prevReturn: { name: "전 거래일 수익률", hint: "이 종목의 직전 거래일 등락률", unit: "%" },
  ret5: { name: "최근 5일 수익률", hint: "이 종목의 직전 5거래일 누적 등락률", unit: "%" },
};

export const FEATURE_GROUPS: Array<{ name: string; keys: FeatureKey[] }> = [
  { name: "밤사이 해외 시장", keys: ["nasdaq", "sox", "ewy", "vix", "us10y", "dxy", "fx", "oil"] },
  { name: "수급", keys: ["foreign", "institution", "foreign5", "institution5"] },
  { name: "종목 흐름", keys: ["prevReturn", "ret5"] },
];

/** 원래(1차) 모델의 입력 — 비교용 */
export const LEGACY_KEYS: FeatureKey[] = ["nasdaq", "sox", "fx", "oil", "foreign", "institution", "prevReturn"];

export interface FitOptions {
  keys?: readonly FeatureKey[]; // 사용할 입력 (없으면 전부)
  clip?: boolean; // 극단값 자르기
  clipSd?: number; // 자르는 기준 (표준편차 배수, 기본 3)
  lambdaRatio?: number; // λ = 비율 × 표본 수
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const zeros = (): Features => Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as Features;
const fill = (v: number): Features => Object.fromEntries(FEATURE_KEYS.map((k) => [k, v])) as Features;

interface XY {
  x: Features;
  y: number;
  date: string;
}

const withTarget = (samples: Sample[], target: Target): XY[] =>
  samples.flatMap((s) => (s.y[target] === null ? [] : [{ x: s.x, y: s.y[target] as number, date: s.date }]));

/** 입력 통계와 자르기 범위 */
function inputStats(rows: XY[], clip: boolean, clipSd = DEFAULT_CLIP_SD) {
  const m = zeros();
  const s = zeros();
  const lo = fill(-1e9);
  const hi = fill(1e9);
  for (const k of FEATURE_KEYS) {
    const col = rows.map((r) => r.x[k]);
    m[k] = mean(col);
    s[k] = sd(col);
    if (clip && s[k] > 0) {
      lo[k] = m[k] - clipSd * s[k];
      hi[k] = m[k] + clipSd * s[k];
    }
  }
  return { m, s, lo, hi };
}

export function clipInputs(x: Features, lo: Features, hi: Features): { x: Features; clipped: FeatureKey[] } {
  const out = { ...x };
  const clipped: FeatureKey[] = [];
  for (const k of FEATURE_KEYS) {
    if (x[k] < lo[k]) {
      out[k] = lo[k];
      clipped.push(k);
    } else if (x[k] > hi[k]) {
      out[k] = hi[k];
      clipped.push(k);
    }
  }
  return { x: out, clipped };
}

export function linearPredict(m: Pick<LinearModel, "intercept" | "coef" | "lo" | "hi">, x: Features): number {
  const c = clipInputs(x, m.lo, m.hi).x;
  let v = m.intercept;
  for (const k of FEATURE_KEYS) v += m.coef[k] * c[k];
  return v;
}

/** 릿지 회귀. offset이 있으면 offset(x)을 뺀 잔차를 학습해 더함(패널의 종목별 보정) */
function fitLinear(
  rows: XY[],
  opts: FitOptions,
  bounds?: { lo: Features; hi: Features },
  offset?: Pick<LinearModel, "intercept" | "coef" | "lo" | "hi">,
): LinearModel | null {
  const n = rows.length;
  if (n < 60) return null;
  const keys = opts.keys ?? FEATURE_KEYS;
  const stats = inputStats(rows, opts.clip ?? true, opts.clipSd);
  const lo = bounds?.lo ?? stats.lo;
  const hi = bounds?.hi ?? stats.hi;
  const X = rows.map((r) => {
    const c = clipInputs(r.x, lo, hi).x;
    return keys.map((k) => c[k]);
  });
  const base = rows.map((r) => (offset ? linearPredict(offset, r.x) : 0));
  const y = rows.map((r, i) => r.y - base[i]);
  const { beta, mu, sig, ym } = ridge(X, y, (opts.lambdaRatio ?? 0.1) * n);

  const coef = offset ? { ...offset.coef } : zeros();
  let intercept = (offset?.intercept ?? 0) + ym;
  keys.forEach((k, j) => {
    const c = sig[j] > 0 ? beta[j] / sig[j] : 0;
    coef[k] += c;
    intercept -= c * mu[j];
  });

  let sse = 0;
  let sst = 0;
  const yMean = mean(rows.map((r) => r.y));
  for (const r of rows) {
    sse += (r.y - linearPredict({ intercept, coef, lo, hi }, r.x)) ** 2;
    sst += (r.y - yMean) ** 2;
  }

  const round = (f: Features) => Object.fromEntries(FEATURE_KEYS.map((k) => [k, r4(f[k])])) as Features;
  return {
    intercept: r4(intercept),
    coef: Object.fromEntries(FEATURE_KEYS.map((k) => [k, Math.round(coef[k] * 1e6) / 1e6])) as Features,
    mean: round(stats.m),
    sd: round(stats.s),
    lo: round(lo),
    hi: round(hi),
    sigma: r4(Math.sqrt(sse / Math.max(1, n - keys.length - 1))),
    n,
    r2: r4(sst > 0 ? 1 - sse / sst : 0),
    trainStart: rows[0].date,
    trainEnd: rows[n - 1].date,
  };
}

/** 종목 하나만으로 학습 */
export function fitStock(samples: Sample[], target: Target, opts: FitOptions = {}): LinearModel | null {
  return fitLinear(withTarget(samples, target), opts);
}

/** 패널: 전체 종목으로 공통 모델 → 종목별로 강하게 수축한 보정 */
export function fitPanel(
  byStock: Map<string, Sample[]>,
  target: Target,
  opts: FitOptions & { stockLambdaRatio?: number } = {},
): { pool: LinearModel | null; stocks: Map<string, LinearModel> } {
  const all: XY[] = [];
  for (const s of byStock.values()) all.push(...withTarget(s, target));
  all.sort((a, b) => a.date.localeCompare(b.date));
  const pool = fitLinear(all, { ...opts, lambdaRatio: opts.lambdaRatio ?? 0.01 });
  const stocks = new Map<string, LinearModel>();
  if (!pool) return { pool, stocks };
  for (const [code, samples] of byStock) {
    const rows = withTarget(samples, target);
    const m = fitLinear(rows, { ...opts, lambdaRatio: opts.stockLambdaRatio ?? 1 }, { lo: pool.lo, hi: pool.hi }, pool);
    if (m) stocks.set(code, m);
  }
  return { pool, stocks };
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

export function probability(expected: number, sigma: number, cal: Calibration | null): { pUp: number; pRaw: number } {
  const z = sigma > 0 ? expected / sigma : 0;
  const pRaw = normalCdf(z);
  return { pRaw, pUp: cal ? sigmoid(cal.a * z + cal.b) : pRaw };
}

export function forecast(m: LinearModel, x: Features, cal: Calibration | null): ForecastResult {
  const { x: c, clipped } = clipInputs(x, m.lo, m.hi);
  let expected = m.intercept;
  const contributions = {} as Features;
  for (const k of FEATURE_KEYS) {
    expected += m.coef[k] * c[k];
    contributions[k] = r4(m.coef[k] * (c[k] - m.mean[k]));
  }
  const p = probability(expected, m.sigma, cal);
  return { expectedReturn: r4(expected), pUp: r4(p.pUp), pRaw: r4(p.pRaw), contributions, clipped };
}

/** 로지스틱 회귀로 a, b 추정 (뉴턴법). z 하나짜리라 금방 수렴 */
/** slopeOnly: 기울기 a만 추정하고 b = 0 (확신 정도만 바로잡고, 기간마다 달라지는 상승 비율 쏠림은 따라가지 않음) */
export function fitCalibration(points: Array<{ z: number; up: boolean }>, slopeOnly = true): Calibration | null {
  if (points.length < 200) return null;
  let a = 1.6;
  let b = 0;
  for (let it = 0; it < 50; it++) {
    let ga = 0;
    let gb = 0;
    let haa = 0;
    let hab = 0;
    let hbb = 0;
    for (const { z, up } of points) {
      const p = sigmoid(a * z + b);
      const e = (up ? 1 : 0) - p;
      const w = p * (1 - p);
      ga += e * z;
      gb += e;
      haa += w * z * z;
      hab += w * z;
      hbb += w;
    }
    haa += 1e-6;
    hbb += 1e-6;
    let da: number;
    let db = 0;
    if (slopeOnly) {
      da = ga / haa;
    } else {
      const det = haa * hbb - hab * hab;
      if (Math.abs(det) < 1e-12) break;
      da = (hbb * ga - hab * gb) / det;
      db = (haa * gb - hab * ga) / det;
    }
    a += da;
    b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a: r4(a), b: r4(b), n: points.length };
}

// ── 사후 평가(워크포워드) ──────────────────────────────────────────

export interface OosPrediction {
  code: string;
  date: string;
  expected: number;
  sigma: number;
  actual: number;
}

export type Variant = "legacy" | "base" | "extended" | "panel";
export const DEFAULT_VARIANT: Variant = "base";

export const VARIANTS: Array<{ id: Variant; name: string; description: string }> = [
  { id: "legacy", name: "1차 모델", description: "입력 7개, 종목별 학습, 극단값 자르기 없음" },
  { id: "base", name: "기본 모델", description: "입력 7개, 종목별 학습, 평소의 5배 표준편차를 넘는 극단값만 자름" },
  { id: "extended", name: "확장 모델", description: "입력 14개(EWY·VIX·금리·달러·5일 수급·5일 수익률 추가), 종목별 학습" },
  { id: "panel", name: "패널 모델", description: "입력 14개, 100종목 공통 학습 + 종목별 보정" },
];

const VARIANT_OPTS: Record<Variant, FitOptions & { panel?: boolean; stockLambdaRatio?: number }> = {
  legacy: { keys: LEGACY_KEYS, clip: false },
  base: { keys: LEGACY_KEYS, clipSd: 5 },
  extended: { clipSd: 5 },
  panel: { clipSd: 5, panel: true, stockLambdaRatio: 0.2 },
};

export function fitVariant(variant: Variant, byStock: Map<string, Sample[]>, target: Target): Map<string, LinearModel> {
  const opts = VARIANT_OPTS[variant];
  if (opts.panel) return fitPanel(byStock, target, opts).stocks;
  const out = new Map<string, LinearModel>();
  for (const [code, s] of byStock) {
    const m = fitStock(s, target, opts);
    if (m) out.set(code, m);
  }
  return out;
}

/**
 * B가 A보다 확률 오차(Brier)를 얼마나 줄였는지. 같은 날 종목들은 함께 움직이므로
 * 날짜별 평균 차이로 표준오차를 구합니다. t ≥ 2 정도는 돼야 우연이 아니라고 봅니다.
 */
export function pairedImprovement(a: OosPrediction[], calA: Calibration | null, b: OosPrediction[], calB: Calibration | null) {
  const daily = (ps: OosPrediction[], cal: Calibration | null) => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const p of ps) {
      if (p.actual === 0) continue;
      const q = probability(p.expected, p.sigma, cal).pUp;
      const e = m.get(p.date) ?? { sum: 0, n: 0 };
      e.sum += (q - (p.actual > 0 ? 1 : 0)) ** 2;
      e.n++;
      m.set(p.date, e);
    }
    return new Map([...m].map(([d, v]) => [d, v.sum / v.n]));
  };
  const da = daily(a, calA);
  const db = daily(b, calB);
  const diffs = [...da].filter(([d]) => db.has(d)).map(([d, v]) => v - db.get(d)!);
  if (diffs.length < 20) return null;
  const mu = mean(diffs);
  const se = sd(diffs) / Math.sqrt(diffs.length);
  return { brierDiff: Math.round(mu * 1e6) / 1e6, t: se > 0 ? Math.round((mu / se) * 100) / 100 : 0 };
}

/**
 * 마지막 testDays 거래일을, refitEvery일마다 '그 전 window거래일'만으로 다시 학습해 예측.
 * 어떤 예측도 그 날짜 이후의 표본을 보지 않습니다.
 */
export type FitFn = (train: Map<string, Sample[]>, target: Target) => Map<string, LinearModel>;

export function walkForward(
  byStock: Map<string, Sample[]>,
  target: Target,
  variant: Variant | FitFn,
  testDays: number,
  refitEvery = 5,
  window = TRAIN_WINDOW,
): OosPrediction[] {
  const dates = [...new Set([...byStock.values()].flatMap((s) => s.map((x) => x.date)))].sort();
  const start = Math.max(window, dates.length - testDays);
  const out: OosPrediction[] = [];
  for (let b = start; b < dates.length; b += refitEvery) {
    const trainFrom = dates[Math.max(0, b - window)];
    const blockStart = dates[b];
    const blockEnd = dates[Math.min(dates.length - 1, b + refitEvery - 1)];
    const train = new Map<string, Sample[]>();
    for (const [code, s] of byStock) train.set(code, s.filter((x) => x.date >= trainFrom && x.date < blockStart));
    const models = typeof variant === "function" ? variant(train, target) : fitVariant(variant, train, target);
    for (const [code, s] of byStock) {
      const m = models.get(code);
      if (!m) continue;
      for (const x of s) {
        if (x.date < blockStart || x.date > blockEnd) continue;
        const actual = x.y[target];
        if (actual === null) continue;
        out.push({ code, date: x.date, expected: linearPredict(m, x.x), sigma: m.sigma, actual });
      }
    }
  }
  return out;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function metrics(preds: OosPrediction[], cal: Calibration | null): Metrics | null {
  const rows = preds.filter((p) => p.actual !== 0);
  if (rows.length < 50) return null;
  const ps = rows.map((p) => probability(p.expected, p.sigma, cal).pUp);
  const ups = rows.map((p) => p.actual > 0);
  const base = ups.filter(Boolean).length / rows.length;
  let hits = 0;
  let brier = 0;
  let brierBase = 0;
  rows.forEach((_, i) => {
    if (ps[i] >= 0.5 === ups[i]) hits++;
    brier += (ps[i] - (ups[i] ? 1 : 0)) ** 2;
    brierBase += (base - (ups[i] ? 1 : 0)) ** 2;
  });
  brier /= rows.length;
  brierBase /= rows.length;

  // 날짜별로 상승 확률 상위 20% − 하위 20% 평균 수익률
  const byDate = new Map<string, OosPrediction[]>();
  for (const p of preds) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  const spreads: number[] = [];
  for (const day of byDate.values()) {
    if (day.length < 10) continue;
    const s = [...day].sort((a, b) => b.expected / b.sigma - a.expected / a.sigma);
    const q = Math.floor(s.length / 5);
    spreads.push(mean(s.slice(0, q).map((p) => p.actual)) - mean(s.slice(-q).map((p) => p.actual)));
  }

  return {
    n: rows.length,
    hitRate: round((hits / rows.length) * 100, 1),
    baseRate: round(base * 100, 1),
    correlation: round(correlation(rows.map((p) => p.expected), rows.map((p) => p.actual)) ?? 0, 3),
    brier: round(brier, 4),
    brierBase: round(brierBase, 4),
    brierSkill: round((1 - brier / brierBase) * 100, 2),
    topBottomSpread: round(mean(spreads), 3),
  };
}

export function calibrationBins(preds: OosPrediction[], cal: Calibration | null, edges = [0, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.0001]): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = preds
      .filter((p) => p.actual !== 0)
      .map((p) => ({ p: probability(p.expected, p.sigma, cal).pUp, up: p.actual > 0 }))
      .filter((v) => v.p >= edges[i] && v.p < edges[i + 1]);
    if (inBin.length === 0) continue;
    bins.push({
      lo: edges[i],
      hi: Math.min(1, edges[i + 1]),
      meanP: round(mean(inBin.map((v) => v.p)), 3),
      freq: round(inBin.filter((v) => v.up).length / inBin.length, 3),
      n: inBin.length,
    });
  }
  return bins;
}

/** 한 종목의 최근 사후 예측 → 화면용 요약 */
export function summarizeBacktest(preds: OosPrediction[], cal: Calibration | null): BacktestSummary | null {
  if (preds.length === 0) return null;
  const days: BacktestDay[] = preds.map((p) => {
    const pUp = probability(p.expected, p.sigma, cal).pUp;
    return {
      date: p.date,
      actualReturn: round(p.actual),
      expectedReturn: round(p.expected, 3),
      pUp: round(pUp, 3),
      hit: p.actual === 0 ? null : pUp >= 0.5 === p.actual > 0,
    };
  });
  const evaluated = days.filter((d) => d.hit !== null);
  const n = evaluated.length;
  const hits = evaluated.filter((d) => d.hit).length;
  const ups = evaluated.filter((d) => d.actualReturn > 0).length;
  let pValue: number | null = null;
  if (n >= 10) pValue = round(2 * (1 - normalCdf(Math.abs((hits - n / 2) / Math.sqrt(n / 4)))), 3);
  let hold = 1;
  let strat = 1;
  for (const d of days) {
    hold *= 1 + d.actualReturn / 100;
    if (d.pUp >= 0.5) strat *= 1 + d.actualReturn / 100;
  }
  const corr = correlation(days.map((d) => d.expectedReturn), days.map((d) => d.actualReturn));
  return {
    days,
    evaluated: n,
    hits,
    hitRate: n ? round((hits / n) * 100, 1) : null,
    alwaysUpHitRate: n ? round((ups / n) * 100, 1) : null,
    pValue,
    correlation: corr === null ? null : round(corr, 3),
    strategyReturn: round((strat - 1) * 100),
    holdReturn: round((hold - 1) * 100),
  };
}

/** 시나리오 프리셋: 실제 입력값 중 일부를 바꿈 */
export const PRESETS: Array<{ id: string; name: string; description: string; apply: (x: Features) => Features }> = [
  {
    id: "tech-rally",
    name: "미국 기술주 강세",
    description: "나스닥 +2%, 반도체 +3%, EWY +2%, VIX −8%",
    apply: (x) => ({ ...x, nasdaq: 2, sox: 3, ewy: 2, vix: -8, fx: -0.5 }),
  },
  {
    id: "risk-off",
    name: "위험 회피",
    description: "나스닥 −2.5%, EWY −3%, VIX +20%, 달러 강세",
    apply: (x) => ({ ...x, nasdaq: -2.5, sox: -4, ewy: -3, vix: 20, dxy: 0.6, fx: 1 }),
  },
  {
    id: "foreign-buy",
    name: "외국인 대량 매수",
    description: "전일 외국인 순매수가 평소 거래량의 10%",
    apply: (x) => ({ ...x, foreign: 10, foreign5: Math.max(x.foreign5, 20) }),
  },
  {
    id: "rate-shock",
    name: "금리 급등",
    description: "미국 10년 금리 +15bp, 나스닥 −1.5%",
    apply: (x) => ({ ...x, us10y: 15, nasdaq: -1.5, dxy: 0.5 }),
  },
];

/** 월별 방향 적중률 (기대수익률 부호 기준, 보합 제외) */
export function monthlyHitRates(preds: OosPrediction[]): Array<{ month: string; hitRate: number; n: number }> {
  const m = new Map<string, { hits: number; n: number }>();
  for (const p of preds) {
    if (p.actual === 0) continue;
    const key = p.date.slice(0, 7);
    const e = m.get(key) ?? { hits: 0, n: 0 };
    e.n++;
    if (p.expected >= 0 === p.actual > 0) e.hits++;
    m.set(key, e);
  }
  return [...m]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({ month, hitRate: Math.round((e.hits / e.n) * 1000) / 10, n: e.n }));
}
