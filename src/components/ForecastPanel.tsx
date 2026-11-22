import { AlertTriangle, Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { FEATURE_LABELS } from "../../shared/model";
import { FEATURE_KEYS, type FeatureKey, type ForecastResult, type StockDetail, type Target } from "../../shared/types";
import { pct, prob, probWords, signed, timeAgo, toneProb, toneText, won } from "../lib/format";
import { FundamentalsPanel } from "./FundamentalsPanel";
import { PriceChart } from "./PriceChart";

interface Props {
  stock: StockDetail;
  results: Record<Target, ForecastResult | null>;
  isScenario: boolean;
  outliers: FeatureKey[];
}

const TARGET_LABEL: Record<Target, string> = { close: "종가", gap: "시가" };

export function ForecastPanel({ stock, results, isScenario, outliers }: Props) {
  const [copied, setCopied] = useState(false);
  const [factorTarget, setFactorTarget] = useState<Target>("close");
  const last = stock.history[stock.history.length - 1];
  const prev = stock.history[stock.history.length - 2];
  const change = prev ? (last.close / prev.close - 1) * 100 : 0;
  const close = results.close;
  const gap = results.gap;

  const fr = results[factorTarget];
  const fm = stock[factorTarget].model;
  const contribs = fr
    ? FEATURE_KEYS.map((k) => ({ k, v: fr.contributions[k] }))
        .filter((c) => Math.abs(c.v) >= 0.01)
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
        .slice(0, 5)
    : [];
  const maxAbs = Math.max(0.0001, ...contribs.map((c) => Math.abs(c.v)));

  const shareText =
    close && gap
      ? `[${stock.name}] 다음 거래일 시가 상승 출발 ${prob(gap.pUp)}, 종가 상승 ${prob(close.pUp)}${isScenario ? " (가정 시나리오)" : ""}\n※ 통계 모델 참고값이며 투자 권유가 아닙니다.`
      : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 요약: 종목 · 가격 · 확률 두 개 */}
      <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="summary-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="summary-title" className="text-2xl font-bold">
            {stock.name}
          </h2>
          <span className="num text-sm text-slate-500">
            {stock.code} · {stock.market === "KOSDAQ" ? "코스닥" : "코스피"}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="num text-xl font-semibold">{won(last.close)}</span>
          <span className={`num font-medium ${toneText(change)}`}>{pct(change)}</span>
          <span className="text-sm text-slate-500">{last.date.slice(5).replace("-", "/")} 종가</span>
        </p>

        {close && gap ? (
          <>
            <p className="mt-6 text-sm font-medium text-slate-600">
              다음 거래일 상승 확률{isScenario && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">가정 시나리오</span>}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["gap", "close"] as const).map((t) => {
                const r = results[t]!;
                return (
                  <div key={t} className={`rounded-xl px-4 py-4 ${r.pUp > 0.53 ? "bg-up-soft" : r.pUp < 0.47 ? "bg-down-soft" : "bg-slate-100"}`}>
                    <p className="text-[15px] font-medium text-slate-700">{TARGET_LABEL[t]}</p>
                    <p className={`num mt-1 text-3xl font-bold ${toneProb(r.pUp)}`}>{prob(r.pUp)}</p>
                    <p className="mt-1 text-[15px] text-slate-700">{probWords(r.pUp)}</p>
                  </div>
                );
              })}
            </div>
            <p className="num mt-3 text-sm text-slate-500">
              최근 60일 적중률 시가 {stock.gap.backtest?.hitRate ?? "—"}% · 종가 {stock.close.backtest?.hitRate ?? "—"}%
            </p>

            {outliers.length > 0 && (
              <p role="note" className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-950">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {outliers.map((k) => FEATURE_LABELS[k].name).join("·")} 변동이 평소보다 매우 커서 확률이 과장됐을 수 있어요.
                </span>
              </p>
            )}

            <details className="group mt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-600 hover:text-slate-900">이 확률은 어떻게 읽나요?</summary>
              <div className="space-y-2 pb-1 text-[15px] leading-relaxed text-slate-700">
                <p>
                  <strong>시가</strong>는 밤사이 미국 시장이 대부분 반영돼 비교적 잘 맞고, <strong>종가</strong>는 장중 움직임이 섞여 50% 근처가 정상입니다.
                </p>
                <p>
                  기대 수익률은 시가 <span className={`num ${toneText(gap.expectedReturn)}`}>{pct(gap.expectedReturn)}</span>, 종가{" "}
                  <span className={`num ${toneText(close.expectedReturn)}`}>{pct(close.expectedReturn)}</span>입니다. 확률은 과거 사후 예측으로 보정한 값이며 투자 권유가
                  아닙니다.
                </p>
              </div>
            </details>
          </>
        ) : (
          <p className="mt-6 rounded-xl bg-slate-100 p-4 text-[15px] text-slate-700">{stock.notes[0] ?? "이 종목은 전망을 계산하지 못했습니다."}</p>
        )}
      </section>

      {/* 가격 차트 */}
      <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="chart-title">
        <h3 id="chart-title" className="text-lg font-bold">
          최근 60일
        </h3>
        <div className="mt-4">
          <PriceChart history={stock.history} expectedReturn={close?.expectedReturn ?? null} sigma={stock.close.model?.sigma ?? null} />
        </div>
      </section>

      {/* 무엇이 움직였나 */}
      {fr && fm && contribs.length > 0 && (
        <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="factors-title">
          <div className="flex items-center justify-between gap-2">
            <h3 id="factors-title" className="text-lg font-bold">
              무엇이 움직였나
            </h3>
            <div role="tablist" aria-label="예측 대상" className="flex rounded-lg bg-slate-100 p-0.5">
              {(["gap", "close"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={factorTarget === t}
                  onClick={() => setFactorTarget(t)}
                  className={`min-h-11 rounded-md px-4 text-sm font-semibold ${factorTarget === t ? "bg-white shadow-sm" : "text-slate-600"}`}
                >
                  {TARGET_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-5 space-y-4">
            {contribs.map(({ k, v }) => {
              const w = (Math.abs(v) / maxAbs) * 50;
              return (
                <li key={k}>
                  <div className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span>{FEATURE_LABELS[k].name}</span>
                    <span className={`num shrink-0 font-semibold ${toneText(v)}`}>{signed(v, 2)}%p</span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-slate-100" aria-hidden>
                    <div className="absolute top-0 left-1/2 h-full w-px bg-slate-300" />
                    <div
                      className={`absolute top-0 h-full rounded-full ${v >= 0 ? "bg-up" : "bg-down"} transition-all duration-200`}
                      style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-slate-500">평소와 비교해 기대 수익률을 올린(빨강)·내린(파랑) 정도</p>
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-600 hover:text-slate-900">모델 계수 보기</summary>
            <p className="text-sm text-slate-600">
              {fm.trainStart} ~ {fm.trainEnd}, {fm.n}거래일로 학습 · 설명력 {(fm.r2 * 100).toFixed(1)}% · 하루 오차 ±{fm.sigma.toFixed(2)}%
            </p>
            <table className="mt-2 w-full text-[15px]">
              <tbody>
                {FEATURE_KEYS.filter((k) => fm.coef[k] !== 0).map((k) => (
                  <tr key={k} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">{FEATURE_LABELS[k].name}</td>
                    <td className={`num py-2 text-right ${toneText(fm.coef[k])}`}>{signed(fm.coef[k], 3)}%p</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      <FundamentalsPanel data={stock.fundamentals} price={last.close} />

      {/* 뉴스 */}
      {stock.news.length > 0 && (
        <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="news-title">
          <h3 id="news-title" className="text-lg font-bold">
            뉴스
          </h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {stock.news.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="group flex min-h-11 items-start gap-3 py-3">
                  <span className="flex-1">
                    <span className="block text-[15px] leading-snug font-medium group-hover:underline">{n.title}</span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {n.source} · {timeAgo(n.publishedAt)}
                    </span>
                  </span>
                  <ExternalLink className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 공유 */}
      {shareText && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="mr-1 text-sm text-slate-600">공유</span>
          <button
            type="button"
            onClick={copy}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "복사했어요" : "요약 복사"}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"
          >
            X
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"
          >
            텔레그램
          </a>
        </div>
      )}
    </div>
  );
}
