import { RotateCcw } from "lucide-react";
import { PRESETS } from "../../shared/model";
import type { Scenario, ScenarioReference } from "../../shared/types";
import { signed } from "../lib/format";

interface Props {
  scenario: Scenario;
  live: Scenario;
  reference: ScenarioReference;
  liveAvailable: boolean;
  onChange: (s: Scenario) => void;
}

interface SliderDef {
  key: keyof Scenario;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
  manual?: boolean;
}

export function ScenarioPanel({ scenario, live, reference, liveAvailable, onChange }: Props) {
  const sliders: SliderDef[] = [
    {
      key: "usdKrw",
      label: "원/달러 환율",
      min: Math.round(reference.usdKrw - 100),
      max: Math.round(reference.usdKrw + 100),
      step: 1,
      format: (v) => `${v.toLocaleString("ko-KR")}원`,
      hint: `전일 ${Math.round(reference.usdKrw).toLocaleString("ko-KR")}원 대비 ${signed(scenario.usdKrw - reference.usdKrw, 0)}원`,
    },
    {
      key: "nasdaqChange",
      label: "나스닥 등락률",
      min: -5,
      max: 5,
      step: 0.1,
      format: (v) => `${signed(v, 1)}%`,
      hint: "직전 미국 거래일 기준",
    },
    {
      key: "semiconductorChange",
      label: "필라델피아 반도체 등락률",
      min: -8,
      max: 8,
      step: 0.1,
      format: (v) => `${signed(v, 1)}%`,
      hint: "직전 미국 거래일 기준",
    },
    {
      key: "oilPrice",
      label: "WTI 유가",
      min: Math.max(1, Math.round(reference.oilPrice - 25)),
      max: Math.round(reference.oilPrice + 25),
      step: 0.5,
      format: (v) => `$${v.toFixed(1)}`,
      hint: `전일 $${reference.oilPrice.toFixed(1)} 대비 ${signed(scenario.oilPrice - reference.oilPrice, 1)}`,
    },
    {
      key: "foreignFlow",
      label: "외국인 수급",
      min: -5,
      max: 5,
      step: 1,
      format: (v) => (v === 0 ? "중립" : v > 0 ? `순매수 ${v}` : `순매도 ${-v}`),
      hint: "실시간 값이 없어 직접 정합니다 (−5 강한 순매도 ~ +5 강한 순매수)",
      manual: true,
    },
    {
      key: "newsSentiment",
      label: "뉴스 분위기",
      min: -100,
      max: 100,
      step: 5,
      format: (v) => (v === 0 ? "중립" : v > 0 ? `긍정 ${v}` : `부정 ${-v}`),
      hint: "실시간 값이 없어 직접 정합니다",
      manual: true,
    },
  ];

  const isLive = sliders.every((s) => scenario[s.key] === live[s.key]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="scenario-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="scenario-title" className="text-base font-bold">
            시나리오 조절
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {liveAvailable ? "처음 값은 오늘 실제 지표입니다." : "실시간 지표를 못 가져와 임시 기준값을 쓰고 있습니다."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(live)}
          disabled={isLive}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400"
        >
          <RotateCcw className="size-4" aria-hidden /> 오늘 값으로
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {sliders.map((d) => {
          const id = `slider-${d.key}`;
          const value = scenario[d.key];
          const clamped = Math.min(d.max, Math.max(d.min, value));
          return (
            <div key={d.key}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={id} className="text-[15px] font-medium">
                  {d.label}
                  {d.manual && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-800">직접 입력</span>}
                </label>
                <output htmlFor={id} className="num font-semibold">
                  {d.format(value)}
                </output>
              </div>
              <input
                id={id}
                type="range"
                min={d.min}
                max={d.max}
                step={d.step}
                value={clamped}
                onChange={(e) => onChange({ ...scenario, [d.key]: Number(e.target.value) })}
                className="mt-1 w-full"
                aria-describedby={`${id}-hint`}
              />
              <p id={`${id}-hint`} className="text-sm text-slate-500">
                {d.hint}
              </p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-700">예시 시나리오</h3>
      <p className="text-sm text-slate-500">오늘 값에서 출발해 적용합니다.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.apply(live))}
            className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-400 hover:bg-slate-50"
          >
            <span className="block text-[15px] font-semibold">{p.name}</span>
            <span className="block text-sm text-slate-500">{p.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
