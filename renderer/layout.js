// Tile layout math. Pure functions, shared by the app (browser global TWLayout)
// and the node tests (CommonJS).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ASPECT = 16 / 9;

  // Pick the column count that gives each tile the biggest 16:9 picture.
  function bestGrid(n, W, H, gap) {
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const tw = (W - gap * (cols - 1)) / cols;
      const th = (H - gap * (rows - 1)) / rows;
      if (tw <= 0 || th <= 0) continue;
      const vw = Math.min(tw, th * ASPECT);
      const score = vw * (vw / ASPECT);
      const empty = cols * rows - n;
      const shape = Math.abs(Math.log(tw / th / ASPECT));
      const cand = { cols, rows, tw, th, score, empty, shape };
      if (!best) { best = cand; continue; }
      const eps = best.score * 0.001;
      if (cand.score > best.score + eps) best = cand;
      else if (Math.abs(cand.score - best.score) <= eps) {
        // same picture size: fewer empty cells, then cells closer to 16:9,
        // then follow the screen (more columns when wide, more rows when tall)
        const sameShape = Math.abs(cand.shape - best.shape) < 1e-6;
        if (cand.empty < best.empty) best = cand;
        else if (cand.empty === best.empty && !sameShape && cand.shape < best.shape) best = cand;
        else if (cand.empty === best.empty && sameShape && W >= H) best = cand;
      }
    }
    return best || { cols: 1, rows: n, tw: W, th: H / Math.max(1, n), score: 0, empty: 0, shape: 0 };
  }

  function gridRects(n, W, H, gap) {
    if (n <= 0) return [];
    const g = bestGrid(n, W, H, gap);
    const rects = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / g.cols);
      const col = i % g.cols;
      const inRow = row === g.rows - 1 ? n - row * g.cols : g.cols;
      const rowW = inRow * g.tw + (inRow - 1) * gap;
      const x0 = (W - rowW) / 2;
      rects.push({ x: x0 + col * (g.tw + gap), y: row * (g.th + gap), w: g.tw, h: g.th, hidden: false });
    }
    return rects;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // One big tile plus a strip of small ones (right side when wide, bottom when tall).
  function focusRects(n, W, H, gap, mi) {
    if (n === 1) return [{ x: 0, y: 0, w: W, h: H, hidden: false }];
    const others = n - 1;
    let main;
    let strip;
    if (W >= H) {
      const sw = Math.round(clamp((H / others) * ASPECT, W * 0.2, W * 0.34));
      main = { x: 0, y: 0, w: W - sw - gap, h: H, hidden: false };
      strip = { x: W - sw, y: 0, w: sw, h: H };
    } else {
      const sh = Math.round(clamp((W / others) / ASPECT, H * 0.15, H * 0.3));
      main = { x: 0, y: 0, w: W, h: H - sh - gap, hidden: false };
      strip = { x: 0, y: H - sh, w: W, h: sh };
    }
    const side = gridRects(others, strip.w, strip.h, gap).map((r) => ({ ...r, x: r.x + strip.x, y: r.y + strip.y }));
    const out = [];
    let k = 0;
    for (let i = 0; i < n; i++) out.push(i === mi ? main : side[k++]);
    return out;
  }

  function soloRects(n, W, H, mi) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: 0, y: 0, w: W, h: H, hidden: i !== mi });
    return out;
  }

  // mode: 'grid' | 'focus' | 'solo'. Returns one rect per tile, in tile order.
  function computeLayout({ mode, count, width, height, gap = 0, mainIndex = 0 }) {
    const n = Math.max(0, count | 0);
    if (n === 0 || width <= 0 || height <= 0) return [];
    const mi = mainIndex >= 0 && mainIndex < n ? mainIndex : 0;
    if (mode === 'solo') return soloRects(n, width, height, mi);
    if (mode === 'focus') return focusRects(n, width, height, gap, mi);
    return gridRects(n, width, height, gap);
  }

  return { computeLayout, bestGrid, gridRects, ASPECT };
});
