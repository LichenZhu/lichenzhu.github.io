/* The homepage observatory pairs light interference with features extracted
   from the Chapel photograph in the Experience gallery. */
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
  var W, H, radius, haze;
  var frameId = null, lastFrame = null, inView = true;
  var time = 0, offsetX = 0, offsetY = 0, targetX = 0, targetY = 0;
  var TAU = Math.PI * 2, SIZE = 256;
  var sourcePixels = null, photograph = null, features = null;
  var stars = [], fringe = [], bands = [[], [], []], imagePoints = [];
  var SAMPLE_MIN = -0.88, SAMPLE_SPAN = 1.76;

  function clamp(n) { return Math.max(0, Math.min(1, n)); }
  function smooth(n) { n = clamp(n); return n * n * (3 - 2 * n); }
  function hash(n) {
    var v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  for (var i = 0; i < 87; i++) {
    var seed = i * 4;
    stars.push([hash(seed + 1), hash(seed + 2), hash(seed + 3), hash(seed + 4)]);
  }
  for (var j = 0; j < 360; j++) {
    var theta = TAU * hash(j * 3 + 700);
    var r = 0.93 + 0.26 * hash(j * 3 + 701);
    var x = Math.cos(theta) * r, y = Math.sin(theta) * r;
    var left = Math.hypot(x + 0.54, y + 0.12), right = Math.hypot(x - 0.54, y - 0.12);
    fringe.push({ x: x, y: y, phase: 25 * (left - right), gain: hash(j * 3 + 702) });
  }

  function readColors() {
    var css = getComputedStyle(figure);
    ['veil', 'orbit', 'light', 'star', 'shade', 'photo', 'edge'].forEach(function (name) {
      palette[name] = css.getPropertyValue('--observatory-' + name).trim();
    });
    haze = ctx.createRadialGradient(0, 0, 0.32, 0, 0, 1.36);
    haze.addColorStop(0, palette.veil);
    haze.addColorStop(1, 'transparent');
    if (sourcePixels) preparePhoto();
  }

  function rgb(hex) {
    return [1, 3, 5].map(function (start) { return parseInt(hex.slice(start, start + 2), 16); });
  }

  function preparePhoto() {
    var picture = photograph.getContext('2d'), edgeLayer = features.getContext('2d');
    var image = picture.createImageData(SIZE, SIZE), edges = edgeLayer.createImageData(SIZE, SIZE);
    var shade = rgb(palette.shade), highlight = rgb(palette.photo), signal = rgb(palette.edge);
    imagePoints.length = 0;
    for (var n = 0; n < sourcePixels.length; n++) {
      var at = n * 4;
      var row = Math.floor(n / SIZE), col = n % SIZE;
      var value = Math.pow(clamp((sourcePixels[n] - 0.08) / 0.82), 0.86);
      var inside = row > 0 && row < SIZE - 1 && col > 0 && col < SIZE - 1;
      var dx = inside ? sourcePixels[n + 1] - sourcePixels[n - 1] : 0;
      var dy = inside ? sourcePixels[n + SIZE] - sourcePixels[n - SIZE] : 0;
      var contrast = Math.min(1, 2.4 * Math.hypot(dx, dy));
      for (var channel = 0; channel < 3; channel++) {
        image.data[at + channel] = shade[channel] + (highlight[channel] - shade[channel]) * value;
        edges.data[at + channel] = signal[channel];
      }
      image.data[at + 3] = 255;
      edges.data[at + 3] = 215 * contrast;
      if (row % 5 === 0 && col % 5 === 0 && contrast > 0.20) {
        imagePoints.push({
          x: SAMPLE_MIN + SAMPLE_SPAN * col / SIZE,
          y: SAMPLE_MIN + SAMPLE_SPAN * row / SIZE,
          size: 0.31 + contrast * 0.86
        });
      }
    }
    picture.putImageData(image, 0, 0);
    edgeLayer.putImageData(edges, 0, 0);
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
    radius = Math.min(W * 0.397, H * 0.40);
    draw();
  }

  function starfield(cx, cy) {
    ctx.fillStyle = palette.star;
    var spread = Math.min(W * 0.48, radius * 2.4);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var x = (s[0] * 2 - 1) * spread, y = (s[1] * 2 - 1) * radius * 1.37;
      if (x * x + y * y < radius * radius * 0.85) continue;
      var brightness = s[2] * s[2];
      ctx.globalAlpha = 0.08 + brightness * 0.41 + Math.sin(time * 0.58 + s[3] * TAU) * 0.06;
      ctx.beginPath();
      ctx.arc(cx + x, cy + y, 0.38 + brightness * 0.85, 0, TAU);
      ctx.fill();
      if (s[2] > 0.96) {
        var tail = 2 + brightness * 1.5;
        ctx.globalAlpha *= 0.72;
        ctx.fillRect(cx + x - tail, cy + y - 0.33, tail * 2, 0.66);
        ctx.fillRect(cx + x - 0.33, cy + y - tail, 0.66, tail * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function arc(r, start, end, width, opacity, color) {
    ctx.globalAlpha = opacity;
    ctx.lineWidth = width / radius;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, start, end);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function interference() {
    for (var k = 0; k < bands.length; k++) bands[k].length = 0;
    for (var i = 0; i < fringe.length; i++) {
      var p = fringe[i];
      // Phase difference between two circular waves sets the fringe intensity.
      var level = Math.pow(0.5 + 0.5 * Math.cos(p.phase - time * 0.65), 3);
      var intensity = level * (0.38 + p.gain * 0.62);
      if (intensity > 0.09) bands[Math.min(2, Math.floor(intensity * 3))].push(p);
    }
    ctx.fillStyle = palette.light;
    for (var band = 0; band < bands.length; band++) {
      var points = bands[band], size = (0.41 + band * 0.28) / radius;
      ctx.globalAlpha = 0.14 + band * 0.17;
      ctx.beginPath();
      for (var j = 0; j < points.length; j++) {
        var dot = points[j];
        ctx.moveTo(dot.x + size, dot.y);
        ctx.arc(dot.x, dot.y, size, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function orbitingLight(r, angle) {
    ctx.fillStyle = palette.light;
    for (var step = 9; step >= 0; step--) {
      var a = angle - step * 0.013;
      var size = (step === 0 ? 1.55 : 0.93 - step * 0.06) / radius;
      ctx.globalAlpha = (1 - step / 10) * 0.86;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function outerRings() {
    var drift = Math.sin(time * 0.13) * 0.14;
    ctx.strokeStyle = palette.orbit;
    ctx.lineWidth = 0.85 / radius;
    ctx.globalAlpha = 0.40;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.21, 0.38, -0.29, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    arc(1.06, 0, TAU, 0.65, 0.42, palette.orbit);
    arc(1.15, 3.27 + drift, 5.28 + drift, 0.8, 0.54, palette.orbit);
    arc(1.15, 0.43 + drift, 1.95 + drift, 0.8, 0.54, palette.orbit);
    arc(1.15, 5.49 + drift, 5.87 + drift, 1.7, 0.8, palette.light);
    arc(1.15, 2.15 + drift, 2.40 + drift, 1.7, 0.72, palette.light);
    arc(0.98, -0.68, 0.71, 0.9, 0.63, palette.orbit);
    arc(0.98, 2.14, 3.82, 0.9, 0.63, palette.orbit);
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = palette.orbit;
    ctx.lineWidth = 0.7 / radius;
    ctx.beginPath();
    for (var tick = 0; tick < 25; tick++) {
      var a = 0.61 + tick * 0.065;
      var outer = tick % 5 === 0 ? 1.112 : 1.092;
      ctx.moveTo(Math.cos(a) * 1.070, Math.sin(a) * 1.070);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    orbitingLight(1.06, 4.93 + time * 0.46);
    orbitingLight(0.975, 2.38 + time * 0.34);
  }

  function box(x, y, w, h, opacity) {
    var corner = 0.057;
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1 / radius;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(x, y + corner); ctx.lineTo(x, y); ctx.lineTo(x + corner, y);
    ctx.moveTo(x + w - corner, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + corner);
    ctx.moveTo(x + w, y + h - corner); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - corner, y + h);
    ctx.moveTo(x + corner, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - corner);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function scanImage() {
    var phase = (time / 8 + 0.46) % 1;
    var head = smooth(phase / 0.84);
    var scan = SAMPLE_MIN + SAMPLE_SPAN * head;
    for (var strip = 0; strip < 7; strip++) {
      var from = Math.max(0, head - (strip + 1) * 0.035);
      var width = head - strip * 0.035 - from;
      if (width <= 0) break;
      ctx.globalAlpha = 0.66 - strip * 0.087;
      ctx.drawImage(features, SIZE * from, 0, SIZE * width, SIZE,
        SAMPLE_MIN + SAMPLE_SPAN * from, SAMPLE_MIN, SAMPLE_SPAN * width, SAMPLE_SPAN);
    }
    ctx.fillStyle = palette.edge;
    ctx.globalAlpha = 0.67;
    ctx.beginPath();
    for (var i = 0; i < imagePoints.length; i++) {
      var point = imagePoints[i], distance = Math.abs(point.x - scan);
      if (distance > 0.13) continue;
      var r = point.size * (1 - distance / 0.14) / radius;
      ctx.moveTo(point.x + r, point.y);
      ctx.arc(point.x, point.y, r, 0, TAU);
    }
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 0.8 / radius;
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(scan, -0.88); ctx.lineTo(scan, 0.88);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The faint grid marks sampled patches. The two active regions frame the
    // tower and adjacent stonework in this crop of the actual photograph.
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 0.65 / radius;
    ctx.globalAlpha = 0.13;
    ctx.beginPath();
    for (var cell = 1; cell < 9; cell++) {
      var p = SAMPLE_MIN + SAMPLE_SPAN * cell / 9;
      ctx.moveTo(p, -0.88); ctx.lineTo(p, 0.88);
      ctx.moveTo(-0.88, p); ctx.lineTo(0.88, p);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    box(-0.09, -0.31, 0.43, 0.67, 0.46 + 0.46 * Math.exp(-7 * Math.abs(scan - 0.13)));
    box(-0.57, 0.12, 0.34, 0.28, 0.18 + 0.42 * Math.exp(-7 * Math.abs(scan + 0.4)));
  }

  function aperture() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 0.87, 0, TAU);
    ctx.clip();
    ctx.fillStyle = palette.shade;
    ctx.fillRect(-0.88, -0.88, 1.76, 1.76);
    if (sourcePixels) {
      ctx.drawImage(photograph, SAMPLE_MIN, SAMPLE_MIN, SAMPLE_SPAN, SAMPLE_SPAN);
      scanImage();
    } else {
      for (var i = 1; i < 6; i++) {
        arc(i * 0.15, -0.7 + i * 0.38, 1.9 + i * 0.38, 0.8, 0.28, palette.light);
      }
    }
    ctx.restore();
    arc(0.88, 0, TAU, 1.2, 0.8, palette.orbit);
    arc(0.897, 4.20, 5.65, 1.25, 0.84, palette.light);
    arc(0.897, 0.96, 1.45, 1.15, 0.56, palette.light);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!radius) return;
    var cx = W * 0.51, cy = H * (H > W ? 0.47 : 0.5);
    starfield(cx - offsetX * 2, cy - offsetY * 2);
    ctx.save();
    ctx.translate(cx + offsetX * 6, cy + offsetY * 5);
    ctx.scale(radius, radius);
    ctx.fillStyle = haze;
    ctx.fillRect(-1.37, -1.37, 2.74, 2.74);
    interference();
    outerRings();
    aperture();
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
    var easing = 1 - Math.exp(-delta / 180);
    offsetX += (targetX - offsetX) * easing;
    offsetY += (targetY - offsetY) * easing;
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function resetPointer() { targetX = targetY = 0; }

  figure.parentElement.classList.add('has-observatory');
  figure.classList.add('is-on');
  readColors();
  fit();

  var image = new Image();
  image.onload = function () {
    photograph = document.createElement('canvas');
    features = document.createElement('canvas');
    photograph.width = photograph.height = features.width = features.height = SIZE;
    var sample = photograph.getContext('2d');
    if (!sample || !features.getContext('2d')) return;
    var crop = image.naturalHeight * 0.90;
    sample.drawImage(image, (image.naturalWidth - crop) * 0.59, image.naturalHeight - crop,
      crop, crop, 0, 0, SIZE, SIZE);
    try {
      var pixels = sample.getImageData(0, 0, SIZE, SIZE).data;
      sourcePixels = new Float32Array(SIZE * SIZE);
      for (var i = 0; i < sourcePixels.length; i++) {
        var p = i * 4;
        sourcePixels[i] = (pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722) / 255;
      }
      preparePhoto();
      if (frameId === null) draw();
    } catch (error) {
      // Canvas pixel reads can be restricted when the page is opened as a file.
      sourcePixels = null;
    }
  };
  image.src = canvas.dataset.source;

  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse' || motion.matches) return;
    var rect = canvas.getBoundingClientRect();
    targetX = 2 * clamp((event.clientX - rect.left) / rect.width) - 1;
    targetY = 2 * clamp((event.clientY - rect.top) / rect.height) - 1;
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
    offsetX = offsetY = 0;
    draw();
    syncLoop();
  });
  syncLoop();
})();
