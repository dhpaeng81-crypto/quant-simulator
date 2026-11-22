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
      <div role="tablist" aria-label="예측 대상" className="grid grid-cols-2 rounded-xl bg-slate-200/70 p-1">
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
    return <div className="rounded-2xl bg-white p-6 text-[15px] text-slate-600">이 종목은 검증할 수 있는 과거 데이터가 부족합니다.</div>;
  }
  const days = [...data.days].reverse();
  const shown = showAll ? days : days.slice(0, 15);
  const vsBase = data.hitRate !== null && data.alwaysUpHitRate !== null ? data.hitRate - data.alwaysUpHitRate : null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="bt-title">
        <h2 id="bt-title" className="text-lg font-bold">
          최근 {data.days.length}일 {target === "gap" ? "시가" : "종가"} 성적
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-800">
          <span className="num text-3xl font-bold">{data.hitRate === null ? "—" : `${data.hitRate}%`}</span>
          <span className="ml-2 text-slate-600">
            {data.evaluated}일 중 {data.hits}일 맞힘
          </span>
        </p>
        {vsBase !== null && data.alwaysUpHitRate !== null && (
          <p className="num mt-1 text-[15px] text-slate-600">
            늘 '상승'만 찍었다면 {data.alwaysUpHitRate}% ({vsBase >= 0 ? "+" : ""}
            {vsBase.toFixed(1)}%p 차이)
          </p>
        )}

        <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-950">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{verdict(data)}</span>
        </p>

        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-600 hover:text-slate-900">세부 수치</summary>
          <dl className="space-y-2 text-[15px]">
            {target === "close" && (
              <>
                <Row label="상승 전망일만 보유했다면" value={pct(data.strategyReturn)} tone={toneText(data.strategyReturn)} />
                <Row label="계속 보유했다면" value={pct(data.holdReturn)} tone={toneText(data.holdReturn)} />
              </>
            )}
            <Row label="예측-실제 상관" value={data.correlation === null ? "—" : String(data.correlation)} />
            <Row label="우연일 가능성 (p값)" value={data.pValue === null ? "—" : String(data.pValue)} />
          </dl>
          <p className="mt-3 text-sm text-slate-500">
            5거래일마다 그 전 250거래일로만 다시 학습해 예측했습니다(미래 정보 없음). 수익률은 비용·세금 제외
            {target === "gap" ? ", 시가 갭은 장 시작 전에 거래할 수 없어 수익과 직접 연결되지 않습니다" : ""}.
          </p>
        </details>
      </section>

      <section className="rounded-2xl bg-white" aria-labelledby="bt-table-title">
        <h3 id="bt-table-title" className="px-5 pt-5 text-lg font-bold">
          날짜별 결과
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[340px] text-[15px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                <th scope="col" className="px-5 py-2 font-medium">날짜</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">상승 확률</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">실제</th>
                <th scope="col" className="px-4 py-2 text-center font-medium">결과</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.date} className="border-b border-slate-100 last:border-0">
                  <td className="num px-5 py-3">{shortDate(d.date)}</td>
                  <td className="num px-2 py-3 text-right">{prob(d.pUp)}</td>
                  <td className={`num px-2 py-3 text-right ${toneText(d.actualReturn)}`}>{pct(d.actualReturn)}</td>
                  <td className="px-5 py-3 text-center">
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

function Row({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2">
      <dt className="text-slate-700">{label}</dt>
      <dd className={`num font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}
