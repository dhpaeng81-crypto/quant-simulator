// Yahoo Finance 차트 API (비공식). 응답 형식이 바뀌거나 막힐 수 있으므로 실패는 null로 돌려줍니다.

import { fetchJson, TtlCache } from "../http";
import type { DailyBar } from "../backtest";
import type { Market, Quote } from "../../shared/types";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

interface ChartMeta {
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketVolume?: number;
  exchangeTimezoneName?: string;
  longName?: string;
  shortName?: string;
  symbol?: string;
}

export interface ChartData {
  meta: ChartMeta;
  bars: DailyBar[];
}

const chartCache = new TtlCache<ChartData | null>(60_000);

function toLocalDate(ts: number, timeZone: string): string {
  // en-CA 형식은 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ts * 1000),
  );
}

async function loadChart(symbol: string, range: string): Promise<ChartData | null> {
  for (const host of HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
      const json = await fetchJson<any>(url, {}, 4000);
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const meta: ChartMeta = result.meta || {};
      const tz = meta.exchangeTimezoneName || "UTC";
      const ts: number[] = result.timestamp || [];
      const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
      const bars: DailyBar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (typeof c === "number" && Number.isFinite(c)) {
          const date = toLocalDate(ts[i], tz);
          // 같은 날짜가 두 번 오면(장중 봉) 마지막 값으로 덮어씀
          if (bars.length && bars[bars.length - 1].date === date) bars[bars.length - 1].close = c;
          else bars.push({ date, close: c });
        }
      }
      return { meta, bars };
    } catch {
      // 다음 호스트 시도
    }
  }
  return null;
}

export function getChart(symbol: string, range = "1mo", force = false): Promise<ChartData | null> {
  return chartCache.getOrLoad(`${symbol}|${range}`, () => loadChart(symbol, range), force);
}

export function quoteFromChart(chart: ChartData | null): Quote | null {
  if (!chart || chart.bars.length < 2) return null;
  const last = chart.bars[chart.bars.length - 1];
  const prev = chart.bars[chart.bars.length - 2];
  const price = typeof chart.meta.regularMarketPrice === "number" ? chart.meta.regularMarketPrice : last.close;
  const change = price - prev.close;
  return {
    price,
    previousClose: prev.close,
    change: Math.round(change * 100) / 100,
    changeRate: Math.round((change / prev.close) * 10000) / 100,
    volume: typeof chart.meta.regularMarketVolume === "number" ? chart.meta.regularMarketVolume : null,
    asOf: chart.meta.regularMarketTime ? new Date(chart.meta.regularMarketTime * 1000).toISOString() : null,
  };
}

export const yahooSymbol = (code: string, market: Market) => `${code}.${market === "KOSDAQ" ? "KQ" : "KS"}`;

/** 6자리 코드가 코스피/코스닥 중 어디에 있는지 확인 */
export async function probeKoreanCode(code: string): Promise<{ market: Market; name: string | null } | null> {
  for (const market of ["KOSPI", "KOSDAQ"] as Market[]) {
    const chart = await getChart(yahooSymbol(code, market), "5d");
    if (chart && chart.bars.length > 0) {
      return { market, name: chart.meta.longName || chart.meta.shortName || null };
    }
  }
  return null;
}

/** 이름 검색 (Yahoo search). 한국 종목만 골라 냄 */
export async function searchYahoo(q: string): Promise<Array<{ code: string; market: Market; name: string }>> {
  try {
    const json = await fetchJson<any>(
      `${HOSTS[0]}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
      {},
      4000,
    );
    const out: Array<{ code: string; market: Market; name: string }> = [];
    for (const item of json?.quotes || []) {
      const m = /^(\d{6})\.(KS|KQ)$/.exec(item?.symbol || "");
      if (m) out.push({ code: m[1], market: m[2] === "KQ" ? "KOSDAQ" : "KOSPI", name: item.longname || item.shortname || m[1] });
    }
    return out;
  } catch {
    return [];
  }
}

export const MACRO_SYMBOLS = {
  nasdaq: "^IXIC",
  sox: "^SOX",
  usdkrw: "USDKRW=X",
  oil: "CL=F",
} as const;
