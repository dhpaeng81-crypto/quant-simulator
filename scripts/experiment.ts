// 모델 설정 실험: `REUSE_CACHE` 원자료로 여러 설정을 같은 기준(통합 사후 평가)으로 비교합니다.
// 사용: npx tsx scripts/experiment.ts   (먼저 npm run collect 로 .cache/raw.json 생성)

import { readFile } from "node:fs/promises";
import { buildSamples, sortMacro, type Sample } from "../shared/features";
import { fitCalibration, fitPanel, fitStock, LEGACY_KEYS, metrics, walkForward, type FitFn, type FitOptions, type OosPrediction } from "../shared/model";
import { FEATURE_KEYS, type FeatureKey, type LinearModel, type Target } from "../shared/types";

const raw = JSON.parse(await readFile(".cache/raw.json", "utf8"));
const macro = sortMacro(raw.macro);
const byStock = new Map<string, Sample[]>();
for (const s of raw.stocks) byStock.set(s.code, buildSamples(s.rows, macro).samples);

const perStock = (opts: FitOptions): FitFn => (train, target) => {
  const out = new Map<string, LinearModel>();
  for (const [c, s] of train) {
    const m = fitStock(s, target, opts);
    if (m) out.set(c, m);
  }
  return out;
};
const panel = (opts: FitOptions & { stockLambdaRatio?: number }): FitFn => (train, target) => fitPanel(train, target, opts).stocks;

const NO_FLOW5: FeatureKey[] = FEATURE_KEYS.filter((k) => k !== "foreign5" && k !== "institution5");
const configs: Array<[string, FitFn]> = [
  ["1차(7, 자르기X)", perStock({ keys: LEGACY_KEYS, clip: false })],
  ["기본(7, 5σ)", perStock({ keys: LEGACY_KEYS, clipSd: 5 })],
  ["기본(7, 3σ)", perStock({ keys: LEGACY_KEYS, clipSd: 3 })],
  ["1차+EWY(8, 5σ)", perStock({ keys: [...LEGACY_KEYS, "ewy"], clipSd: 5 })],
  ["종목 14, 5σ", perStock({ clipSd: 5 })],
  ["종목 12(5일수급X), 5σ", perStock({ keys: NO_FLOW5, clipSd: 5 })],
  ["패널 14, 5σ, 수축1", panel({ clipSd: 5 })],
  ["패널 14, 5σ, 수축0.2", panel({ clipSd: 5, stockLambdaRatio: 0.2 })],
];

const z = (p: OosPrediction) => (p.sigma > 0 ? p.expected / p.sigma : 0);
const pts = (ps: OosPrediction[]) => ps.filter((p) => p.actual !== 0).map((p) => ({ z: z(p), up: p.actual > 0 }));

// 날짜별 Brier 차이로 '1차 대비 개선'의 표준오차 (날짜 묶음)
function dailyBrier(ps: OosPrediction[], cal: ReturnType<typeof fitCalibration>) {
  const m = new Map<string, number[]>();
  for (const p of ps) {
    if (p.actual === 0) continue;
    const q = cal ? 1 / (1 + Math.exp(-(cal.a * z(p) + cal.b))) : 0.5;
    m.set(p.date, [...(m.get(p.date) ?? []), (q - (p.actual > 0 ? 1 : 0)) ** 2]);
  }
  return new Map([...m].map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length]));
}

for (const target of ["gap", "close"] as Target[]) {
  console.log(`\n== ${target} ==`);
  let base: Map<string, number> | null = null;
  for (const [name, fit] of configs) {
    const t = Date.now();
    const ps = walkForward(byStock, target, fit, 250);
    const dates = [...new Set(ps.map((p) => p.date))].sort();
    const split = dates[Math.floor(dates.length / 2)];
    const first = ps.filter((p) => p.date < split);
    const second = ps.filter((p) => p.date >= split);
    const cal = fitCalibration(pts(first));
    const cal2 = fitCalibration(pts(first), false);
    const m2 = metrics(second, cal2)!;
    const m = metrics(second, cal)!;
    const mRaw = metrics(second, null)!;
    const db = dailyBrier(second, cal);
    let diff = "";
    if (!base) base = db;
    else {
      const d = [...db].map(([k, v]) => base!.get(k)! - v).filter(Number.isFinite);
      const mu = d.reduce((a, b) => a + b, 0) / d.length;
      const se = Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / (d.length - 1) / d.length);
      diff = `  1차 대비 Brier 개선 ${(mu * 1e4).toFixed(1)}e-4 (t=${(mu / se).toFixed(2)})`;
    }
    console.log(`${name.padEnd(24)} 적중 ${m.hitRate}%  BS 기울기보정 ${m.brierSkill}% / a·b보정 ${m2.brierSkill}% / 보정 전 ${mRaw.brierSkill}% [a=${cal?.a}]  상하위차 ${m.topBottomSpread}  상관 ${m.correlation}${diff}  (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  }
}
