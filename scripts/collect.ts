// 데이터 수집 → 통합 평가(모델 비교) → 확률 보정 → 최종 학습 → public/data/*.json
// GitHub Actions가 평일 하루 두 번 실행합니다. 로컬에서는 `npm run collect`.
//
// 환경 변수(선택): UNIVERSE_KOSPI, UNIVERSE_KOSDAQ, GEMINI_API_KEY, GEMINI_MODEL, OUT_DIR,
//   REUSE_CACHE=1 (직전 수집한 원자료 .cache/raw.json으로 평가·학습만 다시)

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSamples, sortMacro, type MacroSeries, type Sample } from "../shared/features";
import {
  calibrationBins,
  DEFAULT_VARIANT,
  fitCalibration,
  fitVariant,
  forecast,
  metrics,
  pairedImprovement,
  summarizeBacktest,
  TRAIN_WINDOW,
  VARIANTS,
  walkForward,
  type OosPrediction,
  type Variant,
} from "../shared/model";
import {
  TARGETS,
  type Bar,
  type Briefing,
  type Calibration,
  type DailyRow,
  type EvaluationFile,
  type Features,
  type IndexFile,
  type MacroQuote,
  type ModelVariantResult,
  type StockDetail,
  type StockSummary,
  type Target,
  type TargetResult,
} from "../shared/types";
import { aiBriefing } from "./sources/gemini";
import { indexBars, stockNews, stockRows, topByMarketValue, type RankedStock } from "./sources/naver";
import { MACRO_SYMBOLS, yahooDaily } from "./sources/yahoo";

if (existsSync(".env")) process.loadEnvFile(".env");

const OUT = path.resolve(process.env.OUT_DIR || "public/data");
const CACHE = path.resolve(".cache/raw.json");
const N_KOSPI = Number(process.env.UNIVERSE_KOSPI || 60);
const N_KOSDAQ = Number(process.env.UNIVERSE_KOSDAQ || 40);
const HISTORY_DAYS = 120;
const EVAL_DAYS = 250; // 통합 평가 기간 (앞 절반: 확률 보정 학습, 뒤 절반: 보정 후 성적)
const BACKTEST_DAYS = 60; // 종목 화면의 '과거 성적'
const CONCURRENCY = 4;
const MAX_FAILURE_RATIO = 0.3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const signed = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const pctChange = (bars: Bar[]) => (bars.length >= 2 ? (bars[bars.length - 1].close / bars[bars.length - 2].close - 1) * 100 : 0);
const elapsed = (t: number) => `${((Date.now() - t) / 1000).toFixed(0)}초`;

