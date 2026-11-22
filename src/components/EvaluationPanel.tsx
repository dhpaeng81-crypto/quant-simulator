import { useEffect, useState } from "react";
import { TARGETS, type EvaluationFile, type Target } from "../../shared/types";
import { loadEvaluation } from "../lib/data";
import { shortDate } from "../lib/format";

const TARGET_LABEL: Record<Target, string> = { gap: "시가 (갭)", close: "종가" };

/** 모델 성적표: 100종목 통합 사후 평가와 확률 보정 상태 */
export function EvaluationPanel() {
  const [data, setData] = useState<EvaluationFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadEvaluation().then(setData, (e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-[15px] text-slate-600">{error}</div>;
  if (!data) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-[15px] text-slate-600">불러오는 중…</div>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="eval-title">
        <h2 id="eval-title" className="text-base font-bold">
          모델 성적표
        </h2>
        <p className="mt-0.5 text-[15px] text-slate-600">
          전체 종목을 합쳐 {shortDate(data.testStart)} ~ {shortDate(data.testEnd)} 동안 사후 예측한 결과입니다(대상별 {data.predictionsPerTarget.toLocaleString("ko-KR")}건). 각
          예측은 그 날짜 이전 데이터로만 학습했고, 확률 보정도 이 기간 이전 데이터로 맞췄습니다.
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[15px]">{data.chosenReason}</p>

        {TARGETS.slice()
          .reverse()
          .map((t) => (
            <div key={t} className="mt-5">
              <h3 className="text-[15px] font-semibold">{TARGET_LABEL[t]}</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm sm:text-[15px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                      <th scope="col" className="py-2 pr-2 font-medium">모델</th>
                      <th scope="col" className="px-1.5 py-2 text-right font-medium whitespace-nowrap">적중률</th>
                      <th scope="col" className="px-1.5 py-2 text-right font-medium whitespace-nowrap">확률점수</th>
                      <th scope="col" className="px-1.5 py-2 text-right font-medium whitespace-nowrap">상하위차</th>
                      <th scope="col" className="py-2 pl-1.5 text-right font-medium whitespace-nowrap">t값</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.variants.map((v) => {
                      const m = v.metrics[t];
                      const chosen = v.id === data.chosen;
                      return (
                        <tr key={v.id} className={`border-b border-slate-100 last:border-0 ${chosen ? "bg-slate-50 font-semibold" : ""}`}>
                          <td className="py-2.5 pr-2">
                            {v.name}
                            {chosen && <span className="ml-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-xs font-normal text-white">사용 중</span>}
                          </td>
                          <td className="num px-1.5 py-2.5 text-right whitespace-nowrap">{m ? `${m.hitRate}%` : "—"}</td>
                          <td className={`num px-1.5 py-2.5 text-right whitespace-nowrap ${m && m.brierSkill > 0 ? "text-emerald-800" : "text-slate-600"}`}>
                            {m ? `${m.brierSkill > 0 ? "+" : ""}${m.brierSkill.toFixed(1)}%` : "—"}
                          </td>
                          <td className="num px-1.5 py-2.5 text-right whitespace-nowrap">{m ? `${m.topBottomSpread > 0 ? "+" : ""}${m.topBottomSpread.toFixed(2)}%p` : "—"}</td>
                          <td className={`num py-2.5 pl-1.5 text-right whitespace-nowrap ${v.vsDefault[t] && Math.abs(v.vsDefault[t]!.t) >= 2 ? "font-semibold" : "text-slate-500"}`}>
                            {v.vsDefault[t] ? `${v.vsDefault[t]!.t > 0 ? "+" : ""}${v.vsDefault[t]!.t.toFixed(1)}` : "기준"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {data.variants[0]?.metrics[t] && (
                <p className="mt-1 text-sm text-slate-500">이 기간 실제 상승 비율 {data.variants[0].metrics[t]!.baseRate}%</p>
              )}
            </div>
          ))}

        <dl className="mt-5 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <div>
            <dt className="inline font-semibold">확률 점수</dt>
            <dd className="inline"> — 매번 '실제 상승 비율'만 답한 경우보다 확률 오차(Brier)를 몇 % 줄였는지. 0 이하면 쓸모없는 확률입니다.</dd>
          </div>
          <div>
            <dt className="inline font-semibold">상하위차</dt>
            <dd className="inline"> — 매일 상승 확률 상위 20% 종목과 하위 20% 종목의 그날 평균 수익률 차이.</dd>
          </div>
          <div>
            <dt className="inline font-semibold">t값</dt>
            <dd className="inline"> — 기본 모델보다 확률 오차를 줄였는지의 통계값. +2 이상이어야 우연이 아니라고 볼 수 있고, 그 사이는 차이가 없는 것으로 봅니다.</dd>
          </div>
          {data.variants.map((v) => (
            <div key={v.id}>
              <dt className="inline font-semibold">{v.name}</dt>
              <dd className="inline"> — {v.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="cal-title">
        <h2 id="cal-title" className="text-base font-bold">
          확률이 맞는가 (보정 점검)
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">모델이 '60%'라고 한 날들이 실제로 60% 올랐는지 구간별로 비교합니다. 두 막대가 비슷할수록 믿을 만한 확률입니다.</p>
        {TARGETS.slice()
          .reverse()
          .map((t) => (
            <div key={t} className="mt-4">
              <h3 className="text-[15px] font-semibold">{TARGET_LABEL[t]}</h3>
              <ul className="mt-2 space-y-2">
                {data.calibrationBins[t].map((b) => (
                  <li key={b.lo} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm">
                    <span className="num text-slate-600">
                      {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
                      <span className="block text-xs text-slate-500">{b.n.toLocaleString("ko-KR")}건</span>
                    </span>
                    <span className="space-y-1">
                      <Bar value={b.meanP} label="예측" className="bg-slate-400" />
                      <Bar value={b.freq} label="실제" className="bg-slate-900" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>
    </div>
  );
}

function Bar({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-slate-500">{label}</span>
      <span className="relative h-2.5 flex-1 rounded-full bg-slate-100">
        <span className={`absolute inset-y-0 left-0 rounded-full ${className}`} style={{ width: `${value * 100}%` }} />
      </span>
      <span className="num w-12 shrink-0 text-right">{(value * 100).toFixed(1)}%</span>
    </span>
  );
}
