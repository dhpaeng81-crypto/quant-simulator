import { useState } from "react";
import type { TrajectoryPoint } from "../../shared/types";
import { pct, toneText, won } from "../lib/format";

const W = 600;
const H = 220;
const PAD = { top: 20, right: 24, bottom: 34, left: 24 };

/** 점수를 5거래일로 외삽한 참고선. 외부 차트 라이브러리 없이 SVG로 그립니다. */
export function TrendChart({ basePrice, points }: { basePrice: number; points: TrajectoryPoint[] }) {
  const [active, setActive] = useState(points.length - 1);
  const all = [{ day: "오늘", price: basePrice, cumulativeChangeRate: 0, dailyChangeRate: 0 }, ...points];
  const prices = all.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || basePrice * 0.01 || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;

  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (all.length - 1);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const up = points[points.length - 1]?.cumulativeChangeRate >= 0;
  const color = up ? "#dc2626" : "#2563eb";
  const line = all.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(all.length - 1)},${H - PAD.bottom} L${x(0)},${H - PAD.bottom} Z`;
  const sel = all[active + 1] ?? all[all.length - 1];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`5거래일 시나리오 경로, 마지막 누적 ${pct(points[points.length - 1]?.cumulativeChangeRate ?? 0)}`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(basePrice)} y2={y(basePrice)} stroke="#cbd5e1" strokeDasharray="4 4" />
        <path d={area} fill={color} opacity={0.08} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {all.map((p, i) => (
          <g key={p.day}>
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={15} fill="#475569">
              {p.day}
            </text>
            {i > 0 && (
              <>
                {active === i - 1 && <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={H - PAD.bottom} stroke="#94a3b8" />}
                <circle cx={x(i)} cy={y(p.price)} r={active === i - 1 ? 6 : 4} fill="#fff" stroke={color} strokeWidth={2.5} />
                {/* 넓은 터치 영역 */}
                <rect
                  x={x(i) - 30}
                  y={0}
                  width={60}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setActive(i - 1)}
                  onClick={() => setActive(i - 1)}
                />
              </>
            )}
            {i === 0 && <circle cx={x(0)} cy={y(p.price)} r={4} fill="#475569" />}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px]">
        <span className="font-semibold">{sel.day}</span>
        <span className="num">{won(sel.price)}</span>
        <span className={`num ${toneText(sel.cumulativeChangeRate)}`}>누적 {pct(sel.cumulativeChangeRate)}</span>
        <span className={`num text-sm ${toneText(sel.dailyChangeRate)}`}>당일 {pct(sel.dailyChangeRate)}</span>
      </figcaption>
    </figure>
  );
}
