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
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="fund-title">
        <h3 id="fund-title" className="text-base font-bold">
          재무·투자 지표
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="fund-title">
      <h3 id="fund-title" className="text-base font-bold">
        재무·투자 지표
      </h3>
      <p className="mt-0.5 text-sm text-slate-500">네이버 증권 기준, 수집 시점 값입니다. 모델의 예측 입력에는 쓰이지 않습니다.</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 border-t border-slate-100 pt-2">
            <dt className="text-sm text-slate-600">{it.label}</dt>
            <dd className="num text-lg font-semibold">{it.value}</dd>
            {it.sub && <dd className="text-sm text-slate-500">{it.sub}</dd>}
          </div>
        ))}
      </dl>

      {range !== null && (
        <div className="mt-5">
          <p className="text-sm text-slate-600">52주 가격 범위에서 현재 위치</p>
          <div className="relative mt-2 h-2 rounded-full bg-slate-100" role="img" aria-label={`52주 최저 ${won(v.low52!)}, 최고 ${won(v.high52!)} 중 ${Math.round(range * 100)}% 위치`}>
            <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow" style={{ left: `${Math.min(100, Math.max(0, range * 100))}%` }} />
          </div>
          <div className="num mt-1.5 flex justify-between text-sm text-slate-600">
            <span>최저 {won(v.low52!)}</span>
            <span>최고 {won(v.high52!)}</span>
          </div>
        </div>
      )}

      {v.targetPrice !== null && upside !== null && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-[15px]">
          증권사 평균 목표주가 <span className="num font-semibold">{won(v.targetPrice)}</span>{" "}
          <span className="num text-slate-600">
            (현재가 대비 {upside > 0 ? "+" : ""}
            {upside.toFixed(1)}%)
          </span>
          <span className="block text-sm text-slate-500">
            {v.targetDate ? `${v.targetDate} 집계` : ""} · 증권사 추정의 평균이며, 이 사이트의 예측이 아닙니다.
          </span>
        </p>
      )}

      {data.annual.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold">연간 실적 {data.annual.length}년</summary>
          <div className="overflow-x-auto">
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
          <p className="mt-2 text-sm text-slate-500">추정 열은 증권사 전망치 평균입니다. 배당성향은 주당배당금 ÷ 주당순이익으로 계산했습니다.</p>
        </details>
      )}
    </section>
  );
}
