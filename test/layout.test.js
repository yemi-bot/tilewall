const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout, bestGrid } = require('../renderer/layout.js');

const W = 1920;
const H = 1080;

function inside(r, w, h) {
  return r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= w + 0.01 && r.y + r.h <= h + 0.01;
}

function overlaps(a, b) {
  return a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
}

test('no tiles gives no rects', () => {
  assert.deepEqual(computeLayout({ mode: 'grid', count: 0, width: W, height: H, gap: 0 }), []);
});

test('one tile fills the stage', () => {
  const [r] = computeLayout({ mode: 'grid', count: 1, width: W, height: H, gap: 2 });
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h, hidden: r.hidden }, { x: 0, y: 0, w: W, h: H, hidden: false });
});

test('four tiles on a 16:9 screen make a 2x2 of exact 16:9 cells', () => {
  const rects = computeLayout({ mode: 'grid', count: 4, width: W, height: H, gap: 0 });
  assert.equal(rects.length, 4);
  for (const r of rects) {
    assert.equal(r.w, 960);
    assert.equal(r.h, 540);
  }
  assert.deepEqual(rects.map((r) => [r.x, r.y]), [[0, 0], [960, 0], [0, 540], [960, 540]]);
});

test('gap is respected between cells', () => {
  const rects = computeLayout({ mode: 'grid', count: 4, width: W, height: H, gap: 4 });
  assert.equal(rects[1].x - (rects[0].x + rects[0].w), 4);
  assert.equal(rects[2].y - (rects[0].y + rects[0].h), 4);
});

test('a short last row is centered', () => {
  const rects = computeLayout({ mode: 'grid', count: 3, width: W, height: H, gap: 0 });
  // 2x2 grid, third tile alone on row 2, centered
  assert.equal(rects[2].y, 540);
  assert.equal(rects[2].x, (W - rects[2].w) / 2);
});

test('grid never overlaps and stays inside for 1..16 tiles and odd sizes', () => {
  for (const [w, h] of [[1920, 1080], [1280, 1024], [900, 1600], [3440, 1440], [500, 300]]) {
    for (let n = 1; n <= 16; n++) {
      const rects = computeLayout({ mode: 'grid', count: n, width: w, height: h, gap: 2 });
      assert.equal(rects.length, n);
      rects.forEach((r, i) => {
        assert.ok(inside(r, w, h), `rect ${i} of ${n} outside ${w}x${h}`);
        for (let j = i + 1; j < n; j++) assert.ok(!overlaps(r, rects[j]), `overlap ${i},${j} of ${n} at ${w}x${h}`);
      });
    }
  }
});

test('bestGrid prefers wide grids on wide screens and tall grids on tall screens', () => {
  assert.equal(bestGrid(2, 1920, 1080, 0).cols, 2);
  assert.equal(bestGrid(2, 1080, 1920, 0).cols, 1);
});

test('focus layout gives the main tile the biggest rect', () => {
  const rects = computeLayout({ mode: 'focus', count: 4, width: W, height: H, gap: 2, mainIndex: 2 });
  const main = rects[2];
  for (const [i, r] of rects.entries()) {
    assert.ok(inside(r, W, H));
    if (i !== 2) {
      assert.ok(r.w * r.h < main.w * main.h / 4, 'side tiles are much smaller');
      assert.ok(!overlaps(r, main));
    }
  }
  assert.equal(main.x, 0);
  assert.equal(main.y, 0);
});

test('focus layout on a portrait stage puts the strip at the bottom', () => {
  const rects = computeLayout({ mode: 'focus', count: 3, width: 1080, height: 1920, gap: 0, mainIndex: 0 });
  assert.equal(rects[0].w, 1080);
  assert.ok(rects[1].y >= rects[0].h);
});

test('focus with an out of range main index falls back to the first tile', () => {
  const rects = computeLayout({ mode: 'focus', count: 3, width: W, height: H, gap: 0, mainIndex: 9 });
  assert.equal(rects[0].x, 0);
  assert.ok(rects[0].w > rects[1].w);
});

test('solo shows only the main tile, full size', () => {
  const rects = computeLayout({ mode: 'solo', count: 3, width: W, height: H, gap: 2, mainIndex: 1 });
  assert.deepEqual(rects.map((r) => r.hidden), [true, false, true]);
  assert.equal(rects[1].w, W);
  assert.equal(rects[1].h, H);
});
