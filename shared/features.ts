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
  /** 나스닥 선물 1시간봉: t = 봉이 끝난 시각(UTC ms), c = 종가. 없으면 장전 신호는 0 */
  futHourly?: Array<{ t: number; c: number }>;
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
  const out = Object.fromEntries(MACRO_KEYS.map((k) => [k, sortBars(m[k])])) as unknown as MacroSeries;
  out.futHourly = [...(m.futHourly ?? [])].sort((a, b) => a.t - b.t);
  return out;
}

const HOUR = 3600_000;
/** 한국 날짜 dateKst의 KST hh시를 UTC ms로 */
const kstTime = (dateKst: string, hh: number) => Date.parse(`${dateKst}T00:00:00Z`) + (hh - 9) * HOUR;

/** t 이하에서 끝난 마지막 봉 */
function lastAt(series: Array<{ t: number; c: number }>, t: number) {
  let lo = 0;
  let hi = series.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return idx >= 0 ? series[idx] : null;
}

/**
 * 장 시작 직전 신호: 한국 거래일 dateKst의 06:00(미국 장 마감 무렵) → 08:00 KST 나스닥 선물 변화(%).
 * nowMs보다 뒤의 값은 쓰지 않음(실시간 계산 시). 정보가 없으면 0.
 */
export function preOpenMove(series: Array<{ t: number; c: number }> | undefined, dateKst: string, nowMs = Infinity): number {
  return futuresMove(series, dateKst, 6, 8, nowMs);
}

/** 미국 장 후반 흐름: 한국 거래일 dateKst의 00:00 → 06:00 KST 나스닥 선물 변화(%) */
export function lateSessionMove(series: Array<{ t: number; c: number }> | undefined, dateKst: string, nowMs = Infinity): number {
  return futuresMove(series, dateKst, 0, 6, nowMs);
}

/** dateKst의 fromH시 → toH시(KST) 선물 변화. nowMs 이후 값은 쓰지 않음, 정보가 없으면 0 */
function futuresMove(series: Array<{ t: number; c: number }> | undefined, dateKst: string, fromH: number, toH: number, nowMs: number): number {
  if (!series || series.length === 0) return 0;
  const refT = kstTime(dateKst, fromH);
  const cap = Math.min(kstTime(dateKst, toH), nowMs);
  if (cap <= refT) return 0;
  const ref = lastAt(series, refT);
  const pre = lastAt(series, cap);
  if (!ref || !pre || refT - ref.t > 4 * 24 * HOUR || pre.t <= ref.t) return 0;
  return pct(pre.c, ref.c);
}

/** 지금 시각 기준 '다음 한국 거래일' (09:00 전이면 오늘, 주말 건너뜀, 공휴일은 고려하지 않음) */
export function nextTradingDate(nowMs: number, after: string): string {
  const k = new Date(nowMs + 9 * HOUR);
  let d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  if (k.getUTCHours() >= 9) d = new Date(d.getTime() + 24 * HOUR);
  for (;;) {
    const s = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && s > after) return s;
    d = new Date(d.getTime() + 24 * HOUR);
  }
}

/** rows[i]를 예측할 입력 (i === rows.length → 다음 거래일). 값이 모자라면 null */
function featuresAt(rows: DailyRow[], i: number, macro: MacroSeries, date: string, futDate: string, nowMs = Infinity) {
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
  x.futPre = preOpenMove(macro.futHourly, futDate, nowMs);
  x.futLate = lateSessionMove(macro.futHourly, futDate, nowMs);
  asOf.futPre = futDate;
  asOf.futLate = futDate;
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
export function buildSamples(rowsIn: DailyRow[], macro: MacroSeries, nowMs = Date.now()) {
  const rows = [...rowsIn].sort((a, b) => a.date.localeCompare(b.date));
  const samples: Sample[] = [];
  for (let i = 7; i < rows.length; i++) {
    const f = featuresAt(rows, i, macro, rows[i].date, rows[i].date);
    if (!f || f.suspicious) continue;
    const prevClose = rows[i - 1].close;
    const close = pct(rows[i].close, prevClose);
    if (Math.abs(close) > MAX_DAILY_MOVE) continue;
    const gap = rows[i].open > 0 ? pct(rows[i].open, prevClose) : null;
    samples.push({ date: rows[i].date, x: f.x, y: { close, gap: gap !== null && Math.abs(gap) <= MAX_DAILY_MOVE ? gap : null } });
  }
  const nextDate = rows.length ? nextTradingDate(nowMs, rows[rows.length - 1].date) : "";
  const next = rows.length > 7 ? featuresAt(rows, rows.length, macro, "9999-12-31", nextDate, nowMs) : null;
  return {
    samples,
    latestInputs: next && !next.suspicious ? next.x : null,
    inputsAsOf: next ? next.asOf : null,
    nextDate,
  };
}
