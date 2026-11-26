// Yahoo Finance 차트 (키 불필요, 비공식). 해외 지표 일봉.

import type { Bar } from "../../shared/types";
import { getJson } from "../http";

export const MACRO_SYMBOLS = {
  nasdaq: "^IXIC",
  sox: "^SOX",
  ewy: "EWY",
  vix: "^VIX",
  us10y: "^TNX",
  dxy: "DX-Y.NYB",
  fx: "KRW=X",
  oil: "CL=F",
} as const;

const localDate = (ts: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts * 1000));

export async function yahooDaily(symbol: string, range = "5y"): Promise<Bar[]> {
  let lastErr: unknown;
  for (const host of ["query1", "query2"]) {
    try {
      const json = await getJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`);
      const r = json?.chart?.result?.[0];
      if (!r) throw new Error(`no data ${symbol}`);
      const tz = r.meta?.exchangeTimezoneName || "UTC";
      const ts: number[] = r.timestamp ?? [];
      const closes: Array<number | null> = r.indicators?.quote?.[0]?.close ?? [];
      const bars: Bar[] = [];
      ts.forEach((t, i) => {
        const c = closes[i];
        if (typeof c !== "number" || !Number.isFinite(c)) return;
        const date = localDate(t, tz);
        if (bars.length && bars[bars.length - 1].date === date) bars[bars.length - 1].close = c;
        else bars.push({ date, close: c });
      });
      if (bars.length < 2) throw new Error(`too few bars ${symbol}`);
      return bars;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** 1시간봉 (t = 봉이 끝난 시각 UTC ms). 아직 끝나지 않은 마지막 봉은 지금까지의 가격 */
export async function yahooHourly(symbol: string, range = "730d"): Promise<Array<{ t: number; c: number }>> {
  const json = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=${range}`);
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`no hourly data ${symbol}`);
  const ts: number[] = r.timestamp ?? [];
  const closes: Array<number | null> = r.indicators?.quote?.[0]?.close ?? [];
  const now = Date.now();
  const out: Array<{ t: number; c: number }> = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof c !== "number" || !Number.isFinite(c)) return;
    out.push({ t: Math.min((t + 3600) * 1000, now), c });
  });
  return out;
}
