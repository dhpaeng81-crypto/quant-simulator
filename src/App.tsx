import { BarChart3, List, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { predict } from "../shared/model";
import type {
  BacktestResult,
  Commentary,
  MacroValue,
  Narrative,
  NewsItem,
  Prediction,
  Scenario,
  ScenarioReference,
  Stock,
  StockWithQuote,
} from "../shared/types";
import { BacktestPanel } from "./components/BacktestPanel";
import { BriefingCard } from "./components/BriefingCard";
import { ReportPanel } from "./components/ReportPanel";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { TickerBar } from "./components/TickerBar";
import { Watchlist } from "./components/Watchlist";
import { api } from "./lib/api";
import { loadWatchlist, saveWatchlist } from "./lib/storage";

// 실시간 지표를 못 가져왔을 때 쓰는 임시 기준값 (화면에 '임시'라고 표시)
const FALLBACK = { usdKrw: 1400, oilPrice: 70 };

type MobileTab = "stocks" | "scenario" | "report";

function deriveLive(macro: MacroValue[]): { live: Scenario; reference: ScenarioReference; available: boolean } {
  const get = (id: MacroValue["id"]) => macro.find((m) => m.id === id);
  const fx = get("usdkrw");
  const oil = get("oil");
  const nq = get("nasdaq");
  const sox = get("sox");
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    live: {
      usdKrw: fx?.value ? Math.round(fx.value) : FALLBACK.usdKrw,
      oilPrice: oil?.value ? r1(oil.value) : FALLBACK.oilPrice,
      nasdaqChange: nq?.changeRate != null ? r1(nq.changeRate) : 0,
      semiconductorChange: sox?.changeRate != null ? r1(sox.changeRate) : 0,
      foreignFlow: 0,
      newsSentiment: 0,
    },
    reference: {
      usdKrw: fx?.previousClose ?? fx?.value ?? FALLBACK.usdKrw,
      oilPrice: oil?.previousClose ?? oil?.value ?? FALLBACK.oilPrice,
    },
    available: Boolean(fx?.value && oil?.value && nq?.changeRate != null && sox?.changeRate != null),
  };
}

