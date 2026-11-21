import { ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Commentary } from "../../shared/types";
import { timeAgo } from "../lib/format";

interface Props {
  enabled: boolean | null;
  commentary: Commentary | null;
  loading: boolean;
  onRefresh: () => void;
}

export function BriefingCard({ enabled, commentary, loading, onRefresh }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="briefing-title">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-11 flex-1 items-center gap-2 text-left"
        >
          <h2 id="briefing-title" className="text-base font-bold">
            오늘의 시황 브리핑
          </h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">AI 작성</span>
          <ChevronDown className={`ml-auto size-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {enabled && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            aria-label="브리핑 다시 만들기"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4 text-[15px] leading-relaxed">
          {loading && !commentary && <p className="text-slate-500">브리핑을 만드는 중입니다…</p>}
          {!loading && enabled === false && (
            <p className="text-slate-600">AI 키가 설정되지 않아 브리핑을 만들 수 없습니다. 위의 해외 지표는 실시간 값입니다.</p>
          )}
          {!loading && enabled && !commentary && (
            <p className="text-slate-600">지금은 브리핑을 만들 수 없습니다(사용량 한도 또는 연결 문제). 잠시 후 다시 시도해 주세요.</p>
          )}
          {commentary && (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">직전 미국 증시</h3>
                  <ul className="list-disc space-y-1.5 pl-5">
                    {commentary.usMarket.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">지표·뉴스</h3>
                  <ul className="list-disc space-y-1.5 pl-5">
                    {commentary.macroNews.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 font-medium">{commentary.strategy}</p>
              <p className="mt-3 text-sm text-slate-500">
                {timeAgo(commentary.generatedAt)} 작성 · AI가 쓴 글이라 틀린 내용이 있을 수 있습니다.
                {commentary.sources.length === 0 && " 웹 검색 없이 지표만 보고 작성했습니다."}
              </p>
              {commentary.sources.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="min-h-11 cursor-pointer py-2 text-slate-600">참고한 출처 {commentary.sources.length}개</summary>
                  <ul className="space-y-1 pl-4">
                    {commentary.sources.map((s) => (
                      <li key={s.uri}>
                        <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-slate-700 underline underline-offset-2">
                          {s.title || s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
