import { AlertTriangle, Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { SECTOR_LABELS, SIGNAL_TEXT } from "../../shared/model";
import type { Narrative, NewsItem, Prediction, StockWithQuote } from "../../shared/types";
import { pct, signed, timeAgo, toneText, won } from "../lib/format";
import { TrendChart } from "./TrendChart";

interface Props {
  stock: StockWithQuote;
  prediction: Prediction;
  narrative: Narrative | null;
  narrativeLoading: boolean;
  narrativeError: string | null;
  news: { enabled: boolean; items: NewsItem[] } | null;
  newsLoading: boolean;
}

export function ReportPanel({ stock, prediction: p, narrative, narrativeLoading, narrativeError, news, newsLoading }: Props) {
  const [copied, setCopied] = useState(false);
  const up = p.direction === "UP";
  const neutral = p.signal === "NEUTRAL";
  const tone = neutral ? "text-slate-700" : up ? "text-up" : "text-down";
  const toneBg = neutral ? "bg-slate-100" : up ? "bg-up-soft" : "bg-down-soft";
  const factors = [...p.factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.0001);
  const last = p.trajectory[p.trajectory.length - 1];

  const shareText = [
    `[${stock.name} 시나리오 점검]`,
    `${SIGNAL_TEXT[p.signal]} (점수 ${signed(p.score)}, 신뢰도 지표 ${p.confidence})`,
    `주요 요인: ${factors.slice(0, 3).map((f) => `${f.name} ${f.contribution >= 0 ? "▲" : "▼"}`).join(", ")}`,
    "※ 규칙 기반 참고 지표이며 투자 권유가 아닙니다.",
  ].join("\n");
  const pageUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${pageUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="summary-title">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="summary-title" className="text-xl font-bold">
            {stock.name}
          </h2>
          <span className="num text-sm text-slate-500">
            {stock.code} · {stock.market === "KOSDAQ" ? "코스닥" : "코스피"} · {SECTOR_LABELS[stock.sector]}
          </span>
        </div>
        {stock.quote && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-2xl font-bold">{won(stock.quote.price)}</span>
            <span className={`num font-semibold ${toneText(stock.quote.changeRate)}`}>
              {signed(stock.quote.change, 0)} ({pct(stock.quote.changeRate)})
            </span>
            {stock.quote.asOf && <span className="text-sm text-slate-500">{timeAgo(stock.quote.asOf)} 기준</span>}
          </p>
        )}

        <div className={`mt-4 rounded-lg ${toneBg} p-4`}>
          <p className="text-sm text-slate-600">현재 시나리오에서 다음 거래일</p>
          <p className={`mt-0.5 text-2xl font-bold ${tone}`}>{SIGNAL_TEXT[p.signal]}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white" aria-hidden>
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${neutral ? "bg-slate-400" : up ? "bg-up" : "bg-down"}`}
                style={{ width: `${((p.confidence - 50) / 40) * 100}%` }}
              />
            </div>
            <span className="num shrink-0 text-sm font-semibold">신뢰도 지표 {p.confidence}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            점수 <span className="num font-semibold">{signed(p.score)}</span>. 신뢰도 지표는 점수 크기를 50~90으로 바꾼 값이며, 실제로 맞힐
            확률이 아닙니다. 실제 성적은 '과거 검증' 탭에서 확인하세요.
          </p>
        </div>
      </section>

      {/* 요인별 기여 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="factors-title">
        <h3 id="factors-title" className="text-base font-bold">
          무엇이 점수를 움직였나
        </h3>
        <p className="text-sm text-slate-500">가운데 선 오른쪽은 올림, 왼쪽은 내림. 업종별 민감도 × 입력값으로 계산합니다.</p>
        <ul className="mt-3 space-y-2.5">
          {factors.map((f) => {
            const w = (Math.abs(f.contribution) / maxAbs) * 50;
            return (
              <li key={f.id}>
                <div className="flex items-baseline justify-between text-[15px]">
                  <span>{f.name}</span>
                  <span className={`num font-semibold ${toneText(f.contribution)}`}>
                    {signed(f.contribution, 2)} <span className="text-sm font-normal text-slate-500">({f.share}%)</span>
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
                  <div className="absolute top-0 left-1/2 h-full w-px bg-slate-300" />
                  <div
                    className={`absolute top-0 h-full rounded-full ${f.contribution >= 0 ? "bg-up" : "bg-down"} transition-all duration-300`}
                    style={f.contribution >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 5일 경로 */}
      {stock.quote && (
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="trend-title">
          <h3 id="trend-title" className="text-base font-bold">
            5거래일 시나리오 경로
          </h3>
          <p className="text-sm text-slate-500">
            오늘 점수가 하루 15%씩 약해진다고 가정한 참고선입니다. 가격 예측이 아닙니다. 점을 누르면 값을 볼 수 있습니다.
          </p>
          <div className="mt-3">
            <TrendChart basePrice={stock.quote.price} points={p.trajectory} />
          </div>
          <p className="sr-only">
            D+5 누적 {pct(last.cumulativeChangeRate)}, {won(last.price)}
          </p>
        </section>
      )}

      {/* 해설 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="narrative-title" aria-busy={narrativeLoading}>
        <div className="flex items-center gap-2">
          <h3 id="narrative-title" className="text-base font-bold">
            해설
          </h3>
          {narrative && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {narrative.generatedBy === "gemini" ? "AI 작성" : "규칙 기반"}
            </span>
          )}
        </div>
        {narrativeLoading && <p className="mt-2 text-slate-500">해설을 만드는 중…</p>}
        {!narrativeLoading && narrativeError && <p className="mt-2 text-slate-600">{narrativeError}</p>}
        {!narrativeLoading && narrative && (
          <>
            <p className="mt-2 text-[15px] leading-relaxed">{narrative.analysis}</p>
            <h4 className="mt-4 text-sm font-semibold text-slate-700">주의할 점</h4>
            <ul className="mt-2 space-y-2">
              {narrative.risks.map((r, i) => (
                <li key={i} className="flex gap-2 text-[15px]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 뉴스 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="news-title">
        <h3 id="news-title" className="text-base font-bold">
          최근 뉴스
        </h3>
        {newsLoading && <p className="mt-2 text-slate-500">불러오는 중…</p>}
        {!newsLoading && news && !news.enabled && (
          <p className="mt-2 text-[15px] text-slate-600">뉴스 검색 키가 설정되지 않았습니다.</p>
        )}
        {!newsLoading && news?.enabled && news.items.length === 0 && (
          <p className="mt-2 text-[15px] text-slate-600">지금은 뉴스를 가져오지 못했습니다.</p>
        )}
        {!newsLoading && news && news.items.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100">
            {news.items.map((n) => (
              <li key={n.link}>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-start gap-2 py-2.5 hover:text-slate-600"
                >
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium">{n.title}</span>
                    <span className="block text-sm text-slate-500">
                      {[n.source, timeAgo(n.publishedAt)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ExternalLink className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 공유 */}
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
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
          >
            X에 공유
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
          >
            텔레그램
          </a>
        </div>
      </section>
    </div>
  );
}
