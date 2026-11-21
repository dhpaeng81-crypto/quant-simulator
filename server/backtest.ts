// 실제 과거 데이터로 같은 예측 공식을 돌려 보는 백테스트.
// 네트워크와 분리된 순수 함수라서 tests/에서 그대로 검증합니다.

import { predict } from "../shared/model";
import type { BacktestRecord, BacktestResult, SectorKey } from "../shared/types";

export interface DailyBar {
  date: string; // YYYY-MM-DD (해당 시장의 현지 거래일)
  close: number;
}

export interface BacktestInput {
  code: string;
  name: string;
  sector: SectorKey;
  stock: DailyBar[]; // 한국 거래일 기준, 오름차순
  nasdaq: DailyBar[]; // 미국 거래일 기준
  sox: DailyBar[];
  oil: DailyBar[];
  usdKrw: DailyBar[];
  days?: number; // 평가할 거래일 수 (기본 10)
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** date보다 앞선 마지막 봉과 그 직전 봉 (한국 장 시작 전에 알 수 있었던 값) */
function lastBefore(series: DailyBar[], date: string): { cur: DailyBar; prev: DailyBar } | null {
  let idx = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i].date < date) idx = i;
    else break;
  }
  if (idx < 1) return null;
  return { cur: series[idx], prev: series[idx - 1] };
}

const pct = (a: number, b: number) => (b > 0 ? (a / b - 1) * 100 : 0);

export function runBacktest(input: BacktestInput): BacktestResult {
  const days = input.days ?? 10;
  const bars = [...input.stock].sort((a, b) => a.date.localeCompare(b.date));
  const sortAsc = (s: DailyBar[]) => [...s].sort((a, b) => a.date.localeCompare(b.date));
  const nasdaq = sortAsc(input.nasdaq);
  const sox = sortAsc(input.sox);
  const oil = sortAsc(input.oil);
  const fx = sortAsc(input.usdKrw);

  const notes: string[] = [
    "외국인 수급과 뉴스 분위기는 과거 값을 확보할 수 없어 0(중립)으로 두고 계산했습니다.",
    "각 거래일의 예측에는 그날 한국 장이 열리기 전에 알 수 있었던 값(전날 미국 마감, 전날 환율·유가)만 썼습니다.",
    "전략 수익률은 '상승 신호면 보유, 아니면 현금'으로 계산했고 거래 비용·세금은 빼지 않았습니다.",
  ];

  // 평가하려면 전전날 종가(모멘텀)와 전날 종가가 필요 → 앞쪽 2개 봉은 평가 불가
  const startIdx = Math.max(2, bars.length - days);
  const records: BacktestRecord[] = [];
  let missingMacro = 0;

  for (let i = startIdx; i < bars.length; i++) {
    const d = bars[i];
    const prev = bars[i - 1];
    const prev2 = bars[i - 2];
    const changeRate = round(pct(d.close, prev.close));
    const prevDayChangeRate = pct(prev.close, prev2.close);

    const nq = lastBefore(nasdaq, d.date);
    const sx = lastBefore(sox, d.date);
    const ol = lastBefore(oil, d.date);
    const fxv = lastBefore(fx, d.date);
    if (!nq || !sx || !ol || !fxv) missingMacro++;

    const nasdaqChange = nq ? pct(nq.cur.close, nq.prev.close) : null;
    const semiconductorChange = sx ? pct(sx.cur.close, sx.prev.close) : null;

    const p = predict({
      sector: input.sector,
      price: prev.close,
      prevDayChangeRate,
      scenario: {
        usdKrw: fxv ? fxv.cur.close : 0,
        oilPrice: ol ? ol.cur.close : 0,
        nasdaqChange: nasdaqChange ?? 0,
        semiconductorChange: semiconductorChange ?? 0,
        foreignFlow: 0,
        newsSentiment: 0,
      },
      reference: {
        usdKrw: fxv ? fxv.prev.close : 0,
        oilPrice: ol ? ol.prev.close : 0,
      },
    });

    const actual = changeRate > 0 ? "UP" : changeRate < 0 ? "DOWN" : "FLAT";
    records.push({
      date: d.date,
      close: d.close,
      changeRate,
      predicted: p.direction,
      actual,
      correct: actual === "FLAT" ? null : p.direction === actual,
      score: p.score,
      inputs: {
        nasdaqChange: nasdaqChange === null ? null : round(nasdaqChange),
        semiconductorChange: semiconductorChange === null ? null : round(semiconductorChange),
        usdKrwChangeRate: fxv ? round(pct(fxv.cur.close, fxv.prev.close)) : null,
        oilChangeRate: ol ? round(pct(ol.cur.close, ol.prev.close)) : null,
        prevDayChangeRate: round(prevDayChangeRate),
      },
    });
  }

  if (missingMacro > 0) {
    notes.push(`${missingMacro}일은 일부 해외 지표가 없어 해당 항목을 0으로 두고 계산했습니다.`);
  }

  const evaluated = records.filter((r) => r.correct !== null);
  const correctDays = evaluated.filter((r) => r.correct).length;
  const upDays = evaluated.filter((r) => r.actual === "UP").length;

  let hold = 1;
  let strategy = 1;
  for (const r of records) {
    hold *= 1 + r.changeRate / 100;
    if (r.predicted === "UP") strategy *= 1 + r.changeRate / 100;
  }

  if (evaluated.length > 0 && evaluated.length < 20) {
    notes.push(`평가 일수가 ${evaluated.length}일뿐이라 적중률은 우연의 영향이 큽니다. 참고용으로만 보세요.`);
  }

  return {
    code: input.code,
    name: input.name,
    records,
    evaluatedDays: evaluated.length,
    correctDays,
    accuracy: evaluated.length ? round((correctDays / evaluated.length) * 100, 1) : null,
    alwaysUpAccuracy: evaluated.length ? round((upDays / evaluated.length) * 100, 1) : null,
    strategyReturn: round((strategy - 1) * 100),
    holdReturn: round((hold - 1) * 100),
    notes,
  };
}
