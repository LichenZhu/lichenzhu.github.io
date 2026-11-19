/* The wave field at the top of the homepage.

   A point cloud of a water surface seen in perspective, receding toward a
   horizon, driven by a damped 2-D wave equation solved live on the grid:

       u(t+1) = (2u(t) - u(t-1) + c^2 * laplacian(u)) * damping

   so ripples are not drawn, they happen: they spread, cross, interfere and
   die away. On top of that sit a slow swell, the odd raindrop, and one
   glider that crosses the surface by itself and leaves a wake the equation
   produces on its own. A cursor moving over the surface drags a wake behind
   it; a click drops a stone.

   It lives in its own band above the text, never behind it, and nothing
   here touches the rest of the page. It runs only while the band is on
   screen and the tab is visible. With reduced motion it renders one still
   frame of the surface; without JavaScript the band is not shown at all. */
(function () {
  'use strict';

  var fig = document.querySelector('.hero-field');
  var canvas = fig && fig.querySelector('canvas');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Surface and camera. The cells are square in world space: rows are as far
     apart in depth as columns are across, so a drop spreads as a true circle
     and perspective alone turns it into an ellipse. (Spacing rows by depth
     instead made waves run faster away from the viewer and rings lopsided.) */
  var ROWS = 0, Z_NEAR = 3, Z_FAR = 10.5, DX = 0;
  var C2 = 0.32, DAMP = 0.9955, AMP = 0.2;
  var STEP = 1000 / 60;

  var W = 0, H = 0, cols = 0, n = 0;
  var cx, horizon, K, camH, XR;
  var u0, u1, u2, zRow, xCol;
  var sxRow, syRow;                       // projected positions, one row at a time
  var colLo, colMid, colHi, lineCol, glowCol, alphaScale = 1, additive = false, floor = 0.16;

  var t = 0, last = 0, acc = 0, running = false, onScreen = true;
  var nextRain = 0, trail = [], pointer = null;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (name) { return cs.getPropertyValue(name).trim(); };
    colLo = v('--wave-lo'); colMid = v('--wave-mid'); colHi = v('--wave-hi');
    lineCol = v('--wave-line'); glowCol = v('--wave-glow');
    alphaScale = parseFloat(v('--wave-alpha')) || 1;
    floor = parseFloat(v('--wave-floor')) || 0.16;   // how visible still water is
    // Light adds up on a dark page, so crests and the dense far rows glow;
    // on white, adding light would only wash the surface out.
    additive = v('--wave-blend') === 'lighter';
  }

  function build() {
    var rect = fig.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.max(100, Math.min(200, Math.round(W / 5)));
    XR = Z_FAR * 0.86;                    // the far row spans 86% of the width
    DX = 2 * XR / (cols - 1);
    ROWS = Math.round((Z_FAR - Z_NEAR) / DX) + 1;
    n = cols * ROWS;
    u0 = new Float32Array(n); u1 = new Float32Array(n); u2 = new Float32Array(n);
    sxRow = new Float32Array(cols); syRow = new Float32Array(cols);

    cx = W / 2;
    horizon = H * 0.04;
    K = W / 2;                            // x/z = +-1 reaches the edges
    camH = (H * 0.985 - horizon) * Z_NEAR / K;

    zRow = new Float32Array(ROWS);
    for (var j = 0; j < ROWS; j++) zRow[j] = Z_NEAR + j * DX;
    xCol = new Float32Array(cols);
    for (var i = 0; i < cols; i++) xCol[i] = (i / (cols - 1) * 2 - 1) * XR;
    trail = [];
  }

  /* --- physics -------------------------------------------------------- */
  function impulse(gi, gj, amp, radius) {
    var r = Math.ceil(radius * 2.2), s2 = 2 * radius * radius;
    var i0 = Math.max(1, Math.round(gi) - r), i1 = Math.min(cols - 2, Math.round(gi) + r);
    var j0 = Math.max(1, Math.round(gj) - r), j1 = Math.min(ROWS - 2, Math.round(gj) + r);
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var di = i - gi, dj = j - gj;
        u1[j * cols + i] += amp * Math.exp(-(di * di + dj * dj) / s2);
      }
    }
  }

  function sim() {
    for (var j = 1; j < ROWS - 1; j++) {
      var row = j * cols;
      for (var i = 1; i < cols - 1; i++) {
        var k = row + i;
        var lap = u1[k - 1] + u1[k + 1] + u1[k - cols] + u1[k + cols] - 4 * u1[k];
        u2[k] = (2 * u1[k] - u0[k] + C2 * lap) * DAMP;
      }
    }
    var tmp = u0; u0 = u1; u1 = u2; u2 = tmp;
  }

  function swell(i, j) {
    return 0.16 * Math.sin(0.21 * i + 0.0016 * t) * Math.sin(0.37 * j - 0.0011 * t) +
           0.12 * Math.sin(0.08 * i - 0.29 * j + 0.0019 * t);
  }

  /* Screen point to grid cell, by intersecting the view ray with the still
     surface. Null above the far edge. */
  function toGrid(sx, sy) {
    if (sy <= horizon + 2) return null;
    var z = camH * K / (sy - horizon);
    if (z < Z_NEAR * 0.98 || z > Z_FAR) return null;
    var x = (sx - cx) * z / K;
    var gi = (x / XR + 1) / 2 * (cols - 1);
    var gj = (z - Z_NEAR) / DX;
    if (gi < 1 || gi > cols - 2 || gj < 1 || gj > ROWS - 2) return null;
    return { i: gi, j: gj };
  }

  function project(i, j) {
    var z = zRow[j], h = (u1[j * cols + i] + swell(i, j)) * AMP;
    return { x: cx + xCol[i] / z * K, y: horizon + (camH - h) * K / z };
  }

  /* The glider follows a slow Lissajous path laid out in screen space, so it
     never wanders off the visible part of the surface. */
  function glider() {
    var a = t * 0.00016, b = t * 0.00027 + 1.2;
    var sx = W * (0.5 + 0.36 * Math.sin(a));
    var farY = horizon + camH * K / Z_FAR;
    var sy = farY + (H * 0.9 - farY) * (0.5 + 0.42 * Math.sin(b));
    return toGrid(sx, sy);
  }

  function step() {
    t += STEP;
    var g = glider();
    if (g) impulse(g.i, g.j, -0.22, 0.9);
    if (t > nextRain) {
      var rg = toGrid(W * (0.12 + Math.random() * 0.76), H * (0.3 + Math.random() * 0.6));
      if (rg) impulse(rg.i, rg.j, -(1.1 + Math.random() * 1.2), 0.85);
      nextRain = t + 550 + Math.random() * 1300;
    }
    sim();
    if (g) {
      var p = project(Math.round(g.i), Math.round(g.j));
      trail.push(p.x, p.y);
      if (trail.length > 64) trail.splice(0, 2);
    }
  }

  /* --- drawing -------------------------------------------------------- */
  var BUCKETS = 6;
  var buckets = [[], [], []];             // lo, mid, hi; each holds BUCKETS lists

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    var c, a, k, i, j;
    for (c = 0; c < 3; c++) for (a = 0; a < BUCKETS; a++) (buckets[c][a] || (buckets[c][a] = [])).length = 0;

    var edgeW = W * 0.13, bottomW = H * 0.2;
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = lineCol;

    for (j = ROWS - 1; j >= 0; j--) {
      var z = zRow[j], depth = j / (ROWS - 1);
      var fog = Math.pow(1 - depth, 0.75) * 0.88 + 0.12;
      var size = 0.7 + 1.6 * (Z_NEAR / z);
      var first = -1, lastI = -1;

      var inner = j > 0 && j < ROWS - 1;
      for (i = 0; i < cols; i++) {
        var kk = j * cols + i;
        var h = u1[kk] + swell(i, j);
        var sx = cx + xCol[i] / z * K;
        sxRow[i] = sx;
        syRow[i] = horizon + (camH - h * AMP) * K / z;
        if (sx < -4 || sx > W + 4) continue;
        if (first < 0) first = i;
        lastI = i;

        var e = Math.min(sx, W - sx) / edgeW;
        e = e >= 1 ? 1 : e <= 0 ? 0 : e * e * (3 - 2 * e);
        // and out through the bottom, so the water dissolves into the page
        // above the greeting instead of ending on a hard line
        var bf = (H - syRow[i]) / bottomW;
        e *= bf >= 1 ? 1 : bf <= 0 ? 0 : bf * bf * (3 - 2 * bf);
        // Slope, not height, is what catches light on water: the moving
        // fronts of a ripple glow and the flat water between them stays dark.
        var slope = inner && i > 0 && i < cols - 1
          ? Math.abs(u1[kk + 1] - u1[kk - 1]) + Math.abs(u1[kk + cols] - u1[kk - cols]) : 0;
        var level = floor + slope * 1.5 + h * 0.18;
        level = level < 0 ? 0 : level > 1 ? 1 : level;
        var alpha = fog * e * (0.2 + 0.8 * level) * alphaScale;
        if (alpha < 0.02) continue;
        c = level < 0.3 ? 0 : level < 0.6 ? 1 : 2;
        a = Math.min(BUCKETS - 1, (alpha * BUCKETS) | 0);
        buckets[c][a].push(sx, syRow[i], size);
      }

      // the row as a faint scanline: the surface reads as a mesh, not dust
      if (first >= 0 && lastI > first) {
        ctx.globalAlpha = fog * 0.09 * alphaScale * (j < 4 ? j / 4 : 1);
        ctx.beginPath();
        ctx.moveTo(sxRow[first], syRow[first]);
        for (i = first + 1; i <= lastI; i++) ctx.lineTo(sxRow[i], syRow[i]);
        ctx.stroke();
      }
    }

    var colors = [colLo, colMid, colHi];
    // bloom: the crests again, larger and faint, so they read as light.
    // Dark only: on white the same pass draws grey squares, not glow.
    ctx.fillStyle = colHi;
    for (a = 1; additive && a < BUCKETS; a++) {
      var crest = buckets[2][a];
      if (!crest.length) continue;
      ctx.globalAlpha = (a + 0.5) / BUCKETS * 0.22;
      ctx.beginPath();
      for (k = 0; k < crest.length; k += 3) {
        var bs = crest[k + 2] * 3.2;
        ctx.rect(crest[k] - bs / 2, crest[k + 1] - bs / 2, bs, bs);
      }
      ctx.fill();
    }
    for (c = 0; c < 3; c++) {
      ctx.fillStyle = colors[c];
      for (a = 0; a < BUCKETS; a++) {
        var list = buckets[c][a];
        if (!list.length) continue;
        ctx.globalAlpha = (a + 0.5) / BUCKETS;
        ctx.beginPath();
        for (k = 0; k < list.length; k += 3) {
          var s = list[k + 2];
          ctx.rect(list[k] - s / 2, list[k + 1] - s / 2, s, s);
        }
        ctx.fill();
      }
    }

    // the glider: a fading trail and a glowing head
    if (trail.length >= 4) {
      ctx.strokeStyle = colHi;
      ctx.lineWidth = 1.2;
      for (k = 2; k < trail.length; k += 2) {
        ctx.globalAlpha = (k / trail.length) * 0.55 * alphaScale;
        ctx.beginPath();
        ctx.moveTo(trail[k - 2], trail[k - 1]);
        ctx.lineTo(trail[k], trail[k + 1]);
        ctx.stroke();
      }
      var hx = trail[trail.length - 2], hy = trail[trail.length - 1];
      var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
      g.addColorStop(0, glowCol);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alphaScale;
      ctx.fillStyle = g;
      ctx.fillRect(hx - 14, hy - 14, 28, 28);
      ctx.fillStyle = colHi;
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* --- loop ----------------------------------------------------------- */
  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    acc += Math.min(now - last, 100);
    last = now;
    var steps = 0;
    while (acc >= STEP && steps < 3) { step(); acc -= STEP; steps++; }
    if (steps) draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || still || !onScreen || document.hidden) return;
    running = true; last = 0; acc = 0;
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  function seed() {
    // a stone into still water, a little off centre, as the page opens
    var g = toGrid(W * 0.56, H * 0.62);
    if (g) impulse(g.i, g.j, -5, 1.3);
    nextRain = t + 1800;
  }

  /* --- wiring --------------------------------------------------------- */
  readColors();
  build();
  seed();

  if (still) {
    // One frame, after the surface has had a moment to move.
    for (var s = 0; s < 70; s++) step();
    draw();
    fig.classList.add('is-on');
  } else {
    draw();
    fig.classList.add('is-on');
    start();

    fig.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var g = toGrid(x, y);
      if (g && pointer) {
        var d = Math.hypot(x - pointer.x, y - pointer.y);
        impulse(g.i, g.j, -Math.min(1.2, 0.06 + d * 0.05), 1);
      }
      pointer = { x: x, y: y };
    }, { passive: true });
    fig.addEventListener('pointerleave', function () { pointer = null; });
    fig.addEventListener('pointerdown', function (e) {
      var r = canvas.getBoundingClientRect();
      var g = toGrid(e.clientX - r.left, e.clientY - r.top);
      if (g) impulse(g.i, g.j, -5, 1.3);
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) start(); else stop();
      }).observe(fig);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  var lastW = W;
  var onResize = function () {
    var w = Math.round(fig.getBoundingClientRect().width);
    if (w === lastW) return;
    lastW = w;
    build(); seed();
    if (still) { for (var s = 0; s < 70; s++) step(); }
    draw();
  };
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(fig);
  else window.addEventListener('resize', onResize);

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  if (scheme.addEventListener) scheme.addEventListener('change', function () { readColors(); draw(); });
})();
