import { useEffect, useRef, useState } from "react";
import type { DailyRow } from "../../shared/types";
import { shortDate, won } from "../lib/format";

const H = 200;
const PAD = { top: 22, right: 72, bottom: 28, left: 4 };
const FONT = 13;

/** 최근 종가와 다음 거래일 예상 범위(기대값 ± 표준편차 1개, 약 68%). 실제 폭에 맞춰 그려 글자 크기가 일정 */
export function PriceChart({ history, expectedReturn, sigma }: { history: DailyRow[]; expectedReturn: number | null; sigma: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = history.slice(-60);
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1].close;
  const band =
    expectedReturn !== null && sigma !== null
      ? { mid: last * (1 + expectedReturn / 100), lo: last * (1 + (expectedReturn - sigma) / 100), hi: last * (1 + (expectedReturn + sigma) / 100) }
      : null;

  const closes = rows.map((r) => r.close);
  const values = closes.concat(band ? [band.lo, band.hi] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || last * 0.01;
  const lo = min - span * 0.04;
  const hi = max + span * 0.04;
  const GAP = 6;
  const slots = rows.length + (band ? GAP : 0);
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (slots - 1);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.close).toFixed(1)}`).join(" ");
  const lastX = x(rows.length - 1);
  const nextX = x(rows.length + GAP - 2);
  const color = band && band.mid >= last ? "#dc2626" : "#2563eb";
  const maxI = closes.indexOf(Math.max(...closes));
  const minI = closes.indexOf(Math.min(...closes));
  const anchor = (i: number) => (i < rows.length * 0.15 ? "start" : i > rows.length * 0.8 ? "end" : "middle");
  const fmt = (v: number) => Math.round(v).toLocaleString("ko-KR");

  return (
    <figure ref={ref}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${rows.length}거래일 종가, 최고 ${won(closes[maxI])}, 최저 ${won(closes[minI])}`}>
        <path d={line} fill="none" stroke="#0f172a" strokeWidth={1.75} strokeLinejoin="round" />
        <text x={x(maxI)} y={y(closes[maxI]) - 8} fontSize={FONT} fill="#64748b" textAnchor={anchor(maxI)}>
          {fmt(closes[maxI])}
        </text>
        <text x={x(minI)} y={y(closes[minI]) + 18} fontSize={FONT} fill="#64748b" textAnchor={anchor(minI)}>
          {fmt(closes[minI])}
        </text>
        <circle cx={lastX} cy={y(last)} r={3.5} fill="#0f172a" />
        {band && (
          <>
            <path d={`M${lastX},${y(last)} L${nextX},${y(band.hi)} L${nextX},${y(band.lo)} Z`} fill={color} opacity={0.1} />
            <line x1={lastX} y1={y(last)} x2={nextX} y2={y(band.mid)} stroke={color} strokeWidth={1.75} strokeDasharray="4 3" />
            <line x1={nextX} x2={nextX} y1={y(band.hi)} y2={y(band.lo)} stroke={color} strokeWidth={2} />
            <text x={nextX + 6} y={y(band.hi) + 4} fontSize={FONT} fill="#475569">
              {fmt(band.hi)}
            </text>
            <text x={nextX + 6} y={y(band.lo) + 4} fontSize={FONT} fill="#475569">
              {fmt(band.lo)}
            </text>
          </>
        )}
        <text x={x(0)} y={H - 6} fontSize={FONT} fill="#64748b">
          {shortDate(rows[0].date)}
        </text>
        <text x={lastX} y={H - 6} fontSize={FONT} fill="#64748b" textAnchor="end">
          {shortDate(rows[rows.length - 1].date)}
        </text>
        {band && (
          <text x={nextX} y={H - 6} fontSize={FONT} fill="#64748b" textAnchor="middle">
            다음
          </text>
        )}
      </svg>
      {band && (
        <figcaption className="num mt-2 text-sm text-slate-600">
          다음 거래일 예상 범위 {won(band.lo)} ~ {won(band.hi)} <span className="text-slate-500">(약 68%)</span>
        </figcaption>
      )}
    </figure>
  );
}
