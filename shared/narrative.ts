// Gemini가 없을 때 쓰는 규칙 기반 설명. 모델 결과를 그대로 풀어 쓸 뿐, 새 사실을 만들지 않습니다.

import { SIGNAL_TEXT } from "./model";
import type { Narrative, Prediction, Scenario, ScenarioReference } from "./types";

export function rulesNarrative(name: string, scenario: Scenario, reference: ScenarioReference, p: Prediction): Narrative {
  const sorted = [...p.factors].filter((f) => f.contribution !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const pushUp = sorted.filter((f) => f.contribution > 0).slice(0, 2).map((f) => f.name);
  const pushDown = sorted.filter((f) => f.contribution < 0).slice(0, 2).map((f) => f.name);

  const parts: string[] = [];
  parts.push(`현재 시나리오에서 ${name}의 점수는 ${p.score >= 0 ? "+" : ""}${p.score.toFixed(2)}로 '${SIGNAL_TEXT[p.signal]}'입니다.`);
  if (pushUp.length) parts.push(`${pushUp.join("·")}이(가) 점수를 끌어올렸고`);
  if (pushDown.length) parts.push(`${pushDown.join("·")}이(가) 점수를 낮췄습니다.`);
  else if (pushUp.length) parts[parts.length - 1] += ", 점수를 낮춘 요인은 거의 없습니다.";
  if (!pushUp.length && !pushDown.length) parts.push("모든 요인이 중립에 가까워 방향을 판단하기 어렵습니다.");
  if (p.signal === "NEUTRAL") parts.push("점수가 0에 가까워 작은 변화에도 방향이 바뀔 수 있습니다.");

  const risks: string[] = [];
  if (Math.abs(scenario.usdKrw - reference.usdKrw) >= 15) risks.push("환율 변동 폭이 커서 외국인 자금 흐름이 예상과 다르게 움직일 수 있습니다.");
  if (scenario.oilPrice - reference.oilPrice >= 5) risks.push("유가 상승은 제조업 원가와 물가 우려를 키울 수 있습니다.");
  if (scenario.foreignFlow === 0 && scenario.newsSentiment === 0)
    risks.push("외국인 수급과 뉴스 분위기를 중립(0)으로 두었습니다. 실제 값을 넣으면 결과가 달라질 수 있습니다.");
  risks.push("실적 발표, 공시 같은 개별 기업 소식은 이 모델에 들어 있지 않습니다.");
  risks.push("이 점수는 사람이 정한 가중치로 계산한 참고 지표이며, 검증된 예측 확률이 아닙니다.");

  return { analysis: parts.join(" "), risks: risks.slice(0, 3), generatedBy: "rules" };
}
