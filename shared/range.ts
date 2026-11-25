// 오늘 예상 가격 범위 (참고용, 매수·매도 추천 아님)
//
// - 예상 시가: 전일 종가 × (1 + 시가 갭 모델의 기대 수익률), 범위는 ± 갭 모델 오차 1표준편차(약 68%)
// - 하루 범위: 최근 20거래일 동안 '시가 대비 고가'와 '시가 대비 저가'가 보통 얼마였는지(중앙값)를 예상 시가에 적용
// 수집기(과거 적중 점검)와 화면(시나리오 반영)이 함께 씁니다.

import type { DailyRow } from "./types";

export const RANGE_WINDOW = 20;

export interface PriceRange {
  prevClose: number;
  expectedOpen: number;
  openLo: number;
  openHi: number;
  upPct: number; // 시가 대비 고가 상승폭 중앙값 (%)
  downPct: number; // 시가 대비 저가 하락폭 중앙값 (%)
  dayHi: number; // 예상 시가 기준 보통의 고가
  dayLo: number; // 예상 시가 기준 보통의 저가
  upPct80: number; // 80% 분위 (열에 여덟 날은 이 안)
  downPct80: number;
  dayHi80: number;
  dayLo80: number;
}

/** 분위수 (선형 보간). q = 0.5면 중앙값 */
export function quantile(xs: number[], q: number) {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** rows: 날짜 오름차순, 마지막 행이 '어제(전 거래일)'. 고가·저가가 없는 행은 건너뜀 */
export function priceRange(rows: DailyRow[], gapExpected: number, gapSigma: number): PriceRange | null {
  const recent = rows.slice(-RANGE_WINDOW).filter((r) => r.open > 0 && r.high > 0 && r.low > 0);
  if (recent.length < RANGE_WINDOW / 2 || rows.length === 0) return null;
  const prevClose = rows[rows.length - 1].close;
  const ups = recent.map((r) => (r.high / r.open - 1) * 100);
  const downs = recent.map((r) => (1 - r.low / r.open) * 100);
  const upPct = quantile(ups, 0.5);
  const downPct = quantile(downs, 0.5);
  const upPct80 = quantile(ups, 0.8);
  const downPct80 = quantile(downs, 0.8);
  const expectedOpen = prevClose * (1 + gapExpected / 100);
  return {
    prevClose,
    expectedOpen,
    openLo: prevClose * (1 + (gapExpected - gapSigma) / 100),
    openHi: prevClose * (1 + (gapExpected + gapSigma) / 100),
    upPct,
    downPct,
    dayHi: expectedOpen * (1 + upPct / 100),
    dayLo: expectedOpen * (1 - downPct / 100),
    upPct80,
    downPct80,
    dayHi80: expectedOpen * (1 + upPct80 / 100),
    dayLo80: expectedOpen * (1 - downPct80 / 100),
  };
}

export interface RangeCheck {
  n: number;
  openInBand: number; // 실제 시가가 예상 시가 범위 안에 든 비율 (%)
  highWithin: number; // 실제 고가가 예상 고가 이하였던 비율 (%)
  lowWithin: number; // 실제 저가가 예상 저가 이상이었던 비율 (%)
  highWithin80: number; // 넓은 범위(80% 분위) 기준
  lowWithin80: number;
  openErr: number; // 예상 시가와 실제 시가의 평균 절대 오차 (%)
}

export function checkRanges(items: Array<{ range: PriceRange; actual: DailyRow }>): RangeCheck | null {
  const ok = items.filter((x) => x.actual.open > 0 && x.actual.high > 0 && x.actual.low > 0);
  if (ok.length === 0) return null;
  const pct = (k: number) => Math.round((k / ok.length) * 1000) / 10;
  let inBand = 0;
  let hi = 0;
  let lo = 0;
  let hi80 = 0;
  let lo80 = 0;
  let err = 0;
  for (const { range: r, actual: a } of ok) {
    if (a.open >= r.openLo && a.open <= r.openHi) inBand++;
    if (a.high <= r.dayHi) hi++;
    if (a.low >= r.dayLo) lo++;
    if (a.high <= r.dayHi80) hi80++;
    if (a.low >= r.dayLo80) lo80++;
    err += Math.abs(a.open / r.expectedOpen - 1) * 100;
  }
  return { n: ok.length, openInBand: pct(inBand), highWithin: pct(hi), lowWithin: pct(lo), highWithin80: pct(hi80), lowWithin80: pct(lo80), openErr: Math.round((err / ok.length) * 100) / 100 };
}
