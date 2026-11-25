import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRanges, priceRange, quantile } from "../shared/range";
import type { DailyRow } from "../shared/types";

const row = (date: string, open: number, high: number, low: number, close: number): DailyRow => ({
  date, open, high, low, close, volume: 1, foreignNet: 0, institutionNet: 0,
});

test("분위수", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([0, 10], 0.8), 8);
});

test("예상 가격 범위: 시가는 갭 기대값, 하루 폭은 최근 20일 시가 대비 고·저가", () => {
  // 20일 모두 시가 100, 고가 102(+2%), 저가 99(−1%)
  const rows = Array.from({ length: 20 }, (_, i) => row(`2026-01-${String(i + 1).padStart(2, "0")}`, 100, 102, 99, 100));
  const r = priceRange(rows, 1, 0.5)!;
  assert.equal(r.prevClose, 100);
  assert.ok(Math.abs(r.expectedOpen - 101) < 1e-9);
  assert.ok(Math.abs(r.openLo - 100.5) < 1e-9 && Math.abs(r.openHi - 101.5) < 1e-9);
  assert.ok(Math.abs(r.upPct - 2) < 1e-9 && Math.abs(r.downPct - 1) < 1e-9);
  assert.ok(Math.abs(r.dayHi - 101 * 1.02) < 1e-9 && Math.abs(r.dayLo - 101 * 0.99) < 1e-9);
});

test("데이터가 모자라면 범위를 만들지 않음", () => {
  assert.equal(priceRange([row("2026-01-01", 100, 101, 99, 100)], 0, 1), null);
});

test("범위 적중 점검", () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(`2026-01-${String(i + 1).padStart(2, "0")}`, 100, 102, 99, 100));
  const r = priceRange(rows, 0, 1)!;
  const c = checkRanges([
    { range: r, actual: row("2026-02-01", 100.5, 101, 99.5, 100) }, // 시가 범위 안, 고·저 범위 안
    { range: r, actual: row("2026-02-02", 103, 106, 102, 105) }, // 시가 범위 밖, 고가 넘음
  ])!;
  assert.equal(c.n, 2);
  assert.equal(c.openInBand, 50);
  assert.equal(c.highWithin, 50);
  assert.equal(c.lowWithin, 100);
});
