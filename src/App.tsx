import { AlertTriangle, BarChart3, List, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FEATURE_LABELS, forecast } from "../shared/model";
import { FEATURE_KEYS, type Features, type IndexFile, type StockDetail } from "../shared/types";
import { BacktestPanel } from "./components/BacktestPanel";
import { BriefingCard } from "./components/BriefingCard";
import { ForecastPanel } from "./components/ForecastPanel";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { StockList } from "./components/StockList";
import { TickerBar } from "./components/TickerBar";
import { loadIndex, loadStock } from "./lib/data";
import { dateTimeKo } from "./lib/format";
import { loadWatchlist, saveWatchlist } from "./lib/storage";

type MobileTab = "stocks" | "scenario" | "report";

const codeFromHash = () => /^#(\d{6})$/.exec(window.location.hash)?.[1] ?? null;

export default function App() {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[] | null>(loadWatchlist);
  const [selected, setSelected] = useState<string | null>(codeFromHash);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Features | null>(null);
  const [tab, setTab] = useState<"forecast" | "backtest">("forecast");
  const [mobileTab, setMobileTab] = useState<MobileTab>("report");

  useEffect(() => {
    loadIndex()
      .then((idx) => {
        setIndex(idx);
        const codes = new Set(idx.stocks.map((s) => s.code));
        // 처음 방문: 코스피 시가총액 상위 10개
        setWatchlist((prev) =>
          prev
            ? prev.filter((c) => codes.has(c))
            : idx.stocks
                .filter((s) => s.market === "KOSPI")
                .sort((a, b) => a.rank - b.rank)
                .slice(0, 10)
                .map((s) => s.code),
        );
        setSelected((cur) =>
          cur && codes.has(cur) ? cur : (idx.stocks.find((s) => s.market === "KOSPI" && s.rank === 1)?.code ?? idx.stocks[0]?.code ?? null),
        );
      })
      .catch((e) => setIndexError((e as Error).message));
    const onHash = () => {
      const c = codeFromHash();
      if (c) setSelected(c);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (watchlist) saveWatchlist(watchlist);
  }, [watchlist]);

  useEffect(() => {
    if (!selected) return;
    if (window.location.hash !== `#${selected}`) history.replaceState(null, "", `#${selected}`);
    let cancelled = false;
    setDetailError(null);
    loadStock(selected)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setScenario(d.latestInputs);
      })
      .catch((e) => !cancelled && setDetailError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const current = detail && detail.code === selected ? detail : null;
  const result = useMemo(() => (current?.model && scenario ? forecast(current.model, scenario) : null), [current, scenario]);
  const isScenario = Boolean(current?.latestInputs && scenario && FEATURE_KEYS.some((k) => scenario[k] !== current.latestInputs![k]));
  const outliers =
    current?.model && scenario
      ? FEATURE_KEYS.filter((k) => current.model!.sd[k] > 0 && Math.abs((scenario[k] - current.model!.mean[k]) / current.model!.sd[k]) > 3)
      : [];

  const select = (code: string) => {
    setSelected(code);
    setMobileTab("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const add = (code: string) => setWatchlist((w) => (w && !w.includes(code) ? [...w, code] : w));
  const remove = (code: string) => setWatchlist((w) => (w ? w.filter((c) => c !== code) : w));
  const hidden = (t: MobileTab) => (mobileTab === t ? "" : "hidden lg:block");

  if (indexError) {
    return (
      <main className="mx-auto max-w-xl p-6 text-[15px]">
        <h1 className="text-xl font-bold">데이터를 불러오지 못했습니다</h1>
        <p className="mt-2 text-slate-600">{indexError} 잠시 후 새로고침해 주세요.</p>
      </main>
    );
  }
  if (!index || !watchlist) {
    return <main className="p-6 text-[15px] text-slate-600">불러오는 중…</main>;
  }

  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <TickerBar macro={index.macro} />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <h1 className="text-lg font-bold sm:text-xl">다음 거래일 전망</h1>
          <p className="text-sm text-slate-500">
            시가총액 상위 {index.stocks.length}개 종목 · {dateTimeKo(index.generatedAt)} 갱신
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <div className={hidden("report")}>
          <BriefingCard briefing={index.briefing} note={index.nextTradingDayNote} />
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="min-w-0 space-y-4 lg:col-span-5">
            <div className={hidden("stocks")}>
              <StockList universe={index.stocks} watchlist={watchlist} selected={selected} onSelect={select} onAdd={add} onRemove={remove} />
            </div>
            <div className={hidden("scenario")}>
              {current?.model && current.latestInputs && scenario ? (
                <ScenarioPanel model={current.model} actual={current.latestInputs} asOf={current.inputsAsOf} value={scenario} onChange={setScenario} />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-[15px] text-slate-600">
                  {current ? "이 종목은 시나리오를 계산할 모델이 없습니다." : "종목을 고르면 시나리오를 바꿔 볼 수 있습니다."}
                </div>
              )}
            </div>
          </div>

          <div className={`min-w-0 space-y-4 lg:col-span-7 ${hidden("report")}`}>
            <div role="tablist" aria-label="보기 선택" className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1">
              {(
                [
                  ["forecast", "전망"],
                  ["backtest", "과거 성적"],
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

            {detailError && <p className="rounded-lg bg-red-50 px-4 py-3 text-[15px] text-red-800">{detailError}</p>}
            {!current && !detailError && <div className="rounded-xl border border-slate-200 bg-white p-6 text-[15px] text-slate-600">불러오는 중…</div>}

            {current && tab === "forecast" && (
              <>
                {outliers.length > 0 && (
                  <div role="note" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[15px] text-amber-950">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>
                      {outliers.map((k) => FEATURE_LABELS[k].name).join(", ")} 값이 지난 1년 평소 범위를 크게 벗어났습니다. 모델이 이런 날을 거의
                      학습하지 못해 확률이 과장될 수 있습니다.
                    </p>
                  </div>
                )}
                <ForecastPanel stock={current} result={result} isScenario={isScenario} />
              </>
            )}
            {current && tab === "backtest" && <BacktestPanel data={current.backtest} name={current.name} />}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pt-4 pb-8 text-sm leading-relaxed text-slate-500">
        <p>종목마다 최근 1년 데이터로 학습한 통계 모델의 참고값입니다. 투자 권유가 아니며, 투자 판단과 결과의 책임은 투자자 본인에게 있습니다.</p>
        <p className="mt-1">데이터: 네이버 증권(국내 시세·투자자별 매매·뉴스), Yahoo Finance(해외 지표). 평일 하루 두 번 갱신.</p>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="화면 전환">
        <div className="grid grid-cols-3">
          {(
            [
              ["stocks", "종목", List],
              ["scenario", "시나리오", SlidersHorizontal],
              ["report", "전망", BarChart3],
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
