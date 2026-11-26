import assert from "node:assert/strict";
import { test } from "node:test";
import { forecastTiming, nextUpdateLabel } from "../src/lib/format";

// KST = UTC + 9
const kst = (iso: string) => new Date(new Date(iso + "Z").getTime() - 9 * 3600_000);

test("다음 자동 갱신 시각", () => {
  assert.equal(nextUpdateLabel(kst("2026-11-23T06:00:00")), "오늘 08:05"); // 월 새벽
  assert.equal(nextUpdateLabel(kst("2026-11-23T10:00:00")), "오늘 16:40"); // 월 오전
  assert.equal(nextUpdateLabel(kst("2026-11-23T18:00:00")), "내일 08:05"); // 월 저녁
  assert.equal(nextUpdateLabel(kst("2026-11-27T18:00:00")), "월요일 08:05"); // 금 저녁
  assert.equal(nextUpdateLabel(kst("2026-11-22T19:35:00")), "내일 08:05"); // 일 저녁 → 월
});

test("전망 시점 표시", () => {
  assert.equal(forecastTiming("2026-11-25T23:06:00Z", "2026-11-26"), "preopen"); // 11/26 08:06 KST
  assert.equal(forecastTiming("2026-11-26T04:15:00Z", "2026-11-26"), "late"); // 13:15 KST
  assert.equal(forecastTiming("2026-11-26T09:00:00Z", "2026-11-27"), "previous"); // 전날 18:00
});
