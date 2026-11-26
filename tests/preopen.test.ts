import assert from "node:assert/strict";
import { test } from "node:test";
import { lateSessionMove, nextTradingDate, preOpenMove } from "../shared/features";

const kst = (s: string) => Date.parse(s + "+09:00");
// 1시간봉: 끝난 시각과 가격
const series = [
  { t: kst("2026-11-26T05:00:00"), c: 100 },
  { t: kst("2026-11-26T06:00:00"), c: 100 }, // 미국 장 마감 무렵
  { t: kst("2026-11-26T07:00:00"), c: 100.2 },
  { t: kst("2026-11-26T08:00:00"), c: 100.5 }, // 08:00
  { t: kst("2026-11-26T09:00:00"), c: 101.5 }, // 장 시작 후 — 쓰면 안 됨
];

test("장전 선물: 06:00 → 08:00 변화만 쓰고 09:00 값은 안 씀", () => {
  assert.ok(Math.abs(preOpenMove(series, "2026-11-26") - 0.5) < 1e-9);
});

test("장전 선물: 지금 시각 이후 값은 안 씀", () => {
  assert.ok(Math.abs(preOpenMove(series, "2026-11-26", kst("2026-11-26T07:30:00")) - 0.2) < 1e-9);
  assert.equal(preOpenMove(series, "2026-11-26", kst("2026-11-26T05:30:00")), 0); // 아직 06:00 전
  assert.equal(preOpenMove([], "2026-11-26"), 0);
});

test("다음 거래일: 09:00 전이면 오늘, 이후면 다음 평일", () => {
  assert.equal(nextTradingDate(kst("2026-11-26T07:00:00"), "2026-11-25"), "2026-11-26");
  assert.equal(nextTradingDate(kst("2026-11-26T16:40:00"), "2026-11-26"), "2026-11-27");
  assert.equal(nextTradingDate(kst("2026-11-27T18:00:00"), "2026-11-27"), "2026-11-30"); // 금 저녁 → 월
});

test("미국 장 후반 흐름: 00:00 → 06:00", () => {
  const s = [
    { t: kst("2026-11-26T00:00:00"), c: 100 },
    { t: kst("2026-11-26T03:00:00"), c: 103 },
    { t: kst("2026-11-26T06:00:00"), c: 104 },
    { t: kst("2026-11-26T07:00:00"), c: 99 }, // 06시 이후 — 안 씀
  ];
  assert.ok(Math.abs(lateSessionMove(s, "2026-11-26") - 4) < 1e-9);
});
