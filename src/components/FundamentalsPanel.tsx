import type { AnnualRow, Fundamentals } from "../../shared/types";
import { won } from "../lib/format";

const num = (v: number | null, digits = 2, unit = "") => (v === null ? "—" : `${v.toLocaleString("ko-KR", { maximumFractionDigits: digits })}${unit}`);

/** 억 원 → "333.6조" / "8,123억" */
function eok(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조`;
  return `${Math.round(v).toLocaleString("ko-KR")}억`;
}

const ROWS: Array<{ label: string; get: (r: AnnualRow) => string }> = [
  { label: "매출액", get: (r) => eok(r.revenue) },
  { label: "영업이익", get: (r) => eok(r.operatingIncome) },
  { label: "순이익", get: (r) => eok(r.netIncome) },
  { label: "영업이익률", get: (r) => num(r.opMargin, 1, "%") },
  { label: "ROE", get: (r) => num(r.roe, 1, "%") },
  { label: "부채비율", get: (r) => num(r.debtRatio, 0, "%") },
  { label: "EPS", get: (r) => num(r.eps, 0, "원") },
  { label: "PER", get: (r) => num(r.per, 1, "배") },
  { label: "PBR", get: (r) => num(r.pbr, 2, "배") },
  { label: "주당배당금", get: (r) => num(r.dps, 0, "원") },
  { label: "배당성향", get: (r) => num(r.payoutRatio, 1, "%") },
];

export function FundamentalsPanel({ data, price }: { data: Fundamentals | null; price: number }) {
  if (!data) {
    return (
      <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="fund-title">
        <h3 id="fund-title" className="text-lg font-bold">
          재무 지표
        </h3>
        <p className="mt-2 text-[15px] text-slate-600">이번 수집에서 재무 지표를 가져오지 못했습니다.</p>
      </section>
    );
  }
  const v = data.valuation;
  const fy = v.fiscalYear ? `${v.fiscalYear.slice(0, 4)}년 결산` : "최근 결산";
  const range = v.high52 !== null && v.low52 !== null && v.high52 > v.low52 ? (price - v.low52) / (v.high52 - v.low52) : null;
  const upside = v.targetPrice !== null ? (v.targetPrice / price - 1) * 100 : null;

  const items: Array<{ label: string; value: string; sub?: string }> = [
    { label: "PER", value: num(v.per, 1, "배"), sub: v.cnsPer !== null ? `추정 이익 기준 ${num(v.cnsPer, 1, "배")}` : "최근 4개 분기 이익 기준" },
    { label: "PBR", value: num(v.pbr, 2, "배"), sub: v.bps !== null ? `주당순자산 ${num(v.bps, 0, "원")}` : undefined },
    { label: "배당수익률", value: num(v.dividendYield, 2, "%"), sub: v.dps !== null ? `주당배당금 ${num(v.dps, 0, "원")}` : "배당 정보 없음" },
    { label: "배당성향", value: num(v.payoutRatio, 1, "%"), sub: `${fy} · 배당금 ÷ 순이익` },
    { label: "ROE", value: num(v.roe, 1, "%"), sub: fy },
    { label: "영업이익률", value: num(v.opMargin, 1, "%"), sub: fy },
    {
      label: "부채비율",
      value: num(v.debtRatio, 0, "%"),
      sub: v.debtRatio !== null && v.debtRatio > 500 ? "금융회사는 예금 등이 부채라 높게 나옴" : fy,
    },
    { label: "외국인 소진율", value: num(v.foreignOwnership, 1, "%"), sub: "외국인 보유 한도 대비" },
  ];

  const key = items.filter((it) => ["PER", "PBR", "배당수익률", "ROE"].includes(it.label));
  const rest = items.filter((it) => !key.includes(it));

  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="fund-title">
      <h3 id="fund-title" className="text-lg font-bold">
        재무 지표
      </h3>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {key.map((it) => (
          <div key={it.label}>
            <dt className="text-sm text-slate-600">{it.label}</dt>
            <dd className="num mt-0.5 text-xl font-semibold">{it.value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-5 border-t border-slate-100 pt-1">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-600 hover:text-slate-900">지표 더 보기</summary>

        <dl className="mt-2 grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6">
          {[...key, ...rest].map((it) => (
            <div key={it.label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-[15px] text-slate-700">
                {it.label}
                {it.sub && <span className="block text-sm text-slate-500">{it.sub}</span>}
              </dt>
              <dd className="num shrink-0 text-[15px] font-semibold">{it.value}</dd>
            </div>
          ))}
        </dl>

        {range !== null && (
          <div className="mt-6">
            <p className="text-[15px] text-slate-700">52주 범위에서 현재 위치</p>
            <div className="relative mt-3 h-1.5 rounded-full bg-slate-200" role="img" aria-label={`52주 최저 ${won(v.low52!)}, 최고 ${won(v.high52!)} 중 ${Math.round(range * 100)}% 위치`}>
              <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900" style={{ left: `${Math.min(100, Math.max(0, range * 100))}%` }} />
            </div>
            <div className="num mt-2 flex justify-between text-sm text-slate-600">
              <span>{won(v.low52!)}</span>
              <span>{won(v.high52!)}</span>
            </div>
          </div>
        )}

        {v.targetPrice !== null && upside !== null && (
          <p className="mt-6 text-[15px] text-slate-700">
            증권사 평균 목표주가 <span className="num font-semibold text-slate-900">{won(v.targetPrice)}</span>{" "}
            <span className="num">({upside > 0 ? "+" : ""}
            {upside.toFixed(1)}%)</span>
            <span className="mt-0.5 block text-sm text-slate-500">{v.targetDate ? `${v.targetDate} 집계 · ` : ""}증권사 추정 평균이며 이 사이트의 예측이 아닙니다.</span>
          </p>
        )}

      {data.annual.length > 0 && (
        <div className="mt-6">
          <h4 className="text-[15px] font-semibold">연간 실적</h4>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm sm:text-[15px]">
              <caption className="sr-only">연간 실적 (단위: 억 원·조 원, %, 원, 배)</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="sticky left-0 bg-white py-2 pr-2 text-left font-medium">
                    항목
                  </th>
                  {data.annual.map((r) => (
                    <th key={r.period} scope="col" className={`num px-2 py-2 text-right font-medium whitespace-nowrap ${r.estimate ? "bg-slate-50" : ""}`}>
                      {r.period.slice(0, 4)}
                      {r.estimate && <span className="block text-xs font-normal">추정</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="sticky left-0 bg-white py-2 pr-2 text-left font-normal whitespace-nowrap text-slate-700">
                      {row.label}
                    </th>
                    {data.annual.map((r) => (
                      <td key={r.period} className={`num px-2 py-2 text-right whitespace-nowrap ${r.estimate ? "bg-slate-50 text-slate-600" : ""}`}>
                        {row.get(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-slate-500">추정 열은 증권사 전망치 평균. 네이버 증권 기준, 예측 모델에는 쓰지 않습니다.</p>
        </div>
      )}
      </details>
    </section>
  );
}
