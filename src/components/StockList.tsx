import { Plus, Search, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StockSummary } from "../../shared/types";
import { pct, prob, toneProb, toneText, won } from "../lib/format";

interface Props {
  universe: StockSummary[];
  watchlist: string[];
  selected: string | null;
  onSelect: (code: string) => void;
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
}

type View = "watch" | "all";
type Sort = "rank" | "pUp" | "gap" | "hit" | "per" | "pbr" | "div";

export function StockList({ universe, watchlist, selected, onSelect, onAdd, onRemove }: Props) {
  const [view, setView] = useState<View>("watch");
  const [sort, setSort] = useState<Sort>("gap");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const byCode = new Map(universe.map((s) => [s.code, s]));
  const watchSet = new Set(watchlist);
  const q = query.trim().toLowerCase();
  const matches = q ? universe.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q)).slice(0, 8) : [];

  let rows: StockSummary[];
  if (view === "watch") {
    rows = watchlist.map((c) => byCode.get(c)).filter((s): s is StockSummary => Boolean(s));
  } else {
    rows = [...universe].sort((a, b) => {
      if (sort === "pUp") return (b.pUp ?? -1) - (a.pUp ?? -1);
      if (sort === "gap") return (b.gapPUp ?? -1) - (a.gapPUp ?? -1);
      if (sort === "hit") return (b.hitRate ?? -1) - (a.hitRate ?? -1);
      // 낮을수록 위 (적자 등으로 값이 없거나 음수면 맨 아래)
      const low = (v: number | null) => (v === null || v <= 0 ? Infinity : v);
      if (sort === "per") return low(a.per) - low(b.per);
      if (sort === "pbr") return low(a.pbr) - low(b.pbr);
      if (sort === "div") return (b.dividendYield ?? -1) - (a.dividendYield ?? -1);
      return b.marketValue - a.marketValue;
    });
  }

  const askRemove = (code: string) => {
    window.clearTimeout(timer.current);
    if (confirming === code) {
      setConfirming(null);
      onRemove(code);
      return;
    }
    setConfirming(code);
    timer.current = window.setTimeout(() => setConfirming(null), 4000);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="list-title">
      <div className="px-4 pt-4">
        <h2 id="list-title" className="sr-only">
          종목 목록
        </h2>
        <div role="tablist" aria-label="목록 보기" className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          {(
            [
              ["watch", `관심 종목 ${watchlist.length}`],
              ["all", `전체 ${universe.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`min-h-11 rounded-md text-[15px] font-semibold ${view === key ? "bg-white shadow-sm" : "text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "watch" && (
          <div className="relative mt-3">
            <label htmlFor="stock-search" className="sr-only">
              종목 이름 또는 코드로 찾아 추가
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="stock-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="종목 찾아 추가 (이름·코드)"
              autoComplete="off"
              className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-base placeholder:text-slate-500 focus:border-slate-900 focus:outline-none"
            />
            {q && (
              <div className="mt-2 rounded-lg border border-slate-200" aria-live="polite">
                {matches.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-600">시가총액 상위 {universe.length}개 종목 안에서만 찾을 수 있습니다.</p>
                )}
                {matches.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    disabled={watchSet.has(s.code)}
                    onClick={() => {
                      onAdd(s.code);
                      setQuery("");
                    }}
                    className="flex min-h-11 w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 disabled:text-slate-500"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="num text-sm text-slate-500">{s.code}</span>
                    <span className="ml-auto flex items-center gap-1 text-sm">
                      {watchSet.has(s.code) ? "추가됨" : (
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
        )}

        {view === "all" && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <label htmlFor="sort" className="text-slate-600">
              정렬
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-[15px]"
            >
              <option value="gap">시가 상승 확률 높은 순</option>
              <option value="pUp">종가 상승 확률 높은 순</option>
              <option value="hit">과거 적중률 높은 순</option>
              <option value="per">PER 낮은 순</option>
              <option value="pbr">PBR 낮은 순</option>
              <option value="div">배당수익률 높은 순</option>
              <option value="rank">시가총액 순</option>
            </select>
          </div>
        )}
      </div>

      <div className="mt-3 flex border-y border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-600">
        <span className="flex-1">종목</span>
        <span className="w-24 text-right">종가</span>
        <span className="w-16 text-right leading-tight">
          상승 확률
          <span className="block">시가/종가</span>
        </span>
        <span className="w-11" aria-hidden />
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.length === 0 && <li className="px-4 py-6 text-[15px] text-slate-600">관심 종목이 없습니다. 위에서 찾아 추가해 보세요.</li>}
        {rows.map((s) => {
          const active = s.code === selected;
          const inWatch = watchSet.has(s.code);
          return (
            <li key={s.code} className={`flex items-stretch ${active ? "bg-slate-100" : ""}`}>
              <button
                type="button"
                onClick={() => onSelect(s.code)}
                aria-current={active ? "true" : undefined}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 pl-4 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${active ? "font-bold" : "font-semibold"}`}>{s.name}</span>
                  <span className="num block truncate text-sm text-slate-600">
                    {view === "all" && (sort === "per" || sort === "pbr" || sort === "div")
                      ? (() => {
                          // 정렬 기준 지표를 맨 앞에 (좁은 화면에서 잘려도 보이도록)
                          const parts = {
                            per: `PER ${s.per !== null ? `${s.per.toFixed(1)}배` : "—"}`,
                            pbr: `PBR ${s.pbr !== null ? `${s.pbr.toFixed(2)}배` : "—"}`,
                            div: `배당 ${s.dividendYield !== null ? `${s.dividendYield.toFixed(2)}%` : "—"}`,
                          };
                          return [parts[sort], ...Object.entries(parts).filter(([k]) => k !== sort).map(([, v]) => v)].join(" · ");
                        })()
                      : `${s.code} · ${s.market === "KOSDAQ" ? "코스닥" : "코스피"}`}
                  </span>
                </span>
                <span className="w-24 text-right">
                  <span className="num block text-[15px] font-semibold">{won(s.close)}</span>
                  <span className={`num block text-sm ${toneText(s.changeRate)}`}>{pct(s.changeRate)}</span>
                </span>
                <span className="num w-16 text-right">
                  <span className={`block text-[15px] font-semibold ${s.gapPUp === null ? "text-slate-500" : toneProb(s.gapPUp)}`}>
                    {s.gapPUp === null ? "—" : prob(s.gapPUp)}
                  </span>
                  <span className={`block text-sm ${s.pUp === null ? "text-slate-500" : toneProb(s.pUp)}`}>{s.pUp === null ? "—" : prob(s.pUp)}</span>
                </span>
              </button>
              {view === "watch" ? (
                <button
                  type="button"
                  onClick={() => askRemove(s.code)}
                  className={`flex w-11 shrink-0 items-center justify-center text-sm ${confirming === s.code ? "bg-red-600 font-semibold text-white" : "text-slate-500 hover:text-slate-800"}`}
                  aria-label={confirming === s.code ? `${s.name} 삭제 확인` : `${s.name} 관심 종목에서 빼기`}
                >
                  {confirming === s.code ? "삭제" : <Trash2 className="size-4" aria-hidden />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => (inWatch ? onRemove(s.code) : onAdd(s.code))}
                  aria-pressed={inWatch}
                  aria-label={inWatch ? `${s.name} 관심 종목에서 빼기` : `${s.name} 관심 종목에 추가`}
                  className="flex w-11 shrink-0 items-center justify-center"
                >
                  <Star className={`size-5 ${inWatch ? "fill-amber-400 text-amber-600" : "text-slate-400"}`} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
