import "dotenv/config";
import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_STOCKS, guessSector, isStockCode } from "../shared/catalog";
import { predict } from "../shared/model";
import { rulesNarrative } from "../shared/narrative";
import type { MacroValue, Scenario, ScenarioReference, Stock, StockWithQuote } from "../shared/types";
import { runBacktest } from "./backtest";
import { TtlCache } from "./http";
import { generateCommentary, generateNarrative, geminiEnabled } from "./sources/gemini";
import { fetchNaverNews, naverNewsEnabled, searchNaverStocks } from "./sources/naver";
import { getChart, MACRO_SYMBOLS, probeKoreanCode, quoteFromChart, searchYahoo, yahooSymbol } from "./sources/yahoo";

const app = express();
app.use(express.json({ limit: "20kb" }));

// ── 종목 정보 (이름·시장·업종) ─────────────────────────────────────────
// 종목 자체의 정보만 모아 두는 캐시. 사용자별 관심 종목 목록은 브라우저에만 저장합니다.
const stockInfo = new Map<string, Stock>(DEFAULT_STOCKS.map((s) => [s.code, s]));

async function resolveStock(code: string): Promise<Stock | null> {
  const known = stockInfo.get(code);
  if (known) return known;
  const probe = await probeKoreanCode(code);
  if (!probe) return null;
  const stock: Stock = { code, name: probe.name || code, market: probe.market, sector: guessSector(probe.name) };
  if (stockInfo.size < 2000) stockInfo.set(code, stock);
  return stock;
}

async function withQuote(stock: Stock, force = false): Promise<StockWithQuote> {
  const chart = await getChart(yahooSymbol(stock.code, stock.market), "1mo", force);
  return { ...stock, quote: quoteFromChart(chart) };
}

function parseCodes(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isStockCode)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 30);
}

// ── 해외 지표 ────────────────────────────────────────────────────
const MACRO_META: Array<{ id: MacroValue["id"]; name: string; unit: string }> = [
  { id: "nasdaq", name: "나스닥", unit: "pt" },
  { id: "sox", name: "필라델피아 반도체", unit: "pt" },
  { id: "usdkrw", name: "원/달러 환율", unit: "원" },
  { id: "oil", name: "WTI 유가", unit: "$" },
];

async function loadMacro(force = false): Promise<MacroValue[]> {
  return Promise.all(
    MACRO_META.map(async (m) => {
      const q = quoteFromChart(await getChart(MACRO_SYMBOLS[m.id], "1mo", force));
      return {
        ...m,
        value: q ? q.price : null,
        previousClose: q ? q.previousClose : null,
        changeRate: q ? q.changeRate : null,
        asOf: q ? q.asOf : null,
      };
    }),
  );
}

// ── 입력 검증 ────────────────────────────────────────────────────
const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

function parseScenario(body: any): { scenario: Scenario; reference: ScenarioReference } | null {
  const s = body?.scenario ?? {};
  const r = body?.reference ?? {};
  const scenario = {
    usdKrw: num(s.usdKrw, 500, 3000),
    nasdaqChange: num(s.nasdaqChange, -20, 20),
    semiconductorChange: num(s.semiconductorChange, -20, 20),
    oilPrice: num(s.oilPrice, 1, 500),
    foreignFlow: num(s.foreignFlow, -5, 5),
    newsSentiment: num(s.newsSentiment, -100, 100),
  };
  const reference = { usdKrw: num(r.usdKrw, 500, 3000), oilPrice: num(r.oilPrice, 1, 500) };
  if (Object.values(scenario).some((v) => v === null) || Object.values(reference).some((v) => v === null)) return null;
  return { scenario: scenario as Scenario, reference: reference as ScenarioReference };
}

const send = (res: Response, data: unknown, status = 200) => res.status(status).json(data);
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

// ── API ─────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => send(res, { gemini: geminiEnabled(), naverNews: naverNewsEnabled() }));

app.get("/api/macro", async (req, res) => {
  send(res, await loadMacro(req.query.refresh === "1"));
});

app.get("/api/stocks", async (req, res) => {
  const codes = parseCodes(req.query.codes);
  const force = req.query.refresh === "1";
  const stocks = (await Promise.all(codes.map(resolveStock))).filter((s): s is Stock => s !== null);
  send(res, await Promise.all(stocks.map((s) => withQuote(s, force))));
});

app.get("/api/stocks/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 40);
  if (!q) return send(res, []);

  if (isStockCode(q)) {
    const stock = await resolveStock(q);
    return send(res, stock ? [stock] : []);
  }

  const lower = q.toLowerCase();
  const local = [...stockInfo.values()].filter((s) => s.name.toLowerCase().includes(lower));
  const remote = (await searchNaverStocks(q)).concat(local.length ? [] : await searchYahoo(q));

  const merged = new Map<string, Stock>(local.map((s) => [s.code, s]));
  for (const r of remote) {
    if (merged.has(r.code)) continue;
    const stock: Stock = stockInfo.get(r.code) ?? { code: r.code, name: r.name, market: r.market, sector: guessSector(r.name) };
    merged.set(r.code, stock);
    if (!stockInfo.has(r.code) && stockInfo.size < 2000) stockInfo.set(r.code, stock);
  }
  send(res, [...merged.values()].slice(0, 8));
});

