import type { MacroValue } from "../../shared/types";
import { pct } from "../lib/format";

export function TickerBar({ macro, loading }: { macro: MacroValue[]; loading: boolean }) {
  return (
    <div className="bg-slate-900 text-slate-100">
      <ul className="mx-auto flex max-w-7xl gap-x-6 gap-y-1 overflow-x-auto px-4 py-2 text-sm whitespace-nowrap" aria-label="해외 지표">
        {macro.length === 0 && <li className="text-slate-300">{loading ? "지표 불러오는 중…" : "지표를 불러오지 못했습니다"}</li>}
        {macro.map((m) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <span className="text-slate-300">{m.name}</span>
            {m.value === null ? (
              <span className="text-slate-400">데이터 없음</span>
            ) : (
              <>
                <span className="num font-semibold">
                  {m.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
                {m.changeRate !== null && (
                  <span className={`num ${m.changeRate > 0 ? "text-red-300" : m.changeRate < 0 ? "text-blue-300" : "text-slate-300"}`}>
                    {pct(m.changeRate)}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
