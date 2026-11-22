import { Info } from "lucide-react";
import { useState } from "react";
import type { BacktestSummary, StockDetail, Target } from "../../shared/types";
import { pct, prob, shortDate, toneText } from "../lib/format";

function verdict(b: BacktestSummary): string {
  if (b.hitRate === null || b.pValue === null) return "평가할 날이 부족합니다.";
  if (b.pValue < 0.05 && b.hitRate > 50) return "이 기간에는 우연으로 보기 어려울 만큼 잘 맞혔습니다. 다만 앞으로도 그렇다는 보장은 없습니다.";
  if (b.pValue < 0.05 && b.hitRate < 50) return "이 기간에는 오히려 반대로 맞히는 경향이 있었습니다. 이 종목의 전망은 참고하지 않는 게 좋습니다.";
  return "이 정도 차이는 동전 던지기로도 충분히 나올 수 있습니다. 실력이 있다고 말하기 어렵습니다.";
}

export function BacktestPanel({ stock }: { stock: StockDetail }) {
  const [target, setTarget] = useState<Target>("gap");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="예측 대상" className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
        {(
          [
            ["gap", "시가 (갭)"],
            ["close", "종가"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={target === t}
            onClick={() => setTarget(t)}
            className={`min-h-11 rounded-md text-[15px] font-semibold ${target === t ? "bg-white shadow-sm" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Results key={target} data={stock[target].backtest} name={stock.name} target={target} />
    </div>
  );
}

function Results({ data, name, target }: { data: BacktestSummary | null; name: string; target: Target }) {
  const [showAll, setShowAll] = useState(false);
  if (!data) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-[15px] text-slate-600">이 종목은 검증할 수 있는 과거 데이터가 부족합니다.</div>;
  }
  const days = [...data.days].reverse();
  const shown = showAll ? days : days.slice(0, 15);
  const vsBase = data.hitRate !== null && data.alwaysUpHitRate !== null ? data.hitRate - data.alwaysUpHitRate : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="bt-title">
        <h2 id="bt-title" className="text-base font-bold">
          {name} · {target === "gap" ? "시가" : "종가"} 최근 {data.days.length}거래일 사후 검증
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          5거래일마다 그 전 250거래일 데이터로만 모델을 새로 학습해 예측했습니다. 확률 보정도 이 기간 이전 데이터로만 맞췄습니다.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="방향 적중률" value={data.hitRate === null ? "—" : `${data.hitRate}%`} sub={`${data.hits}/${data.evaluated}일`} />
          <Stat
            label="'매일 상승' 기준 대비"
            value={vsBase === null ? "—" : `${vsBase >= 0 ? "+" : ""}${vsBase.toFixed(1)}%p`}
            sub={data.alwaysUpHitRate === null ? "" : `기준 ${data.alwaysUpHitRate}%`}
          />
          {target === "close" ? (
            <Stat label="상승 전망일만 보유" value={pct(data.strategyReturn)} sub="비용·세금 제외" tone={toneText(data.strategyReturn)} />
          ) : (
            <Stat label="예측-실제 상관" value={data.correlation === null ? "—" : String(data.correlation)} sub="1에 가까울수록 잘 맞음" />
          )}
          {target === "close" ? (
            <Stat label="계속 보유" value={pct(data.holdReturn)} sub={`예측-실제 상관 ${data.correlation ?? "—"}`} tone={toneText(data.holdReturn)} />
          ) : (
            <Stat label="수익 의미" value="참고용" sub="시가 갭은 장 시작 전엔 사고팔 수 없음" />
          )}
        </dl>

        <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-[15px] text-amber-950">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {verdict(data)}
            {data.pValue !== null && <span className="text-sm text-amber-900"> (우연일 가능성 p = {data.pValue})</span>}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="bt-table-title">
        <h3 id="bt-table-title" className="px-4 pt-4 text-base font-bold">
          날짜별 결과
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[340px] text-[15px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium">날짜</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">상승 확률</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">실제</th>
                <th scope="col" className="px-4 py-2 text-center font-medium">결과</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.date} className="border-b border-slate-100 last:border-0">
                  <td className="num px-4 py-2.5">{shortDate(d.date)}</td>
                  <td className="num px-2 py-2.5 text-right">{prob(d.pUp)}</td>
                  <td className={`num px-2 py-2.5 text-right ${toneText(d.actualReturn)}`}>{pct(d.actualReturn)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {d.hit === null ? (
                      <span className="text-slate-500">보합</span>
                    ) : d.hit ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">적중</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">빗나감</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {days.length > 15 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="min-h-11 w-full border-t border-slate-100 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
          >
            {showAll ? "접기" : `${days.length - 15}일 더 보기`}
          </button>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`num mt-0.5 text-xl font-bold ${tone}`}>{value}</dd>
      {sub && <dd className="num text-sm text-slate-500">{sub}</dd>}
    </div>
  );
}
