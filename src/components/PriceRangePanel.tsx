import type { PriceRange, RangeCheck } from "../../shared/range";
import { won } from "../lib/format";

/** 한국거래소 호가 단위로 반올림 (예상값을 실제 주문 가능한 가격처럼 보이게, 과한 정밀도 제거) */
function tick(v: number): number {
  const t = v >= 500_000 ? 1000 : v >= 200_000 ? 500 : v >= 50_000 ? 100 : v >= 20_000 ? 50 : v >= 5_000 ? 10 : v >= 2_000 ? 5 : 1;
  return Math.round(v / t) * t;
}
const fmt = (v: number) => tick(v).toLocaleString("ko-KR");

/** 오늘 예상 가격 범위 (참고용). 넓은 범위를 막대 전체로, 그 안에 보통 범위와 예상 시가 범위를 겹쳐 그림 */
export function PriceRangePanel({ range: r, check, isScenario }: { range: PriceRange; check: RangeCheck | null | undefined; isScenario: boolean }) {
  const lo = Math.min(r.dayLo80, r.openLo, r.prevClose);
  const hi = Math.max(r.dayHi80, r.openHi, r.prevClose);
  const span = hi - lo || 1;
  const pos = (v: number) => `${((v - lo) / span) * 100}%`;
  const width = (a: number, b: number) => `${((b - a) / span) * 100}%`;

  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="range-title">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="range-title" className="text-lg font-bold">
          오늘 예상 가격 범위
        </h3>
        <span className="text-sm text-slate-500">{isScenario ? "가정 시나리오 · " : ""}참고용</span>
      </div>

      {/* 막대: 넓은 범위(연한) ⊃ 보통 범위(진한), 위에 예상 시가 범위, 전일 종가 눈금 */}
      <div className="relative mt-8 mb-2 h-3" role="img" aria-label={`넓은 범위 ${won(r.dayLo80)}~${won(r.dayHi80)}, 보통 범위 ${won(r.dayLo)}~${won(r.dayHi)}, 예상 시가 ${won(r.openLo)}~${won(r.openHi)}`}>
        <div className="absolute inset-y-0 rounded-full bg-slate-200" style={{ left: pos(r.dayLo80), width: width(r.dayLo80, r.dayHi80) }} />
        <div className="absolute inset-y-0 rounded-full bg-slate-500" style={{ left: pos(r.dayLo), width: width(r.dayLo, r.dayHi) }} />
        <div className="absolute -top-3 h-1.5 rounded-full bg-amber-500" style={{ left: pos(r.openLo), width: width(r.openLo, r.openHi) }} />
        <div
          className={`absolute -top-8 text-xs whitespace-nowrap text-amber-800 ${(r.expectedOpen - lo) / span > 0.85 ? "-translate-x-full" : (r.expectedOpen - lo) / span < 0.15 ? "" : "-translate-x-1/2"}`}
          style={{ left: pos(r.expectedOpen) }}
        >
          예상 시가
        </div>
        <div className="absolute -inset-y-1 w-0.5 bg-slate-900" style={{ left: pos(r.prevClose) }} />
      </div>
      <div className="relative h-5 text-xs text-slate-600">
        {(() => {
          const p = (r.prevClose - lo) / span;
          const shift = p > 0.85 ? "-translate-x-full" : p < 0.15 ? "" : "-translate-x-1/2";
          return (
            <span className={`absolute whitespace-nowrap ${shift}`} style={{ left: pos(r.prevClose) }}>
              전일 종가 {fmt(r.prevClose)}
            </span>
          );
        })()}
      </div>

      <dl className="mt-4 space-y-2.5 text-[15px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-slate-700">
            <span className="inline-block h-1.5 w-4 rounded-full bg-amber-500" aria-hidden />
            예상 시가
          </dt>
          <dd className="num text-right">
            <span className="block font-semibold">{fmt(r.expectedOpen)}원</span>
            <span className="block text-sm text-slate-500">
              {fmt(r.openLo)} ~ {fmt(r.openHi)}
            </span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-slate-700">
            <span className="inline-block h-3 w-4 rounded-sm bg-slate-500" aria-hidden />
            보통 하루 범위
          </dt>
          <dd className="num text-right font-semibold">
            {fmt(r.dayLo)} ~ {fmt(r.dayHi)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-slate-700">
            <span className="inline-block h-3 w-4 rounded-sm bg-slate-200" aria-hidden />
            넓게 보면
          </dt>
          <dd className="num text-right font-semibold">
            {fmt(r.dayLo80)} ~ {fmt(r.dayHi80)}
          </dd>
        </div>
      </dl>

      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-600 hover:text-slate-900">어떻게 계산했고, 얼마나 맞았나요?</summary>
        <div className="space-y-2 text-[15px] leading-relaxed text-slate-700">
          <p>
            예상 시가는 시가 예측 모델의 기대값과 오차(약 68% 범위)로, 하루 범위는 최근 20거래일 동안 시가 대비 고가·저가가 보통(중앙값) / 넓게(열에
            여덟 날) 어디까지 갔는지로 계산했습니다. 시가 대비 위로 보통 <span className="num">+{r.upPct.toFixed(1)}%</span>, 아래로{" "}
            <span className="num">−{r.downPct.toFixed(1)}%</span>.
          </p>
          {check && (
            <p className="num">
              최근 6개월 100종목 점검: 실제 시가가 예상 범위 안 <strong>{check.openInBand}%</strong> · 고가·저가가 보통 범위 안 {check.highWithin}% /{" "}
              {check.lowWithin}% · 넓은 범위 안 {check.highWithin80}% / {check.lowWithin80}%.
            </p>
          )}
          <p className="text-sm text-slate-500">
            이 가격대에 사고팔면 수익이 난다는 뜻이 아닙니다. 과거 일봉 시험에서 '시가보다 싸게 지정가 매수 → 종가 매도'는 거래 비용(약 0.23%)을 빼면
            모든 경우 손실이었습니다.
          </p>
        </div>
      </details>
    </section>
  );
}
