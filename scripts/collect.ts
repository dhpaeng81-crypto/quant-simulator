// 데이터 수집 → 학습 → 백테스트 → public/data/*.json 작성.
// GitHub Actions가 평일 하루 두 번 실행합니다. 로컬에서는 `npm run collect`.
//
// 환경 변수(선택): UNIVERSE_KOSPI, UNIVERSE_KOSDAQ (종목 수), GEMINI_API_KEY, GEMINI_MODEL, OUT_DIR

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDataset, fitModel, forecast, TRAIN_WINDOW, walkForward, type MacroSeries } from "../shared/model";
import type { Bar, Briefing, IndexFile, MacroQuote, StockDetail, StockSummary } from "../shared/types";
import { aiBriefing } from "./sources/gemini";
import { indexBars, stockNews, stockRows, topByMarketValue, type RankedStock } from "./sources/naver";
import { MACRO_SYMBOLS, yahooDaily } from "./sources/yahoo";

if (existsSync(".env")) process.loadEnvFile(".env");

const OUT = path.resolve(process.env.OUT_DIR || "public/data");
const N_KOSPI = Number(process.env.UNIVERSE_KOSPI || 60);
const N_KOSDAQ = Number(process.env.UNIVERSE_KOSDAQ || 40);
const HISTORY_DAYS = 120;
const CONCURRENCY = 4;
const MAX_FAILURE_RATIO = 0.3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const signed = (v: number, d = 2) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const pctChange = (bars: Bar[]) => (bars.length >= 2 ? (bars[bars.length - 1].close / bars[bars.length - 2].close - 1) * 100 : 0);

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

function macroQuote(id: MacroQuote["id"], name: string, bars: Bar[]): MacroQuote {
  const last = bars[bars.length - 1];
  return { id, name, value: r2(last.close), changeRate: r2(pctChange(bars)), date: last.date };
}

async function processStock(s: RankedStock, macro: MacroSeries) {
  const rows = await stockRows(s.code);
  if (rows.length < 30) throw new Error("시세 부족");
  const news = await stockNews(s.code).catch(() => []);

  const { samples, latestInputs, inputsAsOf } = buildDataset(rows, macro);
  const model = fitModel(samples.slice(-TRAIN_WINDOW));
  const fc = model && latestInputs ? forecast(model, latestInputs) : null;
  const backtest = walkForward(samples);

  const notes: string[] = [];
  if (!model) notes.push("학습할 수 있는 날이 60일보다 적어 모델을 만들지 않았습니다(최근 상장 등).");
  if (model && !latestInputs) notes.push("다음 거래일 입력값 일부가 없어 오늘 전망은 계산하지 않았습니다.");

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const detail: StockDetail = {
    code: s.code,
    name: s.name,
    market: s.market,
    history: rows.slice(-HISTORY_DAYS),
    model,
    latestInputs: latestInputs && Object.fromEntries(Object.entries(latestInputs).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) as any,
    inputsAsOf,
    forecast: fc,
    backtest,
    news,
    notes,
  };
  const summary: StockSummary = {
    code: s.code,
    name: s.name,
    market: s.market,
    rank: s.rank,
    marketValue: s.marketValue,
    close: last.close,
    changeRate: prev ? r2((last.close / prev.close - 1) * 100) : 0,
    date: last.date,
    pUp: fc ? fc.pUp : null,
    expectedReturn: fc ? fc.expectedReturn : null,
    hitRate: backtest?.hitRate ?? null,
  };
  const foreignValue = last.foreignNet !== null ? (last.foreignNet * last.close) / 1e8 : null; // 억 원
  return { detail, summary, foreignValue };
}

