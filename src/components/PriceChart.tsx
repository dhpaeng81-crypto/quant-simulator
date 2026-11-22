import type { DailyRow } from "../../shared/types";
import { shortDate, won } from "../lib/format";

const W = 600;
const H = 240;
const PAD = { top: 16, right: 96, bottom: 36, left: 8 };

/** 최근 종가와 다음 거래일 예상 범위(기대값 ± 표준편차 1개, 약 68%) */
export function PriceChart({ history, expectedReturn, sigma }: { history: DailyRow[]; expectedReturn: number | null; sigma: number | null }) {
  const rows = history.slice(-60);
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1].close;
  const band =
    expectedReturn !== null && sigma !== null
      ? {
          mid: last * (1 + expectedReturn / 100),
          lo: last * (1 + (expectedReturn - sigma) / 100),
          hi: last * (1 + (expectedReturn + sigma) / 100),
        }
      : null;

  const values = rows.map((r) => r.close).concat(band ? [band.lo, band.hi] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || last * 0.01;
  const lo = min - span * 0.05;
  const hi = max + span * 0.05;
  const GAP = 8; // 다음 거래일 범위를 그릴 여백(칸 수)
  const slots = rows.length + (band ? GAP : 0);
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (slots - 1);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.close).toFixed(1)}`).join(" ");
  const lastX = x(rows.length - 1);
  const nextX = x(rows.length + GAP - 2);
  const ticks = [0, Math.floor(rows.length / 2), rows.length - 1];
  const bandColor = band && band.mid >= last ? "#dc2626" : "#2563eb";

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`최근 ${rows.length}거래일 종가와 다음 거래일 예상 범위`}>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + t * (H - PAD.top - PAD.bottom)} y2={PAD.top + t * (H - PAD.top - PAD.bottom)} stroke="#f1f5f9" />
        ))}
        <path d={line} fill="none" stroke="#0f172a" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={lastX} cy={y(last)} r={3.5} fill="#0f172a" />
        {band && (
          <>
            <path
              d={`M${lastX},${y(last)} L${nextX},${y(band.hi)} L${nextX},${y(band.lo)} Z`}
              fill={bandColor}
              opacity={0.12}
            />
            <line x1={lastX} y1={y(last)} x2={nextX} y2={y(band.mid)} stroke={bandColor} strokeWidth={2} strokeDasharray="5 4" />
            <line x1={nextX} x2={nextX} y1={y(band.hi)} y2={y(band.lo)} stroke={bandColor} strokeWidth={2} />
            <text x={nextX + 6} y={y(band.hi) + 4} fontSize={20} fill="#475569">
              {Math.round(band.hi).toLocaleString("ko-KR")}
            </text>
            <text x={nextX + 6} y={y(band.lo) + 4} fontSize={20} fill="#475569">
              {Math.round(band.lo).toLocaleString("ko-KR")}
            </text>
          </>
        )}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize={20} fill="#64748b" textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}>
            {shortDate(rows[i].date)}
          </text>
        ))}
        {band && (
          <text x={nextX} y={H - 6} fontSize={20} fill="#64748b" textAnchor="middle">
            다음
          </text>
        )}
      </svg>
      {band && (
        <figcaption className="mt-1 text-sm text-slate-600">
          점선 끝의 세로 막대가 다음 거래일 예상 범위입니다(약 68% 확률로 이 안): {won(band.lo)} ~ {won(band.hi)}
        </figcaption>
      )}
    </figure>
  );
}
