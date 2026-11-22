// 네이버 증권 (키 불필요). 비공식 엔드포인트라 형식이 바뀌면 여기서 오류가 납니다.

import type { Bar, DailyRow, Market, NewsItem } from "../../shared/types";
import { getJson, getText } from "../http";

const num = (s: unknown) => Number(String(s ?? "").replace(/[,+%\s]/g, ""));
const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

export interface RankedStock {
  code: string;
  name: string;
  market: Market;
  rank: number;
  marketValue: number; // 억 원
}

/** 시가총액 상위 보통주 (ETF·우선주 제외) */
export async function topByMarketValue(market: Market, count: number): Promise<RankedStock[]> {
  const out: RankedStock[] = [];
  for (let page = 1; page <= 5 && out.length < count; page++) {
    const json = await getJson(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`);
    const stocks: any[] = json?.stocks ?? [];
    if (stocks.length === 0) break;
    for (const s of stocks) {
      if (s.stockEndType !== "stock") continue;
      if (/우[A-C]?$|\(전환\)$/.test(s.stockName)) continue;
      if (!/^\d{6}$/.test(s.itemCode)) continue;
      out.push({ code: s.itemCode, name: s.stockName, market, rank: out.length + 1, marketValue: num(s.marketValue) });
      if (out.length >= count) break;
    }
  }
  return out;
}

/** 일봉 (종가·거래량). symbol은 종목코드 또는 KOSPI/KOSDAQ */
export async function dailyPrices(symbol: string, count = 600): Promise<Array<{ date: string; open: number; close: number; volume: number }>> {
  const xml = await getText(`https://fchart.stock.naver.com/sise.nhn?symbol=${symbol}&timeframe=day&count=${count}&requestType=0`);
  const out: Array<{ date: string; open: number; close: number; volume: number }> = [];
  for (const m of xml.matchAll(/<item data="(\d{8})\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^"]*)"/g)) {
    const open = Number(m[2]);
    const close = Number(m[5]);
    const volume = Number(m[6]);
    if (Number.isFinite(close) && close > 0)
      out.push({ date: ymd(m[1]), open: Number.isFinite(open) ? open : 0, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return out;
}

/** 일별 외국인·기관 순매수 수량. pages × 60거래일 */
export async function investorFlows(code: string, pages = 10): Promise<Map<string, { foreign: number; institution: number }>> {
  const map = new Map<string, { foreign: number; institution: number }>();
  let cursor: string | null = null;
  for (let p = 0; p < pages; p++) {
    const url: string = `https://m.stock.naver.com/api/stock/${code}/trend?pageSize=60${cursor ? `&bizdate=${cursor}` : ""}`;
    const rows: any[] = await getJson(url);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      const f = num(r.foreignerPureBuyQuant);
      const i = num(r.organPureBuyQuant);
      if (/^\d{8}$/.test(r.bizdate) && Number.isFinite(f) && Number.isFinite(i)) map.set(ymd(r.bizdate), { foreign: f, institution: i });
    }
    cursor = rows[rows.length - 1].bizdate; // 이 날짜 '이전'부터 다음 페이지
    if (rows.length < 60) break;
  }
  return map;
}

export async function stockRows(code: string): Promise<DailyRow[]> {
  const [prices, flows] = await Promise.all([dailyPrices(code), investorFlows(code)]);
  return prices.map((p) => {
    const f = flows.get(p.date);
    return { date: p.date, open: p.open, close: p.close, volume: p.volume, foreignNet: f?.foreign ?? null, institutionNet: f?.institution ?? null };
  });
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export async function stockNews(code: string, count = 3): Promise<NewsItem[]> {
  const groups: any[] = await getJson(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=${count}&page=1`);
  const out: NewsItem[] = [];
  for (const g of groups ?? []) {
    const it = g?.items?.[0];
    if (!it?.title) continue;
    const dt = String(it.datetime ?? "");
    const publishedAt = /^\d{12}$/.test(dt)
      ? new Date(`${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(8, 10)}:${dt.slice(10, 12)}:00+09:00`).toISOString()
      : new Date().toISOString();
    const url = it.mobileNewsUrl || (it.officeId && it.articleId ? `https://n.news.naver.com/mnews/article/${it.officeId}/${it.articleId}` : "");
    if (!url.startsWith("https://")) continue;
    out.push({ title: decode(it.titleFull || it.title), url, source: String(it.officeName ?? ""), publishedAt });
  }
  return out.slice(0, count);
}

export const indexBars = async (symbol: "KOSPI" | "KOSDAQ", count = 5): Promise<Bar[]> =>
  (await dailyPrices(symbol, count)).map(({ date, close }) => ({ date, close }));