interface Raw {
  fetchedAt: string;
  macro: MacroSeries;
  kospi: Bar[];
  kosdaq: Bar[];
  stocks: Array<RankedStock & { rows: DailyRow[]; news: StockDetail["news"] }>;
  failures: string[];
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function fetchRaw(): Promise<Raw> {
  const keys = Object.keys(MACRO_SYMBOLS) as Array<keyof typeof MACRO_SYMBOLS>;
  const series = await Promise.all(keys.map((k) => yahooDaily(MACRO_SYMBOLS[k])));
  const macro = Object.fromEntries(keys.map((k, i) => [k, series[i]])) as unknown as MacroSeries;
  const [kospi, kosdaq] = await Promise.all([indexBars("KOSPI"), indexBars("KOSDAQ")]);

  const universe = [...(await topByMarketValue("KOSPI", N_KOSPI)), ...(await topByMarketValue("KOSDAQ", N_KOSDAQ))];
  console.log(`종목 ${universe.length}개 수집`);
  const failures: string[] = [];
  const got = await pool(universe, CONCURRENCY, async (s) => {
    try {
      const rows = await stockRows(s.code);
      if (rows.length < 30) throw new Error("시세 부족");
      const news = await stockNews(s.code).catch(() => []);
      process.stdout.write(".");
      return { ...s, rows, news };
    } catch (e) {
      failures.push(s.code);
      console.warn(`\n[실패] ${s.code} ${s.name}: ${(e as Error).message}`);
      return null;
    }
  });
  console.log("");
  if (universe.length === 0 || failures.length / universe.length > MAX_FAILURE_RATIO) {
    throw new Error(`실패가 너무 많습니다 (${failures.length}/${universe.length}). 배포하지 않습니다.`);
  }
  return { fetchedAt: new Date().toISOString(), macro, kospi, kosdaq, stocks: got.filter((s) => s !== null), failures };
}

function macroQuote(id: MacroQuote["id"], name: string, bars: Bar[], bp = false): MacroQuote {
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  return { id, name, value: r2(last.close), changeRate: r2(bp ? (last.close - prev.close) * 100 : pctChange(bars)), date: last.date };
}

function buildFacts(macro: MacroQuote[], flows: Array<{ name: string; value: number }>, summaries: StockSummary[]): string[] {
  const m = Object.fromEntries(macro.map((q) => [q.id, q]));
  const facts: string[] = [];
  facts.push(
    `직전 미국 거래일(${m.nasdaq.date}) 나스닥 ${signed(m.nasdaq.changeRate)}%, 필라델피아 반도체 ${signed(m.sox.changeRate)}%, 한국 ETF(EWY) ${signed(m.ewy.changeRate)}%.`,
  );
  facts.push(`VIX ${m.vix.value.toFixed(1)}(${signed(m.vix.changeRate)}%), 미국 10년 금리 ${m.us10y.value.toFixed(2)}%(${signed(m.us10y.changeRate, 0)}bp).`);
  facts.push(
    `원/달러 ${m.usdkrw.value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원(${signed(m.usdkrw.changeRate)}%), WTI ${m.oil.value.toFixed(2)}달러(${signed(m.oil.changeRate)}%).`,
  );
  facts.push(`${m.kospi.date} 코스피 ${m.kospi.value.toLocaleString("ko-KR")}(${signed(m.kospi.changeRate)}%), 코스닥 ${m.kosdaq.value.toLocaleString("ko-KR")}(${signed(m.kosdaq.changeRate)}%).`);
  const sorted = [...flows].sort((a, b) => b.value - a.value);
  const fmt = (x: { name: string; value: number }) => `${x.name}(${Math.round(x.value).toLocaleString("ko-KR")}억)`;
  if (sorted.length >= 6) {
    facts.push(`외국인 순매수 상위: ${sorted.slice(0, 3).map(fmt).join(", ")}.`);
    facts.push(`외국인 순매도 상위: ${sorted.slice(-3).reverse().map(fmt).join(", ")}.`);
  }
  const withP = summaries.filter((s) => s.pUp !== null && s.gapPUp !== null);
  if (withP.length) {
    const ups = withP.filter((s) => s.pUp! >= 0.5).length;
    const gapUps = withP.filter((s) => s.gapPUp! >= 0.5).length;
    facts.push(`모델은 ${withP.length}개 종목 중 시가는 ${gapUps}개, 종가는 ${ups}개를 '상승 쪽'으로 봤습니다.`);
  }
  return facts;
}

async function main() {
  const t0 = Date.now();
  let raw: Raw;
  if (process.env.REUSE_CACHE === "1" && existsSync(CACHE)) {
    raw = JSON.parse(await readFile(CACHE, "utf8"));
    console.log(`원자료 재사용: ${raw.fetchedAt}`);
  } else {
    raw = await fetchRaw();
    await mkdir(path.dirname(CACHE), { recursive: true });
    await writeFile(CACHE, JSON.stringify(raw));
    console.log(`수집 완료 ${elapsed(t0)}`);
  }

  // 표본
  const macro = sortMacro(raw.macro);
  const byStock = new Map<string, Sample[]>();
  const latest = new Map<string, ReturnType<typeof buildSamples>>();
  for (const s of raw.stocks) {
    const b = buildSamples(s.rows, macro);
    latest.set(s.code, b);
    byStock.set(s.code, b.samples);
  }

  // 1) 통합 평가: 모델 3개 × 대상 2개
  const t1 = Date.now();
  const preds = new Map<string, OosPrediction[]>();
  for (const v of VARIANTS) for (const t of TARGETS) preds.set(`${v.id}:${t}`, walkForward(byStock, t, v.id, EVAL_DAYS));
  const evalDates = [...new Set(preds.get(`${DEFAULT_VARIANT}:close`)!.map((p) => p.date))].sort();
  const split = evalDates[Math.floor(evalDates.length / 2)];
  const firstHalf = (ps: OosPrediction[]) => ps.filter((p) => p.date < split);
  const secondHalf = (ps: OosPrediction[]) => ps.filter((p) => p.date >= split);
  const calPoints = (ps: OosPrediction[]) => ps.filter((p) => p.actual !== 0).map((p) => ({ z: p.sigma > 0 ? p.expected / p.sigma : 0, up: p.actual > 0 }));

  // 보정은 앞 절반으로 학습 → 뒤 절반에서 성적 측정 (보정도 미래를 보지 않음)
  const halfCal = new Map<string, Calibration | null>();
  for (const v of VARIANTS) for (const t of TARGETS) halfCal.set(`${v.id}:${t}`, fitCalibration(calPoints(firstHalf(preds.get(`${v.id}:${t}`)!))));
  const key = (v: string, t: Target) => `${v}:${t}`;
  const variants: ModelVariantResult[] = VARIANTS.map((v) => {
    const m = {} as ModelVariantResult["metrics"];
    const vs = {} as ModelVariantResult["vsDefault"];
    for (const t of TARGETS) {
      m[t] = metrics(secondHalf(preds.get(key(v.id, t))!), halfCal.get(key(v.id, t)) ?? null);
      vs[t] =
        v.id === DEFAULT_VARIANT
          ? null
          : pairedImprovement(
              secondHalf(preds.get(key(DEFAULT_VARIANT, t))!),
              halfCal.get(key(DEFAULT_VARIANT, t)) ?? null,
              secondHalf(preds.get(key(v.id, t))!),
              halfCal.get(key(v.id, t)) ?? null,
            );
    }
    return { ...v, metrics: m, vsDefault: vs };
  });

  // 채택: 기본 모델. 다른 모델이 종가에서 t ≥ 2로 낫고 시가에서도 나빠지지 않을 때만 바꿈 (우연에 따라 매일 바뀌지 않도록)
  const challengers = variants
    .filter((v) => v.id !== DEFAULT_VARIANT && v.id !== "legacy")
    .filter((v) => (v.vsDefault.close?.t ?? 0) >= 2 && (v.vsDefault.gap?.brierDiff ?? -1) >= 0)
    .sort((a, b) => b.vsDefault.close!.t - a.vsDefault.close!.t);
  const chosen = (challengers[0]?.id ?? DEFAULT_VARIANT) as Variant;
  const chosenReason = challengers[0]
    ? `${challengers[0].name}이(가) 종가 확률 오차를 기본 모델보다 의미 있게 줄여(t = ${challengers[0].vsDefault.close!.t}) 채택했습니다.`
    : "다른 모델이 기본 모델보다 의미 있게 낫지 않아(모두 t < 2) 가장 단순한 기본 모델을 씁니다.";
  console.log(`평가 ${elapsed(t1)} · 채택: ${chosen}`);
  for (const v of variants)
    console.log(
      `  ${v.id.padEnd(8)} 시가 적중 ${v.metrics.gap?.hitRate}% BS ${v.metrics.gap?.brierSkill}% t ${v.vsDefault.gap?.t ?? "-"} | 종가 적중 ${v.metrics.close?.hitRate}% BS ${v.metrics.close?.brierSkill}% t ${v.vsDefault.close?.t ?? "-"}`,
    );

  // 2) 실사용 보정: 채택 모델의 평가 기간 전체로
  const liveCal = Object.fromEntries(TARGETS.map((t) => [t, fitCalibration(calPoints(preds.get(`${chosen}:${t}`)!))])) as Record<Target, Calibration | null>;

  // 3) 최종 학습: 최근 250거래일
  const allDates = [...new Set([...byStock.values()].flatMap((s) => s.map((x) => x.date)))].sort();
  const trainFrom = allDates[Math.max(0, allDates.length - TRAIN_WINDOW)];
  const recent = new Map([...byStock].map(([c, s]) => [c, s.filter((x) => x.date >= trainFrom)]));
  const finalModels = Object.fromEntries(TARGETS.map((t) => [t, fitVariant(chosen, recent, t)])) as Record<Target, ReturnType<typeof fitVariant>>;

  // 4) 파일 쓰기
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "stocks"), { recursive: true });

  const summaries: StockSummary[] = [];
  const flows: Array<{ name: string; value: number }> = [];
  for (const s of raw.stocks) {
    const b = latest.get(s.code)!;
    const result = {} as Record<Target, TargetResult>;
    for (const t of TARGETS) {
      const model = finalModels[t].get(s.code) ?? null;
      const mine = preds.get(`${chosen}:${t}`)!.filter((p) => p.code === s.code).slice(-BACKTEST_DAYS);
      result[t] = {
        model,
        forecast: model && b.latestInputs ? forecast(model, b.latestInputs, liveCal[t]) : null,
        // 최근 60일은 평가 뒤 절반에 속하므로, 앞 절반으로 맞춘 보정을 씀 (미래 정보 없음)
        backtest: summarizeBacktest(mine, halfCal.get(`${chosen}:${t}`) ?? null),
      };
    }
    const notes: string[] = [];
    if (!result.close.model) notes.push("학습할 수 있는 날이 60일보다 적어 모델을 만들지 않았습니다(최근 상장 등).");
    if (result.close.model && !b.latestInputs) notes.push("다음 거래일 입력값 일부가 없어 오늘 전망은 계산하지 않았습니다.");

    const rows = [...s.rows].sort((a, c) => a.date.localeCompare(c.date));
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const round3 = (x: Features | null) => x && (Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) as Features);
    const detail: StockDetail = {
      code: s.code,
      name: s.name,
      market: s.market,
      history: rows.slice(-HISTORY_DAYS),
      latestInputs: round3(b.latestInputs),
      inputsAsOf: b.inputsAsOf,
      close: result.close,
      gap: result.gap,
      news: s.news,
      notes,
    };
    await writeFile(path.join(OUT, "stocks", `${s.code}.json`), JSON.stringify(detail));
    summaries.push({
      code: s.code,
      name: s.name,
      market: s.market,
      rank: s.rank,
      marketValue: s.marketValue,
      close: last.close,
      changeRate: prev ? r2((last.close / prev.close - 1) * 100) : 0,
      date: last.date,
      pUp: result.close.forecast?.pUp ?? null,
      expectedReturn: result.close.forecast?.expectedReturn ?? null,
      gapPUp: result.gap.forecast?.pUp ?? null,
      expectedGap: result.gap.forecast?.expectedReturn ?? null,
      hitRate: result.close.backtest?.hitRate ?? null,
    });
    if (last.foreignNet !== null) flows.push({ name: s.name, value: (last.foreignNet * last.close) / 1e8 });
  }

  const m = raw.macro;
  const macroQuotes: MacroQuote[] = [
    macroQuote("kospi", "코스피", raw.kospi),
    macroQuote("kosdaq", "코스닥", raw.kosdaq),
    macroQuote("nasdaq", "나스닥", m.nasdaq),
    macroQuote("sox", "필라델피아 반도체", m.sox),
    macroQuote("ewy", "EWY", m.ewy),
    macroQuote("vix", "VIX", m.vix),
    macroQuote("us10y", "미국 10년", m.us10y, true),
    macroQuote("dxy", "달러지수", m.dxy),
    macroQuote("usdkrw", "원/달러", m.fx),
    macroQuote("oil", "WTI", m.oil),
  ];
  const facts = buildFacts(macroQuotes, flows, summaries);
  const briefing: Briefing = { facts, ai: await aiBriefing(facts) };
  const lastDate = summaries.map((s) => s.date).sort().at(-1) ?? "";
  const chosenInfo = VARIANTS.find((v) => v.id === chosen)!;

  const index: IndexFile = {
    generatedAt: new Date().toISOString(),
    nextTradingDayNote: `${lastDate} 장 마감까지의 데이터와 그 뒤 미국 시장 값으로 계산한 '다음 거래일' 전망입니다.`,
    model: { id: chosen, name: chosenInfo.name },
    calibration: liveCal,
    macro: macroQuotes,
    stocks: summaries,
    briefing,
    failures: raw.failures,
  };
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(index));

  const evaluation: EvaluationFile = {
    generatedAt: index.generatedAt,
    testStart: split,
    testEnd: evalDates.at(-1) ?? "",
    predictionsPerTarget: secondHalf(preds.get(`${chosen}:close`)!).length,
    chosen,
    chosenReason,
    variants,
    calibrationBins: Object.fromEntries(
      TARGETS.map((t) => [t, calibrationBins(secondHalf(preds.get(`${chosen}:${t}`)!), halfCal.get(`${chosen}:${t}`) ?? null)]),
    ) as EvaluationFile["calibrationBins"],
  };
  await writeFile(path.join(OUT, "evaluation.json"), JSON.stringify(evaluation));

  console.log(`완료: ${summaries.length}개 종목, 실패 ${raw.failures.length}개, 전체 ${elapsed(t0)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
