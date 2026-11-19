/* The latent manifold beside About.

   A point cloud in the shape an embedding space takes under a projection:
   seven structures (strands, spirals, rings, blobs, sheets) and a thin halo
   of outliers, each point linked to its three nearest neighbours.

   It is born the way a diffusion model samples. Every point carries a fixed
   noise vector e, and its position is  sqrt(a)*x0 + sqrt(1-a)*e  with a
   running from 0 to 1 along a cosine schedule, so a ball of Gaussian noise
   separates into coloured structure. A click draws a new sample: the cloud
   dissolves back toward noise and re-forms as a different manifold. Every
   few seconds a signal is passed hop by hop along the neighbour graph and
   lights up a filament. Hovering probes a point's neighbourhood; dragging
   turns the space, with inertia.

   It sits in the right-hand column of the opening screen, never behind text,
   and the sidebar is untouched. It runs only while it is on screen and the
   tab is visible. With reduced motion it is a still figure that still
   answers to hover, drag and click; without JavaScript it is not shown. */
(function () {
  'use strict';

  var fig = document.querySelector('.manifold');
  var canvas = fig && fig.querySelector('canvas');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var K = 7, KNN = 3, SIGMA = 0.72, LEVELS = 4;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gaussian(r) {
    return function () { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
  }

  /* --- canvas --------------------------------------------------------- */
  var W = 0, H = 0;
  function fit() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();

  /* --- the points ----------------------------------------------------- */
  // Sized once, from the first layout: a resize re-projects, it does not resample.
  var N = Math.max(1100, Math.min(2800, Math.round(W * H / 56)));
  var HALO = Math.round(N * 0.06);
  var owner = new Int8Array(N);           // cluster per index, -1 for the halo
  (function () {
    // Fixed cluster sizes, so every point keeps its colour across a resample.
    var r = rng(97), w = [], s = 0, k, i = 0, body = N - HALO;
    for (k = 0; k < K; k++) { w.push(0.7 + r() * 0.6); s += w[k]; }
    for (k = 0; k < K; k++) {
      var n = k === K - 1 ? body - i : Math.round(body * w[k] / s);
      for (var m = 0; m < n; m++) owner[i++] = k;
    }
    while (i < N) owner[i++] = -1;
  })();

  var eps = new Float32Array(3 * N), phase = new Float32Array(N), freq = new Float32Array(N);
  (function () {
    var r = rng(5), g = gaussian(r);
    for (var i = 0; i < N; i++) {
      eps[3 * i] = g(); eps[3 * i + 1] = g(); eps[3 * i + 2] = g();
      phase[i] = r() * 6.283; freq[i] = 0.6 + r() * 0.8;
    }
  })();

  function frame3(g) {
    var a = [g(), g(), g()], n = Math.hypot(a[0], a[1], a[2]);
    a = [a[0] / n, a[1] / n, a[2] / n];
    var b = [g(), g(), g()], d = b[0] * a[0] + b[1] * a[1] + b[2] * a[2];
    b = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]];
    n = Math.hypot(b[0], b[1], b[2]);
    b = [b[0] / n, b[1] / n, b[2] / n];
    return [a, b, [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]];
  }

  function shape(type, u, f, c, g) {
    var a = f[0], b = f[1], n = f[2];
    function at(pa, pb, pn) {
      return [c[0] + a[0] * pa + b[0] * pb + n[0] * pn,
              c[1] + a[1] * pa + b[1] * pb + n[1] * pn,
              c[2] + a[2] * pa + b[2] * pb + n[2] * pn];
    }
    var t, th, rr;
    switch (type) {
      case 'strand':
        t = u * 2 - 1;
        return at(t * 0.56 + g() * 0.03, (t * t - 0.35) * 0.32 + g() * 0.035, Math.sin(t * 2.2) * 0.12 + g() * 0.035);
      case 'spiral':
        th = u * 3.4 * Math.PI; rr = 0.06 + u * 0.36;
        return at(Math.cos(th) * rr + g() * 0.022, Math.sin(th) * rr + g() * 0.022, (u - 0.5) * 0.14 + g() * 0.025);
      case 'ring':
        th = u * 6.2832 + g() * 0.04;
        return at(Math.cos(th) * 0.3 + g() * 0.035, Math.sin(th) * 0.3 + g() * 0.035, g() * 0.035);
      case 'sheet':
        return at(g() * 0.24, g() * 0.24, g() * 0.022);
      default:                                // blob
        return at(g() * 0.21, g() * 0.13, g() * 0.1);
    }
  }

  var TYPES = ['strand', 'spiral', 'ring', 'blob', 'sheet', 'strand', 'blob'];

  function sample(seed) {
    var r = rng(seed), g = gaussian(r), i, k;
    var types = TYPES.slice();
    for (i = types.length - 1; i > 0; i--) { k = (r() * (i + 1)) | 0; var tmp = types[i]; types[i] = types[k]; types[k] = tmp; }
    var turn = r() * 6.283, centres = [], frames = [];
    for (k = 0; k < K; k++) {
      var phi = Math.acos(1 - 2 * (k + 0.5) / K), th = 2.39996 * k + turn + (r() - 0.5) * 0.5;
      var rad = 0.95 + (r() - 0.5) * 0.25;
      centres.push([Math.sin(phi) * Math.cos(th) * rad, Math.cos(phi) * rad * 0.82, Math.sin(phi) * Math.sin(th) * rad]);
      frames.push(frame3(g));
    }
    var seen = new Int32Array(K), size = new Int32Array(K);
    for (i = 0; i < N; i++) if (owner[i] >= 0) size[owner[i]]++;
    var out = new Float32Array(3 * N);
    for (i = 0; i < N; i++) {
      var o = owner[i], p;
      if (o < 0) {
        var hu = r() * 2 - 1, ht = r() * 6.283, hr = Math.cbrt(r()) * 1.45, sq = Math.sqrt(1 - hu * hu);
        p = [hr * sq * Math.cos(ht), hr * hu * 0.78, hr * sq * Math.sin(ht)];
      } else {
        p = shape(types[o], seen[o]++ / size[o], frames[o], centres[o], g);
      }
      out[3 * i] = p[0]; out[3 * i + 1] = p[1]; out[3 * i + 2] = p[2];
    }
    // centre on the structure and scale it to unit radius
    var mx = 0, my = 0, mz = 0, m = 0, radii = [];
    for (i = 0; i < N; i++) if (owner[i] >= 0) { mx += out[3 * i]; my += out[3 * i + 1]; mz += out[3 * i + 2]; m++; }
    mx /= m; my /= m; mz /= m;
    for (i = 0; i < N; i++) {
      out[3 * i] -= mx; out[3 * i + 1] -= my; out[3 * i + 2] -= mz;
      if (owner[i] >= 0) radii.push(Math.hypot(out[3 * i], out[3 * i + 1], out[3 * i + 2]));
    }
    radii.sort(function (a, b) { return a - b; });
    var s = 1 / (radii[Math.floor(radii.length * 0.95)] || 1);
    for (i = 0; i < 3 * N; i++) out[i] *= s;
    return out;
  }

  /* Three nearest neighbours of every structured point, made undirected. */
  function graph(pos) {
    var idx = [], i, j, a, b;
    for (i = 0; i < N; i++) if (owner[i] >= 0) idx.push(i);
    var nb = new Int32Array(N * KNN).fill(-1), nd = new Float32Array(N * KNN).fill(1e9);
    function insert(p, q, d) {
      var o = p * KNN;
      if (d >= nd[o + KNN - 1]) return;
      var m = KNN - 1;
      while (m > 0 && nd[o + m - 1] > d) { nd[o + m] = nd[o + m - 1]; nb[o + m] = nb[o + m - 1]; m--; }
      nd[o + m] = d; nb[o + m] = q;
    }
    for (a = 0; a < idx.length; a++) {
      i = idx[a];
      var xi = pos[3 * i], yi = pos[3 * i + 1], zi = pos[3 * i + 2];
      for (b = a + 1; b < idx.length; b++) {
        j = idx[b];
        var dx = pos[3 * j] - xi, dy = pos[3 * j + 1] - yi, dz = pos[3 * j + 2] - zi;
        var d = dx * dx + dy * dy + dz * dz;
        insert(i, j, d); insert(j, i, d);
      }
    }
    var adj = [];
    for (i = 0; i < N; i++) adj.push([]);
    for (i = 0; i < N; i++) {
      for (var m2 = 0; m2 < KNN; m2++) {
        j = nb[i * KNN + m2];
        if (j < 0) continue;
        if (adj[i].indexOf(j) < 0) adj[i].push(j);
        if (adj[j].indexOf(i) < 0) adj[j].push(i);
      }
    }
    return adj;
  }

  function bfs(src, depth, cap) {
    var order = [src], level = [0], parent = [-1], seen = {}, head = 0;
    seen[src] = 1;
    while (head < order.length && order.length < cap) {
      var v = order[head], lv = level[head]; head++;
      if (lv >= depth) continue;
      var nbs = adj[v];
      for (var m = 0; m < nbs.length && order.length < cap; m++) {
        var w2 = nbs[m];
        if (seen[w2]) continue;
        seen[w2] = 1; order.push(w2); level.push(lv + 1); parent.push(v);
      }
    }
    return { order: order, level: level, parent: parent };
  }

  /* --- state ---------------------------------------------------------- */
  var seed = 1;
  var x0 = sample(seed), x0next = null, mix = 0;
  var adj = graph(x0), adjNext = null;
  var tau = 0;                             // 0: clean sample, 1: pure noise
  var anim = null;                         // the opening, or a resample in progress
  var cur = new Float32Array(3 * N);
  var X = new Float32Array(N), Y = new Float32Array(N), near = new Float32Array(N);
  var lit = new Float32Array(N), probeLit = new Float32Array(N);
  var yaw = 0.6, pitch = 0.3, yawV = 0, pitchV = 0, REST_PITCH = 0.3;
  var hover = null, press = null, dragging = false;
  var pulses = [], nextPulse = 0;
  var P = {};                              // colours

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (n) { return cs.getPropertyValue(n).trim(); };
    P.pal = v('--mf-palette').split(/\s+/).filter(Boolean);
    while (P.pal.length < K) P.pal.push(P.pal[0] || '#4d9cff');
    P.halo = v('--mf-halo'); P.signal = v('--mf-signal'); P.glow = v('--mf-glow');
    P.additive = v('--mf-blend') === 'lighter';
  }

  function alphaBar(t) { var c = Math.cos(t * Math.PI / 2); return c * c; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function smooth(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }

  /* --- one frame ------------------------------------------------------ */
  function positions(now) {
    var ab = alphaBar(tau), sa = Math.sqrt(ab), sn = Math.sqrt(1 - ab) * SIGMA;
    var breathe = still ? 0 : 0.011;
    for (var i = 0; i < N; i++) {
      var o = 3 * i;
      var bx = x0[o], by = x0[o + 1], bz = x0[o + 2];
      if (mix > 0 && x0next) {
        bx += (x0next[o] - bx) * mix; by += (x0next[o + 1] - by) * mix; bz += (x0next[o + 2] - bz) * mix;
      }
      var e = sn + breathe * Math.sin(now * 0.0011 * freq[i] + phase[i]);
      cur[o] = sa * bx + e * eps[o];
      cur[o + 1] = sa * by + e * eps[o + 1];
      cur[o + 2] = sa * bz + e * eps[o + 2];
    }
  }

  function project() {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Fit the unit-radius structure inside the box with room to turn: the
    // halo and the noise may spill past the edges, the structure should not.
    var CAM = 3.4, SX = Math.min(W * 0.36, H * 0.6), SY = Math.min(H * 0.36, W * 0.55);
    var cx = W * 0.5, cyy = H * 0.5;
    for (var i = 0; i < N; i++) {
      var o = 3 * i, x = cur[o], y = cur[o + 1], z = cur[o + 2];
      var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var s = CAM / (CAM + z2);
      X[i] = cx + x1 * s * SX;
      Y[i] = cyy + y2 * s * SY;
      near[i] = Math.max(0, Math.min(1, (1.3 - z2) / 2.6));
    }
  }

  function probe() {
    for (var i = 0; i < N; i++) probeLit[i] *= 0.82;
    if (!hover || dragging || tau > 0.2) return null;
    var best = -1, bd = 26 * 26;
    for (i = 0; i < N; i++) {
      if (owner[i] < 0) continue;
      var dx = X[i] - hover.x, dy = Y[i] - hover.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    var t = bfs(best, 3, 72);
    for (var m = 0; m < t.order.length; m++) {
      var v = t.order[m], target = [1, 0.82, 0.62, 0.44][t.level[m]];
      if (probeLit[v] < target) probeLit[v] += (target - probeLit[v]) * 0.45;
    }
    return t;
  }

  var buckets = [];
  for (var bq = 0; bq < (K + 1) * LEVELS; bq++) buckets.push([]);
  var edgeBuckets = [[], [], [], [], []];

  function draw(now) {
    var i, k, lv, m;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // a soft field of light behind the cloud
    var R = Math.max(W, H) * 0.62;
    var gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R);
    gr.addColorStop(0, P.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = P.additive ? 'lighter' : 'source-over';
    var scale = Math.max(0.75, Math.min(1.25, Math.min(W, H) / 420));

    for (i = 0; i < buckets.length; i++) buckets[i].length = 0;
    for (i = 0; i < N; i++) {
      var group = owner[i] < 0 ? K : owner[i];
      buckets[group * LEVELS + Math.min(LEVELS - 1, (near[i] * LEVELS) | 0)].push(i);
    }

    // bloom under the nearest points, on dark only
    if (P.additive) {
      for (k = 0; k < K; k++) {
        ctx.fillStyle = P.pal[k]; ctx.globalAlpha = 0.055; ctx.beginPath();
        for (lv = 2; lv < LEVELS; lv++) {
          var bl = buckets[k * LEVELS + lv];
          for (m = 0; m < bl.length; m++) {
            i = bl[m];
            var br = (2.6 + near[i] * 3.4) * scale;
            ctx.moveTo(X[i] + br, Y[i]); ctx.arc(X[i], Y[i], br, 0, 6.2832);
          }
        }
        ctx.fill();
      }
    }

    // the cloud: one path per colour and depth band
    var dim = P.additive ? 1 : 0.85;
    for (k = 0; k <= K; k++) {
      ctx.fillStyle = k === K ? P.halo : P.pal[k];
      for (lv = 0; lv < LEVELS; lv++) {
        var list = buckets[k * LEVELS + lv];
        if (!list.length) continue;
        ctx.globalAlpha = (k === K ? 0.2 + lv * 0.08 : 0.28 + lv * 0.22) * dim;
        ctx.beginPath();
        for (m = 0; m < list.length; m++) {
          i = list[m];
          var rad = (0.5 + near[i] * 1.7) * scale;
          ctx.moveTo(X[i] + rad, Y[i]); ctx.arc(X[i], Y[i], rad, 0, 6.2832);
        }
        ctx.fill();
      }
    }

    // signals: the probe's neighbourhood and passing messages
    var t = probe();
    for (i = 0; i < N; i++) lit[i] = probeLit[i];
    for (i = 0; i < edgeBuckets.length; i++) edgeBuckets[i].length = 0;
    function edge(a, b, alpha) {
      if (alpha < 0.04) return;
      edgeBuckets[Math.min(4, (alpha * 5) | 0)].push(a, b);
    }
    if (t) {
      var inSet = {};
      for (m = 0; m < t.order.length; m++) inSet[t.order[m]] = t.level[m] + 1;
      for (m = 0; m < t.order.length; m++) {
        var v = t.order[m], nbs = adj[v];
        for (var q = 0; q < nbs.length; q++) {
          var w2 = nbs[q];
          if (w2 > v && inSet[w2]) edge(v, w2, 0.95 - 0.2 * Math.max(t.level[m], inSet[w2] - 1));
        }
      }
    }
    for (var p = pulses.length - 1; p >= 0; p--) {
      var pu = pulses[p], alive = false;
      for (m = 0; m < pu.order.length; m++) {
        var age = now - (pu.t0 + pu.level[m] * 85);
        if (age < 0) { alive = true; continue; }
        var a2 = Math.exp(-age / 420);
        if (a2 < 0.03) continue;
        alive = true;
        var node = pu.order[m];
        if (lit[node] < a2) lit[node] = a2;
        if (pu.parent[m] >= 0) edge(pu.parent[m], node, a2 * 0.95);
      }
      if (!alive) pulses.splice(p, 1);
    }
    ctx.strokeStyle = P.signal; ctx.lineWidth = 0.8 * scale;
    for (lv = 0; lv < 5; lv++) {
      var eb = edgeBuckets[lv];
      if (!eb.length) continue;
      ctx.globalAlpha = (lv + 0.5) / 5 * (P.additive ? 0.75 : 0.6);
      ctx.beginPath();
      for (m = 0; m < eb.length; m += 2) { ctx.moveTo(X[eb[m]], Y[eb[m]]); ctx.lineTo(X[eb[m + 1]], Y[eb[m + 1]]); }
      ctx.stroke();
    }
    ctx.fillStyle = P.signal;
    for (i = 0; i < N; i++) {
      if (lit[i] < 0.05) continue;
      ctx.globalAlpha = lit[i] * 0.95;
      ctx.beginPath(); ctx.arc(X[i], Y[i], (1 + lit[i] * 1.5) * scale, 0, 6.2832); ctx.fill();
    }
    if (t) {
      var c0 = t.order[0];
      ctx.globalAlpha = 0.6; ctx.strokeStyle = P.signal; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X[c0], Y[c0], 7 * scale, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function render(now) { positions(now); project(); draw(now); }

  /* --- motion ---------------------------------------------------------- */
  var OPEN_MS = 2800, OUT_MS = 650, IN_MS = 2100;

  function stepAnim(now) {
    if (!anim) return;
    var e = now - anim.t0;
    if (anim.type === 'open') {
      var u = Math.min(1, e / OPEN_MS);
      tau = 1 - easeOut(u);
      if (u >= 1) { tau = 0; anim = null; }
    } else {
      if (e < OUT_MS) {
        var u1 = e / OUT_MS;
        tau = easeIn(u1) * 0.9;
        mix = smooth(0.55, 1, u1);
      } else {
        if (x0next) { x0 = x0next; x0next = null; mix = 0; adj = adjNext; adjNext = null; }
        var u2 = Math.min(1, (e - OUT_MS) / IN_MS);
        tau = 0.9 * (1 - easeOut(u2));
        if (u2 >= 1) { tau = 0; anim = null; }
      }
    }
  }

  function startPulse() {
    var tries = 0, s;
    do { s = (Math.random() * N) | 0; tries++; } while ((owner[s] < 0 || near[s] < 0.45) && tries < 50);
    var t = bfs(s, 11, 170);
    t.t0 = performance.now();
    pulses.push(t);
  }

  function resample() {
    if (anim && anim.type === 'resample') return;
    seed += 1;
    x0next = sample(seed * 7919);
    adjNext = graph(x0next);
    pulses = [];
    if (still) {
      x0 = x0next; adj = adjNext; x0next = adjNext = null; mix = 0;
      render(performance.now());
      return;
    }
    anim = { type: 'resample', t0: performance.now() };
  }

  var running = false, onScreen = true, last = 0;
  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(50, now - last) : 16.7;
    last = now;
    stepAnim(now);
    if (!dragging) {
      yaw += yawV + dt * 0.00006;
      pitch += pitchV;
      yawV *= 0.94; pitchV *= 0.9;
      pitch += (REST_PITCH - pitch) * 0.008;
    }
    if (!anim && !hover && now > nextPulse) {
      if (nextPulse) startPulse();
      nextPulse = now + 4200 + Math.random() * 2600;
    }
    render(now);
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || still || !onScreen || document.hidden) return;
    running = true; last = 0;
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  /* --- input ----------------------------------------------------------- */
  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointerdown', function (e) {
    press = local(e); press.yaw = yaw; press.pitch = pitch; press.lx = press.x; press.ly = press.y;
    dragging = false;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = local(e);
    hover = p;
    if (press) {
      if (!dragging && Math.hypot(p.x - press.x, p.y - press.y) > 4) {
        dragging = true; fig.classList.add('is-dragging');
      }
      if (dragging) {
        var dx = p.x - press.lx, dy = p.y - press.ly;
        yaw += dx * 0.006; pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * 0.004));
        yawV = dx * 0.006; pitchV = dy * 0.004;
        press.lx = p.x; press.ly = p.y;
      }
    }
    if (still) render(performance.now());
  });
  function release(e) {
    if (press && !dragging && e.type === 'pointerup') resample();
    press = null;
    if (dragging) { dragging = false; fig.classList.remove('is-dragging'); }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', function () { hover = null; if (still) render(performance.now()); });

  /* --- go -------------------------------------------------------------- */
  readColors();

  var first = false;
  try {
    if (!sessionStorage.getItem('lz-manifold')) { sessionStorage.setItem('lz-manifold', '1'); first = true; }
  } catch (err) { /* no storage: no opening, rather than one on every visit */ }
  if (first && !still) { tau = 1; anim = { type: 'open', t0: performance.now() }; }

  render(performance.now());
  fig.classList.add('is-on');

  if (!still) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) start(); else stop();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    start();
  }

  var lastSize = W + 'x' + H;
  function onResize() {
    var r = canvas.getBoundingClientRect(), key = Math.round(r.width) + 'x' + Math.round(r.height);
    if (key === lastSize) return;
    lastSize = key; fit();
    if (!running) render(performance.now());
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener('resize', onResize);

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  if (scheme.addEventListener) scheme.addEventListener('change', function () { readColors(); if (!running) render(performance.now()); });
})();
