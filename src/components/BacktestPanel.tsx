import { Info } from "lucide-react";
import type { BacktestResult } from "../../shared/types";
import { pct, shortDate, toneText, won } from "../lib/format";

interface Props {
  data: BacktestResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function BacktestPanel({ data, loading, error, onRetry }: Props) {
  if (loading) return <Box>과거 시세로 계산하는 중…</Box>;
  if (error)
    return (
      <Box>
        <p>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
        >
          다시 시도
        </button>
      </Box>
    );
  if (!data) return null;

  const beatBaseline =
    data.accuracy !== null && data.alwaysUpAccuracy !== null ? data.accuracy - data.alwaysUpAccuracy : null;
  const alpha = data.strategyReturn - data.holdReturn;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="bt-title">
        <h2 id="bt-title" className="text-base font-bold">
          {data.name} · 최근 {data.records.length}거래일 검증
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          화면의 예측 공식을 그대로, 그날 아침까지 알 수 있었던 실제 지표에 적용했습니다.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="적중률" value={data.accuracy === null ? "—" : `${data.accuracy}%`} sub={`${data.correctDays}/${data.evaluatedDays}일`} />
          <Stat
            label="'매일 상승' 기준과 비교"
            value={beatBaseline === null ? "—" : `${beatBaseline >= 0 ? "+" : ""}${beatBaseline.toFixed(1)}%p`}
            sub={data.alwaysUpAccuracy === null ? "" : `기준 적중률 ${data.alwaysUpAccuracy}%`}
            tone={beatBaseline === null ? "" : toneText(beatBaseline)}
          />
          <Stat label="신호대로 했을 때" value={pct(data.strategyReturn)} sub="상승 신호일만 보유" tone={toneText(data.strategyReturn)} />
          <Stat label="그냥 보유했을 때" value={pct(data.holdReturn)} sub={`차이 ${pct(alpha)}`} tone={toneText(data.holdReturn)} />
        </dl>

        <ul className="mt-4 space-y-1.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {data.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="bt-table-title">
        <h3 id="bt-table-title" className="px-4 pt-4 text-base font-bold">
          날짜별 결과
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[440px] text-[15px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium">날짜</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">종가</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">등락</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">신호</th>
                <th scope="col" className="px-4 py-2 text-center font-medium">결과</th>
              </tr>
            </thead>
            <tbody>
              {[...data.records].reverse().map((r) => (
                <tr key={r.date} className="border-b border-slate-100 last:border-0">
                  <td className="num px-4 py-2.5">{shortDate(r.date)}</td>
                  <td className="num px-2 py-2.5 text-right">{won(r.close)}</td>
                  <td className={`num px-2 py-2.5 text-right ${toneText(r.changeRate)}`}>{pct(r.changeRate)}</td>
                  <td className={`px-2 py-2.5 text-center font-semibold ${r.predicted === "UP" ? "text-up" : "text-down"}`}>
                    {r.predicted === "UP" ? "▲ 상승" : "▼ 하락"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r.correct === null ? (
                      <span className="text-slate-500">보합</span>
                    ) : r.correct ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">적중</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">빗나감</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-6 text-[15px] text-slate-600">{children}</div>;
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
