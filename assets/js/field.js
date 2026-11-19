/* The live lattice behind the page.

   The 24px dot grid that has always sat behind the site, drawn on a canvas and
   made to respond, with a finer lattice of grains under it that only shows
   where something is happening:

     ripples   a damped wave equation runs on the fine lattice. The cursor
               drags a wake across it, a click drops a stone, and now and then
               a drop falls by itself. Grains light up on the moving slopes,
               so ripples read as rings of light, and they spread, cross and
               die away.
     cursor    grains near the pointer light, lean away and link into a mesh.
     memory    wherever the field has been lit, it keeps a faint trace that
               fades over several seconds: it remembers, then forgets. Rest
               the pointer in an empty spot and thin lines reach back to the
               brightest traces still left, and they light up again.
     opening   on the first page of a visit the dots start scattered and
               gather into the grid.

   It never moves behind text. Every paragraph, heading, list item, picture
   and card is measured, and the lattice under them stays still: ripples run
   under the page and show only in the empty space around the text. The
   empty column beside About on the homepage is where most of it plays.

   Canvas 2D, no libraries, no shaders. It stops asking for frames when
   nothing is moving. With reduced motion, or without JavaScript, there is no
   canvas and the static CSS grid stays. Clicks are observed, never caught. */
(function () {
  'use strict';

  var backdrop = document.querySelector('.backdrop');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!backdrop || reduce.matches || !window.requestAnimationFrame) return;

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.setAttribute('aria-hidden', 'true');
  backdrop.appendChild(canvas);
  backdrop.classList.add('is-live');

  /* The coarse grid matches the CSS one exactly: 24px cells, a dot in the
     middle of each, fading out down the first screen. The fine lattice is
     12px and sits on the same points, so every coarse dot is a fine node. */
  var GAP = 24, FINE = 12, FADE = 0.62;
  var C2 = 0.24, DAMP = 0.988;            // wave speed squared, damping per step
  var REACH = 150;                        // cursor halo, px
  var STEP = 1000 / 60;
  var MEM_KEEP = Math.pow(0.5, 1 / (60 * 2.6));   // traces halve every 2.6 s

  var W = 0, H = 0, VH = 0, dpr = 1;
  var gc = 0, gr = 0, gn = 0;             // coarse grid
  var fc = 0, fr = 0, fn = 0;             // fine lattice
  var u0, u1, u2, lit, mem, quiet, jx, jy, ox, oy, phase;
  var C = {};
  var ptr = null, ptrK = 0, ptrStill = 0, lastMove = 0;
  var recall = [], recallK = 0;
  var running = false, last = 0, acc = 0, clock = 0;
  var introOn = false, introT0 = 0, INTRO_MS = 2400;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (n) { return cs.getPropertyValue(n).trim(); };
    C.dot = v('--rule'); C.lit = v('--field-lit') || v('--accent'); C.hot = v('--field-hot') || C.lit;
    C.alpha = parseFloat(v('--field-alpha')) || 0.9;
    C.add = v('--field-blend') === 'lighter';
  }

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    VH = window.innerHeight;
    // Allocated at the tallest the viewport can get, so a phone's address bar
    // sliding away (which makes the viewport taller) never forces a rebuild.
    H = Math.max(VH, Math.min((window.screen && screen.height) || 0, VH * 1.6));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gc = Math.ceil(W / GAP); gr = Math.ceil(H / GAP); gn = gc * gr;
    fc = Math.ceil(W / FINE) + 1; fr = Math.ceil(H / FINE) + 1; fn = fc * fr;
    u0 = new Float32Array(fn); u1 = new Float32Array(fn); u2 = new Float32Array(fn);
    lit = new Float32Array(fn); mem = new Float32Array(fn); quiet = new Float32Array(fn);
    jx = new Float32Array(fn); jy = new Float32Array(fn);
    var r = rng(9);
    for (var i = 0; i < fn; i++) { var a = r() * 6.283, m = Math.sqrt(r()); jx[i] = Math.cos(a) * m; jy[i] = Math.sin(a) * m; }
    ox = new Float32Array(gn); oy = new Float32Array(gn); phase = new Float32Array(gn);
    for (i = 0; i < gn; i++) { a = r() * 6.283; m = 40 + r() * 220; ox[i] = Math.cos(a) * m; oy[i] = Math.sin(a) * m; phase[i] = r(); }
    recall = [];
    measure();
  }

  /* --- where the text is ------------------------------------------------------
     Everything a reader reads, measured in viewport space and stamped onto the
     fine lattice: 1 under the text and a thin margin round it, 0.85 a little
     further out, which closes the gaps between paragraphs, so the field only
     moves in space that is really empty. */
  var TEXT = 'main p, main h1, main h2, main h3, main li, main figure, main pre, main table, main img, ' +
             'main .pub-card, main .entry, main .tag, main summary, ' +
             '.sidebar p, .sidebar h1, .sidebar a, .sidebar img, .site-footer p, .site-footer a, .stamp';
  var textEls = [];
  function collect() { textEls = [].slice.call(document.querySelectorAll(TEXT)); }
  function stamp(l, t, rgt, b, v) {
    var x0 = Math.max(0, Math.floor(l / FINE)), x1 = Math.min(fc - 1, Math.ceil(rgt / FINE));
    var y0 = Math.max(0, Math.floor(t / FINE)), y1 = Math.min(fr - 1, Math.ceil(b / FINE));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var k = y * fc + x; if (quiet[k] < v) quiet[k] = v;
    }
  }
  function measure() {
    if (!quiet) return;
    quiet.fill(0);
    for (var i = 0; i < textEls.length; i++) {
      var r = textEls[i].getBoundingClientRect();
      if (!r.width || r.bottom < -20 || r.top > H + 20) continue;
      stamp(r.left - 18, r.top - 22, r.right + 18, r.bottom + 22, 0.85);
      stamp(r.left - 5, r.top - 4, r.right + 5, r.bottom + 4, 1);
    }
  }
  var measureQueued = false;
  function remeasure() {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(function () { measureQueued = false; measure(); });
  }

  /* --- the water ------------------------------------------------------------ */
  function drop(x, y, amp, radius) {
    var gx = x / FINE, gy = y / FINE, rr = Math.ceil(radius * 2.4), s2 = 2 * radius * radius;
    for (var j = Math.max(1, Math.round(gy) - rr); j <= Math.min(fr - 2, Math.round(gy) + rr); j++) {
      for (var i = Math.max(1, Math.round(gx) - rr); i <= Math.min(fc - 2, Math.round(gx) + rr); i++) {
        var dx = i - gx, dy = j - gy;
        u1[j * fc + i] += amp * Math.exp(-(dx * dx + dy * dy) / s2);
      }
    }
    wake();
  }
  function emptyAt(x, y) {
    var i = Math.round(x / FINE), j = Math.round(y / FINE);
    return i >= 0 && j >= 0 && i < fc && j < fr && quiet[j * fc + i] < 0.1;
  }

  function step() {
    var i, j, k;
    for (j = 1; j < fr - 1; j++) {
      var row = j * fc;
      for (i = 1; i < fc - 1; i++) {
        k = row + i;
        u2[k] = (2 * u1[k] - u0[k] + C2 * (u1[k - 1] + u1[k + 1] + u1[k - fc] + u1[k + fc] - 4 * u1[k])) * DAMP;
      }
    }
    var tmp = u0; u0 = u1; u1 = u2; u2 = tmp;

    var intro = introOn ? Math.min(1, (clock - introT0) / INTRO_MS) : 1;
    if (introOn && intro >= 1) introOn = false;
    ptrK += ((ptr ? 1 : 0) - ptrK) * 0.12;
    var R2 = REACH * REACH, motion = 0;
    for (j = 0; j < fr; j++) {
      for (i = 0; i < fc; i++) {
        k = j * fc + i;
        var slope = 0, h = u1[k];
        if (i > 0 && j > 0 && i < fc - 1 && j < fr - 1) slope = Math.abs(u1[k + 1] - u1[k - 1]) + Math.abs(u1[k + fc] - u1[k - fc]);
        var target = Math.min(1, slope * 1.4 + Math.abs(h) * 0.35);
        if (ptr && ptrK > 0.01) {
          var dx = i * FINE - ptr.x, dy = j * FINE - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) { var f = 1 - Math.sqrt(d2) / REACH; target = Math.max(target, f * f * ptrK); }
        }
        var before = lit[k];
        lit[k] = target > before ? before + (target - before) * 0.45 : before * 0.9;
        if (lit[k] < 0.003) lit[k] = 0;
        var m = mem[k] * MEM_KEEP, keep = lit[k] * 0.55;
        mem[k] = m > keep ? m : keep;
        if (mem[k] < 0.004) mem[k] = 0;
        var change = Math.abs(lit[k] - before) * 30 + Math.abs(h) * 4;
        if (change > motion) motion = change;
      }
    }
    // the recall lines: reaching from a resting pointer to the brightest traces
    var want = ptr && clock - lastMove > 650 && emptyAt(ptr.x, ptr.y) ? 1 : 0;
    if (want && !recall.length) findRecall();
    if (!want && recallK < 0.02) recall = [];
    recallK += (want - recallK) * (want ? 0.06 : 0.12);
    for (var q = 0; q < recall.length; q++) {
      var n = recall[q];
      lit[n] = Math.max(lit[n], recallK * 0.9);
      mem[n] = Math.max(mem[n], recallK * 0.4);
    }
    return motion + (introOn ? 1 : 0) + (recall.length ? 1 : 0);
  }

  // A recall line is drawn only if its whole curve stays in empty space.
  function clearPath(x0, y0, x1, y1) {
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.18;
    for (var s = 1; s < 12; s++) {
      var t = s / 12, v = 1 - t;
      if (!emptyAt(v * v * x0 + 2 * v * t * mx + t * t * x1, v * v * y0 + 2 * v * t * my + t * t * y1)) return false;
    }
    return true;
  }
  function findRecall() {
    var best = [], i, j, k;
    for (j = 1; j < fr - 1; j += 2) for (i = 1; i < fc - 1; i += 2) {
      k = j * fc + i;
      if (mem[k] < 0.08 || quiet[k] > 0.1) continue;
      var dx = i * FINE - ptr.x, dy = j * FINE - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < 90 * 90 || d2 > 340 * 340 || !clearPath(ptr.x, ptr.y, i * FINE, j * FINE)) continue;
      best.push([mem[k], k]);
    }
    best.sort(function (a, b) { return b[0] - a[0]; });
    var picked = [];
    for (var q = 0; q < best.length && picked.length < 6; q++) {
      var kk = best[q][1], xi = (kk % fc) * FINE, yi = Math.floor(kk / fc) * FINE, ok = true;
      for (var p = 0; p < picked.length; p++) {
        var px = (picked[p] % fc) * FINE, py = Math.floor(picked[p] / fc) * FINE;
        if ((px - xi) * (px - xi) + (py - yi) * (py - yi) < 70 * 70) { ok = false; break; }
      }
      if (ok) picked.push(kk);
    }
    recall = picked;
  }

  /* --- drawing ---------------------------------------------------------------- */
  var B = 6, dotB = [], lineB = [], bloom = [], vis = null;
  for (var bq = 0; bq < B; bq++) { dotB.push([]); lineB.push([]); }

  function posX(k) {
    var i = k % fc, h = (i > 0 && i < fc - 1) ? u1[k + 1] - u1[k - 1] : 0;
    var x = i * FINE + h * 9 + jx[k] * lit[k] * 4;
    if (ptr && ptrK > 0.01) { var dx = x - ptr.x, dy = Math.floor(k / fc) * FINE - ptr.y, d = Math.sqrt(dx * dx + dy * dy); if (d < REACH && d > 0.5) x += dx / d * (1 - d / REACH) * (1 - d / REACH) * 9 * ptrK; }
    return x;
  }
  function posY(k) {
    var j = Math.floor(k / fc), h = (j > 0 && j < fr - 1) ? u1[k + fc] - u1[k - fc] : 0;
    var y = j * FINE + h * 9 + jy[k] * lit[k] * 4;
    if (ptr && ptrK > 0.01) { var dx = (k % fc) * FINE - ptr.x, dy = y - ptr.y, d = Math.sqrt(dx * dx + dy * dy); if (d < REACH && d > 0.5) y += dy / d * (1 - d / REACH) * (1 - d / REACH) * 9 * ptrK; }
    return y;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var i, j, k, b;
    var intro = introOn ? Math.min(1, (clock - introT0) / INTRO_MS) : 1;

    // the resting grid, row by row so each row takes the fade's alpha. During
    // the opening it is drawn twice: plain, then lit, while the dots fly home.
    var introLit = introOn ? (intro < 0.5 ? 1 : Math.pow(1 - (intro - 0.5) / 0.5, 1.4)) : 0;
    for (var pass = 0; pass < (introLit > 0.01 ? 2 : 1); pass++) {
    ctx.globalCompositeOperation = pass && C.add ? 'lighter' : 'source-over';
    ctx.fillStyle = pass ? C.lit : C.dot;
    for (j = 0; j < gr; j++) {
      var y0 = GAP / 2 + j * GAP, a = Math.max(0, 1 - y0 / (VH * FADE));
      if (a <= 0 && !(pass && y0 < VH)) break;
      ctx.globalAlpha = pass ? Math.min(1, (0.25 + a) * introLit * C.alpha) : a * 0.85;
      ctx.beginPath();
      for (i = 0; i < gc; i++) {
        var x0 = GAP / 2 + i * GAP, fk = (j * 2 + 1) * fc + (i * 2 + 1);
        if (fk < fn && lit[fk] * (1 - quiet[fk]) > 0.12) continue;     // drawn lit, below
        var gi = j * gc + i, x = x0, y = y0;
        if (pass && quiet[Math.min(fn - 1, fk)] > 0.5) continue;      // the lit opening skips text too
        if (introOn) {
          var t = Math.max(0, Math.min(1, (intro - phase[gi] * 0.35) / 0.65)); t = 1 - Math.pow(1 - t, 3);
          x += ox[gi] * (1 - t); y += oy[gi] * (1 - t);
        }
        if (pass) ctx.rect(x - 1.3, y - 1.3, 2.6, 2.6); else ctx.rect(x - 1, y - 1, 2, 2);
      }
      ctx.fill();
    }
    }

    // the live grains: lit by the water, the pointer and memory, never under text
    for (b = 0; b < B; b++) { dotB[b].length = 0; lineB[b].length = 0; }
    bloom.length = 0;
    if (!vis || vis.length !== fn) vis = new Float32Array(fn);
    for (k = 0; k < fn; k++) {
      vis[k] = 0;
      var v = Math.max(lit[k], mem[k] * 0.55);
      if (v < 0.03) continue;
      var y1 = Math.floor(k / fc) * FINE;
      v *= (1 - quiet[k]) * (1 - 0.6 * Math.max(0, Math.min(1, (y1 - VH * 0.55) / (VH * 0.45))));
      if (v < 0.03) continue;
      vis[k] = v;
      dotB[Math.min(B - 1, (v * B) | 0)].push(k);
      if (v > 0.55) bloom.push(k);
    }
    for (k = 0; k < fn; k++) {                          // links between lit neighbours
      if (vis[k] < 0.22) continue;
      var ii = k % fc;
      var nb = [ii < fc - 1 ? k + 1 : -1, k + fc, ii < fc - 1 ? k + fc + 1 : -1, ii > 0 ? k + fc - 1 : -1];
      for (var q = 0; q < 4; q++) {
        var n = nb[q];
        if (n < 0 || n >= fn || vis[n] < 0.22) continue;
        lineB[Math.min(B - 1, (Math.min(vis[k], vis[n]) * B) | 0)].push(k, n);
      }
    }
    ctx.globalCompositeOperation = C.add ? 'lighter' : 'source-over';
    if (C.add && bloom.length) {
      ctx.fillStyle = C.lit; ctx.globalAlpha = 0.07; ctx.beginPath();
      for (q = 0; q < bloom.length; q++) { k = bloom[q]; var bx = posX(k), by = posY(k); ctx.moveTo(bx + 5, by); ctx.arc(bx, by, 5, 0, 6.283); }
      ctx.fill();
    }
    ctx.strokeStyle = C.lit; ctx.lineWidth = 0.6;
    for (b = 0; b < B; b++) {
      var seg = lineB[b]; if (!seg.length) continue;
      ctx.globalAlpha = (b + 0.5) / B * C.alpha * 0.45;
      ctx.beginPath();
      for (q = 0; q < seg.length; q += 2) { ctx.moveTo(posX(seg[q]), posY(seg[q])); ctx.lineTo(posX(seg[q + 1]), posY(seg[q + 1])); }
      ctx.stroke();
    }
    for (b = 0; b < B; b++) {
      var set = dotB[b]; if (!set.length) continue;
      var level = (b + 0.5) / B, s = 0.9 + level * 1.6;
      ctx.fillStyle = level > 0.75 ? C.hot : C.lit;
      ctx.globalAlpha = Math.min(1, level * C.alpha * 1.15);
      ctx.beginPath();
      for (q = 0; q < set.length; q++) { k = set[q]; ctx.rect(posX(k) - s / 2, posY(k) - s / 2, s, s); }
      ctx.fill();
    }

    // recall: thin lines from the resting pointer back to old traces
    if (recall.length && ptr && recallK > 0.02) {
      ctx.strokeStyle = C.lit; ctx.lineWidth = 0.8;
      for (q = 0; q < recall.length; q++) {
        k = recall[q];
        var tx = posX(k), ty = posY(k), mx = (ptr.x + tx) / 2, my = (ptr.y + ty) / 2 - Math.abs(tx - ptr.x) * 0.18;
        var reach = Math.min(1, recallK * 1.3);
        ctx.globalAlpha = 0.5 * recallK * C.alpha;
        ctx.beginPath(); ctx.moveTo(ptr.x, ptr.y);
        // drawn out from the pointer as recallK rises
        var steps = 18;
        for (var sI = 1; sI <= Math.round(steps * reach); sI++) {
          var tt = sI / steps, inv = 1 - tt;
          ctx.lineTo(inv * inv * ptr.x + 2 * inv * tt * mx + tt * tt * tx, inv * inv * ptr.y + 2 * inv * tt * my + tt * tt * ty);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, recallK) * C.alpha; ctx.fillStyle = C.hot;
      ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 2.2, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* --- the loop: it stops when nothing moves ----------------------------------- */
  function frame(now) {
    if (!last) last = now;
    acc += Math.min(now - last, 100); last = now; clock = now;
    var motion = 0, steps = 0;
    while (acc >= STEP && steps < 3) { motion = Math.max(motion, step()); acc -= STEP; steps++; }
    if (!steps) motion = 1;
    draw();
    if (motion > 0.02) requestAnimationFrame(frame);
    else { running = false; last = 0; acc = 0; }
  }
  function wake() {
    if (running || document.hidden) return;
    running = true; requestAnimationFrame(frame);
  }

  /* --- input -------------------------------------------------------------------- */
  var prev = null;
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;      // a moving finger is a scroll
    var p = { x: e.clientX, y: e.clientY };
    if (prev) {
      var d = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (d > 2) drop(p.x, p.y, -Math.min(0.55, d * 0.012), 1.1);
    }
    prev = p; ptr = p; lastMove = clock || performance.now();
    recall = [];
    wake();
  }, { passive: true });
  function leave() { ptr = null; prev = null; wake(); }
  document.documentElement.addEventListener('mouseleave', leave);
  window.addEventListener('blur', leave);
  window.addEventListener('click', function (e) {
    if (e.detail === 0) return;                 // keyboard activation
    drop(e.clientX, e.clientY, -2.6, 1.6);
  }, { passive: true });

  // a drop now and then, in the empty space of the first screen
  (function rain() {
    setTimeout(function () {
      if (!document.hidden && window.scrollY < VH * 0.8) {
        for (var t = 0; t < 14; t++) {
          var x = Math.random() * W, y = 70 + Math.random() * VH * 0.62;
          if (emptyAt(x, y)) { drop(x, y, -(0.7 + Math.random() * 0.9), 1); break; }
        }
      }
      rain();
    }, 1100 + Math.random() * 1700);
  })();

  window.addEventListener('scroll', function () { remeasure(); }, { passive: true });
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth === W && window.innerHeight <= H) { VH = window.innerHeight; measure(); if (!running) draw(); return; }
      build(); draw();
    }, 150);
  });
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; acc = 0; wake(); } });

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  if (scheme.addEventListener) scheme.addEventListener('change', function () { readColors(); if (!running) draw(); });
  if (reduce.addEventListener) reduce.addEventListener('change', function () {
    if (!reduce.matches) return;
    running = false; canvas.remove(); backdrop.classList.remove('is-live');
  });

  /* --- go -------------------------------------------------------------------------- */
  readColors();
  collect();
  build();
  // Fonts and lazy images change where the text is once they arrive.
  window.addEventListener('load', function () { collect(); measure(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); });

  var first = false;
  try {
    if (!sessionStorage.getItem('lz-field')) { sessionStorage.setItem('lz-field', '1'); first = true; }
  } catch (e) { /* no storage: no opening, rather than one on every page */ }
  clock = performance.now();
  if (first) { introOn = true; introT0 = clock; }
  draw();
  wake();
  // the opening ends on a stone dropped into the largest empty space in view
  setTimeout(function () {
    var best = null;
    for (var t = 0; t < 40; t++) {
      var x = W * (0.45 + Math.random() * 0.5), y = VH * (0.12 + Math.random() * 0.45);
      if (emptyAt(x, y) && emptyAt(x - 60, y) && emptyAt(x + 60, y) && emptyAt(x, y - 50) && emptyAt(x, y + 50)) { best = [x, y]; break; }
    }
    if (best) drop(best[0], best[1], -3.2, 1.8);
  }, first ? INTRO_MS * 0.75 : 600);
})();
