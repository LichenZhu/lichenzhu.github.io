/* A long-exposure ribbon of particles, drawn in the homepage's art column. */
(function () {
  'use strict';

  var figure = document.querySelector('.manifold');
  if (!figure) return;
  var canvas = figure.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var theme = window.matchMedia('(prefers-color-scheme: light)');
  var palette = {};
  var W, H, scaleX, scaleY, centerX, centerY, glow;
  var frameId = null, lastFrame = null, inView = true;
  var time = 0, yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;

  // The path curls once and crosses its own wake. Its two ends stay open.
  var knots = [
    [-1.05, 0.84, -0.36], [-0.62, 0.71, -0.25], [-0.02, 0.62, 0.09],
    [0.49, 0.37, 0.40], [0.66, -0.05, 0.25], [0.47, -0.47, -0.19],
    [0.02, -0.64, -0.45], [-0.49, -0.37, -0.16], [-0.62, 0.12, 0.25],
    [-0.32, 0.26, 0.53], [0.10, 0.03, 0.37], [0.50, -0.44, -0.02],
    [0.93, -0.92, -0.32]
  ];
  var ROWS = 192, STRANDS = 21;
  var centers = [], grains = new Float32Array(ROWS * STRANDS);
  var screenX = new Float32Array(grains.length), screenY = new Float32Array(grains.length);
  var screenDepth = new Float32Array(grains.length);
  var taper = new Float32Array(ROWS);
  var dots = [[], [], [], [], []];
  var radii = [0.39, 0.60, 0.88, 0.60, 1.05];
  var alphas = [0.36, 0.60, 0.92, 0.60, 0.94];

  function clamp(n) { return Math.max(0, Math.min(1, n)); }
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function spline(t) {
    var x = t * (knots.length - 1);
    var i = Math.min(Math.floor(x), knots.length - 2);
    var f = x - i, f2 = f * f, f3 = f2 * f;
    var a = knots[Math.max(0, i - 1)], b = knots[i];
    var c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
    return b.map(function (v, k) {
      return 0.5 * (2 * v + (c[k] - a[k]) * f
        + (2 * a[k] - 5 * v + 4 * c[k] - d[k]) * f2
        + (-a[k] + 3 * v - 3 * c[k] + d[k]) * f3);
    });
  }

  for (var i = 0; i < ROWS; i++) {
    var t = i / (ROWS - 1);
    var point = spline(t);
    var a = spline(Math.max(0, t - 0.004)), b = spline(Math.min(1, t + 0.004));
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var length = Math.hypot(dx, dy);
    taper[i] = Math.pow(Math.sin(t * Math.PI), 0.52);
    centers.push({
      x: point[0], y: point[1], z: point[2], nx: -dy / length, ny: dx / length,
      width: 0.018 + 0.22 * Math.pow(Math.sin(t * Math.PI), 0.73)
    });
  }
  for (var j = 0; j < grains.length; j++) grains[j] = hash(j + 31);

  function readColors() {
    var css = getComputedStyle(figure);
    ['filament', 'grain', 'shine', 'amber', 'spark', 'glow'].forEach(function (name) {
      palette[name] = css.getPropertyValue('--ribbon-' + name).trim();
    });
    if (W) makeGlow();
  }

  function makeGlow() {
    glow = ctx.createRadialGradient(centerX + scaleX * 0.04, centerY, 0,
      centerX + scaleX * 0.04, centerY, Math.max(1, Math.min(scaleX * 1.05, scaleY * 1.12)));
    glow.addColorStop(0, palette.glow);
    glow.addColorStop(1, 'transparent');
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
    ctx.setTransform(width / (W || 1), 0, 0, height / (H || 1), 0, 0);
    var tall = H >= W;
    scaleX = Math.min(W * 0.43, H * 0.84);
    scaleY = Math.min(H * (tall ? 0.39 : 0.43), W * 0.61);
    centerX = W * 0.52;
    centerY = H * (tall ? 0.46 : 0.50);
    makeGlow();
    draw();
  }

  function project() {
    var cy = Math.cos(yaw - 0.11), sy = Math.sin(yaw - 0.11);
    var cp = Math.cos(pitch + 0.04), sp = Math.sin(pitch + 0.04);

    for (var row = 0; row < ROWS; row++) {
      var t = row / (ROWS - 1), p = centers[row];
      var roll = 1.7 + t * 6.9 + Math.sin(t * 12 - time * 0.85) * 0.21;
      var across = Math.cos(roll), depth = Math.sin(roll);
      var ripple = Math.sin(t * 17 - time * 1.1) * 0.026;
      for (var strand = 0; strand < STRANDS; strand++) {
        var index = row * STRANDS + strand;
        var u = 2 * strand / (STRANDS - 1) - 1;
        var surface = u * p.width;
        var x = p.x + p.nx * (surface * across + ripple);
        var y = p.y + p.ny * (surface * across + ripple);
        var z = p.z + surface * depth + Math.sin(u * 2.6 + t * 11 - time) * 0.028 * taper[row];
        var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        var perspective = 3.4 / (3.4 - z2);
        screenX[index] = centerX + x1 * perspective * scaleX;
        screenY[index] = centerY + y2 * perspective * scaleY;
        screenDepth[index] = z2;
      }
    }
  }

  function placeGrains(light) {
    for (var k = 0; k < dots.length; k++) dots[k].length = 0;
    for (var strand = 0; strand < STRANDS; strand++) {
      var edge = Math.abs(2 * strand / (STRANDS - 1) - 1);
      var drift = time * (5 + strand * 0.19);
      for (var row = 0; row < ROWS - 1; row++) {
        var grain = grains[row * STRANDS + strand];
        var position = (row + grain + drift) % (ROWS - 1);
        var low = Math.floor(position), f = position - low;
        if (grain > 0.45 + taper[low] * 0.42) continue;

        var i = low * STRANDS + strand, j = i + STRANDS;
        var distance = (position / (ROWS - 1) - light) * 9.2;
        var warm = Math.exp(-distance * distance);
        var detail = grain * 0.62 + screenDepth[i] * 0.14 + edge * 0.1 + warm * 0.23;
        var band = detail > 0.54 ? 2 : detail > 0.32 ? 1 : 0;
        if (warm > 0.36 && grain > 0.30 + edge * 0.20) band = detail > 0.56 ? 4 : 3;
        var jitter = (grain - 0.5) * 2.3 * (0.4 + edge * 0.7);
        var p = centers[low];
        dots[band].push(
          screenX[i] + (screenX[j] - screenX[i]) * f + jitter * p.nx,
          screenY[i] + (screenY[j] - screenY[i]) * f + jitter * p.ny
        );
      }
    }
  }

  function filaments() {
    ctx.strokeStyle = palette.filament;
    ctx.lineWidth = 0.65;
    for (var strand = 1; strand < STRANDS; strand += 3) {
      ctx.globalAlpha = 0.25 + Math.abs(2 * strand / (STRANDS - 1) - 1) * 0.42;
      ctx.beginPath();
      ctx.moveTo(screenX[strand], screenY[strand]);
      for (var row = 1; row < ROWS; row++) {
        var index = row * STRANDS + strand;
        ctx.lineTo(screenX[index], screenY[index]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function particles() {
    var size = Math.min(1.15, Math.max(0.72, scaleX / 150));
    var colors = [palette.grain, palette.grain, palette.shine, palette.amber, palette.spark];
    for (var k = 0; k < dots.length; k++) {
      var points = dots[k], r = radii[k] * size;
      ctx.fillStyle = colors[k];
      ctx.globalAlpha = alphas[k];
      ctx.beginPath();
      for (var i = 0; i < points.length; i += 2) {
        ctx.moveTo(points[i] + r, points[i + 1]);
        ctx.arc(points[i], points[i + 1], r, 0, 2 * Math.PI);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function streaks(light) {
    ctx.strokeStyle = palette.spark;
    ctx.lineWidth = 0.8;
    for (var strand = 3; strand < STRANDS; strand += 5) {
      var head = Math.floor(light * (ROWS - 1) - strand * 0.7);
      if (head < 4 || head >= ROWS) continue;
      for (var tail = 4; tail > 0; tail--) {
        var i = (head - tail) * STRANDS + strand, j = i + STRANDS;
        ctx.globalAlpha = 0.73 - tail * 0.14;
        ctx.beginPath();
        ctx.moveTo(screenX[i], screenY[i]);
        ctx.lineTo(screenX[j], screenY[j]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!W || !H) return;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    var beat = (time / 9.2 + 0.40) % 1;
    var light = -0.12 + 1.24 * beat * beat * (3 - 2 * beat);
    project();
    placeGrains(light);
    filaments();
    particles();
    streaks(light);
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
    var easing = 1 - Math.exp(-delta / 190);
    yaw += (targetYaw - yaw) * easing;
    pitch += (targetPitch - pitch) * easing;
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function resetPointer() { targetYaw = targetPitch = 0; }

  figure.parentElement.classList.add('has-ribbon');
  figure.classList.add('is-on');
  readColors();
  fit();

  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse' || motion.matches) return;
    var rect = canvas.getBoundingClientRect();
    targetYaw = (clamp((event.clientX - rect.left) / rect.width) - 0.5) * 0.32;
    targetPitch = (clamp((event.clientY - rect.top) / rect.height) - 0.5) * 0.20;
  }, { passive: true });
  canvas.addEventListener('pointerleave', resetPointer);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (!inView) resetPointer();
      syncLoop();
    }).observe(figure);
  }
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(figure);
  else window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', syncLoop);
  theme.addEventListener('change', function () { readColors(); draw(); });
  motion.addEventListener('change', function () {
    resetPointer();
    yaw = pitch = 0;
    draw();
    syncLoop();
  });
  syncLoop();
})();
