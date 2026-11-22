import assert from "node:assert/strict";
import { test } from "node:test";
import { nextUpdateLabel } from "../src/lib/format";

// KST = UTC + 9
const kst = (iso: string) => new Date(new Date(iso + "Z").getTime() - 9 * 3600_000);

test("다음 자동 갱신 시각", () => {
  assert.equal(nextUpdateLabel(kst("2026-11-23T06:00:00")), "오늘 07:20"); // 월 새벽
  assert.equal(nextUpdateLabel(kst("2026-11-23T10:00:00")), "오늘 16:40"); // 월 오전
  assert.equal(nextUpdateLabel(kst("2026-11-23T18:00:00")), "내일 07:20"); // 월 저녁
  assert.equal(nextUpdateLabel(kst("2026-11-27T18:00:00")), "월요일 07:20"); // 금 저녁
  assert.equal(nextUpdateLabel(kst("2026-11-22T19:35:00")), "내일 07:20"); // 일 저녁 → 월
});