export default function App() {
  const [codes, setCodes] = useState<string[]>(loadWatchlist);
  const [stocks, setStocks] = useState<StockWithQuote[]>([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [stocksError, setStocksError] = useState<string | null>(null);
  const [macro, setMacro] = useState<MacroValue[]>([]);
  const [macroLoading, setMacroLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => loadWatchlist()[0] ?? null);

  const { live, reference, available } = useMemo(() => deriveLive(macro), [macro]);
  const [scenario, setScenario] = useState<Scenario>(live);
  const touched = useRef(false);

  const [tab, setTab] = useState<"prediction" | "backtest">("prediction");
  const [mobileTab, setMobileTab] = useState<MobileTab>("report");

  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [news, setNews] = useState<{ enabled: boolean; items: NewsItem[] } | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestNonce, setBacktestNonce] = useState(0);
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  const [commentaryEnabled, setCommentaryEnabled] = useState<boolean | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(true);

  // 관심 종목 저장
  useEffect(() => saveWatchlist(codes), [codes]);

  // 시세
  const loadStocks = useCallback(async (list: string[], refresh = false) => {
    if (list.length === 0) {
      setStocks([]);
      setStocksLoading(false);
      return;
    }
    setStocksLoading(true);
    try {
      const data = await api.stocks(list, refresh);
      const order = new Map(list.map((c, i) => [c, i]));
      setStocks(data.sort((a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0)));
      setStocksError(null);
    } catch (e) {
      setStocksError((e as Error).message);
    } finally {
      setStocksLoading(false);
    }
  }, []);

  const loadMacro = useCallback(async (refresh = false) => {
    setMacroLoading(true);
    try {
      setMacro(await api.macro(refresh));
    } catch {
      // 지표 없이도 화면은 동작 (임시 기준값 사용)
    } finally {
      setMacroLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMacro();
    loadStocks(codes);
    api
      .commentary()
      .then((r) => {
        setCommentary(r.commentary);
        setCommentaryEnabled(r.enabled);
      })
      .catch(() => setCommentaryEnabled(true))
      .finally(() => setCommentaryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 지표가 도착하면, 사용자가 아직 손대지 않았을 때만 시나리오를 오늘 값으로 맞춤
  useEffect(() => {
    if (!touched.current) setScenario(live);
  }, [live]);

  const changeScenario = (s: Scenario) => {
    touched.current = true;
    setScenario(s);
  };

  // 화면에서 즉시 계산 (서버 백테스트와 같은 공식)
  const predictions = useMemo(() => {
    const out: Record<string, Prediction | null> = {};
    for (const s of stocks) {
      out[s.code] = s.quote
        ? predict({ sector: s.sector, price: s.quote.price, prevDayChangeRate: s.quote.changeRate, scenario, reference })
        : null;
    }
    return out;
  }, [stocks, scenario, reference]);

  const current = stocks.find((s) => s.code === selected) ?? null;
  const currentPrediction = current ? predictions[current.code] : null;

  // 선택 종목이 목록에서 사라지면 첫 종목으로
  useEffect(() => {
    if (stocks.length && !stocks.some((s) => s.code === selected)) setSelected(stocks[0].code);
  }, [stocks, selected]);

  // 해설: 슬라이더를 멈추고 0.8초 뒤 요청
  useEffect(() => {
    if (!current?.quote) return;
    let cancelled = false;
    setNarrativeLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const n = await api.narrative(current.code, scenario, reference);
        if (!cancelled) {
          setNarrative(n);
          setNarrativeError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setNarrative(null);
          setNarrativeError((e as Error).message);
        }
      } finally {
        if (!cancelled) setNarrativeLoading(false);
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [current?.code, current?.quote, scenario, reference]);

  // 뉴스
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setNewsLoading(true);
    api
      .news(selected)
      .then((r) => !cancelled && setNews(r))
      .catch(() => !cancelled && setNews({ enabled: true, items: [] }))
      .finally(() => !cancelled && setNewsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // 백테스트 (탭을 열었을 때만)
  useEffect(() => {
    if (tab !== "backtest" || !selected) return;
    let cancelled = false;
    setBacktestLoading(true);
    setBacktestError(null);
    api
      .backtest(selected)
      .then((r) => !cancelled && setBacktest(r))
      .catch((e) => {
        if (!cancelled) {
          setBacktest(null);
          setBacktestError((e as Error).message);
        }
      })
      .finally(() => !cancelled && setBacktestLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, selected, backtestNonce]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadMacro(true), loadStocks(codes, true)]);
    setRefreshing(false);
  };

  const refreshCommentary = async () => {
    setCommentaryLoading(true);
    try {
      const r = await api.commentary(true);
      setCommentary(r.commentary ?? commentary);
      setCommentaryEnabled(r.enabled);
    } finally {
      setCommentaryLoading(false);
    }
  };

  const addStock = (s: Stock) => {
    if (codes.includes(s.code)) return;
    const next = [...codes, s.code];
    setCodes(next);
    setSelected(s.code);
    loadStocks(next);
  };

  const removeStock = (code: string) => {
    const next = codes.filter((c) => c !== code);
    setCodes(next);
    setStocks((prev) => prev.filter((s) => s.code !== code));
  };

  const selectStock = (code: string) => {
    setSelected(code);
    setMobileTab("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hidden = (t: MobileTab) => (mobileTab === t ? "" : "hidden lg:block");

  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <TickerBar macro={macro} loading={macroLoading} />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold sm:text-xl">매크로 시나리오 시뮬레이터</h1>
            <p className="hidden text-sm text-slate-500 sm:block">환율·미국 증시·유가가 한국 대형주에 어떻게 작용하는지 계산해 봅니다</p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            시세 새로고침
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <div className={hidden("report")}>
          <BriefingCard enabled={commentaryEnabled} commentary={commentary} loading={commentaryLoading} onRefresh={refreshCommentary} />
        </div>

        {stocksError && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-[15px] text-red-800">
            시세를 불러오지 못했습니다: {stocksError}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="min-w-0 space-y-4 lg:col-span-5">
            <div className={hidden("stocks")}>
              <Watchlist
                stocks={stocks}
                loading={stocksLoading}
                selected={selected}
                predictions={predictions}
                onSelect={selectStock}
                onAdd={addStock}
                onRemove={removeStock}
              />
            </div>
            <div className={hidden("scenario")}>
              <ScenarioPanel scenario={scenario} live={live} reference={reference} liveAvailable={available} onChange={changeScenario} />
            </div>
          </div>

          <div className={`min-w-0 lg:col-span-7 ${hidden("report")}`}>
            <div role="tablist" aria-label="보기 선택" className="mb-4 grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1">
              {(
                [
                  ["prediction", "시나리오 결과"],
                  ["backtest", "과거 검증"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`min-h-11 rounded-lg text-[15px] font-semibold ${tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "prediction" &&
              (current && currentPrediction ? (
                <ReportPanel
                  stock={current}
                  prediction={currentPrediction}
                  narrative={narrative}
                  narrativeLoading={narrativeLoading}
                  narrativeError={narrativeError}
                  news={news}
                  newsLoading={newsLoading}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-[15px] text-slate-600">
                  {stocksLoading ? "불러오는 중…" : current ? "이 종목의 시세를 가져오지 못해 계산할 수 없습니다." : "종목을 선택해 주세요."}
                </div>
              ))}
            {tab === "backtest" && (
              <BacktestPanel data={backtest} loading={backtestLoading} error={backtestError} onRetry={() => setBacktestNonce((n) => n + 1)} />
            )}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pt-4 pb-8 text-sm leading-relaxed text-slate-500">
        <p>
          이 서비스는 사람이 정한 업종별 가중치로 점수를 내는 학습·참고용 시뮬레이터입니다. 투자 권유가 아니며, 투자 판단과 결과의 책임은
          투자자 본인에게 있습니다.
        </p>
        <p className="mt-1">시세: Yahoo Finance(지연될 수 있음) · 뉴스: 네이버 검색 · 해설·브리핑: Google Gemini</p>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="화면 전환">
        <div className="grid grid-cols-3">
          {(
            [
              ["stocks", "종목", List],
              ["scenario", "시나리오", SlidersHorizontal],
              ["report", "결과", BarChart3],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMobileTab(key);
                window.scrollTo({ top: 0 });
              }}
              aria-current={mobileTab === key ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm ${mobileTab === key ? "font-semibold text-slate-900" : "text-slate-500"}`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
