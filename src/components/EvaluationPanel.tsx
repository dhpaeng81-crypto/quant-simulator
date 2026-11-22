import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { EvaluationFile, Metrics, Target } from "../../shared/types";
import { loadEvaluation } from "../lib/data";
import { shortDate } from "../lib/format";

const TARGET_LABEL: Record<Target, string> = { gap: "시가 방향", close: "종가 방향" };

/** 확률 점수(Brier skill, %) → 등급 */
function grade(skill: number): { label: string; tone: string; note: string } {
  if (skill >= 10) return { label: "강함", tone: "bg-emerald-700 text-white", note: "확률을 그대로 믿어도 될 만큼 정확합니다." };
  if (skill >= 5) return { label: "쓸 만함", tone: "bg-emerald-100 text-emerald-900", note: "방향 판단에 참고할 만합니다." };
  if (skill >= 1) return { label: "약함", tone: "bg-amber-100 text-amber-900", note: "동전 던지기보다 조금 나은 정도입니다." };
  if (skill > 0) return { label: "거의 없음", tone: "bg-slate-200 text-slate-800", note: "사실상 맞히지 못합니다." };
  return { label: "없음", tone: "bg-slate-200 text-slate-800", note: "확률이 도움이 되지 않습니다." };
}

const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}월`;

export function EvaluationPanel() {
  const [data, setData] = useState<EvaluationFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadEvaluation().then(setData, (e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="rounded-2xl bg-white p-6 text-[15px] text-slate-600">{error}</div>;
  if (!data) return <div className="h-96 rounded-2xl bg-white motion-safe:animate-pulse" aria-busy="true" aria-label="불러오는 중" />;

  const chosen = data.variants.find((v) => v.id === data.chosen)!;
  const m = chosen.metrics;
  const order: Target[] = ["gap", "close"];
  const months = data.monthly.gap.length;
  const beatAll = (t: Target) => data.monthly[t].filter((x) => x.hitRate > 50).length;

  const headline =
    m.gap && m.close
      ? `시가 방향은 10번 중 ${(m.gap.hitRate / 10).toFixed(1)}번 맞혀 예측력 '${grade(m.gap.brierSkill).label}', 종가 방향은 10번 중 ${(m.close.hitRate / 10).toFixed(1)}번으로 '${grade(m.close.brierSkill).label}'입니다.`
      : "평가할 데이터가 부족합니다.";

  return (
    <article className="space-y-5" aria-labelledby="eval-title">
      {/* 1. 한 줄 결론 */}
      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <p className="text-sm font-medium text-slate-600">
          모델 성적표 · {shortDate(data.testStart)}~{shortDate(data.testEnd)} 사후 예측 {data.predictionsPerTarget.toLocaleString("ko-KR")}건
        </p>
        <h2 id="eval-title" className="mt-1 text-xl leading-snug font-bold text-balance">
          {headline}
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          그날 이전 데이터로만 예측 · 사용 모델: {chosen.name}
        </p>
      </section>

      {/* 2. 핵심 지표 인덱스 */}
      <section className="rounded-2xl bg-white" aria-labelledby="index-title">
        <h3 id="index-title" className="px-5 pt-5 text-lg font-bold sm:px-6">
          핵심 지표
        </h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {order.map((t) => {
            const mt = m[t];
            if (!mt) return null;
            const g = grade(mt.brierSkill);
            // 50%~75% 구간을 막대 전체로
            const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 50) / 25) * 100))}%`;
            return (
              <li key={t} className="px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[15px] font-semibold">{TARGET_LABEL[t]}</span>
                  <span className={`rounded px-2 py-0.5 text-sm font-semibold ${g.tone}`}>예측력 {g.label}</span>
                </div>

                <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                  <span className="num text-2xl font-bold whitespace-nowrap">{mt.hitRate}%</span>
                  <div>
                    <div className="relative h-3 rounded-full bg-slate-100" aria-hidden>
                      <div className="absolute inset-y-0 left-0 rounded-full bg-slate-900" style={{ width: pos(mt.hitRate) }} />
                      <div className="absolute inset-y-[-3px] w-0.5 bg-amber-600" style={{ left: pos(mt.baseRate >= 50 ? mt.baseRate : 100 - mt.baseRate) }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-slate-600">
                      <span>50% (동전)</span>
                      <span>75%</span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[15px] text-slate-700">
                  10번 중 <strong className="num">{(mt.hitRate / 10).toFixed(1)}번</strong> · {beatAll(t)}/{data.monthly[t].length}개월 50% 넘음
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  주황 선: 늘 많은 쪽으로만 찍었을 때 {Math.max(mt.baseRate, 100 - mt.baseRate).toFixed(1)}%
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 3. 꾸준한가 */}
      <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="monthly-title">
        <h3 id="monthly-title" className="text-lg font-bold">
          월별 적중률
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          최근 {months}개월 · 주황 점선 위면 동전 던지기보다 나음
        </p>
        <div className="mt-4 space-y-5">
          {order.map((t) => (
            <MonthlyBars key={t} label={TARGET_LABEL[t]} rows={data.monthly[t]} />
          ))}
        </div>
      </section>

      <Details title="이 숫자를 어떻게 읽나요">
        <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-700">
          <li>
            <strong>시가</strong>는 밤사이 미국 시장 움직임이 대부분 반영되는 구간이라 비교적 잘 맞습니다. 다만 장이 열리기 전에는 사고팔 수 없어 수익과 바로
            연결되지는 않습니다.
          </li>
          <li>
            <strong>종가</strong>는 장중 움직임이 섞여 맞히기 어렵습니다. 55% 안팎이면 이 분야에서 정상적인 수준입니다.
          </li>
          <li>
            <strong>확률 점수</strong>는 "늘 평균 상승 비율로만 답했을 때"보다 확률 오차를 몇 % 줄였는지입니다. 0 이하면 확률이 쓸모없다는 뜻입니다.
          </li>
          <li>과거 성적이 앞으로도 이어진다는 보장은 없습니다. 투자 판단의 근거로 쓰지 마세요.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">{data.chosenReason}</p>
      </Details>

      <Details title="모델 비교 (기본·1차·확장·패널)">
        <p className="text-sm text-slate-600">
          같은 기간·같은 방식으로 평가. 확률점수: 평균 비율로만 답했을 때보다 줄인 확률 오차(%). 상하위차: 확률 상위·하위 20% 종목의 하루 수익률 차(%p). t값 +2 이상이어야 기본 모델보다 확실히 나음.
        </p>
        {order.map((t) => (
          <div key={t} className="mt-4">
            <h4 className="text-[15px] font-semibold">{TARGET_LABEL[t]}</h4>
            <table className="mt-1 w-full text-sm sm:text-[15px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th scope="col" className="py-2 pr-2 font-medium">모델</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-medium whitespace-nowrap">적중률</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-medium whitespace-nowrap">확률점수</th>
                  <th scope="col" className="px-1.5 py-2 text-right font-medium whitespace-nowrap">상하위차</th>
                  <th scope="col" className="py-2 pl-1.5 text-right font-medium whitespace-nowrap">t값</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v) => {
                  const mt: Metrics | null = v.metrics[t];
                  const on = v.id === data.chosen;
                  return (
                    <tr key={v.id} className={`border-b border-slate-100 last:border-0 ${on ? "bg-slate-50 font-semibold" : ""}`}>
                      <td className="py-2 pr-2">
                        {v.name}
                        {on && <span className="ml-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-xs font-normal text-white">사용 중</span>}
                      </td>
                      <td className="num px-1.5 py-2 text-right whitespace-nowrap">{mt ? `${mt.hitRate}%` : "—"}</td>
                      <td className="num px-1.5 py-2 text-right whitespace-nowrap">{mt ? `${mt.brierSkill > 0 ? "+" : ""}${mt.brierSkill.toFixed(1)}` : "—"}</td>
                      <td className="num px-1.5 py-2 text-right whitespace-nowrap">{mt ? `${mt.topBottomSpread > 0 ? "+" : ""}${mt.topBottomSpread.toFixed(2)}` : "—"}</td>
                      <td className="num py-2 pl-1.5 text-right whitespace-nowrap text-slate-600">
                        {v.vsDefault[t] ? `${v.vsDefault[t]!.t > 0 ? "+" : ""}${v.vsDefault[t]!.t.toFixed(1)}` : "기준"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <dl className="mt-4 space-y-1 text-sm text-slate-600">
          {data.variants.map((v) => (
            <div key={v.id}>
              <dt className="inline font-semibold text-slate-800">{v.name}</dt>
              <dd className="inline"> — {v.description}</dd>
            </div>
          ))}
        </dl>
      </Details>

      <Details title="확률이 맞는가 (보정 점검)">
        <p className="text-sm text-slate-600">모델이 '60%'라고 한 날들이 실제로 60% 올랐는지 구간별로 비교합니다. 두 막대가 비슷할수록 믿을 만한 확률입니다.</p>
        {order.map((t) => (
          <div key={t} className="mt-4">
            <h4 className="text-[15px] font-semibold">{TARGET_LABEL[t]}</h4>
            <ul className="mt-2 space-y-2">
              {data.calibrationBins[t].map((b) => (
                <li key={b.lo} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm">
                  <span className="num text-slate-700">
                    {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
                    <span className="block text-xs text-slate-600">{b.n.toLocaleString("ko-KR")}건</span>
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
      </Details>
    </article>
  );
}

function MonthlyBars({ label, rows }: { label: string; rows: Array<{ month: string; hitRate: number; n: number }> }) {
  // 30%~80%를 막대 높이로. 50% 기준선 표시
  const lo = 30;
  const hi = 80;
  const h = (v: number) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`;
  return (
    <figure>
      <figcaption className="text-[15px] font-semibold">{label}</figcaption>
      <div className="relative mt-2 h-28" role="img" aria-label={`${label} 월별 적중률: ${rows.map((r) => `${monthLabel(r.month)} ${r.hitRate}%`).join(", ")}`}>
        <div className="absolute inset-0 flex items-end gap-1">
          {rows.map((r) => (
            <div key={r.month} className="flex h-full flex-1 flex-col justify-end" title={`${r.month} ${r.hitRate}% (${r.n}건)`}>
              <div className={`rounded-t ${r.hitRate > 50 ? "bg-slate-800" : "bg-slate-300"}`} style={{ height: h(r.hitRate) }} />
            </div>
          ))}
        </div>
        {/* 50% 기준선은 막대 위에 */}
        <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-amber-500" style={{ bottom: h(50) }} aria-hidden />
        <span className="absolute right-0 -translate-y-full rounded bg-white/90 px-1 text-xs text-amber-800" style={{ bottom: h(50) }} aria-hidden>
          50%
        </span>
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {rows.map((r, i) => (
          <span key={r.month} className="num flex-1 text-center text-xs whitespace-nowrap text-slate-600">
            {i % 2 === 0 || rows.length <= 7 ? monthLabel(r.month) : ""}
          </span>
        ))}
      </div>
      <p className="num mt-1 text-sm text-slate-600">
        최저 {Math.min(...rows.map((r) => r.hitRate))}% · 최고 {Math.max(...rows.map((r) => r.hitRate))}%
      </p>
    </figure>
  );
}

function Details({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl bg-white px-5 sm:px-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 text-base font-bold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="ml-auto size-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

function Bar({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-slate-600">{label}</span>
      <span className="relative h-2.5 flex-1 rounded-full bg-slate-100">
        <span className={`absolute inset-y-0 left-0 rounded-full ${className}`} style={{ width: `${value * 100}%` }} />
      </span>
      <span className="num w-12 shrink-0 text-right">{(value * 100).toFixed(1)}%</span>
    </span>
  );
}

