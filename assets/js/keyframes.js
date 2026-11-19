/* Figure 1 of "Query-Conditioned Evidential Keyframe Sampling" (WACV 2027),
   made interactive.

   A long video is a stream of frames, and an MLLM can only look at a few of
   them. A sampler decides which. This lets the reader run three samplers on
   the paper's two example questions and watch where each one spends an
   8-frame budget:

     uniform    spaces frames evenly and ranks nothing
     relevance  takes the frames most similar to the question
     evidence   takes the frames our learned scorer marks as answering it

   Each run, a playhead scans the video and the score curve forms behind it;
   then the chosen frames lift out of the stream into the model's context.
   Frames that land inside the segment that answers the question light up.

   The curves are illustrative, shaped after the paper's figure (the same
   peaks, in the same places); the frames shown are the paper's own. The
   caption says so. Progressive enhancement: without JavaScript the static
   figure from the paper is shown instead, and with reduced motion every
   change lands in its final state at once. */
(function () {
  'use strict';

  var fig = document.querySelector('.kf');
  if (!fig) return;
  var canvas = fig.querySelector('.kf-canvas');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var N = 240, K = 8;

  var VIDEOS = [
    {
      dur: 106, seg: [97, 101], seed: 11,
      rel: { base: 0.5, jitter: 0.34, peaks: [[36, 0.85, 1.1], [61, 0.42, 1], [69, 0.4, 0.9], [87, 0.34, 1]] },
      evi: { base: 0.3, jitter: 0.24, peaks: [[99, 0.8, 1.6], [14, 0.3, 0.9], [28, 0.28, 0.9], [52, 0.22, 0.9]], plateau: 0.25 },
      top: {
        relevance: ['assets/images/publications/kf-poem-rel.webp', 'An old man on a path, captioned with a line of the poem. Close to the question; no answer in it.'],
        evidence: ['assets/images/publications/kf-poem-evi.webp', 'The title card, naming the poem and its author. The frame that answers it.']
      }
    },
    {
      dur: 265, seg: [11, 15], seed: 23,
      rel: { base: 0.56, jitter: 0.34, peaks: [[86, 0.8, 1.4], [118, 0.32, 2.4], [158, 0.3, 2.4], [205, 0.28, 2.4]] },
      evi: { base: 0.34, jitter: 0.26, peaks: [[13, 0.85, 1.6], [98, 0.24, 2.4], [148, 0.22, 2.4]], plateau: 0.25 },
      top: {
        relevance: ['assets/images/publications/kf-foot-rel.webp', 'Open play. Unmistakably football, but it names no event.'],
        evidence: ['assets/images/publications/kf-foot-evi.webp', 'The pre-match card, Argentina v France at Lusail. The event, by name.']
      }
    }
  ];

  /* --- data ----------------------------------------------------------- */
  function rng(seed) {                      // mulberry32: the same curves every visit
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function curve(v, spec, salt) {
    var r = rng(v.seed * 31 + salt), raw = [], out = new Float32Array(N), i;
    for (i = 0; i < N; i++) raw.push(r());
    for (i = 0; i < N; i++) {
      var tsec = (i + 0.5) / N * v.dur;
      var noise = (raw[Math.max(0, i - 1)] + 4 * raw[i] + raw[Math.min(N - 1, i + 1)]) / 6 - 0.5;
      var s = spec.base + spec.jitter * noise * 2;
      for (var p = 0; p < spec.peaks.length; p++) {
        var pk = spec.peaks[p], d = (tsec - pk[0]) / pk[2];
        s += pk[1] * Math.exp(-d * d / 2);
      }
      if (spec.plateau && tsec >= v.seg[0] && tsec <= v.seg[1]) s += spec.plateau;
      out[i] = s;
    }
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < N; i++) { lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
    for (i = 0; i < N; i++) out[i] = (out[i] - lo) / (hi - lo);
    return out;
  }

  VIDEOS.forEach(function (v) {
    v.relevance = curve(v, v.rel, 1);
    v.evidence = curve(v, v.evi, 2);
    v.inSeg = new Uint8Array(N);
    v.segFrames = 0;
    for (var i = 0; i < N; i++) {
      var tsec = (i + 0.5) / N * v.dur;
      if (tsec >= v.seg[0] && tsec <= v.seg[1]) { v.inSeg[i] = 1; v.segFrames++; }
    }
  });

  function pick(v, mode) {
    var idx = [], i;
    if (mode === 'uniform') {
      for (i = 0; i < K; i++) idx.push(Math.floor((i + 0.5) * N / K));
      return idx;
    }
    var s = v[mode], order = [];
    for (i = 0; i < N; i++) order.push(i);
    order.sort(function (a, b) { return s[b] - s[a]; });
    return order.slice(0, K);                // [0] is the top-ranked frame
  }

  /* --- state ---------------------------------------------------------- */
  var q = 0, mode = 'evidence';
  var chosen = pick(VIDEOS[q], mode);
  var scan = 0;                              // 0..1, how far the playhead has read
  var flight = 1;                            // 0..1, frames on their way to the context
  var anim = null, hover = -1, started = false;
  var W = 0, H = 0;
  var C = {};

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (n) { return cs.getPropertyValue(n).trim(); };
    C.rel = v('--kf-rel'); C.evi = v('--kf-evi'); C.seg = v('--kf-seg');
    C.muted = v('--muted'); C.rule = v('--rule-2'); C.ink = v('--ink'); C.body = v('--body');
    C.mono = v('--mono') || 'monospace';
  }

  function size() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* --- geometry ------------------------------------------------------- */
  var PAD = 6;
  function xOf(i) { return PAD + (i + 0.5) / N * (W - 2 * PAD); }
  function yTop() { return 22; }
  function yBase() { return H - 70; }
  function yOf(s) { return yBase() - s * (yBase() - yTop()); }
  function stripY() { return yBase() + 12; }
  function slotY() { return H - 22; }
  function slotX(k) {
    var w = Math.min(W - 2 * PAD, K * 30), x0 = (W - w) / 2;
    return x0 + (k + 0.5) * w / K;
  }

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* --- drawing -------------------------------------------------------- */
  function line(arr, upto, color, alpha, width) {
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width;
    ctx.beginPath();
    for (var i = 0; i < upto; i++) {
      var x = xOf(i), y = yOf(arr[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  function draw() {
    var v = VIDEOS[q], i, k;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    var upto = Math.round(scan * N);
    var font = '10px ' + C.mono;

    // the answer segment
    var sx0 = PAD + v.seg[0] / v.dur * (W - 2 * PAD), sx1 = PAD + v.seg[1] / v.dur * (W - 2 * PAD);
    ctx.fillStyle = C.seg;
    ctx.fillRect(sx0, yTop() - 4, Math.max(2, sx1 - sx0), yBase() - yTop() + 4);
    ctx.fillStyle = C.muted; ctx.font = font; ctx.textBaseline = 'alphabetic';
    var label = 'answer';
    var lw = ctx.measureText(label).width;
    ctx.fillText(label, Math.min(W - PAD - lw, Math.max(PAD, (sx0 + sx1) / 2 - lw / 2)), yTop() - 9);

    // both curves; the active one in front, the other one a ghost
    var relA = mode === 'relevance' ? 0.9 : 0.22, eviA = mode === 'evidence' ? 0.9 : 0.22;
    line(v.relevance, upto, C.rel, relA, mode === 'relevance' ? 1.3 : 1);
    line(v.evidence, upto, C.evi, eviA, mode === 'evidence' ? 1.3 : 1);

    // the active curve as particles: the frames themselves, scored
    if (mode !== 'uniform') {
      var s = v[mode], col = mode === 'relevance' ? C.rel : C.evi;
      ctx.fillStyle = col;
      for (i = 0; i < upto; i++) {
        ctx.globalAlpha = 0.25 + 0.75 * s[i];
        ctx.beginPath(); ctx.arc(xOf(i), yOf(s[i]), 1.1 + s[i] * 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }

    // the video: one particle per frame, lit as the playhead reads it
    for (i = 0; i < N; i++) {
      ctx.globalAlpha = i < upto ? (v.inSeg[i] ? 0.9 : 0.45) : 0.14;
      ctx.fillStyle = v.inSeg[i] && i < upto ? C.evi : C.body;
      ctx.fillRect(xOf(i) - 0.7, stripY() - 3, 1.4, 6);
    }
    ctx.globalAlpha = 0.9; ctx.fillStyle = C.muted; ctx.font = font;
    ctx.fillText('0 s', PAD, stripY() + 17);
    var end = v.dur + ' s', ew = ctx.measureText(end).width;
    ctx.fillText(end, W - PAD - ew, stripY() + 17);

    // playhead
    if (scan > 0 && scan < 1) {
      var px = PAD + scan * (W - 2 * PAD);
      var g = ctx.createLinearGradient(px - 40, 0, px, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, mode === 'relevance' ? C.rel : C.evi);
      ctx.globalAlpha = 0.18; ctx.fillStyle = g; ctx.fillRect(px - 40, yTop() - 4, 40, stripY() - yTop() + 8);
      ctx.globalAlpha = 0.9; ctx.fillStyle = mode === 'relevance' ? C.rel : C.evi;
      ctx.fillRect(px - 0.5, yTop() - 4, 1, stripY() - yTop() + 8);
    }

    // the context: K slots, and the chosen frames travelling into them
    ctx.globalAlpha = 0.9; ctx.fillStyle = C.muted; ctx.font = font;
    var ctxLabel = 'context, ' + K + ' frames';
    if (slotX(0) - 16 - ctx.measureText(ctxLabel).width > PAD) {
      ctx.fillText(ctxLabel, PAD, slotY() + 4);
    }
    for (k = 0; k < K; k++) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = C.rule; ctx.lineWidth = 1;
      ctx.strokeRect(slotX(k) - 9, slotY() - 9, 18, 18);
    }
    if (scan >= 1) {
      for (k = 0; k < chosen.length; k++) {
        var fi = chosen[k], hit = v.inSeg[fi];
        var local = Math.max(0, Math.min(1, flight * 1.6 - k * 0.075));
        var e = ease(local);
        var fx = xOf(fi), fy = mode === 'uniform' ? stripY() : yOf(v[mode][fi]);
        var tx = slotX(k), ty = slotY();
        var cx = fx + (tx - fx) * e, cy = fy + (ty - fy) * e - Math.sin(e * Math.PI) * 18;
        var tint = hit ? C.evi : (mode === 'relevance' ? C.rel : C.body);
        // where it was taken from
        ctx.globalAlpha = 0.5; ctx.strokeStyle = tint; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, stripY()); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = tint;
        ctx.beginPath(); ctx.arc(fx, fy, 2.6, 0, Math.PI * 2); ctx.fill();
        // in flight, then seated
        if (local < 1) {
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.globalAlpha = hit ? 0.95 : 0.35;
          ctx.fillRect(tx - 8, ty - 8, 16, 16);
        }
      }
    }

    // hover readout
    if (hover >= 0 && scan >= 1) {
      var hx = xOf(hover);
      ctx.globalAlpha = 0.5; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, yTop() - 4); ctx.lineTo(hx, stripY() + 4); ctx.stroke();
      var tsec = ((hover + 0.5) / N * v.dur).toFixed(1);
      var txt = 't ' + tsec + ' s   relevance ' + v.relevance[hover].toFixed(2) + '   evidence ' + v.evidence[hover].toFixed(2);
      ctx.font = font; ctx.globalAlpha = 1; ctx.fillStyle = C.ink;
      var tw = ctx.measureText(txt).width;
      ctx.fillText(txt, Math.max(PAD, W - PAD - tw), 10);
    }
    ctx.globalAlpha = 1;
  }

  /* --- the words around it ------------------------------------------- */
  var readout = fig.querySelector('.kf-readout');
  var thumb = fig.querySelector('.kf-thumb');
  var thumbLabel = fig.querySelector('.kf-thumb-label');
  var thumbCap = fig.querySelector('.kf-thumb-cap');

  function words() {
    var v = VIDEOS[q], hits = 0;
    chosen.forEach(function (i) { hits += v.inSeg[i]; });
    var name = mode === 'uniform' ? 'Uniform' : mode === 'relevance' ? 'Relevance' : 'Evidence';
    readout.textContent = name + ': ' + hits + ' of ' + K + ' frames land in the ' + v.segFrames +
      '-frame segment that answers the question.';
    if (mode === 'uniform') {
      thumb.hidden = true;
      thumbLabel.textContent = 'No top frame';
      thumbCap.textContent = 'Uniform sampling ranks nothing. It spaces ' + K + ' frames evenly and sees whatever falls under them.';
    } else {
      var t = v.top[mode];
      thumb.hidden = false;
      thumb.src = t[0];
      thumbLabel.textContent = 'Top frame by ' + mode;
      thumbCap.textContent = t[1];
    }
  }

  /* --- running it ---------------------------------------------------- */
  function run(rescan) {
    chosen = pick(VIDEOS[q], mode);
    words();
    if (still) { scan = 1; flight = 1; draw(); return; }
    var t0 = performance.now();
    var scanMs = rescan ? 1100 : 0, flyMs = 900;
    if (rescan) scan = 0;
    flight = 0;
    if (anim) cancelAnimationFrame(anim);
    (function tick(now) {
      var e = now - t0;
      scan = rescan ? Math.min(1, e / scanMs) : 1;
      flight = Math.max(0, Math.min(1, (e - scanMs) / flyMs));
      draw();
      if (flight < 1) anim = requestAnimationFrame(tick);
      else anim = null;
    })(t0);
  }

  function press(group, attr, value) {
    fig.querySelectorAll(group + ' button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value));
    });
  }

  fig.querySelectorAll('.kf-questions button').forEach(function (b) {
    b.addEventListener('click', function () {
      var nq = +b.getAttribute('data-q');
      if (nq === q) return;
      q = nq; press('.kf-questions', 'data-q', String(q)); run(true);
    });
  });
  fig.querySelectorAll('.kf-modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      var nm = b.getAttribute('data-mode');
      if (nm === mode) return;
      mode = nm; press('.kf-modes', 'data-mode', mode); run(false);
    });
  });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left;
    var i = Math.round((x - PAD) / (W - 2 * PAD) * N - 0.5);
    hover = i >= 0 && i < N ? i : -1;
    if (!anim) draw();
  });
  canvas.addEventListener('pointerleave', function () { hover = -1; if (!anim) draw(); });

  readColors();
  size();
  words();

  // First run when the figure comes into view, so the scan is seen, not missed.
  function begin() { if (started) return; started = true; run(true); }
  if (still || !('IntersectionObserver' in window)) {
    begin();
  } else {
    scan = 0; draw();
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { begin(); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(canvas);
  }

  var lastW = W;
  var onResize = function () {
    var w = Math.round(canvas.getBoundingClientRect().width);
    if (w === lastW) return;
    lastW = w; size(); draw();
  };
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener('resize', onResize);

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  if (scheme.addEventListener) scheme.addEventListener('change', function () { readColors(); draw(); });
})();
