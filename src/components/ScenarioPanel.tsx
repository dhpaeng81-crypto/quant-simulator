import { RotateCcw } from "lucide-react";
import { FEATURE_GROUPS, FEATURE_LABELS, PRESETS } from "../../shared/model";
import { FEATURE_KEYS, type FeatureKey, type Features, type LinearModel } from "../../shared/types";
import { shortDate, signed } from "../lib/format";

interface Props {
  model: LinearModel;
  actual: Features;
  asOf: Record<FeatureKey, string | null> | null;
  value: Features;
  onChange: (x: Features) => void;
}

const STEP: Partial<Record<FeatureKey, number>> = { fx: 0.05, dxy: 0.05, us10y: 1, vix: 0.5, foreign: 0.5, institution: 0.5, foreign5: 1, institution5: 1 };
const MIN_RANGE: Record<FeatureKey, number> = {
  nasdaq: 4,
  sox: 6,
  ewy: 4,
  vix: 20,
  us10y: 15,
  dxy: 1.5,
  fx: 2,
  oil: 6,
  foreign: 20,
  institution: 20,
  foreign5: 50,
  institution5: 50,
  prevReturn: 6,
  ret5: 12,
};

function Slider({ k, model, actual, asOf, value, onChange }: Props & { k: FeatureKey }) {
  const id = `slider-${k}`;
  const lim = Math.ceil(Math.max(MIN_RANGE[k], Math.abs(model.lo[k]), Math.abs(model.hi[k]), Math.abs(actual[k]) * 1.1));
  const v = value[k];
  const changed = v !== actual[k];
  const unit = FEATURE_LABELS[k].unit;
  const digits = k === "fx" || k === "dxy" ? 2 : k === "us10y" ? 0 : 1;
  const outside = v < model.lo[k] || v > model.hi[k];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[15px] font-medium">
          {FEATURE_LABELS[k].name}
        </label>
        <output htmlFor={id} className={`num shrink-0 font-semibold ${changed ? "text-amber-700" : ""}`}>
          {signed(v, digits)}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={-lim}
        max={lim}
        step={STEP[k] ?? 0.1}
        value={Math.max(-lim, Math.min(lim, v))}
        onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
        className="mt-1 w-full"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={changed || outside ? "text-sm text-slate-600" : "sr-only"}>
        {FEATURE_LABELS[k].hint}
        {asOf?.[k] ? ` (${shortDate(asOf[k]!)})` : ""}
        {changed && ` · 실제 ${signed(actual[k], digits)}${unit}`}
        {outside && <span className="text-amber-800"> · 평소 범위 밖</span>}
      </p>
    </div>
  );
}

export function ScenarioPanel(props: Props) {
  const { actual, value, onChange } = props;
  const isActual = FEATURE_KEYS.every((k) => value[k] === actual[k]);

  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6" aria-labelledby="scenario-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="scenario-title" className="text-lg font-bold">
            시나리오 바꿔 보기
          </h2>
          <p className="mt-1 text-sm text-slate-600">값을 바꾸면 확률이 바로 다시 계산돼요.</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(actual)}
          disabled={isActual}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400"
        >
          <RotateCcw className="size-4" aria-hidden /> 실제 값
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="예시 시나리오">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.apply(actual))}
            title={p.description}
            className="min-h-11 rounded-full bg-slate-100 px-4 text-[15px] font-medium hover:bg-slate-200"
          >
            {p.name}
            <span className="sr-only">: {p.description}</span>
          </button>
        ))}
      </div>

      {FEATURE_GROUPS.map((g, i) => (
        <details key={g.name} open={i === 0} className="mt-5 border-t border-slate-100 pt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold">
            {g.name} <span className="font-normal text-slate-500">({g.keys.length})</span>
          </summary>
          <div className="space-y-5 pb-2">
            {g.keys.map((k) => (
              <Slider key={k} k={k} {...props} />
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
