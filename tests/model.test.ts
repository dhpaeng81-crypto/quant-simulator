import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSamples, changeBefore, MACRO_KEYS, type MacroSeries, type Sample } from "../shared/features";
import {
  clipInputs,
  fitCalibration,
  fitPanel,
  fitStock,
  forecast,
  metrics,
  probability,
  walkForward,
} from "../shared/model";
import { normalCdf, ridge, solve } from "../shared/stats";
import type { Bar, DailyRow } from "../shared/types";

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

/**
 * 가짜 시장: 시가 갭 = gapBeta × '전날' EWY 등락, 장중 = 잡음.
 * 종가 수익률 = 갭 + 장중.
 */
function market(opts: { n?: number; gapBeta?: number; noise?: number; seed?: number; dates?: string[]; ewy?: number[] } = {}) {
  const n = opts.dates?.length ?? opts.n ?? 400;
  const r = rng(opts.seed ?? 7);
  const dates = opts.dates ?? weekdays("2025-01-01", n);
  const walk = (vol: number): Bar[] => {
    let v = 100;
    return dates.map((date) => ({ date, close: (v *= 1 + (gauss(r) * vol) / 100) }));
  };
  const ewyChg = opts.ewy ?? dates.map(() => gauss(r) * 1.5);
  let lvl = 100;
  const ewy = dates.map((date, i) => ({ date, close: (lvl *= 1 + ewyChg[i] / 100) }));
  const macro = Object.fromEntries(MACRO_KEYS.map((k) => [k, walk(1)])) as unknown as MacroSeries;
  macro.ewy = ewy;
  macro.us10y = dates.map((date, i) => ({ date, close: 4 + Math.sin(i / 20) * 0.3 + gauss(r) * 0.02 }));

  const rows: DailyRow[] = [];
  let px = 10000;
  for (let i = 0; i < n; i++) {
    const gap = i > 0 ? (opts.gapBeta ?? 0.5) * ewyChg[i - 1] + gauss(r) * 0.2 : 0;
    const open = px * (1 + gap / 100);
    const close = open * (1 + (gauss(r) * (opts.noise ?? 1)) / 100);
    rows.push({ date: dates[i], open, close, volume: 1_000_000, foreignNet: Math.round(gauss(r) * 50_000), institutionNet: Math.round(gauss(r) * 30_000) });
    px = close;
  }
  return { rows, macro, dates, ewyChg };
}

test("통계 도구", () => {
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
  const x = solve([[2, 1], [1, 3]], [3, 5]);
  assert.ok(Math.abs(x[0] - 0.8) < 1e-9 && Math.abs(x[1] - 1.4) < 1e-9);
  const { beta, sig } = ridge([[1], [2], [3], [4]], [3, 5, 7, 9], 0);
  assert.ok(Math.abs(beta[0] / sig[0] - 2) < 1e-9);
});

test("changeBefore: 같은 날 값을 쓰지 않고, 금리는 bp로", () => {
  const s: Bar[] = [
    { date: "2026-01-01", close: 4.0 },
    { date: "2026-01-02", close: 4.1 },
    { date: "2026-01-05", close: 3.9 },
  ];
  assert.equal(changeBefore(s, "2026-01-05")!.date, "2026-01-02");
  assert.ok(Math.abs(changeBefore(s, "2026-01-05", "bp")!.change - 10) < 1e-9);
  assert.equal(changeBefore(s, "2026-01-02"), null);
});

test("표본: 시가 갭과 종가 수익률, 5일 누적 입력", () => {
  const { rows, macro } = market({ n: 60 });
  const { samples, latestInputs, inputsAsOf } = buildSamples(rows, macro);
  const s = samples[samples.length - 1];
  const i = rows.length - 1;
  assert.ok(Math.abs(s.y.gap! - (rows[i].open / rows[i - 1].close - 1) * 100) < 1e-9);
  assert.ok(Math.abs(s.y.close! - (rows[i].close / rows[i - 1].close - 1) * 100) < 1e-9);
  const f5 = rows.slice(i - 5, i).reduce((a, r) => a + r.foreignNet!, 0);
  assert.ok(Math.abs(s.x.foreign5 - (f5 / 1_000_000) * 100) < 1e-9);
  assert.ok(latestInputs);
  assert.equal(inputsAsOf!.ewy, rows[i].date);
});

