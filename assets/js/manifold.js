/* A star disk and a particle exposure of Duke Chapel share the same grains. */
(function () {
  'use strict';

  const figure = document.querySelector('.manifold');
  if (!figure) return;
  const canvas = figure.querySelector('canvas');
  const dukeLink = document.querySelector('#about [data-chapel]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const light = window.matchMedia('(prefers-color-scheme: light)');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return;

  const photo = new Image();
  photo.src = canvas.dataset.source;
  const COUNT = 56000;
  const TAU = 2 * Math.PI;
  let seed = 7351;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function normal() { return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(TAU * random()); }
  const orbits = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const inner = random() < 0.12;
    const r = inner ? 0.18 + Math.abs(normal()) * 0.095 : 0.19 + Math.pow(random(), 1.15) * 0.99;
    const diffuse = random() < 0.34;
    const theta = diffuse ? random() * TAU : TAU * Math.floor(random() * 3) / 3 +
      2.8 * Math.log(r + 0.12) + normal() * (0.17 + r * 0.14);
    orbits.set([r, theta, normal() * (diffuse ? 0.075 : 0.025) * (0.4 + r), random()], i * 4);
  }

  // Importance sampling places grains along actual changes in luminance.
  function sampleChapel() {
    const size = 192;
    const surface = document.createElement('canvas');
    surface.width = surface.height = size;
    const ctx = surface.getContext('2d');
    if (!ctx) return null;
    const w = photo.naturalWidth, h = photo.naturalHeight;
    ctx.drawImage(photo, w * 0.25, h * 0.31, w * 0.49, h * 0.59, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const luminance = new Float32Array(size * size);
    const cumulative = new Float64Array(luminance.length);
    for (let n = 0; n < luminance.length; n++) {
      const i = 4 * n;
      luminance[n] = (pixels[i] * 0.213 + pixels[i + 1] * 0.715 + pixels[i + 2] * 0.072) / 255;
    }
    let total = 0;
    for (let n = 0; n < luminance.length; n++) {
      const x = n % size, y = Math.floor(n / size);
      const dx = luminance[n] - luminance[x ? n - 1 : n];
      const dy = luminance[n] - luminance[y ? n - size : n];
      const radius = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5);
      const fade = Math.min(1, Math.max(0, (0.5 - radius) / 0.17)) ** 2;
      total += fade * (0.065 + 0.32 * luminance[n] + 2.5 * Math.hypot(dx, dy));
      cumulative[n] = total;
    }
    const data = new Float32Array(COUNT * 6);
    for (let i = 0; i < COUNT; i++) {
      const target = random() * total;
      let lo = 0, hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cumulative[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const u = (lo % size + random()) / size;
      const v = (Math.floor(lo / size) + random()) / size;
      const lum = luminance[lo];
      data.set([(u - 0.5) * 1.83, (0.51 - v) * 1.67, (lum - 0.47) * 0.27,
        pixels[lo * 4] / 255, pixels[lo * 4 + 1] / 255, pixels[lo * 4 + 2] / 255], i * 6);
    }
    return data;
  }

  const header = `#version 300 es
precision highp float;
uniform vec2 viewport;
uniform float paper; // pale page uses blue ink
uniform vec4 view; // yaw, elevation, focus, pixel scale
uniform vec2 clock; // simulation time, time since release
const float roll = 0.24;
mat2 rotate(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
float unit() { return min(viewport.x * 0.408, viewport.y * 0.55); }
`;
  const backgroundVertex = `#version 300 es
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;
  const backgroundFragment = header + `
out vec4 outColor;
float hash(vec2 p) { return fract(sin(mod(dot(p, vec2(43.17, 71.53)), 313.0)) * 4375.5453); }
void main() {
  vec2 p = (gl_FragCoord.xy - viewport * vec2(0.5, 0.53)) / unit();
  vec2 q = rotate(-roll) * p;
  vec2 plane = vec2(q.x, -q.y / sin(view.y));
  float r = length(plane), d = length(p);
  float phase = atan(plane.y, plane.x) - view.x - clock.x * 0.045;
  float arm = pow(0.5 + 0.5 * cos(3.0 * (phase - 2.8 * log(r + 0.12))), 3.0);
  float dust = exp(-r*r*2.2) * smoothstep(0.16,0.32,r) * (0.18 + 0.82 * arm);
  vec3 color = vec3(0.0);
  float filament = 0.55 + 0.45*cos(66.0*r + 2.4*sin(4.0*phase-9.0*r));
  color += (1.0-view.z) * (vec3(0.19,0.23,0.55)*dust*(0.62+0.38*filament)
    + vec3(0.13,0.08,0.20)*exp(-r*r*7.0));
  vec2 sky = p * 24.0 + vec2(view.x * 0.35, view.y * 0.18);
  float seed = hash(floor(sky));
  vec2 spot = 0.2 + 0.6 * vec2(seed, hash(floor(sky)+17.0));
  float star = exp(-dot(fract(sky)-spot,fract(sky)-spot)*210.0);
  color += vec3(0.48,0.62,0.88)*star*smoothstep(0.93,1.0,seed);
  float lens = exp(-abs(d-0.174)*130.0) + 0.16*exp(-abs(d-0.18)*22.0);
  color *= mix(1.0,0.12,(1.0-smoothstep(0.155,0.174,d))*(1.0-view.z));
  color += (1.0-view.z)*lens*vec3(0.52,0.56,0.82)*(0.58+0.42*smoothstep(-0.04,0.14,q.y));
  float upper = smoothstep(-0.04,0.14,q.y);
  float arc = exp(-abs(length(q*vec2(1.0,0.87))-0.197)*95.0);
  color += (1.0-view.z)*upper*arc*vec3(0.85,0.44,0.22);
  float fade = 1.0-smoothstep(0.97,1.44,d);
  color *= fade;
  float alpha = clamp(max(color.r,max(color.g,color.b)),0.0,1.0);
  outColor = vec4(mix(color, vec3(0.025,0.14,0.37)*alpha, paper),alpha);
}`;
  const grainVertex = header + `
layout(location=0) in vec4 orbit;
layout(location=1) in vec3 destination;
layout(location=2) in vec3 pigment;
out vec4 tint;
void main() {
  float r = orbit.x, noise = orbit.w, focus = view.z;
  float angle = orbit.y + view.x + clock.x * 0.045 + 0.042*sin(clock.x*0.27+r*7.0);
  float wave = exp(-pow((r - (clock.y * 0.96 + 0.10)) * 10.0, 2.0));
  float scatter = sin(3.14159 * focus);
  float radial = r + wave * (0.043 + 0.038*noise);
  vec3 world = vec3(radial*cos(angle),orbit.z,radial*sin(angle));
  world.y += wave*(noise-0.3)*0.25 + scatter*0.12*sin(orbit.y*7.0);
  float depth = world.z*cos(view.y) + world.y*sin(view.y);
  vec2 disk = rotate(roll) * vec2(world.x, world.y*cos(view.y)-world.z*sin(view.y));
  disk *= 2.9/(2.9-0.48*depth);
  float d = length(disk);
  float visible = (d < 0.162 && depth < sqrt(max(0.0,0.0262-d*d))) ? 0.0 : 1.0;
  vec2 image = destination.xy + destination.z*vec2(0.45*sin(view.x),0.37*sin(view.y-0.45));
  vec2 p = mix(disk, image, focus);
  p += scatter*0.10*vec2(cos(orbit.y*4.0),sin(orbit.y*4.0))*noise;
  gl_Position = vec4((p*unit()/viewport)*2.0 + vec2(0.0,0.06),0.0,1.0);
  float core = 1.0-smoothstep(0.18,0.48,r);
  float crest = pow(noise,3.0);
  vec3 blue = mix(vec3(0.13,0.29,0.74),vec3(0.60,0.75,1.0),crest);
  vec3 warm = mix(vec3(0.80,0.38,0.20),vec3(1.0,0.86,0.68),crest);
  vec3 ink = mix(blue,warm,core*(0.80+0.20*cos(angle)));
  ink = mix(ink,vec3(0.73,0.91,1.0),wave*0.87);
  float lum = dot(pigment,vec3(0.213,0.715,0.072));
  vec3 printColor = mix(pigment,vec3(lum*0.72,lum*0.94,lum*1.22),0.71);
  float exposure = mix(1.0,0.37+0.18*cos(angle+0.6),core);
  float alpha = (0.14+0.48*noise)*exposure*visible*(1.0-0.67*smoothstep(0.85,1.19,r));
  vec3 daylight = mix(vec3(0.12,0.36,0.67),vec3(0.015,0.10,0.32),core);
  ink = mix(ink,daylight,paper);
  printColor = mix(printColor,vec3(0.018,0.14,0.36),paper);
  float printAlpha = mix(0.38+0.26*noise,0.62*pow(1.0-lum,1.65),paper);
  tint = vec4(mix(ink,printColor,focus),mix(alpha,printAlpha,focus));
  gl_PointSize = max(1.0,view.w*mix(0.59 + 1.07*noise + 0.22*core + 0.52*wave,1.3+1.34*noise,focus));
}`;
  const grainFragment = `#version 300 es
precision mediump float;
in vec4 tint;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  outColor = vec4(tint.rgb,tint.a*(1.0-smoothstep(0.20,1.0,d)));
}`;

  let chapel = null;
  function program(vertexSource, fragmentSource) {
    const result = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return { id: result, viewport: gl.getUniformLocation(result, 'viewport'),
      paper: gl.getUniformLocation(result, 'paper'), view: gl.getUniformLocation(result, 'view'), clock: gl.getUniformLocation(result, 'clock') };
  }
  let background, particles, geometry, photoBuffer;
  function init() {
    background = program(backgroundVertex, backgroundFragment);
    particles = program(grainVertex, grainFragment);
    geometry = gl.createVertexArray();
    gl.bindVertexArray(geometry);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, orbits, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    photoBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, photoBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, chapel || COUNT * 24, gl.STATIC_DRAW);
    for (let i = 1; i <= 2; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 24, (i - 1) * 12);
    }
    gl.bindVertexArray(null);
  }
  try { init(); } catch (error) { console.warn('Star field unavailable', error); return; }

  let yaw = 0.28, elevation = 0.48, focus = 0, holding = false;
  let dukeHovered = false, dukeFocused = false;
  let time = 0, wave = 5, last = null, pending = null, visible = true, lost = false;
  let press = null, holdTimer = null;
  let spin = 0;

  function bind(pass, pixelScale) {
    gl.useProgram(pass.id);
    gl.uniform1f(pass.paper, Number(light.matches));
    gl.uniform2f(pass.viewport, canvas.width, canvas.height);
    gl.uniform4f(pass.view, yaw, elevation, focus, pixelScale);
    gl.uniform2f(pass.clock, time, wave);
  }
  function render() {
    if (lost || !canvas.width) return;
    gl.viewport(0,0,canvas.width,canvas.height);
    const size = Math.min(canvas.width*0.408,canvas.height*0.55)/139;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    bind(background,size);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, light.matches ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(geometry);
    bind(particles,size);
    gl.drawArrays(gl.POINTS,0,COUNT);
    gl.bindVertexArray(null);
  }
  function fit() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1,2);
    const w = Math.max(1,Math.round(rect.width*dpr)), h = Math.max(1,Math.round(rect.height*dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    render();
  }
  function focusTarget() {
    return Number(chapel !== null && (holding || dukeHovered || dukeFocused));
  }

  function loop(now) {
    const dt = last === null ? 0 : Math.min(0.05,(now-last)/1000);
    last = now;
    time += dt;
    wave += dt;
    if (!press) {
      yaw += spin*dt;
      spin *= Math.exp(-dt*5.5);
    }
    const target = focusTarget();
    focus += (target-focus)*(1-Math.exp(-dt*4.8));
    render();
    pending = requestAnimationFrame(loop);
  }
  function sync() {
    const run = visible && !document.hidden && !lost && !motion.matches;
    if (run && pending === null) pending = requestAnimationFrame(loop);
    if (!run && pending !== null) { cancelAnimationFrame(pending); pending = last = null; }
    if (motion.matches) { spin = 0; focus = focusTarget(); wave = 5; render(); }
  }
  function release() {
    clearTimeout(holdTimer);
    if (holding && !dukeHovered && !dukeFocused) wave = 0;
    holding = false;
    press = null;
    sync();
  }
  function orbit(dx,dy) {
    yaw += dx;
    elevation = Math.max(0.13,Math.min(1.28,elevation+dy));
    if (motion.matches) render();
  }

  figure.classList.add('is-on');
  fit();
  photo.decode().then(() => {
    chapel = sampleChapel();
    if (!chapel) return;
    if (!lost) {
      gl.bindBuffer(gl.ARRAY_BUFFER,photoBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,chapel,gl.STATIC_DRAW);
    }
    sync();
  }).catch(() => { /* The orbit is independent of the photograph. */ });

  // The affiliation in the biography also reveals the Chapel; the link keeps
  // its ordinary click, keyboard navigation and touch behaviour.
  dukeLink.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    dukeHovered = true;
    sync();
  });
  dukeLink.addEventListener('pointerleave', () => { dukeHovered = false; sync(); });
  dukeLink.addEventListener('focus', () => { dukeFocused = true; sync(); });
  dukeLink.addEventListener('blur', () => { dukeFocused = false; sync(); });
  canvas.addEventListener('pointerdown',event => {
    if (!event.isPrimary || event.button !== 0) return;
    spin = 0;
    press = { id:event.pointerId, x:event.clientX, y:event.clientY, stamp:event.timeStamp, dragged:false };
    canvas.setPointerCapture(event.pointerId);
    holdTimer = setTimeout(() => { holding = Boolean(chapel); sync(); },250);
  });
  canvas.addEventListener('pointermove',event => {
    if (!press || press.id !== event.pointerId) return;
    const dx = event.clientX-press.x, dy = event.clientY-press.y;
    if (!press.dragged && Math.hypot(dx,dy) < 4) return;
    press.dragged = true;
    clearTimeout(holdTimer);
    orbit(dx*0.009,-dy*0.006);
    spin = motion.matches ? 0 : Math.max(-2.2,Math.min(2.2,dx*9/Math.max(12,event.timeStamp-press.stamp)));
    press.stamp = event.timeStamp;
    press.x = event.clientX; press.y = event.clientY;
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    canvas.addEventListener(type,event => { if (press && press.id === event.pointerId) release(); });
  }
  canvas.addEventListener('keydown',event => {
    const steps = {ArrowLeft:[-0.11,0],ArrowRight:[0.11,0],ArrowUp:[0,0.07],ArrowDown:[0,-0.07]};
    if (steps[event.key]) { event.preventDefault(); orbit(...steps[event.key]); }
    if (event.code === 'Space') { event.preventDefault(); holding = Boolean(chapel); sync(); }
  });
  canvas.addEventListener('keyup',event => { if (event.code === 'Space') release(); });
  canvas.addEventListener('blur',release);
  canvas.addEventListener('contextmenu',event => { if (press) event.preventDefault(); });
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas);
  else window.addEventListener('resize',fit);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) release(); sync(); }).observe(figure);
  }
  document.addEventListener('visibilitychange',() => { if (document.hidden) release(); sync(); });
  motion.addEventListener('change',sync);
  light.addEventListener('change',render);
  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault(); lost = true; release(); figure.classList.remove('is-on');
  });
  canvas.addEventListener('webglcontextrestored',() => {
    try { init(); } catch (error) { return; }
    lost = false; figure.classList.add('is-on'); fit(); sync();
  });
  sync();
})();
