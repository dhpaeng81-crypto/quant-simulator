import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SECTOR_LABELS } from "../../shared/model";
import type { Prediction, Stock, StockWithQuote } from "../../shared/types";
import { api } from "../lib/api";
import { pct, toneText, won } from "../lib/format";

interface Props {
  stocks: StockWithQuote[];
  loading: boolean;
  selected: string | null;
  predictions: Record<string, Prediction | null>;
  onSelect: (code: string) => void;
  onAdd: (stock: Stock) => void;
  onRemove: (code: string) => void;
}

export function Watchlist({ stocks, loading, selected, predictions, onSelect, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Stock[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmTimer = useRef<number | undefined>(undefined);

  // 입력이 멈추고 0.35초 뒤 검색
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await api.search(q);
        if (!cancelled) {
          setResults(found);
          setSearchError(found.length ? null : "검색 결과가 없습니다. 6자리 종목코드로도 찾을 수 있습니다.");
        }
      } catch (e) {
        if (!cancelled) setSearchError((e as Error).message);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  const askRemove = (code: string) => {
    if (confirming === code) {
      window.clearTimeout(confirmTimer.current);
      setConfirming(null);
      onRemove(code);
      return;
    }
    setConfirming(code);
    window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirming(null), 4000);
  };

  const inList = new Set(stocks.map((s) => s.code));

  return (
    <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="watchlist-title">
      <div className="px-4 pt-4">
        <h2 id="watchlist-title" className="text-base font-bold">
          관심 종목
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">이 기기에만 저장됩니다.</p>
        <div className="relative mt-3">
          <label htmlFor="stock-search" className="sr-only">
            종목 이름 또는 코드 검색
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="stock-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목 이름 또는 6자리 코드"
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-base placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          />
        </div>
        {(results.length > 0 || searching || searchError) && (
          <div className="mt-2 rounded-lg border border-slate-200" aria-live="polite">
            {searching && <p className="px-3 py-2 text-sm text-slate-500">찾는 중…</p>}
            {!searching && searchError && <p className="px-3 py-2 text-sm text-slate-600">{searchError}</p>}
            {!searching &&
              results.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  disabled={inList.has(r.code)}
                  onClick={() => {
                    onAdd(r);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 disabled:text-slate-400"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="num text-sm text-slate-500">
                    {r.code} · {r.market === "KOSDAQ" ? "코스닥" : "코스피"}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-sm">
                    {inList.has(r.code) ? (
                      "추가됨"
                    ) : (
                      <>
                        <Plus className="size-4" aria-hidden /> 추가
                      </>
                    )}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        {loading && stocks.length === 0 && <li className="px-4 py-6 text-sm text-slate-500">시세를 불러오는 중…</li>}
        {!loading && stocks.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-600">관심 종목이 없습니다. 위에서 검색해 추가해 보세요.</li>
        )}
        {stocks.map((s) => {
          const p = predictions[s.code];
          const active = s.code === selected;
          return (
            <li key={s.code} className={`flex items-stretch ${active ? "bg-slate-50" : ""}`}>
              <button
                type="button"
                onClick={() => onSelect(s.code)}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-14 flex-1 items-center gap-3 py-2.5 pr-2 pl-4 text-left ${active ? "border-l-4 border-slate-900 pl-3" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="num block text-sm text-slate-500">
                    {s.code} · {SECTOR_LABELS[s.sector]}
                  </span>
                </span>
                <span className="text-right">
                  {s.quote ? (
                    <>
                      <span className="num block font-semibold">{won(s.quote.price)}</span>
                      <span className={`num block text-sm ${toneText(s.quote.changeRate)}`}>{pct(s.quote.changeRate)}</span>
                    </>
                  ) : (
                    <span className="block text-sm text-slate-500">시세 없음</span>
                  )}
                </span>
                {p && (
                  <span
                    className={`num w-14 shrink-0 rounded-md px-1.5 py-1 text-center text-sm font-semibold ${
                      p.signal === "NEUTRAL"
                        ? "bg-slate-100 text-slate-600"
                        : p.direction === "UP"
                          ? "bg-up-soft text-up"
                          : "bg-down-soft text-down"
                    }`}
                    title="현재 시나리오 기준 신호"
                  >
                    {p.signal === "NEUTRAL" ? "중립" : p.direction === "UP" ? "▲" : "▼"} {p.confidence}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => askRemove(s.code)}
                className={`flex min-w-11 shrink-0 items-center justify-center px-2 text-sm ${
                  confirming === s.code ? "bg-red-600 font-semibold text-white" : "text-slate-400 hover:text-slate-700"
                }`}
                aria-label={confirming === s.code ? `${s.name} 삭제 확인` : `${s.name} 삭제`}
              >
                {confirming === s.code ? "삭제" : <Trash2 className="size-4" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
