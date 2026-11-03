import assert from "node:assert/strict";
import test from "node:test";
import { buildPosterModel, formatBillionsAsYi, posterFileName } from "../lib/portfolio-poster.ts";

const position = (value, index, ticker = `STOCK${index}`) => ({ id: `position-${index}`, ticker, company: `Company ${index}`, value, weight: 99 });
const closeTo = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test("uses disclosed dollar amounts for top ten and a proportional top-eight plus other ring", () => {
  const holdings = Array.from({ length: 12 }, (_, i) => position(i + 1, i));
  const model = buildPosterModel(holdings, 78);
  assert.equal(model.count, 12);
  assert.equal(model.topHoldings.length, 10);
  assert.deepEqual(model.topHoldings.map((holding) => holding.value), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(model.segments.length, 9);
  assert.equal(model.otherCount, 4);
  assert.equal(model.segments.at(-1).label, "其他");
  assert.equal(model.segments.at(-1).value, 10);
  assert.equal(model.segments.at(-1).rank, null);
  closeTo(model.topHoldings[0].weight, 12 / 78 * 100);
  closeTo(model.topTenWeight, 75 / 78 * 100);
  closeTo(model.segments.reduce((sum, segment) => sum + segment.weight, 0), 100);
  assert.equal(model.segments[0].startAngle, -Math.PI / 2);
  assert.equal(model.segments.at(-1).endAngle, Math.PI * 1.5);
  model.segments.forEach((segment, index) => {
    closeTo(segment.endAngle - segment.startAngle, segment.value / 78 * Math.PI * 2);
    if (index) assert.equal(segment.startAngle, model.segments[index - 1].endAngle);
  });
});

test("preserves separate securities and options rather than merging similar tickers", () => {
  const holdings = [position(2, 0, "GOOG"), position(3, 1, "GOOGL"), position(1, 2, "GOOG PUT")];
  const model = buildPosterModel(holdings, 6);
  assert.deepEqual(model.topHoldings.map((holding) => holding.ticker), ["GOOGL", "GOOG", "GOOG PUT"]);
  assert.equal(model.segments.length, 3);
  assert.equal(model.otherCount, 0);
  assert(!model.segments.some((segment) => segment.label === "其他"));
});

test("does not mutate inputs and retains stable IDs when values tie", () => {
  const holdings = Object.freeze([Object.freeze(position(1, 0)), Object.freeze(position(1, 1))]);
  const model = buildPosterModel(holdings, 2);
  assert.deepEqual(model.topHoldings.map((holding) => holding.id), ["position-0", "position-1"]);
  assert(holdings.every((holding) => holding.weight === 99));
  assert(holdings.every((holding) => !("rank" in holding)));
});

test("handles concentrated portfolios, zero positions, and an empty portfolio without fake arcs", () => {
  const concentrated = buildPosterModel([position(99.99, 0), position(.01, 1), position(0, 2)], 100);
  assert.equal(concentrated.count, 3);
  assert.equal(concentrated.topHoldings.length, 3);
  assert.equal(concentrated.segments.length, 2);
  assert(concentrated.segments.every((segment) => segment.endAngle > segment.startAngle));
  closeTo(concentrated.segments[0].weight, 99.99);
  assert.deepEqual(buildPosterModel([], 0), { topHoldings: [], segments: [], totalValue: 0, count: 0, topTenWeight: 0, otherCount: 0 });
  const zero = buildPosterModel([position(0, 0)], 0);
  assert.equal(zero.topHoldings[0].weight, 0);
  assert.deepEqual(zero.segments, []);
});

test("rejects invalid or inconsistent amounts while tolerating ordinary floating-point sums", () => {
  for (const value of [NaN, Infinity, -Infinity, -1]) {
    assert.throws(() => buildPosterModel([position(value, 0)], 1));
    assert.throws(() => buildPosterModel([], value));
  }
  assert.throws(() => buildPosterModel([position(10, 0)], 11), /不一致/);
  assert.throws(() => buildPosterModel([position(.000001, 0)], 0), /不一致/);
  assert.throws(() => buildPosterModel([], 1), /不一致/);
  const model = buildPosterModel([position(.1, 0), position(.2, 1)], .3);
  closeTo(model.topTenWeight, 100);
});

test("formats billions as US dollar yi and produces safe Chinese PNG names", () => {
  assert.equal(formatBillionsAsYi(65.953), "659.5亿");
  assert.equal(formatBillionsAsYi(299.253556246), "2,992.5亿");
  assert.equal(formatBillionsAsYi(0), "0.0亿");
  assert.equal(formatBillionsAsYi(.1), "1.0亿");
  assert.equal(formatBillionsAsYi(.005210856), "521.1万美元");
  assert.equal(formatBillionsAsYi(.00001), "1.0万美元");
  assert.equal(formatBillionsAsYi(.00000123456), "1,234.56美元");
  assert.equal(formatBillionsAsYi(.000000001), "1美元");
  for (const value of [.005210856, .00001, .000001, .000000001]) {
    assert.notEqual(formatBillionsAsYi(value), "0.0亿");
  }
  assert.throws(() => formatBillionsAsYi(NaN));
  assert.throws(() => formatBillionsAsYi(-1));
  assert.equal(posterFileName("伯克希尔·哈撒韦", "2026 Q2"), "伯克希尔·哈撒韦_2026 Q2_持仓海报.png");
  const unsafe = posterFileName('../危险/名称:*?\\\n', '2026|Q2');
  assert(!/[\u0000-\u001f<>:"/\\|?*]/.test(unsafe));
  assert(unsafe.includes("危险_名称"));
  assert.equal(posterFileName("", ""), "13F_持仓_持仓海报.png");
});
