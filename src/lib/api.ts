import type {
  BacktestResult,
  Commentary,
  MacroValue,
  Narrative,
  NewsItem,
  Scenario,
  ScenarioReference,
  Stock,
  StockWithQuote,
} from "../../shared/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `요청 실패 (${res.status})`);
  return body as T;
}

export const api = {
  health: () => request<{ gemini: boolean; naverNews: boolean }>("/api/health"),
  macro: (refresh = false) => request<MacroValue[]>(`/api/macro${refresh ? "?refresh=1" : ""}`),
  stocks: (codes: string[], refresh = false) =>
    request<StockWithQuote[]>(`/api/stocks?codes=${codes.join(",")}${refresh ? "&refresh=1" : ""}`),
  search: (q: string) => request<Stock[]>(`/api/stocks/search?q=${encodeURIComponent(q)}`),
  narrative: (code: string, scenario: Scenario, reference: ScenarioReference) =>
    request<Narrative>("/api/narrative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, scenario, reference }),
    }),
  news: (code: string) => request<{ enabled: boolean; items: NewsItem[] }>(`/api/news/${code}`),
  commentary: (refresh = false) =>
    request<{ enabled: boolean; commentary: Commentary | null }>(`/api/commentary${refresh ? "?refresh=1" : ""}`),
  backtest: (code: string) => request<BacktestResult>(`/api/backtest/${code}`),
};
