import assert from "node:assert/strict";
import { test } from "node:test";
import { predict, PRESETS } from "../shared/model";
import type { Scenario } from "../shared/types";

const neutral: Scenario = { usdKrw: 1400, oilPrice: 70, nasdaqChange: 0, semiconductorChange: 0, foreignFlow: 0, newsSentiment: 0 };
const ref = { usdKrw: 1400, oilPrice: 70 };

test("모든 입력이 중립이면 점수 0, 신뢰도 50, 중립 신호", () => {
  const p = predict({ sector: "semiconductor", price: 70000, prevDayChangeRate: 0, scenario: neutral, reference: ref });
  assert.equal(p.score, 0);
  assert.equal(p.confidence, 50);
  assert.equal(p.signal, "NEUTRAL");
  assert.ok(p.trajectory.every((t) => t.price === 70000));
});

test("하락 점수면 신뢰도도 50 이상 (원본의 35% 표시 버그 없음)", () => {
  const p = predict({ sector: "default", price: 10000, prevDayChangeRate: -3, scenario: { ...neutral, nasdaqChange: -3, foreignFlow: -5 }, reference: ref });
  assert.equal(p.direction, "DOWN");
  assert.ok(p.confidence >= 75 && p.confidence <= 90);
  assert.equal(p.signal, "STRONG_DOWN");
});

test("반도체 지수는 반도체 업종에 더 크게 작용", () => {
  const s = { ...neutral, semiconductorChange: 2 };
  const chip = predict({ sector: "semiconductor", price: 1, prevDayChangeRate: 0, scenario: s, reference: ref });
  const auto = predict({ sector: "auto", price: 1, prevDayChangeRate: 0, scenario: s, reference: ref });
  assert.ok(chip.score > auto.score);
});

test("환율 상승은 자동차엔 플러스, 플랫폼엔 마이너스", () => {
  const s = { ...neutral, usdKrw: 1430 };
  assert.ok(predict({ sector: "auto", price: 1, prevDayChangeRate: 0, scenario: s, reference: ref }).score > 0);
  assert.ok(predict({ sector: "platform", price: 1, prevDayChangeRate: 0, scenario: s, reference: ref }).score < 0);
});

test("요인 비중 합계는 약 100%", () => {
  const p = predict({ sector: "bio", price: 1, prevDayChangeRate: 1, scenario: PRESETS[0].apply(neutral), reference: ref });
  const sum = p.factors.reduce((a, f) => a + f.share, 0);
  assert.ok(Math.abs(sum - 100) < 0.5, `sum=${sum}`);
});

test("극단 입력에서도 경로 값이 유한", () => {
  const s = { usdKrw: 3000, oilPrice: 500, nasdaqChange: 20, semiconductorChange: 20, foreignFlow: 5, newsSentiment: 100 };
  const p = predict({ sector: "semiconductor", price: 50000, prevDayChangeRate: 30, scenario: s, reference: ref });
  assert.ok(p.trajectory.every((t) => Number.isFinite(t.price) && t.price > 0));
});

test("유가 상승은 모든 기본 업종에 마이너스", () => {
  const s = { ...neutral, oilPrice: 80 };
  for (const sector of ["default", "auto", "semiconductor", "platform"] as const) {
    assert.ok(predict({ sector, price: 1, prevDayChangeRate: 0, scenario: s, reference: ref }).score < 0, sector);
  }
});
