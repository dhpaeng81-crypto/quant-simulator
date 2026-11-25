import { BarChart3, ChevronLeft, ClipboardCheck, List, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { forecast } from "../shared/model";
import { FEATURE_KEYS, TARGETS, type Features, type ForecastResult, type IndexFile, type StockDetail, type Target } from "../shared/types";
import { BacktestPanel } from "./components/BacktestPanel";
import { BriefingCard } from "./components/BriefingCard";
import { EvaluationPanel } from "./components/EvaluationPanel";
import { ForecastPanel } from "./components/ForecastPanel";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { StockList } from "./components/StockList";
import { TickerBar } from "./components/TickerBar";
import { loadIndex, loadStock, resetStockCache } from "./lib/data";
import { dateTimeKo, nextUpdateLabel, timeAgo } from "./lib/format";
import { loadWatchlist, saveWatchlist } from "./lib/storage";

type MobileTab = "stocks" | "scenario" | "report";

function Skeleton() {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4" aria-busy="true" aria-label="불러오는 중">
      {[40, 64, 100, 100, 72].map((w, i) => (
        <div key={i} className="h-5 rounded bg-slate-100 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

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
  const [page, setPage] = useState<"main" | "evaluation">(() => (window.location.hash === "#evaluation" ? "evaluation" : "main"));
  const [mobileTab, setMobileTab] = useState<MobileTab>("report");
  const [dataVersion, setDataVersion] = useState(0); // 새 데이터를 받을 때마다 증가
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

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
    if (window.location.hash !== "#evaluation" && window.location.hash !== `#${selected}`) history.replaceState(null, "", `#${selected}`);
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
  }, [selected, dataVersion]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  };

  /** 서버에 올라온 최신 데이터를 다시 받음 (수집 자체는 GitHub Actions가 평일 하루 두 번) */
  const refresh = async () => {
    if (refreshing || !index) return;
    setRefreshing(true);
    try {
      const fresh = await loadIndex(true);
      if (fresh.generatedAt === index.generatedAt) {
        showNotice(`이미 최신 데이터예요 (${timeAgo(fresh.generatedAt)} 갱신). 다음 자동 갱신은 ${nextUpdateLabel()} 무렵입니다.`);
      } else {
        resetStockCache();
        setIndex(fresh);
        setDataVersion((v) => v + 1);
        showNotice(`새 데이터를 불러왔어요 (${dateTimeKo(fresh.generatedAt)} 갱신).`);
      }
    } catch (e) {
      showNotice(`불러오지 못했어요: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const current = detail && detail.code === selected ? detail : null;
  const results = useMemo(() => {
    const out = {} as Record<Target, ForecastResult | null>;
    for (const t of TARGETS) {
      const m = current?.[t].model;
      out[t] = m && scenario ? forecast(m, scenario, index?.calibration[t] ?? null) : null;
    }
    return out;
  }, [current, scenario, index]);
  const isScenario = Boolean(current?.latestInputs && scenario && FEATURE_KEYS.some((k) => scenario[k] !== current.latestInputs![k]));
  // 학습 기간 평균에서 3 표준편차 넘게 벗어난 입력 (이 모델이 실제로 쓰는 입력만)
  const outliers = FEATURE_KEYS.filter((k) =>
    TARGETS.some((t) => {
      const m = current?.[t].model;
      return Boolean(m && scenario && m.coef[k] !== 0 && m.sd[k] > 0 && Math.abs(scenario[k] - m.mean[k]) > 3 * m.sd[k]);
    }),
  );

  const select = (code: string) => {
    setSelected(code);
    setMobileTab("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const add = (code: string) => setWatchlist((w) => (w && !w.includes(code) ? [...w, code] : w));
  const remove = (code: string) => setWatchlist((w) => (w ? w.filter((c) => c !== code) : w));
  const hidden = (t: MobileTab) => (mobileTab === t ? "" : "hidden lg:block");
  const openPage = (p: "main" | "evaluation") => {
    setPage(p);
    history.replaceState(null, "", p === "evaluation" ? "#evaluation" : selected ? `#${selected}` : "#");
    window.scrollTo({ top: 0 });
  };

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
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-balance sm:text-xl">
              {page === "evaluation" ? (
                <button type="button" onClick={() => openPage("main")} className="hover:underline">
                  다음 거래일 전망
                </button>
              ) : (
                "다음 거래일 전망"
              )}
            </h1>
            <p className="text-sm text-slate-600">
              {dateTimeKo(index.generatedAt)} 갱신<span className="hidden sm:inline"> · 다음 {nextUpdateLabel()}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="최신 데이터 다시 불러오기"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`} aria-hidden />
            <span className="hidden sm:inline">새로고침</span>
          </button>
          <button
            type="button"
            onClick={() => openPage(page === "evaluation" ? "main" : "evaluation")}
            aria-pressed={page === "evaluation"}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${
              page === "evaluation" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 hover:bg-slate-50"
            }`}
          >
            <ClipboardCheck className="size-4" aria-hidden />
            모델 성적표
          </button>
        </div>
      </header>

      <div aria-live="polite" className="mx-auto max-w-7xl px-4">
        {notice && <p className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-[15px] text-white">{notice}</p>}
      </div>

      {page === "evaluation" && (
        <main className="mx-auto max-w-3xl px-4 py-4">
          <button
            type="button"
            onClick={() => openPage("main")}
            className="mb-3 flex min-h-11 items-center gap-1 text-[15px] font-medium text-slate-700 hover:text-slate-900"
          >
            <ChevronLeft className="size-4" aria-hidden /> 전망으로 돌아가기
          </button>
          <EvaluationPanel version={dataVersion} />
        </main>
      )}

      <main className={`mx-auto max-w-7xl space-y-5 px-4 py-5 ${page === "evaluation" ? "hidden" : ""}`}>
        <div className={hidden("report")}>
          <BriefingCard briefing={index.briefing} note={index.nextTradingDayNote} />
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 space-y-5 lg:col-span-5">
            <div className={hidden("stocks")}>
              <StockList universe={index.stocks} watchlist={watchlist} selected={selected} onSelect={select} onAdd={add} onRemove={remove} />
            </div>
            <div className={hidden("scenario")}>
              {current?.close.model && current.latestInputs && scenario ? (
                <ScenarioPanel model={current.close.model} actual={current.latestInputs} asOf={current.inputsAsOf} value={scenario} onChange={setScenario} />
              ) : (
                <div className="rounded-2xl bg-white p-4 text-[15px] text-slate-600">
                  {current ? "이 종목은 시나리오를 계산할 모델이 없습니다." : "종목을 고르면 시나리오를 바꿔 볼 수 있습니다."}
                </div>
              )}
            </div>
          </div>

          <div className={`min-w-0 space-y-5 lg:col-span-7 ${hidden("report")}`}>
            <div role="tablist" aria-label="보기 선택" className="grid grid-cols-2 rounded-xl bg-slate-200/70 p-1">
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
                  className={`min-h-11 rounded-lg text-[15px] font-semibold ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailError && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-[15px] text-red-800">
                {detailError}
              </p>
            )}
            {!current && !detailError && <Skeleton />}

            {current && tab === "forecast" && <ForecastPanel stock={current} results={results} isScenario={isScenario} outliers={outliers} rangeCheck={index.rangeCheck} />}
            {current && tab === "backtest" && <BacktestPanel stock={current} />}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pt-4 pb-8 text-sm leading-relaxed text-slate-500">
        <p>최근 1년 데이터로 학습한 통계 모델({index.model.name})의 참고값입니다. 투자 권유가 아니며, 투자 판단과 결과의 책임은 투자자 본인에게 있습니다.</p>
        <p className="mt-1">데이터: 네이버 증권(국내 시세·투자자별 매매·뉴스), Yahoo Finance(해외 지표). 평일 07:20·16:40 자동 갱신.</p>
        <p className="mt-1">
          <a
            href="https://github.com/dhpaeng81-crypto/quant-simulator/actions/workflows/update.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-slate-700"
          >
            지금 새로 수집하기 (저장소 관리자용, GitHub에서 Run workflow)
          </a>
        </p>
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
                if (page === "evaluation") openPage("main");
                else window.scrollTo({ top: 0 });
              }}
              aria-current={page === "main" && mobileTab === key ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm ${page === "main" && mobileTab === key ? "font-semibold text-slate-900" : "text-slate-600"}`}
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
