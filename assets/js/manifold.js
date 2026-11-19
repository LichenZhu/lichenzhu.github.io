/* Video memory. Recent particle frames stack up, then leave compact traces
   behind. A passing signal calls an older frame back from its trace. */
(function () {
  'use strict';

  var fig = document.querySelector('.manifold');
  if (!fig) return;
  var canvas = fig.querySelector('canvas');
  var recallButton = fig.querySelector('button');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var theme = window.matchMedia('(prefers-color-scheme: light)');
  var colors = {};
  var W, H, scale, left, top, layout;
  var pointer = 0, tilt = 0;
  var STILL_TIME = 4, HISTORY = 20;
  var time = STILL_TIME, lastFrame = null, frameId = null, inView = true;
  var requested = null, recallCount = 0;
  var CYCLE = 5.6, FIRST_RECALL = 2.95, RECALL_TIME = 4.4, RECALL_INTERVAL = 10.8;
  var COLS = 54, ROWS = 30, photo = null;
  var TAU = Math.PI * 2;

  var layouts = {
    tall: { width: 350, height: 426, frame: [65, 250, 244], step: [-13, -36],
      memory: [45, 186, 17, 8], preview: [182, 42, 127], depth: 3 },
    wide: { width: 640, height: 188, frame: [338, 32, 256], step: [-35, -12],
      memory: [46, 151, 13, 7], preview: [181, 29, 115], depth: 3 },
    compact: { width: 350, height: 169, frame: [151, 57, 175], step: [-19, -16],
      memory: [20, 151, 12, 6], preview: [29, 18, 99], depth: 2 }
  };

  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function lerp(a, b, x) { return a + (b - a) * x; }
  function noise(x) {
    var n = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function readColors() {
    var css = getComputedStyle(fig);
    ['surface', 'wash', 'edge', 'dot', 'shine', 'glow', 'trace'].forEach(function (name) {
      colors[name] = css.getPropertyValue('--memory-' + name).trim();
    });
  }

  function fit() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    if (W === rect.width && H === rect.height && canvas.width === width && canvas.height === height) return;
    W = rect.width;
    H = rect.height;
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(canvas.width / (W || 1), 0, 0, canvas.height / (H || 1), 0, 0);
    layout = H > W * 0.95 ? layouts.tall : W >= 520 ? layouts.wide : layouts.compact;
    var space = Math.max(0, H - 38);
    scale = Math.min(W / layout.width, space / layout.height);
    left = (W - layout.width * scale) / 2;
    top = (space - layout.height * scale) / 2;
    render();
  }

  function frameAt(age, slide) {
    var f = layout.frame, s = layout.step, offset = age + slide - 1;
    var w = f[2] * (1 - offset * 0.08);
    return { x: f[0] + offset * (s[0] + f[2] * 0.04), y: f[1] + offset * s[1], w: w, h: w * ROWS / COLS };
  }

  function memoryAt(age, slide, index) {
    var m = layout.memory, row = Math.max(0, age + slide - 1);
    return {
      x: m[0] + row * 2.4,
      y: m[1] - row * m[2],
      w: (layout === layouts.tall ? 83 : 63) * (0.69 + noise(index) * 0.31)
    };
  }

  function roundPanel(w, h) {
    var r = 4;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
  }

  function panel(rect, opacity, front) {
    if (opacity <= 0) return;
    var w = rect.w, h = rect.h;
    ctx.save();
    ctx.transform(1, -0.075, 0.12 + tilt * 0.045, 1, rect.x, rect.y);
    ctx.globalAlpha = opacity;
    roundPanel(w, h);
    var fill = ctx.createLinearGradient(0, 0, w * 0.38, h);
    fill.addColorStop(0, colors.wash);
    fill.addColorStop(1, colors.surface);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = front ? 1 : 0.8;
    ctx.globalAlpha *= front ? 0.75 : 0.48;
    ctx.strokeStyle = colors.edge;
    ctx.stroke();

    var rule = ctx.createLinearGradient(0, 0, w, 0);
    rule.addColorStop(0, colors.shine);
    rule.addColorStop(0.36, colors.edge);
    rule.addColorStop(1, colors.trace);
    ctx.beginPath();
    ctx.moveTo(7, 0.5);
    ctx.lineTo(w - 5, 0.5);
    ctx.strokeStyle = rule;
    ctx.stroke();
    ctx.restore();
  }

  var bands = [[], [], [], [], [], []];
  var radius = [0.27, 0.36, 0.53, 0.67, 0.88, 1.1];
  var intensity = [0.16, 0.32, 0.5, 0.68, 0.84, 1];

  function particles(rect, sample, opacity, sparse, target, collapse) {
    if (opacity <= 0) return;
    var i, j, k;
    var stride = sparse ? 2 : 1;
    var skew = 0.12 + tilt * 0.045;
    var lightX = 0.51 + Math.sin(sample * 0.52) * 0.18;
    var size = Math.max(0.65, rect.w / 245);
    for (k = 0; k < bands.length; k++) bands[k].length = 0;

    for (j = 0; j < ROWS; j += stride) {
      var v = j / (ROWS - 1);
      var water = Math.max(0, (v - 0.60) / 0.40);
      var phase = 16 * Math.log1p(water * 4) - sample * 2;
      var ripples = smooth(water * 5);
      var spread = 0.07 + water * 0.25;
      for (i = 0; i < COLS; i += stride) {
        var u = i / (COLS - 1);
        var crest = 0.5 + 0.5 * Math.sin(phase + u * 13 + Math.sin(u * 8.5 - sample) * 1.25);
        var wave = crest * crest;
        var distance = (u - lightX - Math.sin(phase * 0.37) * 0.04) / spread;
        var glint = Math.exp(-distance * distance);
        var luminance = photo ? photo[j * COLS + i] : 0.56 + 0.17 * Math.exp(-Math.pow((v - 0.59) * 14, 2));
        var detail = clamp((luminance - 0.31) * 1.55 + ripples * (wave * (0.44 + glint * 0.48) - 0.12));
        var x = rect.w * (0.047 + u * 0.906);
        var y = rect.h * (0.075 + v * 0.85) + ripples * (crest - 0.5) * 4 * size;
        var px = rect.x + x + y * skew;
        var py = rect.y - x * 0.075 + y;
        if (target) {
          var group = i % 11 < 8 ? i : i - (i % 11 - 7);
          px = lerp(px, target.x + 8 + target.w * group / COLS, collapse);
          py = lerp(py, target.y + (v - 0.5) * 2, collapse);
        }
        bands[Math.min(5, Math.floor(detail * 6))].push(px, py);
      }
    }

    for (k = 0; k < bands.length; k++) {
      var points = bands[k], r = radius[k] * size;
      ctx.fillStyle = k < 4 ? colors.dot : colors.shine;
      ctx.globalAlpha = opacity * intensity[k];
      ctx.beginPath();
      for (i = 0; i < points.length; i += 2) {
        ctx.moveTo(points[i] + r, points[i + 1]);
        ctx.arc(points[i], points[i + 1], r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function trace(mark, opacity, active) {
    ctx.globalAlpha = opacity * (0.36 + active * 0.64);
    ctx.fillStyle = colors.shine;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, 1 + active, 0, TAU);
    ctx.fill();
    ctx.fillStyle = active > 0 ? colors.shine : colors.dot;
    for (var x = 0; x <= mark.w; x += 4) {
      if (x % 20 < 13) ctx.fillRect(mark.x + 8 + x, mark.y - 0.65, 1.8, 1.3);
    }
    ctx.globalAlpha = 1;
  }

  function connection(front, mark, amount, progress) {
    var tall = layout === layouts.tall;
    var x0 = front.x + front.w * (tall ? 1.015 : 0.04);
    var y0 = front.y + front.h * (tall ? 0.19 : 0.6);
    var x3 = mark.x + mark.w + 11, y3 = mark.y;
    var x1 = x0 + (tall ? 36 : -54), y1 = y0 - (tall ? 92 : 24);
    var x2 = x3 + (x0 - x3) * 0.66, y2 = y3 - (tall ? 24 : 3);

    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 0.85;
    ctx.globalAlpha = 0.5 + amount * 0.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (amount <= 0) return;

    for (var i = 18; i >= 0; i--) {
      var t = progress - i * 0.021;
      if (t < 0 || t > 1) continue;
      var r = 1 - t;
      var x = r * r * r * x0 + 3 * r * r * t * x1 + 3 * r * t * t * x2 + t * t * t * x3;
      var y = r * r * r * y0 + 3 * r * r * t * y1 + 3 * r * t * t * y2 + t * t * t * y3;
      ctx.globalAlpha = amount * (1 - i / 19);
      ctx.fillStyle = i === 0 ? colors.shine : colors.dot;
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 2.2 : 1.15, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    var still = motion.matches;
    var now = still ? STILL_TIME : time;
    var position = now / CYCLE;
    var index = HISTORY + Math.floor(position);
    var phase = position % 1 * CYCLE;
    var slide = smooth(phase / 1.05);
    var depth = layout.depth;
    var collapsed = smooth((phase - 0.12) / 1.4);
    var last = layout.memory[3] - 1;

    if (requested && !still && now - requested.time >= RECALL_TIME) requested = null;
    var autoStart = FIRST_RECALL + Math.floor((now - FIRST_RECALL) / RECALL_INTERVAL) * RECALL_INTERVAL;
    var age = now - (requested ? requested.time : autoStart);
    var remembered = requested ? requested.index : HISTORY + Math.floor(autoStart / CYCLE) - depth - 2;
    var recall = Math.max(1, Math.min(last, index - depth - remembered));
    var beam = still ? 0 : smooth(age / 0.18) * (1 - smooth((age - 1.2) / 0.45));
    var echo = still ? 0.78 : smooth((age - 0.8) / 0.64) * (1 - smooth((age - 3.5) / 0.9));
    var front = frameAt(0, slide);
    var memory = memoryAt(recall, slide, index - depth - recall);

    ctx.clearRect(0, 0, W, H);
    if (!scale) return;
    ctx.save();
    ctx.translate(left + tilt * 4, top);
    ctx.scale(scale, scale);

    ctx.save();
    ctx.translate(front.x + front.w * 0.52, front.y + front.h * 0.38);
    ctx.scale(1, 0.64);
    var radius = front.w * 0.7;
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, colors.glow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();

    for (var slot = last; slot >= 0; slot--) {
      var opacity = (slot === 0 ? smooth((collapsed - 0.82) / 0.18) : 1) * (0.8 - slot * 0.065);
      trace(memoryAt(slot, slide, index - depth - slot), opacity, slot === recall ? Math.max(beam, echo) : 0);
    }

    if (echo > 0) {
      var p = layout.preview;
      var preview = { x: p[0], y: p[1] + (1 - echo) * 5, w: p[2], h: p[2] * ROWS / COLS };
      ctx.globalAlpha = echo * 0.65;
      ctx.strokeStyle = colors.trace;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(memory.x + memory.w + 8, memory.y);
      ctx.quadraticCurveTo(preview.x + 8, memory.y, preview.x + 14, preview.y + preview.h - 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      panel(preview, echo * 0.59, false);
      particles(preview, (index - depth - recall + 1) * 0.83, echo * 0.78, true);
    }

    connection(front, memory, beam, age / 1.16);

    for (var layer = depth; layer >= 0; layer--) {
      if (layer === depth && collapsed >= 1) continue;
      var rect = frameAt(layer, slide);
      var reveal = layer === 0 ? smooth((phase + 0.06) / 0.78) : 1;
      var collapse = layer === depth ? collapsed : 0;
      var strength = reveal * (1 - layer * 0.17);
      if (layer === 0) strength *= 0.76 + slide * 0.24;
      panel(rect, strength * (1 - smooth(collapse * 1.4)), layer === 0);
      particles(rect, (index - layer + (layer === 0 ? phase / CYCLE : 1)) * 0.83,
        strength * (1 - collapse * 0.7), layer > 0, collapse ? memoryAt(0, slide, index - depth) : null, collapse);
    }
    ctx.restore();
  }

  function syncLoop() {
    var play = !motion.matches && inView && !document.hidden;
    if (play && frameId === null) frameId = requestAnimationFrame(frame);
    if (!play && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = lastFrame = null;
    }
  }

  function frame(now) {
    var delta = lastFrame === null ? 0 : Math.min(now - lastFrame, 50);
    lastFrame = now;
    time += delta / 1000;
    tilt += (pointer - tilt) * (1 - Math.exp(-delta / 140));
    render();
    frameId = requestAnimationFrame(frame);
  }

  fig.parentElement.classList.add('has-memory');
  fig.classList.add('is-on');
  readColors();
  fit();

  var image = new Image();
  image.onload = function () {
    var sample = document.createElement('canvas');
    sample.width = COLS;
    sample.height = ROWS;
    var c = sample.getContext('2d', { willReadFrequently: true });
    if (!c) return;
    try {
      c.drawImage(image, 0, 0, COLS, ROWS);
      var pixels = c.getImageData(0, 0, COLS, ROWS).data;
      photo = new Float32Array(COLS * ROWS);
      for (var i = 0; i < photo.length; i++) {
        var p = i * 4;
        photo[i] = (pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722) / 255;
      }
    } catch (error) {
      // Some browsers restrict pixel reads from local files.
      return;
    }
    if (frameId === null) render();
  };
  image.src = canvas.dataset.source;

  recallButton.addEventListener('click', function () {
    var now = motion.matches ? STILL_TIME : time;
    var slot = 1 + recallCount++ % (layout.memory[3] - 2);
    requested = { time: now, index: HISTORY + Math.floor(now / CYCLE) - layout.depth - slot };
    if (frameId === null) render();
  });
  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse' || motion.matches) return;
    var rect = canvas.getBoundingClientRect();
    pointer = 2 * clamp((event.clientX - rect.left) / rect.width) - 1;
  }, { passive: true });
  canvas.addEventListener('pointerleave', function () { pointer = 0; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (!inView) pointer = 0;
      syncLoop();
    }).observe(fig);
  }
  document.addEventListener('visibilitychange', syncLoop);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(fig);
  else window.addEventListener('resize', fit);
  theme.addEventListener('change', function () { readColors(); render(); });
  motion.addEventListener('change', function () {
    pointer = tilt = 0;
    requested = null;
    render();
    syncLoop();
  });
  syncLoop();
})();
