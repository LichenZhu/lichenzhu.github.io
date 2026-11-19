/* The backdrop lattice, alive.

   The site has always had a 24px dot grid fixed behind the page, fading out
   down the first screen. This draws that same grid on a canvas and gives it
   three behaviours:

     1. Opening. On the first page of a visit the dots start scattered and
        pull themselves into the lattice, linking to neighbours as they arrive:
        a network organising itself. Once per session, not on every page, so
        moving between pages stays calm.
     2. Cursor. Dots near the pointer light up in the accent, lean away from
        it, and join into a small mesh. Below the fade the resting grid is
        invisible, so the cursor reveals a lattice that was there all along.
     3. Pulse. A click or tap sends a ring out through the grid. A fainter one
        goes out by itself every so often, so a phone sees it move too.

   Progressive enhancement throughout. Without JavaScript, or with reduced
   motion asked for, nothing here runs and the CSS grid is what you see. The
   loop stops itself whenever nothing is moving, so an idle page costs no CPU.
   Clicks are observed, never intercepted. */
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

  /* Geometry matches the CSS grid exactly: 24px cells, a dot in the middle
     of each, fading out over the top 62% of the viewport. */
  var GAP = 24, FADE = 0.62;
  var REACH = 170;                 // cursor radius, px
  var JITTER = 7;                  // how far a fully lit dot leaves the grid, px
  var LINK = GAP * 1.75;           // longest line drawn between neighbours
  var STEP = 1000 / 60;            // fixed physics step
  var SPRING = 0.045, DAMP = 0.86, PUSH = 0.9;
  var PULSE_SPEED = 0.55, PULSE_BAND = 30;   // px per ms, ring half-width
  var INTRO_MS = 2200;

  var W = 0, H = 0, VH = 0, cols = 0, rows = 0, n = 0, maxR = 0;   // H: canvas, VH: visible
  var hx, hy, px, py, vx, vy, lit, jx, jy;
  var dotColor = '', litColor = '', litAlpha = 0.85;
  var pointer = null, pulses = [];
  var running = false, last = 0, acc = 0;
  var introOn = false, introStart = 0;   // a flag, not a 0 sentinel: 0 is a valid timestamp

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    dotColor = cs.getPropertyValue('--rule').trim();
    litColor = cs.getPropertyValue('--field-lit').trim() || cs.getPropertyValue('--accent').trim();
    litAlpha = parseFloat(cs.getPropertyValue('--field-alpha')) || 0.85;
  }

  function build() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    VH = window.innerHeight;
    // Allocated at the tallest the viewport can get, so a phone's address bar
    // sliding away (which makes the viewport taller) never forces a rebuild.
    H = Math.max(VH, Math.min((window.screen && screen.height) || 0, VH * 1.6));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / GAP);
    rows = Math.ceil(H / GAP);
    n = cols * rows;
    maxR = Math.sqrt(W * W + H * H);
    hx = new Float32Array(n); hy = new Float32Array(n);
    px = new Float32Array(n); py = new Float32Array(n);
    vx = new Float32Array(n); vy = new Float32Array(n);
    lit = new Float32Array(n);
    // A fixed random offset per dot, applied in proportion to how lit it is:
    // a lit patch breaks out of the grid into a constellation and settles
    // back into it as the light fades, without any continuous animation.
    jx = new Float32Array(n); jy = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var ang = Math.random() * Math.PI * 2, mag = Math.sqrt(Math.random());
      jx[k] = Math.cos(ang) * mag; jy[k] = Math.sin(ang) * mag;
    }
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        hx[i] = px[i] = GAP / 2 + c * GAP;
        hy[i] = py[i] = GAP / 2 + r * GAP;
      }
    }
  }

  function scatter() {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var d = 40 + Math.random() * 220;
      px[i] = hx[i] + Math.cos(a) * d;
      py[i] = hy[i] + Math.sin(a) * d;
    }
  }

  function fadeAt(y) { return Math.max(0, 1 - y / (VH * FADE)); }

  /* One physics step. Returns how much is still changing, so the loop can
     tell when the picture has come to rest. */
  function step(now) {
    var R2 = REACH * REACH, motion = 0;
    var intro = introOn ? Math.min(1, (now - introStart) / INTRO_MS) : 1;
    // Light held while the dots travel, released once they have arrived.
    var introLit = !introOn ? 0 : intro < 0.5 ? 1 : Math.pow(1 - (intro - 0.5) / 0.5, 1.4);
    // A soft spring that tightens: slow enough at first to watch them gather.
    var spring = introOn ? SPRING * (0.18 + 0.82 * intro * intro) : SPRING;
    var damp = introOn ? 0.9 : DAMP;
    if (intro >= 1) introOn = false;

    for (var k = pulses.length - 1; k >= 0; k--) {
      var p = pulses[k];
      p.r = (now - p.t0) * PULSE_SPEED;
      p.fade = 1 - p.r / maxR;
      if (p.fade <= 0) pulses.splice(k, 1);
    }

    for (var i = 0; i < n; i++) {
      var fx = (hx[i] - px[i]) * spring;
      var fy = (hy[i] - py[i]) * spring;
      // capped below full so the web never outshouts the text it sits behind
      var target = introLit ? introLit * (0.2 + 0.6 * fadeAt(hy[i])) : 0;

      if (pointer) {
        var dx = px[i] - pointer.x, dy = py[i] - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          var d = Math.sqrt(d2) || 1, f = 1 - d / REACH;
          fx += dx / d * f * f * PUSH;
          fy += dy / d * f * f * PUSH;
          target = Math.max(target, Math.pow(f, 0.85));
        }
      }

      for (var q = 0; q < pulses.length; q++) {
        var pu = pulses[q];
        var ex = hx[i] - pu.x, ey = hy[i] - pu.y, e = Math.sqrt(ex * ex + ey * ey) || 1;
        var off = (e - pu.r) / PULSE_BAND;
        if (off > -3 && off < 3) {
          var band = Math.exp(-off * off) * pu.amp * pu.fade;
          target = Math.max(target, band);
          fx += ex / e * band * 0.25;
          fy += ey / e * band * 0.25;
        }
      }

      vx[i] = (vx[i] + fx) * damp;
      vy[i] = (vy[i] + fy) * damp;
      px[i] += vx[i];
      py[i] += vy[i];

      var before = lit[i];
      lit[i] = target > before ? before + (target - before) * 0.35 : before * 0.94;
      if (lit[i] < 0.004) lit[i] = 0;
      motion = Math.max(motion, Math.abs(vx[i]) + Math.abs(vy[i]), Math.abs(lit[i] - before) * 20);
    }
    return motion + pulses.length + (introOn ? 1 : 0);
  }

  function sx(i) { return px[i] + jx[i] * lit[i] * JITTER; }
  function sy(i) { return py[i] + jy[i] * lit[i] * JITTER; }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var i, r, c, b;

    // The resting lattice, row by row so each row takes the fade's alpha.
    ctx.fillStyle = dotColor;
    for (r = 0; r < rows; r++) {
      var a = fadeAt(hy[r * cols]);
      if (a <= 0) break;
      ctx.globalAlpha = a * 0.85;
      ctx.beginPath();
      for (c = 0; c < cols; c++) {
        i = r * cols + c;
        if (lit[i] > 0.15) continue;          // drawn lit, below, instead
        ctx.rect(px[i] - 1, py[i] - 1, 2, 2);
      }
      ctx.fill();
    }

    // Lit dots and the links between them, bucketed by brightness so a frame
    // is a dozen draw calls rather than a few thousand.
    var BUCKETS = 8, lines = [], dots = [];
    for (b = 0; b < BUCKETS; b++) { lines.push([]); dots.push([]); }
    var L2 = LINK * LINK;
    for (i = 0; i < n; i++) {
      var li = lit[i];
      if (li < 0.05) continue;
      dots[Math.min(BUCKETS - 1, (li * BUCKETS) | 0)].push(i);
      c = i % cols;
      var nb = [c < cols - 1 ? i + 1 : -1, i + cols, c < cols - 1 ? i + cols + 1 : -1, c > 0 ? i + cols - 1 : -1];
      for (var k = 0; k < 4; k++) {
        var j = nb[k];
        if (j < 0 || j >= n || lit[j] < 0.05) continue;
        var dx = sx(j) - sx(i), dy = sy(j) - sy(i);
        if (dx * dx + dy * dy > L2) continue;
        lines[Math.min(BUCKETS - 1, (Math.min(li, lit[j]) * BUCKETS) | 0)].push(i, j);
      }
    }

    ctx.strokeStyle = litColor;
    ctx.lineWidth = 0.7;
    for (b = 0; b < BUCKETS; b++) {
      var seg = lines[b];
      if (!seg.length) continue;
      ctx.globalAlpha = (b + 0.5) / BUCKETS * litAlpha * 0.6;
      ctx.beginPath();
      for (k = 0; k < seg.length; k += 2) {
        ctx.moveTo(sx(seg[k]), sy(seg[k]));
        ctx.lineTo(sx(seg[k + 1]), sy(seg[k + 1]));
      }
      ctx.stroke();
    }

    ctx.fillStyle = litColor;
    for (b = 0; b < BUCKETS; b++) {
      var set = dots[b];
      if (!set.length) continue;
      var level = (b + 0.5) / BUCKETS, rad = 1 + level * 1.5;
      ctx.globalAlpha = level * litAlpha;
      ctx.beginPath();
      for (k = 0; k < set.length; k++) {
        i = set[k];
        var x = sx(i), y = sy(i);
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!last) last = now;
    acc += Math.min(now - last, 100);
    last = now;
    var motion = 0, steps = 0;
    while (acc >= STEP && steps < 4) { motion = step(now); acc -= STEP; steps++; }
    if (!steps) motion = 1;
    draw();
    if (motion > 0.02) {
      requestAnimationFrame(frame);
    } else {
      // At rest: keep the last frame on screen and stop asking for frames.
      running = false; last = 0; acc = 0;
    }
  }

  function wake() {
    if (running || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function pulse(x, y, amp) {
    pulses.push({ x: x, y: y, amp: amp, t0: performance.now(), r: 0, fade: 1 });
    if (pulses.length > 4) pulses.shift();
    wake();
  }

  /* --- wiring --------------------------------------------------------- */
  readColors();
  build();

  var first = false;
  try {
    if (!sessionStorage.getItem('lz-field')) {
      sessionStorage.setItem('lz-field', '1');
      first = true;
    }
  } catch (e) { /* no storage: no opening, rather than one on every page */ }
  if (first) {
    scatter();
    introOn = true;
    introStart = performance.now();
  }
  draw();
  wake();

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;   // a moving finger is a scroll
    pointer = { x: e.clientX, y: e.clientY };
    wake();
  }, { passive: true });

  document.addEventListener('pointerleave', function () { pointer = null; wake(); });
  document.documentElement.addEventListener('mouseleave', function () { pointer = null; wake(); });
  window.addEventListener('blur', function () { pointer = null; wake(); });

  // On a phone the ring crosses the whole screen within half a second, and at
  // full strength its afterglow lit nearly all of it; a tap gets a softer one.
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  window.addEventListener('click', function (e) {
    if (e.detail === 0) return;               // keyboard activation, no point
    pulse(e.clientX, e.clientY, coarse || window.innerWidth < 720 ? 0.6 : 1);
  }, { passive: true });

  /* Rebuild only when the lattice no longer fits: a new width, or a viewport
     taller than the canvas. A phone fires resize every time its address bar
     slides in or out while scrolling; that only moves the fade, and
     rebuilding on it wiped the lit dots, the pulses and the opening. */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth === W && window.innerHeight <= H) {
        VH = window.innerHeight;
        if (!running) draw();
        return;
      }
      build(); introOn = false; pulses = []; draw();
    }, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { last = 0; acc = 0; wake(); }
  });

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  var onScheme = function () { readColors(); draw(); };
  if (scheme.addEventListener) scheme.addEventListener('change', onScheme);

  var onReduce = function () {
    if (!reduce.matches) return;
    pulses = []; introOn = false; pointer = null;
    canvas.remove();
    backdrop.classList.remove('is-live');
  };
  if (reduce.addEventListener) reduce.addEventListener('change', onReduce);

  // An occasional faint pulse from somewhere in the visible part of the grid.
  (function ambient() {
    setTimeout(function () {
      if (!document.hidden && !introOn && backdrop.contains(canvas)) {
        pulse(W * (0.15 + Math.random() * 0.7), VH * (0.08 + Math.random() * 0.35), 0.45);
      }
      ambient();
    }, 11000 + Math.random() * 7000);
  })();
})();