app.post("/api/narrative", async (req: Request, res: Response) => {
  const code = String(req.body?.code ?? "");
  const parsed = parseScenario(req.body);
  if (!isStockCode(code) || !parsed) return fail(res, 400, "입력값이 올바르지 않습니다.");
  const base = await resolveStock(code);
  if (!base) return fail(res, 404, "종목을 찾을 수 없습니다.");
  const stock = await withQuote(base);
  if (!stock.quote) return fail(res, 503, "시세를 가져오지 못해 해설을 만들 수 없습니다.");

  // 숫자는 서버에서 같은 공식으로 다시 계산 (화면에서 보낸 결과를 믿지 않음)
  const prediction = predict({
    sector: stock.sector,
    price: stock.quote.price,
    prevDayChangeRate: stock.quote.changeRate,
    ...parsed,
  });
  const narrative =
    (await generateNarrative(stock, parsed.scenario, prediction)) ??
    rulesNarrative(stock.name, parsed.scenario, parsed.reference, prediction);
  send(res, narrative);
});

const newsCache = new TtlCache<unknown>(10 * 60_000);
app.get("/api/news/:code", async (req, res) => {
  const code = req.params.code;
  if (!isStockCode(code)) return fail(res, 400, "종목코드가 올바르지 않습니다.");
  const stock = await resolveStock(code);
  if (!stock) return fail(res, 404, "종목을 찾을 수 없습니다.");
  const items = await newsCache.getOrLoad(code, async () => {
    const news = await fetchNaverNews(stock.name);
    return { enabled: naverNewsEnabled(), items: news ?? [] };
  });
  send(res, items);
});

// 시황 브리핑: 4시간 캐시. 새로고침은 마지막 생성 후 10분이 지나야 가능
let commentaryCache: { at: number; data: unknown } | null = null;
let commentaryRunning: Promise<unknown> | null = null;
app.get("/api/commentary", async (req, res) => {
  const now = Date.now();
  const age = commentaryCache ? now - commentaryCache.at : Infinity;
  const wantRefresh = req.query.refresh === "1" && age > 10 * 60_000;
  if (commentaryCache && age < 4 * 3600_000 && !wantRefresh) return send(res, commentaryCache.data);

  commentaryRunning ??= (async () => {
    const macro = await loadMacro();
    const context = macro
      .filter((m) => m.value !== null)
      .map((m) => `- ${m.name}: ${m.value!.toLocaleString("en-US")}${m.unit} (${m.changeRate! >= 0 ? "+" : ""}${m.changeRate}%)`)
      .join("\n");
    const commentary = await generateCommentary(context);
    const data = { enabled: geminiEnabled(), commentary };
    // 실패한 결과는 짧게(10분)만 기억
    commentaryCache = { at: commentary ? Date.now() : Date.now() - 4 * 3600_000 + 10 * 60_000, data };
    return data;
  })().finally(() => {
    commentaryRunning = null;
  });
  send(res, await commentaryRunning);
});

app.get("/api/backtest/:code", async (req, res) => {
  const code = req.params.code;
  if (!isStockCode(code)) return fail(res, 400, "종목코드가 올바르지 않습니다.");
  const stock = await resolveStock(code);
  if (!stock) return fail(res, 404, "종목을 찾을 수 없습니다.");

  const [stockChart, nasdaq, sox, oil, fx] = await Promise.all([
    getChart(yahooSymbol(stock.code, stock.market), "2mo"),
    getChart(MACRO_SYMBOLS.nasdaq, "3mo"),
    getChart(MACRO_SYMBOLS.sox, "3mo"),
    getChart(MACRO_SYMBOLS.oil, "3mo"),
    getChart(MACRO_SYMBOLS.usdkrw, "3mo"),
  ]);
  if (!stockChart || stockChart.bars.length < 4) {
    return fail(res, 503, "과거 시세를 가져오지 못해 백테스트를 할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  send(
    res,
    runBacktest({
      code: stock.code,
      name: stock.name,
      sector: stock.sector,
      stock: stockChart.bars,
      nasdaq: nasdaq?.bars ?? [],
      sox: sox?.bars ?? [],
      oil: oil?.bars ?? [],
      usdKrw: fx?.bars ?? [],
      days: 10,
    }),
  );
});

app.use("/api", (_req, res) => fail(res, 404, "없는 API입니다."));

// ── 화면 제공 ────────────────────────────────────────────────────
async function start() {
  const port = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV === "production") {
    // 빌드 후 구조: dist-server/index.js(서버) + dist/(화면)
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  app.listen(port, () => console.log(`http://localhost:${port}`));
}

start();
