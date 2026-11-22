import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { FEATURE_LABELS } from "../../shared/model";
import { FEATURE_KEYS, type ForecastResult, type StockDetail, type Target } from "../../shared/types";
import { pct, prob, probWords, signed, timeAgo, toneProb, toneText, won } from "../lib/format";
import { PriceChart } from "./PriceChart";

interface Props {
  stock: StockDetail;
  results: Record<Target, ForecastResult | null>;
  isScenario: boolean;
}

const TARGET_LABEL: Record<Target, string> = { close: "종가", gap: "시가" };

export function ForecastPanel({ stock, results, isScenario }: Props) {
  const [copied, setCopied] = useState(false);
  const [factorTarget, setFactorTarget] = useState<Target>("close");
  const last = stock.history[stock.history.length - 1];
  const prev = stock.history[stock.history.length - 2];
  const change = prev ? (last.close / prev.close - 1) * 100 : 0;
  const close = results.close;
  const gap = results.gap;
  const closeModel = stock.close.model;

  const fr = results[factorTarget];
  const fm = stock[factorTarget].model;
  const contribs = fr ? FEATURE_KEYS.map((k) => ({ k, v: fr.contributions[k] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)) : [];
  const shown = contribs.filter((c) => Math.abs(c.v) >= 0.005).slice(0, 8);
  const maxAbs = Math.max(0.0001, ...contribs.map((c) => Math.abs(c.v)));

  const shareText =
    close && gap
      ? `[${stock.name}] 다음 거래일 시가 상승 출발 ${prob(gap.pUp)}, 종가 상승 ${prob(close.pUp)}${isScenario ? " · 가정 시나리오" : ""}\n※ 통계 모델 참고값이며 투자 권유가 아닙니다.`
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

  const gapHit = stock.gap.backtest?.hitRate;
  const closeHit = stock.close.backtest?.hitRate;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="summary-title">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="summary-title" className="text-xl font-bold">
            {stock.name}
          </h2>
          <span className="num text-sm text-slate-500">
            {stock.code} · {stock.market === "KOSDAQ" ? "코스닥" : "코스피"}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="num text-2xl font-bold">{won(last.close)}</span>
          <span className={`num font-semibold ${toneText(change)}`}>{pct(change)}</span>
          <span className="text-sm text-slate-500">{last.date} 종가</span>
        </p>

        {close && gap ? (
          <>
            <p className="mt-4 text-sm text-slate-600">
              {isScenario ? <strong className="text-amber-800">가정한 시나리오</strong> : "실제 최신 값"} 기준, 다음 거래일
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["gap", "close"] as const).map((t) => {
                const r = results[t]!;
                const hit = t === "gap" ? gapHit : closeHit;
                return (
                  <div key={t} className={`rounded-lg p-3 ${r.pUp > 0.53 ? "bg-up-soft" : r.pUp < 0.47 ? "bg-down-soft" : "bg-slate-100"}`}>
                    <p className="text-sm font-medium text-slate-700">{t === "gap" ? "시가 상승 출발 확률" : "종가 상승 확률"}</p>
                    <p className={`num mt-0.5 text-2xl font-bold ${toneProb(r.pUp)}`}>{prob(r.pUp)}</p>
                    <p className="text-sm font-semibold">{probWords(r.pUp)}</p>
                    <p className="num mt-1 text-sm text-slate-600">
                      기대 <span className={toneText(r.expectedReturn)}>{pct(r.expectedReturn)}</span>
                      {hit != null && <> · 최근 적중 {hit}%</>}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              <strong>시가</strong>는 밤사이 미국 시장 움직임이 대부분 반영돼 비교적 잘 맞는 편이고, <strong>종가</strong>는 장중 움직임이 섞여 50% 근처가
              정상입니다. 확률은 과거 사후 예측으로 보정한 값입니다.
            </p>
          </>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-100 p-4 text-[15px] text-slate-700">{stock.notes[0] ?? "이 종목은 전망을 계산하지 못했습니다."}</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="chart-title">
        <h3 id="chart-title" className="text-base font-bold">
          최근 60거래일과 다음 거래일 종가 예상 범위
        </h3>
        <div className="mt-3">
          <PriceChart history={stock.history} expectedReturn={close?.expectedReturn ?? null} sigma={closeModel?.sigma ?? null} />
        </div>
      </section>

      {fr && fm && (
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="factors-title">
          <div className="flex items-center justify-between gap-2">
            <h3 id="factors-title" className="text-base font-bold">
              무엇이 전망을 움직였나
            </h3>
            <div role="tablist" aria-label="예측 대상" className="flex rounded-lg bg-slate-100 p-0.5">
              {(["gap", "close"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={factorTarget === t}
                  onClick={() => setFactorTarget(t)}
                  className={`min-h-11 rounded-md px-3 text-sm font-semibold ${factorTarget === t ? "bg-white shadow-sm" : "text-slate-600"}`}
                >
                  {TARGET_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-500">평균적인 날과 비교해 각 입력이 기대 수익률을 얼마나 올리거나(오른쪽) 내렸는지(왼쪽). 영향이 큰 순.</p>
          <ul className="mt-3 space-y-2.5">
            {shown.map(({ k, v }) => {
              const w = (Math.abs(v) / maxAbs) * 50;
              return (
                <li key={k}>
                  <div className="flex items-baseline justify-between gap-2 text-[15px]">
                    <span>
                      {FEATURE_LABELS[k].name}
                      {fr.clipped.includes(k) && <span className="ml-1 text-sm text-amber-800">(상한 적용)</span>}
                    </span>
                    <span className={`num shrink-0 font-semibold ${toneText(v)}`}>{signed(v, 2)}%p</span>
                  </div>
                  <div className="relative mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
                    <div className="absolute top-0 left-1/2 h-full w-px bg-slate-300" />
                    <div
                      className={`absolute top-0 h-full rounded-full ${v >= 0 ? "bg-up" : "bg-down"} transition-all duration-300`}
                      style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                    />
                  </div>
                </li>
              );
            })}
            {shown.length === 0 && <li className="text-[15px] text-slate-600">모든 입력이 평소 수준이라 눈에 띄는 요인이 없습니다.</li>}
          </ul>
          <details className="mt-4 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-slate-700">이 종목 {TARGET_LABEL[factorTarget]} 모델 자세히</summary>
            <p className="text-slate-600">
              {fm.trainStart} ~ {fm.trainEnd}의 {fm.n}거래일로 학습. 학습 구간 설명력(R²) {(fm.r2 * 100).toFixed(1)}%, 하루 오차 표준편차 ±
              {fm.sigma.toFixed(2)}%.
            </p>
            <table className="mt-2 w-full text-[15px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                  <th scope="col" className="py-1.5 font-medium">입력</th>
                  <th scope="col" className="py-1.5 text-right font-medium">1단위 오를 때 기대 수익률</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_KEYS.map((k) => (
                  <tr key={k} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5">{FEATURE_LABELS[k].name}</td>
                    <td className={`num py-1.5 text-right ${toneText(fm.coef[k])}`}>{signed(fm.coef[k], 3)}%p</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="news-title">
        <h3 id="news-title" className="text-base font-bold">
          최근 뉴스
        </h3>
        {stock.news.length === 0 ? (
          <p className="mt-2 text-[15px] text-slate-600">수집된 뉴스가 없습니다.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {stock.news.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-start gap-2 py-2.5 hover:text-slate-600">
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium">{n.title}</span>
                    <span className="block text-sm text-slate-500">
                      {n.source} · {timeAgo(n.publishedAt)}
                    </span>
                  </span>
                  <ExternalLink className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shareText && (
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="share-title">
          <h3 id="share-title" className="text-base font-bold">
            공유
          </h3>
          <pre className="mt-2 rounded-lg bg-slate-50 p-3 font-sans text-sm whitespace-pre-wrap text-slate-700">{shareText}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "복사했습니다" : "요약 복사"}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
            >
              X에 공유
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
            >
              텔레그램
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
