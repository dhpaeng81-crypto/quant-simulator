// 네이버: 종목 이름 검색(자동완성 JSON)과 뉴스(공식 검색 API, 키가 있을 때만)

import { fetchJson } from "../http";
import type { Market, NewsItem } from "../../shared/types";

/** 네이버 증권 자동완성. 비공식 엔드포인트라 형식이 바뀌면 빈 배열을 돌려줌 */
export async function searchNaverStocks(q: string): Promise<Array<{ code: string; market: Market; name: string }>> {
  try {
    const json = await fetchJson<any>(
      `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`,
      { headers: { Referer: "https://finance.naver.com/" } },
      4000,
    );
    const items: any[] = Array.isArray(json?.items) ? json.items : [];
    const out: Array<{ code: string; market: Market; name: string }> = [];
    for (const it of items) {
      const code = String(it?.code ?? "");
      const type = String(it?.typeCode ?? it?.typeName ?? "").toUpperCase();
      if (!/^\d{6}$/.test(code)) continue;
      if (it?.nationCode && it.nationCode !== "KOR") continue;
      const market: Market = type.includes("KOSDAQ") || type.includes("코스닥") ? "KOSDAQ" : "KOSPI";
      out.push({ code, market, name: String(it?.name ?? code) });
    }
    return out;
  } catch {
    return [];
  }
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

export const naverNewsEnabled = () => Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

/** 네이버 검색 API 뉴스. 키가 없거나 실패하면 null (화면에서 '뉴스 없음'으로 표시) */
export async function fetchNaverNews(query: string, count = 3): Promise<NewsItem[] | null> {
  if (!naverNewsEnabled()) return null;
  try {
    const json = await fetchJson<any>(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${count}&sort=date`,
      {
        headers: {
          "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
          "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
        },
      },
      4000,
    );
    return (json?.items || []).slice(0, count).map((it: any) => {
      const link = String(it.originallink || it.link || "");
      let source: string | null = null;
      try {
        source = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        source = null;
      }
      return {
        title: stripTags(String(it.title || "")),
        link,
        source,
        publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      } satisfies NewsItem;
    });
  } catch {
    return null;
  }
}
