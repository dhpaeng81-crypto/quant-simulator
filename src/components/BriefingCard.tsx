import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Briefing } from "../../shared/types";

export function BriefingCard({ briefing, note }: { briefing: Briefing; note: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="briefing-title">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left"
      >
        <h2 id="briefing-title" className="text-base font-bold">
          시장 요약
        </h2>
        <ChevronDown className={`ml-auto size-5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-4 text-[15px] leading-relaxed">
          <ul className="list-disc space-y-1.5 pl-5">
            {briefing.facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          {briefing.ai && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                배경 해설 <span className="rounded bg-white px-1.5 py-0.5 text-xs font-normal text-slate-600">AI 작성</span>
              </p>
              <ul className="space-y-1.5">
                {briefing.ai.text.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
              {briefing.ai.sources.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="min-h-11 cursor-pointer py-2 text-slate-600">참고한 출처 {briefing.ai.sources.length}개</summary>
                  <ul className="space-y-1 pl-4">
                    {briefing.ai.sources.map((s) => (
                      <li key={s.uri}>
                        <a href={s.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                          {s.title || s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="mt-2 text-sm text-slate-500">AI가 쓴 글이라 틀린 내용이 있을 수 있습니다.</p>
            </div>
          )}
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
      )}
    </section>
  );
}
