/* The globe beside About.

   The Earth drawn in particles: every grain of land is a point, and so are
   the arcs, the markers and the dust around it. On it are the places where I
   have studied and worked, joined by the routes between them. It is a figure
   with a job: it shows where I am now (with the local time), where I came
   from, and what happened in each place, and each place links to the part of
   the site that tells the rest.

   The places are not in this file. Each one is a <button> in the figure's
   markup in index.html, with its coordinates and its text as data attributes,
   and the routes are the figure's data-routes. Edit them there.

   What it does
     - turns to each place in turn, and the caption follows
     - drag to spin it (it keeps a little momentum)
     - hover the surface and the grains under the cursor lift and light up
     - click the surface and a ripple runs round the planet from that point
     - hover a marker, or a place's button, to go there
     - hover a link anywhere on the page that points at one of the places
       (Duke, XJTLU, Liverpool) and the globe turns to it
   On the first view of a visit the grains fly in and assemble the planet.

   WebGL 1, no libraries. It draws only while it is on screen and the tab is
   visible. With reduced motion it is a still globe that still answers to
   drag, hover and the buttons. Without WebGL or JavaScript it is not shown
   and the text has the full width. */
(function () {
  'use strict';

  var fig = document.querySelector('.globe');
  if (!fig) return;
  var grid = fig.closest('.about-grid');
  var stage = fig.querySelector('.globe-stage');
  var canvas = fig.querySelector('canvas');
  var tag = fig.querySelector('.globe-tag');
  function giveUp() { if (grid) grid.classList.add('is-plain'); }

  var gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true,
                                      depth: false, stencil: false, powerPreference: 'low-power' });
  } catch (e) { gl = null; }
  if (!gl) { giveUp(); return; }

  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RAD = Math.PI / 180, TAU = Math.PI * 2, MAX = 8;

  /* --- the places and routes, read from the markup -------------------- */
  function unit(lat, lon) {
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  }
  var stops = [].slice.call(fig.querySelectorAll('.globe-stops button'), 0, MAX).map(function (b) {
    var d = b.dataset, lat = +d.lat * RAD, lon = +d.lon * RAD;
    return { el: b, id: d.stop, lat: lat, lon: lon, v: unit(lat, lon), now: b.hasAttribute('data-now'),
             tz: d.tz || '', match: d.match || '', on: 0, sx: 0, sy: 0, front: false };
  });
  if (!stops.length) { giveUp(); return; }
  function stopIndex(id) { for (var i = 0; i < stops.length; i++) if (stops[i].id === id) return i; return -1; }
  var routes = (fig.dataset.routes || '').split(/\s+/).map(function (r) {
    var ab = r.split('-');
    return { a: stopIndex(ab[0]), b: stopIndex(ab[1]), on: 0 };
  }).filter(function (r) { return r.a >= 0 && r.b >= 0; }).slice(0, MAX);

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* --- shaders --------------------------------------------------------- */
  var HEAD =
    'uniform mat3 uRot; uniform vec2 uCenter; uniform float uRadius; uniform vec2 uView;' +
    'uniform float uDpr; uniform float uTime; uniform float uScale;' +
    'vec4 toClip(vec3 r) { vec2 px = uCenter + vec2(r.x, -r.y) * uRadius;' +
    '  vec2 c = px / uView * 2.0 - 1.0; return vec4(c.x, -c.y, 0.0, 1.0); }' +
    'float ang(vec3 a, vec3 b) { return acos(clamp(dot(a, b), -1.0, 1.0)); }';
  var FRAG_HEAD =
    '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

  // The sphere itself and the air around it: one quad, shaded per pixel.
  var BODY_VS = 'attribute vec2 aQ; void main() { gl_Position = vec4(aQ, 0.0, 1.0); }';
  var BODY_FS = FRAG_HEAD +
    'uniform vec2 uCenterGL; uniform float uRadius;' +
    'uniform vec3 uBodyA; uniform vec3 uBodyB; uniform vec3 uRim; uniform vec3 uAtmo;' +
    'uniform float uBodyAlpha; uniform float uRimK; uniform float uAtmoAlpha; uniform float uFade; uniform float uEdge;' +
    'void main() {' +
    '  vec2 q = (gl_FragCoord.xy - uCenterGL) / uRadius; float d = length(q);' +
    '  float glow = uAtmoAlpha * exp(-max(d - 1.0, 0.0) * 6.5) * (1.0 - smoothstep(uEdge * 0.78, uEdge * 0.98, d));' +
    '  vec4 outside = vec4(uAtmo * glow, glow);' +
    '  vec4 col = outside;' +
    '  if (d < 1.0) {' +
    '    float z = sqrt(1.0 - d * d);' +
    '    float l = max(0.0, dot(vec3(q, z), normalize(vec3(-0.45, 0.55, 0.7))));' +
    '    vec3 c = mix(uBodyA, uBodyB, l);' +
    '    c = mix(c, uRim, pow(1.0 - z, 2.4) * uRimK);' +
    '    vec4 inside = vec4(c * uBodyAlpha, uBodyAlpha);' +
    '    float edge = smoothstep(1.0, 1.0 - 2.0 / uRadius, d);' +
    '    col = mix(outside, inside, edge);' +
    '  }' +
    '  gl_FragColor = col * uFade;' +
    '}';

  // Land: one point per grain. Grains lift and light under the pointer, in a
  // ripple, and around the place in focus; on the far side they show faintly
  // through the globe. At the opening they fly in from a scattered shell.
  var LAND_VS = HEAD +
    'attribute vec3 aPos; attribute vec2 aSeed;' +
    'uniform float uIntro; uniform vec3 uPointer; uniform float uPointerK; uniform vec4 uRip[4];' +
    'uniform vec3 uFocus; uniform float uFocusK; uniform float uBack; uniform float uSize;' +
    'varying float vA; varying float vHot; varying float vShade;' +
    'void main() {' +
    '  float lift = 0.0; float hot = 0.0;' +
    '  float pa = ang(aPos, uPointer); float pk = uPointerK * exp(-pa * pa / 0.0055);' +
    '  lift += pk * 0.06; hot += pk * 0.75;' +
    '  for (int i = 0; i < 4; i++) {' +
    '    float age = uTime - uRip[i].w;' +
    '    if (age > 0.0 && age < 2.4) {' +
    '      float d = (ang(aPos, uRip[i].xyz) - age * 1.45) / 0.05;' +
    '      float w = exp(-d * d) * (1.0 - age / 2.4);' +
    '      lift += w * 0.04; hot += w * 0.8;' +
    '    }' +
    '  }' +
    '  float fa = ang(aPos, uFocus); hot += uFocusK * exp(-fa * fa / 0.016) * 0.6;' +
    '  float k = clamp((uIntro - aSeed.x * 0.45) / 0.55, 0.0, 1.0); k = 1.0 - pow(1.0 - k, 3.0);' +
    '  vec3 j = vec3(aSeed.y, fract(aSeed.x * 7.13), fract(aSeed.y * 3.71)) - 0.5;' +
    '  vec3 far = normalize(aPos + j * 1.7) * (1.6 + aSeed.y * 1.5);' +
    '  vec3 r = uRot * mix(far, aPos * (1.0 + lift), k);' +
    '  gl_Position = toClip(r);' +
    '  float front = r.z;' +
    '  float a = front > 0.0 ? 0.3 + 0.7 * smoothstep(0.0, 0.3, front) : uBack * smoothstep(0.0, 0.25, -front);' +
    '  float tw = 0.86 + 0.14 * sin(uTime * 1.7 + aSeed.x * 43.0);' +
    '  vShade = max(0.0, dot(normalize(r), normalize(vec3(-0.45, 0.55, 0.7))));' +
    '  vA = a * tw * (0.3 + 0.7 * k); vHot = hot;' +
    '  gl_PointSize = max(1.0, uSize * uDpr * (front > 0.0 ? 0.82 + 0.3 * front : 0.7) * (1.0 + hot * 0.8));' +
    '}';
  var LAND_FS = FRAG_HEAD +
    'uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColHot;' +
    'varying float vA; varying float vHot; varying float vShade;' +
    'void main() {' +
    '  float d = length(gl_PointCoord - 0.5) * 2.0; float m = smoothstep(1.0, 0.45, d);' +
    '  vec3 c = mix(mix(uColA, uColB, vShade), uColHot, clamp(vHot, 0.0, 1.0));' +
    '  float a = min(1.0, m * vA * (1.0 + vHot * 0.7));' +
    '  gl_FragColor = vec4(c * a, a);' +
    '}';

  // Routes: a line of points along each great circle, lifted off the surface,
  // with a bright packet travelling along it.
  var ARC_VS = HEAD +
    'attribute vec3 aPos; attribute vec2 aInfo;' +
    'uniform float uArcOn[' + MAX + ']; uniform float uReveal; uniform float uBack;' +
    'varying float vA; varying float vHead;' +
    'void main() {' +
    '  vec3 r = uRot * aPos; gl_Position = toClip(r);' +
    '  float on = uArcOn[int(aInfo.y + 0.5)];' +
    '  float behind = fract(uTime * 0.2 + aInfo.y * 0.37 - aInfo.x);' +
    '  float head = exp(-behind * 7.0);' +
    '  float a = (0.2 + 0.5 * on) + head * (0.4 + 0.6 * on);' +
    '  if (r.z < 0.0) a *= length(r.xy) < 1.0 ? uBack * 1.6 : 0.55;' +
    '  vA = a * step(aInfo.x, uReveal); vHead = head;' +
    '  gl_PointSize = max(1.0, uDpr * uScale * (1.5 + head * 2.6 * (0.5 + 0.5 * on)));' +
    '}';
  var ARC_FS = FRAG_HEAD +
    'uniform vec3 uColArc; uniform vec3 uColHot; varying float vA; varying float vHead;' +
    'void main() {' +
    '  float d = length(gl_PointCoord - 0.5) * 2.0; float m = smoothstep(1.0, 0.3, d);' +
    '  vec3 c = mix(uColArc, uColHot, vHead * 0.8); float a = min(1.0, m * vA);' +
    '  gl_FragColor = vec4(c * a, a);' +
    '}';

  // Markers (halo, core, two pulsing rings, a short beam) and the dust.
  var SPR_VS = HEAD +
    'attribute vec3 aPos; attribute vec4 aA;' +
    'uniform float uStopOn[' + MAX + ']; uniform float uReveal; uniform mat3 uDust; uniform float uEdge;' +
    'varying float vKind; varying float vA;' +
    'void main() {' +
    '  float kind = aA.x; float ph = aA.y; float size = 1.0; float a = 1.0; vec3 r;' +
    '  if (kind > 3.5) {' +
    '    r = uDust * aPos;' +
    '    a = (0.2 + 0.8 * aA.w) * (0.55 + 0.45 * sin(uTime * 0.9 + ph * 40.0)) * smoothstep(1.03, 1.22, length(r.xy)) * uReveal * (1.0 - smoothstep(uEdge * 0.8, uEdge * 0.98, max(abs(r.x), abs(r.y))));' +
    '    if (r.z < 0.0) a *= 0.6;' +
    '    size = 0.9 + aA.w * 1.5;' +
    '  } else {' +
    '    float on = uStopOn[int(aA.z + 0.5)];' +
    '    vec3 p = aPos;' +
    '    if (kind < 0.5) { size = 18.0 + on * 16.0; a = 0.2 + on * 0.3; }' +
    '    else if (kind < 1.5) { size = 4.6 + on * 2.8; a = 1.0; }' +
    '    else if (kind < 2.5) { float q = fract(uTime * 0.42 + ph); size = mix(7.0, 30.0 + on * 24.0, q); a = (1.0 - q) * (1.0 - q) * (0.4 + on * 0.6); }' +
    '    else { p = aPos * (1.0 + aA.w * (0.04 + on * 0.085)); size = 2.3 - aA.w * 1.0; a = (1.0 - aA.w) * (0.25 + on * 0.75); }' +
    '    r = uRot * p;' +
    '    a *= smoothstep(-0.08, 0.1, r.z) * uReveal;' +
    '  }' +
    '  gl_Position = toClip(r); vKind = kind; vA = a;' +
    '  gl_PointSize = max(1.0, size * uDpr * uScale);' +
    '}';
  var SPR_FS = FRAG_HEAD +
    'uniform vec3 uColCore; uniform vec3 uColRing; uniform vec3 uColDust;' +
    'varying float vKind; varying float vA;' +
    'void main() {' +
    '  float d = length(gl_PointCoord - 0.5) * 2.0; float m; vec3 c;' +
    '  if (vKind < 0.5) { m = exp(-d * d * 3.4) * smoothstep(1.0, 0.8, d); c = uColRing; }' +
    '  else if (vKind < 1.5) { m = smoothstep(1.0, 0.6, d); c = uColCore; }' +
    '  else if (vKind < 2.5) { m = smoothstep(0.17, 0.0, abs(d - 0.8)); c = uColRing; }' +
    '  else if (vKind < 3.5) { m = smoothstep(1.0, 0.35, d); c = mix(uColRing, uColCore, 0.5); }' +
    '  else { m = smoothstep(1.0, 0.3, d); c = uColDust; }' +
    '  float a = min(1.0, m * vA); gl_FragColor = vec4(c * a, a);' +
    '}';

  /* --- GL plumbing ------------------------------------------------------ */
  var P = {}, B = {}, counts = { land: 0, arc: 0, spr: 0 };

  function program(vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }
  function buffer(data) {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b;
  }
  function attribs(prog, buf, layout, stride) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    var off = 0;
    for (var i = 0; i < layout.length; i++) {
      var loc = gl.getAttribLocation(prog.p, layout[i][0]);
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, layout[i][1], gl.FLOAT, false, stride * 4, off * 4); }
      off += layout[i][1];
    }
  }

  /* --- geometry --------------------------------------------------------- */
  var mask = null;                         // { w, h, data } of the land image
  var landFor = 0;                         // the radius the land grains were built for

  function buildLand(R) {
    // Grains about 2.5 CSS px apart at this radius, on a Fibonacci lattice:
    // even in every direction, so it never moires into stripes the way rows
    // of latitude do.
    var step = Math.max(0.015, Math.min(0.045, 2.5 / R));
    var r = rng(11), out = [], n = Math.round(4 * Math.PI / (step * step)), GA = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var sy = 1 - 2 * (i + 0.5) / n, lat = Math.asin(sy);
      var lon = (i * GA) % TAU; if (lon > Math.PI) lon -= TAU;
      var y = Math.min(mask.h - 1, Math.floor((0.5 - lat / Math.PI) * mask.h));
      var x = Math.min(mask.w - 1, Math.max(0, Math.floor((lon / TAU + 0.5) * mask.w)));
      if (mask.data[(y * mask.w + x) * 4] < 128) continue;
      var v = unit(lat, lon);
      out.push(v[0], v[1], v[2], r(), r());
    }
    if (B.land) gl.deleteBuffer(B.land);
    B.land = buffer(new Float32Array(out));
    counts.land = out.length / 5;
    landFor = R;
  }

  function buildArcs() {
    var out = [];
    routes.forEach(function (rt, k) {
      var a = stops[rt.a].v, b = stops[rt.b].v;
      var om = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
      var n = Math.max(10, Math.ceil(om * 160 / 1.3)), h = 0.055 + 0.25 * om / Math.PI, so = Math.sin(om) || 1;
      for (var i = 0; i <= n; i++) {
        var t = i / n, wa = Math.sin((1 - t) * om) / so, wb = Math.sin(t * om) / so;
        var lift = 1 + h * Math.sin(Math.PI * t);
        out.push((a[0] * wa + b[0] * wb) * lift, (a[1] * wa + b[1] * wb) * lift, (a[2] * wa + b[2] * wb) * lift, t, k);
      }
    });
    B.arc = buffer(new Float32Array(out));
    counts.arc = out.length / 5;
  }

  function buildSprites() {
    var out = [], r = rng(29), i;
    // dust first, so the markers draw over it
    for (i = 0; i < 380; i++) {
      var u = r() * 2 - 1, th = r() * TAU, rad = 1.2 + Math.pow(r(), 1.6) * 1.1, s = Math.sqrt(1 - u * u);
      out.push(rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th), 4, r(), 0, r());
    }
    stops.forEach(function (st, k) {
      var v = st.v;
      out.push(v[0], v[1], v[2], 0, 0, k, 0);
      out.push(v[0], v[1], v[2], 2, r(), k, 0);
      out.push(v[0], v[1], v[2], 2, r() + 0.5, k, 0);
      for (i = 1; i <= 7; i++) out.push(v[0], v[1], v[2], 3, 0, k, i / 7);
      out.push(v[0], v[1], v[2], 1, 0, k, 0);
    });
    B.spr = buffer(new Float32Array(out));
    counts.spr = out.length / 7;
  }

  function initGL() {
    P.body = program(BODY_VS, BODY_FS);
    P.land = program(LAND_VS, LAND_FS);
    P.arc = program(ARC_VS, ARC_FS);
    P.spr = program(SPR_VS, SPR_FS);
    B.quad = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    buildArcs(); buildSprites();
    B.land = null; landFor = 0;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);     // premultiplied, in both themes
  }

  /* --- colours, from the page's tokens ---------------------------------- */
  var C = {};
  function hex(v) {
    v = v.trim().replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var n = parseInt(v, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function readColors() {
    var cs = getComputedStyle(fig);
    var col = function (n) { return hex(cs.getPropertyValue(n) || '#888888'); };
    var num = function (n, d) { var v = parseFloat(cs.getPropertyValue(n)); return isNaN(v) ? d : v; };
    C.landA = col('--gb-land-a'); C.landB = col('--gb-land-b'); C.hot = col('--gb-hot');
    C.bodyA = col('--gb-body-a'); C.bodyB = col('--gb-body-b'); C.rim = col('--gb-rim'); C.atmo = col('--gb-atmo');
    C.arc = col('--gb-arc'); C.core = col('--gb-core'); C.ring = col('--gb-ring'); C.dust = col('--gb-dust');
    C.bodyAlpha = num('--gb-body-alpha', 0.9); C.rimK = num('--gb-rim-k', 0.5);
    C.atmoAlpha = num('--gb-atmo-alpha', 0.3); C.back = num('--gb-back', 0.14);
  }

  /* --- view state -------------------------------------------------------- */
  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 100;
  var yaw = 0, pitch = 0, yawV = 0, pitchV = 0, yawT = 0, pitchT = 0, flying = true;
  var tiltX = 0, tiltY = 0, tiltTX = 0, tiltTY = 0;
  var rot = new Float32Array(9), dustRot = new Float32Array(9);
  var active = 0, holdUntil = 0, held = 0, inside = false;
  var intro = 1, introT0 = -1, introPending = false;
  var pointerM = [0, 0, 1], pointerK = 0, pointerOn = false, pointerXY = null;
  var ripples = new Float32Array(16), ripN = 0;
  var drag = null, dragging = false;
  var focusK = 0, t0 = performance.now(), clock = 0;

  for (var q = 0; q < 4; q++) ripples[q * 4 + 3] = -100;

  function fit() {
    var r = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    cx = W / 2; cy = H / 2;
    R = Math.min(s.width, s.height) * 0.45;
    if (mask && (!landFor || Math.abs(R - landFor) / landFor > 0.22)) buildLand(R);
  }

  function setRot(m, y, p) {
    var c = Math.cos(y), s = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    m[0] = c; m[1] = sp * s; m[2] = -cp * s;
    m[3] = 0; m[4] = cp; m[5] = sp;
    m[6] = s; m[7] = -sp * c; m[8] = cp * c;
  }
  function apply(m, v) {                    // rotate a model vector into view space
    return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
  }
  function unapply(m, v) {                  // and back (the transpose)
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  /* --- the caption -------------------------------------------------------- */
  var el = {
    city: fig.querySelector('.globe-city'), now: fig.querySelector('.globe-now'), time: fig.querySelector('.globe-time'),
    org: fig.querySelector('.globe-org'), role: fig.querySelector('.globe-role'),
    years: fig.querySelector('.globe-years'), link: fig.querySelector('.globe-link')
  };
  function localTime(tz) {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    } catch (e) { return ''; }
  }
  function caption() {
    var st = stops[active], d = st.el.dataset;
    el.city.textContent = d.city || st.el.textContent;
    el.org.textContent = d.org || '';
    el.role.textContent = d.role || '';
    el.years.textContent = d.years || '';
    el.link.textContent = d.link || '';
    el.link.setAttribute('href', d.href || 'experience.html');
    el.link.hidden = !d.link;
    el.now.hidden = !st.now;
    var time = st.now && st.tz ? localTime(st.tz) : '';
    el.time.hidden = !time;
    el.time.textContent = time ? 'local time ' + time : '';
    tag.textContent = st.el.textContent;
    stops.forEach(function (s, i) { s.el.setAttribute('aria-pressed', String(i === active)); });
  }
  setInterval(function () { if (stops[active].now) caption(); }, 30000);

  function select(i, holdMs) {
    if (i < 0 || i >= stops.length) return;
    if (i !== active) { active = i; caption(); }
    yawT = -stops[i].lon; pitchT = Math.max(-1, Math.min(1, stops[i].lat * 0.82));
    flying = true;
    holdUntil = clock + (holdMs || 0);
    if (still) { yaw = yawT; pitch = pitchT; yawV = pitchV = 0; }
    invalidate();
  }

  /* --- drawing ------------------------------------------------------------ */
  function common(prog) {
    var u = prog.u;
    gl.uniformMatrix3fv(u.uRot, false, rot);
    gl.uniform2f(u.uCenter, cx * dpr, cy * dpr);
    gl.uniform1f(u.uRadius, R * dpr);
    gl.uniform2f(u.uView, canvas.width, canvas.height);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uTime, clock / 1000);
    gl.uniform1f(u.uScale, Math.max(0.6, Math.min(1.25, R / 150)));
  }

  var stopOn = new Float32Array(MAX), arcOn = new Float32Array(MAX);

  function draw() {
    var i, u;
    setRot(rot, yaw + tiltX, pitch + tiltY);
    setRot(dustRot, yaw * 0.35 + clock * 0.00002, pitch * 0.35);
    var reveal = Math.max(0, Math.min(1, (intro - 0.5) / 0.5));
    for (i = 0; i < stops.length; i++) stopOn[i] = Math.min(1, stops[i].on + (stops[i].now ? 0.3 : 0));
    for (i = 0; i < routes.length; i++) arcOn[i] = routes[i].on;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // dust
    gl.useProgram(P.spr.p); common(P.spr); u = P.spr.u;
    gl.uniformMatrix3fv(u.uDust, false, dustRot);
    gl.uniform1f(u.uEdge, Math.min(W, H) / 2 / R);
    gl.uniform1fv(u.uStopOn, stopOn);
    gl.uniform1f(u.uReveal, reveal);
    gl.uniform3fv(u.uColCore, C.core); gl.uniform3fv(u.uColRing, C.ring); gl.uniform3fv(u.uColDust, C.dust);
    attribs(P.spr, B.spr, [['aPos', 3], ['aA', 4]], 7);
    gl.drawArrays(gl.POINTS, 0, 380);

    // the sphere and its air
    gl.useProgram(P.body.p); u = P.body.u;
    gl.uniform2f(u.uCenterGL, cx * dpr, canvas.height - cy * dpr);
    gl.uniform1f(u.uRadius, R * dpr);
    gl.uniform3fv(u.uBodyA, C.bodyA); gl.uniform3fv(u.uBodyB, C.bodyB);
    gl.uniform3fv(u.uRim, C.rim); gl.uniform3fv(u.uAtmo, C.atmo);
    gl.uniform1f(u.uBodyAlpha, C.bodyAlpha); gl.uniform1f(u.uRimK, C.rimK);
    gl.uniform1f(u.uAtmoAlpha, C.atmoAlpha);
    gl.uniform1f(u.uEdge, Math.min(W, H) / 2 / R);
    gl.uniform1f(u.uFade, Math.min(1, intro * 2.2));
    attribs(P.body, B.quad, [['aQ', 2]], 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // land
    if (B.land) {
      gl.useProgram(P.land.p); common(P.land); u = P.land.u;
      gl.uniform1f(u.uIntro, intro);
      gl.uniform3fv(u.uPointer, pointerM); gl.uniform1f(u.uPointerK, pointerK);
      gl.uniform4fv(u.uRip, ripples);
      gl.uniform3fv(u.uFocus, stops[active].v); gl.uniform1f(u.uFocusK, focusK);
      gl.uniform1f(u.uBack, C.back);
      gl.uniform1f(u.uSize, 1.25 + 0.5 * Math.min(1.2, R / 150));
      gl.uniform3fv(u.uColA, C.landA); gl.uniform3fv(u.uColB, C.landB); gl.uniform3fv(u.uColHot, C.hot);
      attribs(P.land, B.land, [['aPos', 3], ['aSeed', 2]], 5);
      gl.drawArrays(gl.POINTS, 0, counts.land);
    }

    // routes
    gl.useProgram(P.arc.p); common(P.arc); u = P.arc.u;
    gl.uniform1fv(u.uArcOn, arcOn);
    gl.uniform1f(u.uReveal, reveal); gl.uniform1f(u.uBack, C.back);
    gl.uniform3fv(u.uColArc, C.arc); gl.uniform3fv(u.uColHot, C.hot);
    attribs(P.arc, B.arc, [['aPos', 3], ['aInfo', 2]], 5);
    gl.drawArrays(gl.POINTS, 0, counts.arc);

    // markers
    gl.useProgram(P.spr.p);
    attribs(P.spr, B.spr, [['aPos', 3], ['aA', 4]], 7);
    gl.drawArrays(gl.POINTS, 380, counts.spr - 380);

    // where each place is on screen: for the tag, and for hit testing
    var cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    for (i = 0; i < stops.length; i++) {
      var v = apply(rot, stops[i].v);
      stops[i].sx = cx + v[0] * R; stops[i].sy = cy - v[1] * R; stops[i].front = v[2] > 0.08;
    }
    var st = stops[active];
    if (st.front && intro > 0.9) {
      tag.style.opacity = '1';
      tag.style.transform = 'translate(' + (st.sx + cr.left - sr.left).toFixed(1) + 'px,' + (st.sy + cr.top - sr.top).toFixed(1) + 'px)';
    } else {
      tag.style.opacity = '0';
    }
  }

  /* --- one step of motion --------------------------------------------------- */
  function step(dt) {
    var s = dt / 1000, i;
    if (introPending) { introPending = false; introT0 = clock; holdUntil = clock + 7500; }
    if (introT0 >= 0) {
      intro = Math.min(1, (clock - introT0) / 2400);
      if (intro >= 1) introT0 = -1;
    }
    if (!dragging) {
      if (flying) {
        var dy = wrap(yawT - yaw), dp = pitchT - pitch;
        yawV += (dy * 9 - yawV * 6) * s; pitchV += (dp * 9 - pitchV * 6) * s;
        yaw += yawV * s; pitch += pitchV * s;
      } else {
        yaw += yawV * s; pitch += pitchV * s;
        yawV *= Math.pow(0.08, s); pitchV *= Math.pow(0.02, s);
        pitch = Math.max(-1.2, Math.min(1.2, pitch));
      }
    }
    tiltX += (tiltTX - tiltX) * Math.min(1, s * 4); tiltY += (tiltTY - tiltY) * Math.min(1, s * 4);
    pointerK += ((pointerOn && !dragging ? 1 : 0) - pointerK) * Math.min(1, s * 9);
    focusK += ((flying ? 1 : 0.35) - focusK) * Math.min(1, s * 3);
    for (i = 0; i < stops.length; i++) stops[i].on += ((i === active ? 1 : 0) - stops[i].on) * Math.min(1, s * 5);
    for (i = 0; i < routes.length; i++) {
      var hit = routes[i].a === active || routes[i].b === active ? 1 : 0.3;
      routes[i].on += (hit - routes[i].on) * Math.min(1, s * 4);
    }
    // the tour: when nobody is touching it, move on to the next place
    if (!still && !inside && !held && !dragging && introT0 < 0 && !introPending && clock > holdUntil) {
      select((active + 1) % stops.length, 6500);
    }
  }

  var running = false, onScreen = true, last = 0, queued = false;
  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(60, now - last) : 16.7;
    last = now; clock = now - t0;
    step(dt); hover(); draw();
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || still || !onScreen || document.hidden || !mask) return;
    running = true; last = 0; requestAnimationFrame(frame);
  }
  function stop() { running = false; }
  function invalidate() {                   // one frame on demand, for the still version
    if (!still || queued || !mask) return;
    queued = true;
    requestAnimationFrame(function (now) {
      queued = false; clock = now - t0;
      pointerK = pointerOn && !dragging ? 1 : 0; focusK = 0.6;
      stops.forEach(function (s, i) { s.on = i === active ? 1 : 0; });
      routes.forEach(function (r) { r.on = r.a === active || r.b === active ? 1 : 0.3; });
      hover(); draw();
    });
  }

  /* --- pointer ------------------------------------------------------------- */
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onSphere(p) {
    var x = (p.x - cx) / R, y = -(p.y - cy) / R, d = x * x + y * y;
    return d < 1 ? unapply(rot, [x, y, Math.sqrt(1 - d)]) : null;
  }
  function markerAt(p) {
    var best = -1, bd = 15 * 15;
    for (var i = 0; i < stops.length; i++) {
      if (!stops[i].front) continue;
      var dx = stops[i].sx - p.x, dy = stops[i].sy - p.y, d = dx * dx + dy * dy;
      // the place in focus wins ties, so two close markers do not flicker
      if (d < bd - (i === active ? 0 : 1)) { bd = d; best = i; }
    }
    return best;
  }
  function hover() {
    if (!pointerXY || dragging) { stage.style.cursor = dragging ? 'grabbing' : ''; return; }
    var m = onSphere(pointerXY);
    pointerOn = !!m;
    if (m) pointerM = m;
    var k = markerAt(pointerXY);
    stage.style.cursor = k >= 0 ? 'pointer' : m ? 'grab' : '';
    if (k >= 0 && k !== active) select(k, 9000);
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    var p = local(e);
    drag = { x: p.x, y: p.y, lx: p.x, ly: p.y, t: performance.now(), id: e.pointerId };
    dragging = false;
  });
  stage.addEventListener('pointermove', function (e) {
    var p = local(e);
    pointerXY = p;
    if (drag) {
      if (!dragging && Math.hypot(p.x - drag.x, p.y - drag.y) > 4) {
        dragging = true; flying = false;
        try { stage.setPointerCapture(drag.id); } catch (err) { /* not capturable */ }
      }
      if (dragging) {
        var now = performance.now(), dt = Math.max(8, now - drag.t) / 1000;
        var dx = (p.x - drag.lx) / R, dy = (p.y - drag.ly) / R;
        yaw += dx; pitch = Math.max(-1.2, Math.min(1.2, pitch + dy));
        yawV = dx / dt * 0.6; pitchV = dy / dt * 0.3;
        drag.lx = p.x; drag.ly = p.y; drag.t = now;
        holdUntil = clock + 7000;
      }
    }
    invalidate();
  });
  function release(e) {
    if (drag && !dragging && e.type === 'pointerup') {
      var p = local(e), k = markerAt(p), m = onSphere(p);
      if (k >= 0) select(k, 12000);
      else if (m) {
        ripples.set([m[0], m[1], m[2], clock / 1000], (ripN++ % 4) * 4);
        holdUntil = Math.max(holdUntil, clock + 4000);
      }
    }
    if (dragging && still) { yawV = pitchV = 0; }
    drag = null; dragging = false;
    invalidate();
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', function () { pointerXY = null; pointerOn = false; invalidate(); });
  fig.addEventListener('pointerenter', function () { inside = true; });
  fig.addEventListener('pointerleave', function () { inside = false; holdUntil = Math.max(holdUntil, clock + 2500); });
  fig.addEventListener('focusin', function () { held++; });
  fig.addEventListener('focusout', function () { held = Math.max(0, held - 1); holdUntil = Math.max(holdUntil, clock + 2500); });

  // the place buttons
  stops.forEach(function (st, i) {
    st.el.addEventListener('click', function () { select(i, 12000); });
    st.el.addEventListener('pointerenter', function () { select(i, 9000); });
    st.el.addEventListener('focus', function () { select(i, 12000); });
  });

  // links elsewhere on the page that point at one of the places
  stops.forEach(function (st, i) {
    if (!st.match) return;
    var links = document.querySelectorAll('main a[href*="' + st.match + '"], .sidebar a[href*="' + st.match + '"]');
    [].forEach.call(links, function (a) {
      if (fig.contains(a)) return;
      var on = function () { held++; select(i, 4000); };
      var off = function () { held = Math.max(0, held - 1); holdUntil = clock + 4000; };
      a.addEventListener('pointerenter', on); a.addEventListener('pointerleave', off);
      a.addEventListener('focus', on); a.addEventListener('blur', off);
    });
  });

  // the whole page leans the globe a little toward the cursor
  if (!still) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      tiltTX = (e.clientX / window.innerWidth - 0.5) * 0.14;
      tiltTY = (e.clientY / window.innerHeight - 0.5) * 0.1;
    }, { passive: true });
  }

  /* --- go ---------------------------------------------------------------- */
  function boot() {
    try { initGL(); } catch (e) { giveUp(); return false; }
    readColors();
    fit();
    return true;
  }
  if (!boot()) return;

  var startAt = 0;
  stops.forEach(function (s, i) { if (s.now) startAt = i; });
  active = startAt; caption();
  yawT = -stops[active].lon; pitchT = Math.max(-1, Math.min(1, stops[active].lat * 0.82));
  yaw = yawT; pitch = pitchT;

  var first = false;
  try {
    if (!sessionStorage.getItem('lz-globe')) { sessionStorage.setItem('lz-globe', '1'); first = true; }
  } catch (e) { /* no storage: no opening, rather than one on every page view */ }

  var img = new Image();
  img.onload = function () {
    var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    var g = c.getContext('2d');
    if (!g) { giveUp(); return; }
    g.drawImage(img, 0, 0);
    mask = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
    fit();
    t0 = performance.now(); clock = 0;
    if (first && !still) { intro = 0; introPending = true; yaw = yawT - 1.5; }
    holdUntil = 7000;
    fig.classList.add('is-on');
    if (still) { queued = false; invalidate(); } else start();
  };
  img.onerror = giveUp;
  img.src = 'assets/images/globe/land.png';

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen) start(); else stop();
    }).observe(stage);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

  var lastKey = '';
  function onResize() {
    var r = canvas.getBoundingClientRect(), key = Math.round(r.width) + 'x' + Math.round(r.height);
    if (key === lastKey) return;
    lastKey = key; fit(); invalidate();
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  var scheme = window.matchMedia('(prefers-color-scheme: light)');
  if (scheme.addEventListener) scheme.addEventListener('change', function () { readColors(); invalidate(); });

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', function () { if (boot()) { if (still) invalidate(); else start(); } });
})();
