import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDataset, changeBefore, fitModel, forecast, walkForward, type MacroSeries } from "../shared/model";
import { normalCdf, ridge, solve } from "../shared/stats";
import type { Bar, DailyRow } from "../shared/types";

// 재현 가능한 난수
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

function weekdays(start: string, n: number) {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  while (out.length < n) {
    if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** 진짜 관계(나스닥 계수 0.5)가 있는 가짜 시장 */
function synthetic(n = 400, nasdaqBeta = 0.5, noise = 1) {
  const r = rng(7);
  const dates = weekdays("2025-01-01", n);
  const nq: Bar[] = [];
  const other = (): Bar[] => {
    let v = 100;
    return dates.map((date) => ({ date, close: (v *= 1 + gauss(r) * 0.01) }));
  };
  let lvl = 100;
  const nqChanges: number[] = [];
  for (const date of dates) {
    const c = gauss(r) * 1.2;
    nqChanges.push(c);
    lvl *= 1 + c / 100;
    nq.push({ date, close: lvl });
  }
  const rows: DailyRow[] = [];
  let px = 10000;
  for (let i = 0; i < n; i++) {
    // 그날 한국 수익률 = 0.5 × '전날' 나스닥 등락 + 잡음
    const ret = i > 0 ? nasdaqBeta * nqChanges[i - 1] + gauss(r) * noise : 0;
    px *= 1 + ret / 100;
    rows.push({ date: dates[i], close: px, volume: 1_000_000, foreignNet: Math.round(gauss(r) * 50_000), institutionNet: Math.round(gauss(r) * 30_000) });
  }
  const macro: MacroSeries = { nasdaq: nq, sox: other(), fx: other(), oil: other() };
  return { rows, macro, dates };
}

test("정규분포 누적값", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1) - 0.1587) < 1e-4);
});

test("연립방정식 풀이", () => {
  const x = solve([[2, 1], [1, 3]], [3, 5]);
  assert.ok(Math.abs(x[0] - 0.8) < 1e-9 && Math.abs(x[1] - 1.4) < 1e-9);
});

test("릿지 λ=0이면 최소제곱과 같다", () => {
  const X = [[1], [2], [3], [4]];
  const y = [3, 5, 7, 9]; // y = 2x + 1
  const { beta, sig } = ridge(X, y, 0);
  assert.ok(Math.abs(beta[0] / sig[0] - 2) < 1e-9);
});

test("changeBefore는 같은 날 값을 쓰지 않는다", () => {
  const s: Bar[] = [
    { date: "2026-01-01", close: 100 },
    { date: "2026-01-02", close: 110 },
    { date: "2026-01-05", close: 99 },
  ];
  assert.equal(changeBefore(s, "2026-01-05")!.date, "2026-01-02");
  assert.ok(Math.abs(changeBefore(s, "2026-01-05")!.change - 10) < 1e-9);
  assert.equal(changeBefore(s, "2026-01-02"), null);
});

test("학습하면 숨겨 둔 나스닥 계수를 찾아낸다", () => {
  const { rows, macro } = synthetic(400, 0.5, 0.8);
  const { samples } = buildDataset(rows, macro);
  const m = fitModel(samples.slice(-250))!;
  assert.ok(m.coef.nasdaq > 0.35 && m.coef.nasdaq < 0.6, `nasdaq=${m.coef.nasdaq}`);
  for (const k of ["sox", "fx", "oil"] as const) assert.ok(Math.abs(m.coef[k]) < 0.15, `${k}=${m.coef[k]}`);
});

test("관계가 있으면 백테스트 적중률이 50%를 넘고, 없으면 50% 근처", () => {
  const strong = walkForward(buildDataset(...Object.values(synthetic(400, 0.8, 0.5)).slice(0, 2) as [DailyRow[], MacroSeries]).samples)!;
  assert.ok(strong.hitRate! > 75, `strong=${strong.hitRate}`);
  assert.ok(strong.pValue! < 0.01);
  const none = walkForward(buildDataset(...Object.values(synthetic(400, 0, 1)).slice(0, 2) as [DailyRow[], MacroSeries]).samples)!;
  assert.ok(none.hitRate! > 30 && none.hitRate! < 70, `none=${none.hitRate}`);
});

test("백테스트는 미래 표본을 쓰지 않는다 (마지막 날 값을 바꿔도 이전 예측은 그대로)", () => {
  const { samples } = buildDataset(...(Object.values(synthetic(400)).slice(0, 2) as [DailyRow[], MacroSeries]));
  const a = walkForward(samples)!;
  const altered = samples.map((s, i) => (i === samples.length - 1 ? { ...s, y: 25 } : s));
  const b = walkForward(altered)!;
  assert.deepEqual(a.days.slice(0, -1), b.days.slice(0, -1));
});

test("다음 거래일 입력은 마지막 날까지의 값을 쓴다", () => {
  const { rows, macro, dates } = synthetic(100);
  const d = buildDataset(rows, macro);
  assert.ok(d.latestInputs);
  assert.equal(d.inputsAsOf!.nasdaq, dates[dates.length - 1]);
  assert.equal(d.inputsAsOf!.foreign, dates[dates.length - 1]);
});

test("액면분할 같은 비정상 변동일은 학습에서 뺀다", () => {
  const { rows, macro } = synthetic(200);
  rows[150] = { ...rows[150], close: rows[149].close / 50 };
  const { samples } = buildDataset(rows, macro);
  assert.ok(samples.every((s) => Math.abs(s.y) < 31));
  assert.ok(!samples.some((s) => s.date === rows[151].date)); // 다음 날도 전일수익률이 비정상이라 제외
});

test("예측 확률은 기대수익률 부호와 일치", () => {
  const { rows, macro } = synthetic(300, 0.5);
  const d = buildDataset(rows, macro);
  const m = fitModel(d.samples)!;
  const up = forecast(m, { ...d.latestInputs!, nasdaq: 3 });
  const down = forecast(m, { ...d.latestInputs!, nasdaq: -3 });
  assert.ok(up.pUp > 0.5 && up.expectedReturn > 0);
  assert.ok(down.pUp < 0.5 && down.expectedReturn < 0);
  assert.ok(up.contributions.nasdaq > 0 && down.contributions.nasdaq < 0);
});
