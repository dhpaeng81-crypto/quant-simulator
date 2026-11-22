import type { MacroQuote } from "../../shared/types";
import { pct } from "../lib/format";

export function TickerBar({ macro }: { macro: MacroQuote[] }) {
  return (
    <div className="bg-slate-900 text-slate-100">
      <ul className="mx-auto flex max-w-7xl gap-x-6 overflow-x-auto px-4 py-2 text-sm whitespace-nowrap [mask-image:linear-gradient(to_right,black_88%,transparent)] lg:[mask-image:none]" aria-label="시장 지표 (옆으로 넘겨 더 보기)">
        {macro.map((m) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <span className="text-slate-300">{m.name}</span>
            <span className="num font-semibold">{m.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
            <span className={`num ${m.changeRate > 0 ? "text-red-300" : m.changeRate < 0 ? "text-blue-300" : "text-slate-300"}`}>
              {pct(m.changeRate)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
