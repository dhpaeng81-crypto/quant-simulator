// 종목별 다음 거래일 수익률 모델.
//
// - 입력 7개: 직전 미국 거래일의 나스닥·필라델피아 반도체 등락률, 원/달러·WTI 등락률,
//   전 거래일 외국인·기관 순매수(20일 평균 거래량 대비 %), 전 거래일 수익률
// - 각 종목마다 최근 1년(250거래일)으로 릿지 회귀를 학습합니다.
// - 상승 확률 = Φ(기대수익률 / 잔차 표준편차). 하루 주가는 대부분 잡음이라 50% 근처가 정상입니다.
// - 이 파일은 수집기(학습·백테스트)와 화면(시나리오 계산)이 같이 씁니다.

import { correlation, normalCdf, ridge } from "./stats";
import {
  FEATURE_KEYS,
  type Bar,
  type BacktestDay,
  type BacktestSummary,
  type DailyRow,
  type FeatureKey,
  type Features,
  type FittedModel,
  type ForecastResult,
} from "./types";

export const TRAIN_WINDOW = 250;
export const BACKTEST_DAYS = 60;
export const LAMBDA_RATIO = 0.1; // λ = 0.1 × 학습 일수 (표준화 공간)
const VOLUME_WINDOW = 20;
const MAX_DAILY_MOVE = 31; // 가격제한폭(30%)을 넘는 변동 = 액면분할 등 → 학습에서 제외

export const FEATURE_LABELS: Record<FeatureKey, { name: string; hint: string }> = {
  nasdaq: { name: "나스닥", hint: "직전 미국 거래일 등락률" },
  sox: { name: "필라델피아 반도체", hint: "직전 미국 거래일 등락률" },
  fx: { name: "원/달러 환율", hint: "전일 대비 변화율 (+는 원화 약세)" },
  oil: { name: "WTI 유가", hint: "전일 대비 변화율" },
  foreign: { name: "외국인 순매수", hint: "전 거래일 순매수량 ÷ 20일 평균 거래량" },
  institution: { name: "기관 순매수", hint: "전 거래일 순매수량 ÷ 20일 평균 거래량" },
  prevReturn: { name: "전 거래일 수익률", hint: "이 종목의 직전 거래일 등락률" },
};

export interface MacroSeries {
  nasdaq: Bar[];
  sox: Bar[];
  fx: Bar[];
  oil: Bar[];
}

export interface Sample {
  date: string;
  x: Features;
  y: number; // 그날 수익률 %
}

const pct = (a: number, b: number) => (b !== 0 ? (a / b - 1) * 100 : 0);
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/** date보다 앞선 마지막 봉의 등락률과 그 봉의 날짜. series는 날짜 오름차순 */
export function changeBefore(series: Bar[], date: string): { change: number; date: string } | null {
  let lo = 0;
  let hi = series.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date < date) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 1) return null;
  return { change: pct(series[idx].close, series[idx - 1].close), date: series[idx].date };
}

const sortBars = (s: Bar[]) => [...s].sort((a, b) => a.date.localeCompare(b.date));

/** rows[i]를 예측할 때 쓸 입력 (i === rows.length 이면 다음 거래일). 값이 모자라면 null */
function featuresAt(rows: DailyRow[], i: number, macro: MacroSeries, date: string) {
  if (i < VOLUME_WINDOW + 1) return null;
  const prev = rows[i - 1];
  const prev2 = rows[i - 2];
  if (prev.foreignNet === null || prev.institutionNet === null) return null;
  let vol = 0;
  for (let k = i - VOLUME_WINDOW; k < i; k++) vol += rows[k].volume;
  vol /= VOLUME_WINDOW;
  if (vol <= 0) return null;

  const nq = changeBefore(macro.nasdaq, date);
  const sx = changeBefore(macro.sox, date);
  const fx = changeBefore(macro.fx, date);
  const ol = changeBefore(macro.oil, date);
  if (!nq || !sx || !fx || !ol) return null;

  const prevReturn = pct(prev.close, prev2.close);
  const x: Features = {
    nasdaq: nq.change,
    sox: sx.change,
    fx: fx.change,
    oil: ol.change,
    foreign: (prev.foreignNet / vol) * 100,
    institution: (prev.institutionNet / vol) * 100,
    prevReturn,
  };
  const asOf: Record<FeatureKey, string> = {
    nasdaq: nq.date,
    sox: sx.date,
    fx: fx.date,
    oil: ol.date,
    foreign: prev.date,
    institution: prev.date,
    prevReturn: prev.date,
  };
  return { x, asOf, suspicious: Math.abs(prevReturn) > MAX_DAILY_MOVE };
}

/** 원자료 → 학습용 표본 + 다음 거래일 입력 */
export function buildDataset(rowsIn: DailyRow[], macroIn: MacroSeries) {
  const rows = [...rowsIn].sort((a, b) => a.date.localeCompare(b.date));
  const macro: MacroSeries = {
    nasdaq: sortBars(macroIn.nasdaq),
    sox: sortBars(macroIn.sox),
    fx: sortBars(macroIn.fx),
    oil: sortBars(macroIn.oil),
  };
  const samples: Sample[] = [];
  for (let i = 2; i < rows.length; i++) {
    const f = featuresAt(rows, i, macro, rows[i].date);
    if (!f || f.suspicious) continue;
    const y = pct(rows[i].close, rows[i - 1].close);
    if (Math.abs(y) > MAX_DAILY_MOVE) continue;
    samples.push({ date: rows[i].date, x: f.x, y });
  }
  // 다음 거래일: 지금까지 나온 값을 모두 사용
  const next = rows.length > 2 ? featuresAt(rows, rows.length, macro, "9999-12-31") : null;
  return {
    samples,
    latestInputs: next && !next.suspicious ? next.x : null,
    inputsAsOf: next ? next.asOf : null,
  };
}

