// 원자료 → 학습 표본. 거래일 t의 입력에는 t 장이 열리기 '전에' 알 수 있는 값만 씁니다.

import type { Bar, DailyRow, FeatureKey, Features, Target } from "./types";

export interface MacroSeries {
  nasdaq: Bar[];
  sox: Bar[];
  ewy: Bar[];
  vix: Bar[];
  us10y: Bar[]; // 금리(%) → 변화는 bp로
  dxy: Bar[];
  fx: Bar[];
  oil: Bar[];
}
export const MACRO_KEYS = ["nasdaq", "sox", "ewy", "vix", "us10y", "dxy", "fx", "oil"] as const satisfies readonly FeatureKey[];

export interface Sample {
  date: string;
  x: Features;
  y: Record<Target, number | null>; // 그날 종가 수익률, 시가 갭 (%)
}

const VOLUME_WINDOW = 20;
const MAX_DAILY_MOVE = 31; // 가격제한폭(30%) 초과 = 액면분할 등 → 제외
const pct = (a: number, b: number) => (b !== 0 ? (a / b - 1) * 100 : 0);

/** date보다 앞선 마지막 봉과 그 직전 봉의 변화. us10y는 bp 차이, 나머지는 % */
export function changeBefore(series: Bar[], date: string, kind: "pct" | "bp" = "pct"): { change: number; date: string } | null {
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
  const cur = series[idx].close;
  const prev = series[idx - 1].close;
  return { change: kind === "bp" ? (cur - prev) * 100 : pct(cur, prev), date: series[idx].date };
}

const sortBars = (s: Bar[]) => [...s].sort((a, b) => a.date.localeCompare(b.date));

export function sortMacro(m: MacroSeries): MacroSeries {
  return Object.fromEntries(MACRO_KEYS.map((k) => [k, sortBars(m[k])])) as unknown as MacroSeries;
}

/** rows[i]를 예측할 입력 (i === rows.length → 다음 거래일). 값이 모자라면 null */
function featuresAt(rows: DailyRow[], i: number, macro: MacroSeries, date: string) {
  if (i < VOLUME_WINDOW + 1 || i < 7) return null;
  let vol = 0;
  for (let k = i - VOLUME_WINDOW; k < i; k++) vol += rows[k].volume;
  vol /= VOLUME_WINDOW;
  if (vol <= 0) return null;

  let f1 = 0;
  let i1 = 0;
  let f5 = 0;
  let i5 = 0;
  for (let k = i - 5; k < i; k++) {
    const r = rows[k];
    if (r.foreignNet === null || r.institutionNet === null) return null;
    f5 += r.foreignNet;
    i5 += r.institutionNet;
    if (k === i - 1) {
      f1 = r.foreignNet;
      i1 = r.institutionNet;
    }
  }

  const x = {} as Features;
  const asOf = {} as Record<FeatureKey, string>;
  for (const k of MACRO_KEYS) {
    const c = changeBefore(macro[k], date, k === "us10y" ? "bp" : "pct");
    if (!c) return null;
    x[k] = c.change;
    asOf[k] = c.date;
  }
  const prev = rows[i - 1];
  x.foreign = (f1 / vol) * 100;
  x.institution = (i1 / vol) * 100;
  x.foreign5 = (f5 / vol) * 100;
  x.institution5 = (i5 / vol) * 100;
  x.prevReturn = pct(prev.close, rows[i - 2].close);
  x.ret5 = pct(prev.close, rows[i - 6].close);
  for (const k of ["foreign", "institution", "foreign5", "institution5", "prevReturn", "ret5"] as const) asOf[k] = prev.date;

  // 최근 6일 안에 분할 같은 비정상 변동이 있으면 입력을 믿을 수 없음
  let suspicious = false;
  for (let k = i - 6; k < i; k++) if (Math.abs(pct(rows[k].close, rows[k - 1].close)) > MAX_DAILY_MOVE) suspicious = true;
  return { x, asOf, suspicious };
}

/** 한 종목의 원자료 → 표본 + 다음 거래일 입력 */
export function buildSamples(rowsIn: DailyRow[], macro: MacroSeries) {
  const rows = [...rowsIn].sort((a, b) => a.date.localeCompare(b.date));
  const samples: Sample[] = [];
  for (let i = 7; i < rows.length; i++) {
    const f = featuresAt(rows, i, macro, rows[i].date);
    if (!f || f.suspicious) continue;
    const prevClose = rows[i - 1].close;
    const close = pct(rows[i].close, prevClose);
    if (Math.abs(close) > MAX_DAILY_MOVE) continue;
    const gap = rows[i].open > 0 ? pct(rows[i].open, prevClose) : null;
    samples.push({ date: rows[i].date, x: f.x, y: { close, gap: gap !== null && Math.abs(gap) <= MAX_DAILY_MOVE ? gap : null } });
  }
  const next = rows.length > 7 ? featuresAt(rows, rows.length, macro, "9999-12-31") : null;
  return {
    samples,
    latestInputs: next && !next.suspicious ? next.x : null,
    inputsAsOf: next ? next.asOf : null,
  };
}