function buildFacts(macro: MacroQuote[], flows: Array<{ name: string; value: number }>, summaries: StockSummary[]): string[] {
  const m = Object.fromEntries(macro.map((q) => [q.id, q]));
  const facts: string[] = [];
  if (m.nasdaq && m.sox)
    facts.push(`직전 미국 거래일(${m.nasdaq.date}) 나스닥 ${signed(m.nasdaq.changeRate)}%, 필라델피아 반도체 ${signed(m.sox.changeRate)}%.`);
  if (m.usdkrw && m.oil)
    facts.push(
      `원/달러 ${m.usdkrw.value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원(${signed(m.usdkrw.changeRate)}%), WTI ${m.oil.value.toFixed(2)}달러(${signed(m.oil.changeRate)}%).`,
    );
  if (m.kospi && m.kosdaq)
    facts.push(`${m.kospi.date} 코스피 ${m.kospi.value.toLocaleString("ko-KR")}(${signed(m.kospi.changeRate)}%), 코스닥 ${m.kosdaq.value.toLocaleString("ko-KR")}(${signed(m.kosdaq.changeRate)}%).`);
  const sorted = [...flows].sort((a, b) => b.value - a.value);
  const fmt = (x: { name: string; value: number }) => `${x.name}(${Math.round(x.value).toLocaleString("ko-KR")}억)`;
  if (sorted.length >= 6) {
    facts.push(`외국인 순매수 상위: ${sorted.slice(0, 3).map(fmt).join(", ")}.`);
    facts.push(`외국인 순매도 상위: ${sorted.slice(-3).reverse().map(fmt).join(", ")}.`);
  }
  const withP = summaries.filter((s) => s.pUp !== null);
  if (withP.length) {
    const avg = withP.reduce((a, s) => a + s.pUp!, 0) / withP.length;
    const ups = withP.filter((s) => s.pUp! >= 0.5).length;
    facts.push(`모델은 ${withP.length}개 종목 중 ${ups}개를 다음 거래일 '상승 쪽'으로 봤습니다(평균 상승 확률 ${(avg * 100).toFixed(1)}%).`);
  }
  return facts;
}

async function main() {
  const started = Date.now();
  console.log(`수집 시작 → ${OUT}`);

  const [nasdaq, sox, fx, oil, kospi, kosdaq] = await Promise.all([
    yahooDaily(MACRO_SYMBOLS.nasdaq),
    yahooDaily(MACRO_SYMBOLS.sox),
    yahooDaily(MACRO_SYMBOLS.fx),
    yahooDaily(MACRO_SYMBOLS.oil),
    indexBars("KOSPI"),
    indexBars("KOSDAQ"),
  ]);
  const macroSeries: MacroSeries = { nasdaq, sox, fx, oil };
  const macro: MacroQuote[] = [
    macroQuote("kospi", "코스피", kospi),
    macroQuote("kosdaq", "코스닥", kosdaq),
    macroQuote("nasdaq", "나스닥", nasdaq),
    macroQuote("sox", "필라델피아 반도체", sox),
    macroQuote("usdkrw", "원/달러", fx),
    macroQuote("oil", "WTI", oil),
  ];

  const universe = [...(await topByMarketValue("KOSPI", N_KOSPI)), ...(await topByMarketValue("KOSDAQ", N_KOSDAQ))];
  console.log(`종목 ${universe.length}개`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "stocks"), { recursive: true });

  const failures: string[] = [];
  const results = await pool(universe, CONCURRENCY, async (s) => {
    try {
      const r = await processStock(s, macroSeries);
      await writeFile(path.join(OUT, "stocks", `${s.code}.json`), JSON.stringify(r.detail));
      process.stdout.write(".");
      return r;
    } catch (e) {
      failures.push(s.code);
      console.warn(`\n[실패] ${s.code} ${s.name}: ${(e as Error).message}`);
      return null;
    }
  });
  console.log("");

  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (universe.length === 0 || failures.length / universe.length > MAX_FAILURE_RATIO) {
    throw new Error(`실패가 너무 많습니다 (${failures.length}/${universe.length}). 배포하지 않습니다.`);
  }

  const summaries = ok.map((r) => r.summary);
  const flows = ok.filter((r) => r.foreignValue !== null).map((r) => ({ name: r.summary.name, value: r.foreignValue! }));
  const facts = buildFacts(macro, flows, summaries);
  const briefing: Briefing = { facts, ai: await aiBriefing(facts) };

  const lastDate = summaries.map((s) => s.date).sort().at(-1) ?? "";
  const index: IndexFile = {
    generatedAt: new Date().toISOString(),
    nextTradingDayNote: `${lastDate} 장 마감까지의 데이터와 그 뒤 미국 시장 값으로 계산한 '다음 거래일' 전망입니다.`,
    macro,
    stocks: summaries,
    briefing,
    failures,
  };
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(index));

  const bt = summaries.filter((s) => s.hitRate !== null);
  const avgHit = bt.reduce((a, s) => a + s.hitRate!, 0) / (bt.length || 1);
  console.log(`완료: ${ok.length}개 성공, ${failures.length}개 실패, 평균 백테스트 적중률 ${avgHit.toFixed(1)}%, ${((Date.now() - started) / 1000).toFixed(0)}초`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
