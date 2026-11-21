import assert from "node:assert/strict";
import { test } from "node:test";
import { runBacktest, type DailyBar } from "../server/backtest";
import { predict } from "../shared/model";

// 평일 날짜 n개 생성
function weekdays(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const series = (dates: string[], closes: number[]): DailyBar[] => dates.map((date, i) => ({ date, close: closes[i] }));

const dates = weekdays("2026-10-01", 16);
const stockCloses = [100, 101, 99, 102, 103, 101, 104, 104, 103, 106, 105, 107, 108, 106, 109, 110];
// 미국 지표: 같은 날짜 체계(앞선 날짜만 쓰이는지 확인용)
const nasdaqCloses = [100, 101, 100, 102, 103, 102, 104, 103, 102, 105, 104, 106, 107, 105, 108, 109];

const base = {
  code: "005930",
  name: "테스트",
  sector: "semiconductor" as const,
  stock: series(dates, stockCloses),
  nasdaq: series(dates, nasdaqCloses),
  sox: series(dates, nasdaqCloses),
  oil: series(dates, dates.map(() => 70)),
  usdKrw: series(dates, dates.map(() => 1400)),
};

test("최근 10거래일을 평가하고 예측은 공식으로 계산된다 (난수 아님)", () => {
  const r = runBacktest(base);
  assert.equal(r.records.length, 10);
  const r2 = runBacktest(base);
  assert.deepEqual(r, r2);

  // 첫 평가일을 손으로 재계산
  const i = dates.length - 10;
  const day = dates[i];
  const nqPrev = nasdaqCloses[i - 2];
  const nqCur = nasdaqCloses[i - 1]; // 그날보다 '앞선' 마지막 값
  const nqChg = (nqCur / nqPrev - 1) * 100;
  const prevDay = (stockCloses[i - 1] / stockCloses[i - 2] - 1) * 100;
  const p = predict({
    sector: "semiconductor",
    price: stockCloses[i - 1],
    prevDayChangeRate: prevDay,
    scenario: { usdKrw: 1400, oilPrice: 70, nasdaqChange: nqChg, semiconductorChange: nqChg, foreignFlow: 0, newsSentiment: 0 },
    reference: { usdKrw: 1400, oilPrice: 70 },
  });
  assert.equal(r.records[0].date, day);
  assert.equal(r.records[0].predicted, p.direction);
  assert.equal(r.records[0].score, p.score);
});

test("같은 날 미국 값은 쓰지 않는다 (미래 정보 누출 없음)", () => {
  const leaked = { ...base, nasdaq: series(dates, nasdaqCloses.map((c, i) => (i === dates.length - 1 ? c * 10 : c))) };
  const a = runBacktest(base);
  const b = runBacktest(leaked);
  assert.equal(a.records[9].score, b.records[9].score);
});

test("적중률·수익률 계산", () => {
  const r = runBacktest(base);
  const evaluated = r.records.filter((x) => x.correct !== null);
  assert.equal(r.evaluatedDays, evaluated.length);
  assert.equal(r.correctDays, evaluated.filter((x) => x.correct).length);
  const hold = r.records.reduce((v, x) => v * (1 + x.changeRate / 100), 1);
  assert.ok(Math.abs(r.holdReturn - (hold - 1) * 100) < 0.01);
  const strat = r.records.reduce((v, x) => (x.predicted === "UP" ? v * (1 + x.changeRate / 100) : v), 1);
  assert.ok(Math.abs(r.strategyReturn - (strat - 1) * 100) < 0.01);
});

test("보합일은 평가에서 제외", () => {
  const flat = { ...base, stock: series(dates, stockCloses.map((c, i) => (i === dates.length - 1 ? stockCloses[i - 1] : c))) };
  const r = runBacktest(flat);
  assert.equal(r.records[9].actual, "FLAT");
  assert.equal(r.records[9].correct, null);
  assert.equal(r.evaluatedDays, runBacktest(base).evaluatedDays - 1);
});

test("해외 지표가 없으면 안내 문구를 붙인다", () => {
  const r = runBacktest({ ...base, nasdaq: [], sox: [] });
  assert.ok(r.notes.some((n) => n.includes("해외 지표가 없어")));
});