const toVec = (f: Features) => FEATURE_KEYS.map((k) => f[k]);
const fromVec = (v: number[]): Features => Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, v[i]])) as Features;

export function fitModel(samples: Sample[], lambdaRatio = LAMBDA_RATIO): FittedModel | null {
  const n = samples.length;
  if (n < 60) return null;
  const X = samples.map((s) => toVec(s.x));
  const y = samples.map((s) => s.y);
  const lambda = lambdaRatio * n;
  const { beta, mu, sig, ym } = ridge(X, y, lambda);

  const coef = beta.map((b, j) => (sig[j] > 0 ? b / sig[j] : 0));
  const intercept = ym - coef.reduce((a, c, j) => a + c * mu[j], 0);

  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + coef.reduce((a, c, j) => a + c * X[i][j], 0);
    sse += (y[i] - pred) ** 2;
    sst += (y[i] - ym) ** 2;
  }
  const sigma = Math.sqrt(sse / Math.max(1, n - FEATURE_KEYS.length - 1));

  return {
    intercept: round(intercept),
    coef: fromVec(coef.map((c) => round(c, 5))),
    mean: fromVec(mu.map((m) => round(m))),
    sd: fromVec(sig.map((s) => round(s))),
    sigma: round(sigma),
    n,
    r2: round(sst > 0 ? 1 - sse / sst : 0),
    trainStart: samples[0].date,
    trainEnd: samples[n - 1].date,
    lambda: round(lambda, 2),
  };
}

export function forecast(model: FittedModel, x: Features): ForecastResult {
  let expected = model.intercept;
  const contributions = {} as Features;
  for (const k of FEATURE_KEYS) {
    expected += model.coef[k] * x[k];
    // 평균적인 날과 비교해 이 입력이 더한 몫
    contributions[k] = round(model.coef[k] * (x[k] - model.mean[k]));
  }
  const pUp = model.sigma > 0 ? normalCdf(expected / model.sigma) : 0.5;
  return { expectedReturn: round(expected), pUp: round(pUp), contributions };
}

/** 워크포워드 백테스트: 매일 '그 전 250일'로만 학습해서 그날을 예측 */
export function walkForward(samples: Sample[], testDays = BACKTEST_DAYS, window = TRAIN_WINDOW): BacktestSummary | null {
  const start = Math.max(60, samples.length - testDays);
  const days: BacktestDay[] = [];
  for (let i = start; i < samples.length; i++) {
    const model = fitModel(samples.slice(Math.max(0, i - window), i));
    if (!model) continue;
    const f = forecast(model, samples[i].x);
    const actual = samples[i].y;
    days.push({
      date: samples[i].date,
      actualReturn: round(actual, 2),
      expectedReturn: round(f.expectedReturn, 3),
      pUp: round(f.pUp, 3),
      hit: actual === 0 ? null : f.pUp >= 0.5 === actual > 0,
    });
  }
  if (days.length === 0) return null;

  const evaluated = days.filter((d) => d.hit !== null);
  const hits = evaluated.filter((d) => d.hit).length;
  const ups = evaluated.filter((d) => d.actualReturn > 0).length;
  const n = evaluated.length;

  // 적중률이 50%와 다른지: 정규 근사 양측 p값
  let pValue: number | null = null;
  if (n >= 10) {
    const z = (hits - n / 2) / Math.sqrt(n / 4);
    pValue = round(2 * (1 - normalCdf(Math.abs(z))), 3);
  }

  let hold = 1;
  let strat = 1;
  for (const d of days) {
    hold *= 1 + d.actualReturn / 100;
    if (d.pUp >= 0.5) strat *= 1 + d.actualReturn / 100;
  }

  const corr = correlation(
    days.map((d) => d.expectedReturn),
    days.map((d) => d.actualReturn),
  );

  return {
    days,
    evaluated: n,
    hits,
    hitRate: n ? round((hits / n) * 100, 1) : null,
    alwaysUpHitRate: n ? round((ups / n) * 100, 1) : null,
    pValue,
    correlation: corr === null ? null : round(corr, 3),
    strategyReturn: round((strat - 1) * 100, 2),
    holdReturn: round((hold - 1) * 100, 2),
    trainWindow: window,
  };
}

/** 시나리오 프리셋: 실제 입력값 중 일부를 바꿈 */
export const PRESETS: Array<{ id: string; name: string; description: string; apply: (x: Features) => Features }> = [
  {
    id: "tech-rally",
    name: "미국 기술주 강세",
    description: "나스닥 +2%, 반도체 +3%, 원화 강세",
    apply: (x) => ({ ...x, nasdaq: 2, sox: 3, fx: -0.5 }),
  },
  {
    id: "risk-off",
    name: "위험 회피",
    description: "나스닥 −2.5%, 반도체 −4%, 환율 +1%",
    apply: (x) => ({ ...x, nasdaq: -2.5, sox: -4, fx: 1 }),
  },
  {
    id: "foreign-buy",
    name: "외국인 대량 매수",
    description: "전일 외국인 순매수가 평소 거래량의 10%",
    apply: (x) => ({ ...x, foreign: 10 }),
  },
  {
    id: "oil-shock",
    name: "유가 급등",
    description: "WTI +6%, 환율 +0.8%",
    apply: (x) => ({ ...x, oil: 6, fx: 0.8 }),
  },
];
