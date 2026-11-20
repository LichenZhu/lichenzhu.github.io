/* The live lattice behind the page.

   The 24px dot grid that has always sat behind the site, drawn on a canvas and
   made to respond, with a finer lattice of grains under it that only shows
   where something is happening.

     ripples   a damped wave equation runs on the fine lattice. Moving the
               mouse drags a wake through it, a click drops a stone, and soon
               after arrival a few single drops fall by themselves. The whole
               lattice rides the waves, and grains light on the moving slopes,
               so a ripple reads as a ring of light that spreads, crosses
               others and leaves the window at its edges (they absorb; they do
               not reflect).
     cursor    grains round the pointer light, lean away and link into a mesh.
               The glow is strong while the pointer moves and settles to a
               faint one when it stops, so nothing pulses while you read.
     trails    lit grains leave a faint afterglow that fades in a second or two.
     opening   on the first page of a visit the dots start scattered and fly
               home into the grid.

   It answers the same everywhere, and then defers to the text. Round a
   moving pointer the field is at full strength wherever the pointer is. Away
   from it, and once the pointer rests, every paragraph, heading and list item
   keeps the field under it (with a feathered edge) at 40%, with no mesh and
   no glow: a ripple dims as it passes under a paragraph and comes back on the
   other side, never cut off, and nothing bright sits behind what you are
   reading. Cards and pictures are opaque, so they need nothing.

   Canvas 2D, no libraries, no shaders. It stops asking for frames as soon as
   nothing visible is changing, about 2.5 s after the mouse stops. With reduced motion, or without JavaScript, there is no
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
     12px and passes through the same points, so every coarse dot is a fine
     node and the two always move together. */
  var GAP = 24, FINE = 12, FADE = 0.62;
  var C2 = 0.24, DAMP = 0.986;            // wave speed squared, damping per step
  var EDGE = 8;                           // nodes of absorbing shore round the edge
  var REACH = 150;                        // cursor glow radius, px
  var SOFT = 0.4;                         // how much of the field shows under text
  var REST = 0.32;                        // the cursor glow once the pointer stops
  var STEP = 1000 / 60;
  var TRAIL_KEEP = Math.pow(0.5, 1 / (60 * 0.9));   // afterglow halves every 0.9 s
  var ENERGY_KEEP = Math.pow(0.5, 1 / (60 * 0.4));  // the moving glow halves every 0.4 s

  var W = 0, H = 0, VH = 0, dpr = 1;
  var gc = 0, gr = 0, gn = 0;             // coarse grid
  var fc = 0, fr = 0, fn = 0;             // fine lattice
  var u0, u1, u2, damp, lit, mem, vis, shade, seff, raw, tmp, jx, jy, ox, oy, phase;
  var C = {};
  var ptr = null, energy = 0, lastInput = 0;
  var running = false, last = 0, acc = 0, clock = 0;
  var introOn = false, introT0 = 0, INTRO_MS = 2400;

  function now() { return performance.now(); }

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
    fc = 2 * gc + 1; fr = 2 * gr + 1; fn = fc * fr;   // fine node (2i+1, 2j+1) is coarse dot (i, j)
    u0 = new Float32Array(fn); u1 = new Float32Array(fn); u2 = new Float32Array(fn);
    // A page has no walls: near the edges of the viewport the water absorbs
    // instead of reflecting, so a ring that reaches the side of the window
    // leaves it rather than bouncing back. The bottom edge is the viewport's,
    // not the canvas's, which runs on below it.
    shore();
    lit = new Float32Array(fn); mem = new Float32Array(fn); vis = new Float32Array(fn);
    shade = new Float32Array(fn).fill(1); seff = new Float32Array(fn).fill(1);
    raw = new Float32Array(fn); tmp = new Float32Array(fn);
    jx = new Float32Array(fn); jy = new Float32Array(fn);
    var r = rng(9), i, a, m;
    for (i = 0; i < fn; i++) { a = r() * 6.283; m = Math.sqrt(r()); jx[i] = Math.cos(a) * m; jy[i] = Math.sin(a) * m; }
    ox = new Float32Array(gn); oy = new Float32Array(gn); phase = new Float32Array(gn);
    for (i = 0; i < gn; i++) { a = r() * 6.283; m = 40 + r() * 220; ox[i] = Math.cos(a) * m; oy[i] = Math.sin(a) * m; phase[i] = r(); }
    measure();
  }

  function shore() {
    if (!damp || damp.length !== fn) damp = new Float32Array(fn);
    var vr = Math.min(fr - 1, Math.round(VH / FINE));
    for (var dj = 0; dj < fr; dj++) for (var di = 0; di < fc; di++) {
      var e = Math.min(di, fc - 1 - di, dj, Math.max(0, vr - dj)), w = Math.min(1, e / EDGE);
      damp[dj * fc + di] = DAMP * (0.86 + 0.14 * w * w * (3 - 2 * w));
    }
  }

  /* --- where the text is -----------------------------------------------------
     Text-bearing elements, measured in viewport space and stamped onto the
     fine lattice, then feathered with a box blur so the field fades in and out
     round them over about 24px instead of stopping at a hard edge. Anything
     inside a publication card is skipped: the card is opaque already. */
  var TEXT = 'main p, main h1, main h2, main h3, main li, main figcaption, main pre, main table, ' +
             'main summary, main .tag, main .section-link, .sidebar p, .sidebar h1, .sidebar-links a, ' +
             '.site-footer p, .site-footer a, .stamp';
  var textEls = [];
  function collect() {
    textEls = [].filter.call(document.querySelectorAll(TEXT), function (el) { return !el.closest('.pub-card'); });
  }
  function stamp(l, t, rr, b) {
    var x0 = Math.max(0, Math.floor(l / FINE)), x1 = Math.min(fc - 1, Math.ceil(rr / FINE));
    var y0 = Math.max(0, Math.floor(t / FINE)), y1 = Math.min(fr - 1, Math.ceil(b / FINE));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) raw[y * fc + x] = 1;
  }
  function blur(src, dst, horizontal) {
    var R = 2, n = 2 * R + 1, i, j, k, s;
    if (horizontal) {
      for (j = 0; j < fr; j++) for (i = 0; i < fc; i++) {
        s = 0; for (k = -R; k <= R; k++) s += src[j * fc + Math.min(fc - 1, Math.max(0, i + k))];
        dst[j * fc + i] = s / n;
      }
    } else {
      for (j = 0; j < fr; j++) for (i = 0; i < fc; i++) {
        s = 0; for (k = -R; k <= R; k++) s += src[Math.min(fr - 1, Math.max(0, j + k)) * fc + i];
        dst[j * fc + i] = s / n;
      }
    }
  }
  function measure() {
    if (!raw) return;
    raw.fill(0);
    for (var i = 0; i < textEls.length; i++) {
      var r = textEls[i].getBoundingClientRect();
      if (!r.width || r.bottom < -30 || r.top > H + 30) continue;
      stamp(r.left - 6, r.top - 4, r.right + 6, r.bottom + 4);
    }
    blur(raw, tmp, true); blur(tmp, raw, false);
    for (var k = 0; k < fn; k++) shade[k] = 1 - (1 - SOFT) * Math.min(1, raw[k] * 1.25);
  }
  var measureQueued = false;
  function remeasure() {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(function () { measureQueued = false; measure(); wake(); });
  }
  function emptyAt(x, y) {
    var i = Math.round(x / FINE), j = Math.round(y / FINE);
    return i >= 0 && j >= 0 && i < fc && j < fr && shade[j * fc + i] > 0.97;
  }

  /* --- the water ---------------------------------------------------------- */
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

  function step() {
    var i, j, k;
    for (j = 1; j < fr - 1; j++) {
      var row = j * fc;
      for (i = 1; i < fc - 1; i++) {
        k = row + i;
        u2[k] = (2 * u1[k] - u0[k] + C2 * (u1[k - 1] + u1[k + 1] + u1[k - fc] + u1[k + fc] - 4 * u1[k])) * damp[k];
      }
    }
    var t = u0; u0 = u1; u1 = u2; u2 = t;

    if (introOn && clock - introT0 >= INTRO_MS) introOn = false;
    energy *= ENERGY_KEEP;
    if (energy < 0.04) energy = 0;          // the last of the settling is invisible
    var glow = ptr ? REST + (1 - REST) * Math.min(1, energy) : 0;
    var R2 = REACH * REACH, change = 0, maxS = 0, fading = false;
    for (j = 0; j < fr; j++) {
      for (i = 0; i < fc; i++) {
        k = j * fc + i;
        var h = u1[k], ah = h < 0 ? -h : h, slope = 0;
        if (i > 0 && j > 0 && i < fc - 1 && j < fr - 1) {
          var sx = u1[k + 1] - u1[k - 1], sy = u1[k + fc] - u1[k - fc];
          slope = (sx < 0 ? -sx : sx) + (sy < 0 ? -sy : sy);
        }
        var target = slope * 1.4 + ah * 0.35;
        if (glow > 0) {
          var dx = i * FINE - ptr.x, dy = j * FINE - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) { var f = 1 - Math.sqrt(d2) / REACH; f = f * f * glow; if (f > target) target = f; }
        }
        if (target > 1) target = 1;
        var before = lit[k];
        lit[k] = target > before ? before + (target - before) * 0.45 : before * 0.9 + target * 0.1;
        if (lit[k] < 0.003) lit[k] = 0;
        var keep = mem[k] * TRAIL_KEEP, fresh = lit[k] * 0.5;
        mem[k] = keep > fresh ? keep : fresh;
        if (mem[k] < 0.03) mem[k] = 0;                  // below this it draws nothing
        else if (keep > fresh + 0.004) fading = true;
        // only changes that can be seen: a grain draws nothing below 0.03
        var dl = lit[k] - before; if (dl < 0) dl = -dl;
        if (dl > change && (lit[k] > 0.03 || before > 0.03)) change = dl;
        if (slope > maxS) maxS = slope;
      }
    }
    // Stop on what can be seen. A wave is seen through its slopes: below 0.02
    // it lights no grain and moves no dot by a fifth of a pixel. (A 2-D wave
    // leaves a flat tail at its centre that takes many seconds to drain away;
    // it is invisible, and waiting for it kept the loop busy for ten.)
    return change > 0.0025 || maxS > 0.02 || fading || introOn || energy > 0;
  }

  /* --- drawing --------------------------------------------------------------- */
  var B = 6, dotB = [], lineB = [], bloom = [];
  for (var bq = 0; bq < B; bq++) { dotB.push([]); lineB.push([]); }
  var PX = null, PY = null;

  /* How much of the field shows at each node this frame. Under text that is
     40%, except round a pointer that is moving: there it is full strength
     wherever it is, so the field answers the same over a paragraph as over
     empty space. Nobody reads while moving the mouse; once it rests, the
     text's 40% comes back within half a second. */
  function effective() {
    seff.set(shade);
    var e = Math.min(1, energy);
    if (!ptr || e <= 0) return;
    var RB = REACH * 1.35, i0 = Math.max(0, Math.floor((ptr.x - RB) / FINE)), i1 = Math.min(fc - 1, Math.ceil((ptr.x + RB) / FINE));
    var j0 = Math.max(0, Math.floor((ptr.y - RB) / FINE)), j1 = Math.min(fr - 1, Math.ceil((ptr.y + RB) / FINE));
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      var dx = i * FINE - ptr.x, dy = j * FINE - ptr.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= RB) continue;
      var k = j * fc + i, f = 1 - d / RB;
      seff[k] = shade[k] + (1 - shade[k]) * e * f * (2 - f);
    }
  }

  // Every node's place this frame: on its grid point, moved by the slope of
  // the water, by the pointer, and (when lit) a little off the grid.
  function place() {
    if (!PX || PX.length !== fn) { PX = new Float32Array(fn); PY = new Float32Array(fn); }
    var glow = ptr ? REST + (1 - REST) * Math.min(1, energy) : 0;
    for (var j = 0; j < fr; j++) {
      for (var i = 0; i < fc; i++) {
        var k = j * fc + i, s = seff[k];
        var x = i * FINE, y = j * FINE;
        if (i > 0 && i < fc - 1) x += (u1[k + 1] - u1[k - 1]) * 9 * s;
        if (j > 0 && j < fr - 1) y += (u1[k + fc] - u1[k - fc]) * 9 * s;
        x += jx[k] * lit[k] * 4 * s; y += jy[k] * lit[k] * 4 * s;
        if (glow > 0) {
          var dx = i * FINE - ptr.x, dy = j * FINE - ptr.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < REACH && d > 0.5) { var f = 1 - d / REACH, push = f * f * 9 * glow * s / d; x += dx * push; y += dy * push; }
        }
        PX[k] = x; PY[k] = y;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    effective();
    place();
    var i, j, k, b, q;
    var intro = introOn ? Math.min(1, (clock - introT0) / INTRO_MS) : 1;

    for (k = 0; k < fn; k++) {
      var v = lit[k] > mem[k] ? lit[k] : mem[k];
      vis[k] = v * seff[k];
    }

    // The resting grid, row by row so each row takes the fade's alpha. It
    // rides the waves like everything else; a dot that is lit is drawn lit,
    // below, instead. During the opening it is drawn twice: plain, then lit,
    // while the dots fly home.
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
          k = (2 * j + 1) * fc + (2 * i + 1);
          if (!pass && vis[k] > 0.12) continue;
          if (pass && seff[k] < 0.7) continue;          // the lit opening keeps off the text too
          var x = PX[k], y = PY[k];
          if (introOn) {
            var gi = j * gc + i, tt = Math.max(0, Math.min(1, (intro - phase[gi] * 0.35) / 0.65));
            tt = 1 - Math.pow(1 - tt, 3);
            x += ox[gi] * (1 - tt); y += oy[gi] * (1 - tt);
          }
          if (pass) { var s = 2.6 * (0.6 + 0.4 * seff[k]); ctx.rect(x - s / 2, y - s / 2, s, s); }
          else ctx.rect(x - 1, y - 1, 2, 2);
        }
        ctx.fill();
      }
    }

    // the lit grains, the mesh between them, and their glow
    for (b = 0; b < B; b++) { dotB[b].length = 0; lineB[b].length = 0; }
    bloom.length = 0;
    for (k = 0; k < fn; k++) {
      if (vis[k] < 0.03) continue;
      dotB[Math.min(B - 1, (vis[k] * B) | 0)].push(k);
      if (vis[k] > 0.55 && seff[k] > 0.8) bloom.push(k);
    }
    for (k = 0; k < fn; k++) {                    // the mesh only in open space
      if (vis[k] < 0.22 || seff[k] < 0.75) continue;
      var ii = k % fc;
      var n0 = ii < fc - 1 ? k + 1 : -1, n1 = k + fc, n2 = ii < fc - 1 ? k + fc + 1 : -1, n3 = ii > 0 ? k + fc - 1 : -1;
      var nbs = [n0, n1, n2, n3];
      for (q = 0; q < 4; q++) {
        var n = nbs[q];
        if (n < 0 || n >= fn || vis[n] < 0.22 || seff[n] < 0.75) continue;
        lineB[Math.min(B - 1, ((vis[k] < vis[n] ? vis[k] : vis[n]) * B) | 0)].push(k, n);
      }
    }
    ctx.globalCompositeOperation = C.add ? 'lighter' : 'source-over';
    if (C.add && bloom.length) {
      ctx.fillStyle = C.lit; ctx.globalAlpha = 0.07; ctx.beginPath();
      for (q = 0; q < bloom.length; q++) { k = bloom[q]; ctx.moveTo(PX[k] + 5, PY[k]); ctx.arc(PX[k], PY[k], 5, 0, 6.283); }
      ctx.fill();
    }
    ctx.strokeStyle = C.lit; ctx.lineWidth = 0.6;
    for (b = 0; b < B; b++) {
      var seg = lineB[b]; if (!seg.length) continue;
      ctx.globalAlpha = (b + 0.5) / B * C.alpha * 0.45;
      ctx.beginPath();
      for (q = 0; q < seg.length; q += 2) { ctx.moveTo(PX[seg[q]], PY[seg[q]]); ctx.lineTo(PX[seg[q + 1]], PY[seg[q + 1]]); }
      ctx.stroke();
    }
    for (b = 0; b < B; b++) {
      var set = dotB[b]; if (!set.length) continue;
      var level = (b + 0.5) / B, sz = 0.9 + level * 1.6;
      // the brightest colour only where it is a crest, never under text
      for (var hot = 0; hot < 2; hot++) {
        ctx.fillStyle = hot ? C.hot : C.lit;
        ctx.globalAlpha = Math.min(1, level * C.alpha * 1.15);
        ctx.beginPath();
        var any = false;
        for (q = 0; q < set.length; q++) {
          k = set[q];
          var isHot = level > 0.75 && seff[k] > 0.8;
          if (isHot !== !!hot) continue;
          ctx.rect(PX[k] - sz / 2, PY[k] - sz / 2, sz, sz); any = true;
        }
        if (any) ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* --- the loop: it stops when nothing moves ------------------------------------ */
  function frame(t) {
    if (!last) last = t;
    acc += Math.min(t - last, 100); last = t; clock = t;
    var moving = false, steps = 0;
    while (acc >= STEP && steps < 3) { if (step()) moving = true; acc -= STEP; steps++; }
    if (!steps) moving = true;
    draw();
    if (moving) requestAnimationFrame(frame);
    else {
      // at rest: clear the invisible tail, so the next ripple starts on still water
      running = false; last = 0; acc = 0;
      u0.fill(0); u1.fill(0); u2.fill(0);
    }
  }
  function wake() {
    if (running || document.hidden) return;
    running = true; requestAnimationFrame(frame);
  }

  /* --- input ------------------------------------------------------------------- */
  var prev = null;
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;      // a moving finger is a scroll
    var p = { x: e.clientX, y: e.clientY };
    // A drag with a button held is usually a text selection: no glow and no
    // wake behind the words being selected.
    if (prev && !e.buttons) {
      var d = Math.sqrt((p.x - prev.x) * (p.x - prev.x) + (p.y - prev.y) * (p.y - prev.y));
      energy = Math.min(1.2, energy + d / 90);
      if (d > 2) drop(p.x, p.y, -Math.min(0.5, d * 0.011), 1.1);
    }
    prev = p; ptr = p; lastInput = now();
    wake();
  }, { passive: true });
  function leave() { ptr = null; prev = null; wake(); }
  document.documentElement.addEventListener('mouseleave', leave);
  window.addEventListener('blur', leave);
  window.addEventListener('click', function (e) {
    if (e.detail === 0) return;                 // keyboard activation
    lastInput = now();
    drop(e.clientX, e.clientY, -2.6, 1.6);
  }, { passive: true });

  // Soon after arrival, while nobody is touching the page, a few single drops
  // fall in empty parts of the first screen: an invitation to try it. At most
  // four, all in the first minute, so the page is calm by the time anyone is
  // reading it.
  var drops = 0, born = now();
  (function idle() {
    setTimeout(function () {
      if (!document.hidden && window.scrollY < VH * 0.8 && now() - lastInput > 3000 && !introOn) {
        for (var t = 0; t < 20; t++) {
          var x = Math.random() * W, y = 80 + Math.random() * VH * 0.6;
          if (emptyAt(x, y)) { drop(x, y, -1.5, 1.2); drops++; break; }
        }
      }
      if (drops < 4 && now() - born < 60000) idle();
    }, 5000 + Math.random() * 6000);
  })();

  window.addEventListener('scroll', remeasure, { passive: true });
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth === W && window.innerHeight <= H) { VH = window.innerHeight; shore(); measure(); wake(); return; }
      build(); wake();
    }, 150);
  });
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; acc = 0; wake(); } });

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  if (scheme.addEventListener) scheme.addEventListener('change', function () { readColors(); wake(); });
  if (reduce.addEventListener) reduce.addEventListener('change', function () {
    if (!reduce.matches) return;
    running = false; canvas.remove(); backdrop.classList.remove('is-live');
  });

  /* --- go ------------------------------------------------------------------------- */
  readColors();
  collect();
  build();
  // Fonts and lazy images move the text once they arrive.
  window.addEventListener('load', function () { collect(); remeasure(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  var first = false;
  try {
    if (!sessionStorage.getItem('lz-field')) { sessionStorage.setItem('lz-field', '1'); first = true; }
  } catch (e) { /* no storage: no opening, rather than one on every page */ }
  clock = now();
  if (first) { introOn = true; introT0 = clock; }
  draw();
  wake();
  // the opening ends on a stone dropped into the largest empty space in view
  if (first) setTimeout(function () {
    for (var t = 0; t < 40; t++) {
      var x = W * (0.45 + Math.random() * 0.5), y = VH * (0.12 + Math.random() * 0.45);
      if (emptyAt(x, y) && emptyAt(x - 60, y) && emptyAt(x + 60, y) && emptyAt(x, y - 50) && emptyAt(x, y + 50)) { drop(x, y, -3.2, 1.8); break; }
    }
  }, INTRO_MS * 0.75);
})();