test("학습하면 숨긴 EWY → 시가 갭 관계를 찾는다", () => {
  const { rows, macro } = market({ gapBeta: 0.5 });
  const m = fitStock(buildSamples(rows, macro).samples.slice(-250), "gap")!;
  assert.ok(m.coef.ewy > 0.4 && m.coef.ewy < 0.6, `ewy=${m.coef.ewy}`);
  assert.ok(Math.abs(m.coef.nasdaq) < 0.05, `nasdaq=${m.coef.nasdaq}`);
});

test("극단값 자르기: 평소의 몇 배인 입력도 상한까지만 반영", () => {
  const { rows, macro } = market();
  const d = buildSamples(rows, macro);
  const m = fitStock(d.samples.slice(-250), "gap")!;
  const extreme = { ...d.latestInputs!, ewy: 40 };
  const f = forecast(m, extreme, null);
  assert.ok(f.clipped.includes("ewy"));
  assert.equal(clipInputs(extreme, m.lo, m.hi).x.ewy, m.hi.ewy);
  const atCap = forecast(m, { ...d.latestInputs!, ewy: m.hi.ewy }, null);
  assert.equal(f.expectedReturn, atCap.expectedReturn);
});

test("패널: 종목마다 데이터가 적어도 공통 관계를 더 안정적으로 찾는다", () => {
  const dates = weekdays("2025-01-01", 120);
  const ewy = dates.map((_, i) => Math.sin(i * 1.3) * 2);
  const byStock = new Map<string, Sample[]>();
  for (let k = 0; k < 20; k++) {
    const { rows, macro } = market({ dates, ewy, seed: 100 + k, gapBeta: 0.5, noise: 1 });
    byStock.set(String(k).padStart(6, "0"), buildSamples(rows, macro).samples);
  }
  const panel = fitPanel(byStock, "gap");
  const errPanel = [...panel.stocks.values()].map((m) => Math.abs(m.coef.ewy - 0.5));
  const errSolo = [...byStock.values()].map((s) => Math.abs(fitStock(s, "gap")!.coef.ewy - 0.5));
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(errPanel) < avg(errSolo), `panel ${avg(errPanel)} solo ${avg(errSolo)}`);
});

test("확률 보정: 알려진 a, b를 되찾는다", () => {
  const r = rng(3);
  const pts = Array.from({ length: 5000 }, () => {
    const z = gauss(r);
    return { z, up: r() < 1 / (1 + Math.exp(-(0.8 * z + 0.2))) };
  });
  const cal = fitCalibration(pts, false)!;
  assert.ok(Math.abs(cal.a - 0.8) < 0.1 && Math.abs(cal.b - 0.2) < 0.1, JSON.stringify(cal));
  // 기본(기울기만): b는 0으로 고정
  const slope = fitCalibration(pts)!;
  assert.equal(slope.b, 0);
  assert.ok(Math.abs(slope.a - 0.8) < 0.15, JSON.stringify(slope));
  assert.ok(Math.abs(probability(0, 1, null).pUp - 0.5) < 1e-9);
});

test("워크포워드: 미래 표본을 바꿔도 과거 예측은 그대로", () => {
  const byStock = new Map<string, Sample[]>();
  for (let k = 0; k < 3; k++) {
    const { rows, macro } = market({ seed: 10 + k });
    byStock.set(String(k), buildSamples(rows, macro).samples);
  }
  const a = walkForward(byStock, "close", "panel", 60);
  const altered = new Map([...byStock].map(([c, s]) => [c, s.map((x, i) => (i === s.length - 1 ? { ...x, y: { close: 25, gap: 25 } } : x))]));
  const b = walkForward(altered, "close", "panel", 60);
  const lastDate = a.at(-1)!.date;
  const before = (ps: typeof a) => ps.filter((p) => p.date < lastDate).map((p) => p.expected);
  assert.ok(a.length > 0);
  assert.deepEqual(before(a), before(b));
});

test("평가: 관계가 있으면 시가 갭 적중률이 높고, 없으면 50% 근처", () => {
  const make = (gapBeta: number) => {
    const byStock = new Map<string, Sample[]>();
    for (let k = 0; k < 4; k++) {
      const { rows, macro } = market({ seed: 50 + k, gapBeta });
      byStock.set(String(k), buildSamples(rows, macro).samples);
    }
    return metrics(walkForward(byStock, "gap", "extended", 100), null)!;
  };
  const strong = make(0.6);
  const none = make(0);
  assert.ok(strong.hitRate > 80 && strong.brierSkill > 20, JSON.stringify(strong));
  assert.ok(none.hitRate > 40 && none.hitRate < 60, JSON.stringify(none));
  assert.ok(none.brierSkill < 5, JSON.stringify(none));
});
