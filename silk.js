// 背景：随风飘动的丝绸（WebGL）。
// 想改颜色：改下面 SHADOW / MID / LIGHT 三个颜色（0 到 1 的 RGB）。想改速度：改 SPEED。
// 电脑或平板不支持 WebGL 时，会自动用 CSS 里的米色渐变当背景。
// 切到别的分页或 App 再回来、或者浏览器回收了 3D 画面，都会自动接着飘，不用刷新。
(function () {
  'use strict';
  var SPEED = 0.1;           // 飘动速度，越小越慢
  var SCALE = 0.5;           // 绘制清晰度（0.5 = 一半分辨率，丝绸本来就柔和，省电）
  var FPS = 30;              // 每秒最多画几次（设备跟不上时会自动降低，但不会停）
  var SHADOW = [0.56, 0.47, 0.40];
  var MID    = [0.79, 0.72, 0.66];
  var LIGHT  = [0.95, 0.92, 0.88];

  var canvas = document.getElementById('silk');
  if (!canvas) return;
  var gl = null;
  try { gl = canvas.getContext('webgl', {antialias: false, depth: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power'}); } catch (e) {}
  if (!gl) { canvas.remove(); return; }

  var VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FS = [
    'precision mediump float;',
    'uniform vec2 uRes; uniform float uT;',
    'uniform vec3 uShadow; uniform vec3 uMid; uniform vec3 uLight;',
    // height of the cloth: long diagonal folds that drift and twist
    'float h(vec2 p, float t){',
    '  vec2 q = p;',
    '  q.x += 0.35 * sin(q.y * 1.1 + t * 0.7);',
    '  q.y += 0.25 * sin(q.x * 0.9 - t * 0.5);',
    '  float a = q.x * 0.85 + q.y * 0.55;',
    '  float w = sin(a * 1.6 + t + 0.9 * sin(q.y * 1.3 - t * 0.6));',
    '  w += 0.45 * sin(a * 3.1 - t * 1.25 + 1.4 * sin(q.x * 0.7 + t * 0.35));',
    '  w += 0.18 * sin(q.x * 5.3 + q.y * 2.2 + t * 1.6);',
    '  return w;',
    '}',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.4;',
    '  float t = uT;',
    '  float e = 0.01;',
    '  float hx = (h(p + vec2(e, 0.0), t) - h(p - vec2(e, 0.0), t)) / (2.0 * e);',
    '  float hy = (h(p + vec2(0.0, e), t) - h(p - vec2(0.0, e), t)) / (2.0 * e);',
    '  vec3 n = normalize(vec3(-hx, -hy, 2.3));',
    '  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));',
    '  vec3 V = vec3(0.0, 0.0, 1.0);',
    '  float dif = clamp(dot(n, L), 0.0, 1.0);',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 46.0);',
    '  float sheen = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.0);',
    '  vec3 col = mix(uShadow, uMid, smoothstep(0.18, 0.75, dif));',
    '  col = mix(col, uLight, smoothstep(0.78, 1.0, dif) * 0.85);',
    '  float ao = 0.9 + 0.1 * smoothstep(-1.6, 1.6, h(p, t));',
    '  col *= ao;',
    '  col += vec3(1.0, 0.97, 0.93) * spec * 0.3 + uLight * sheen * 0.1;',
    '  col = min(col, uLight * 1.01);',
    '  float vig = smoothstep(1.25, 0.35, length(uv - vec2(0.5, 0.55)));',
    '  col = mix(col * 0.9, col, vig);',
    '  col += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog, uRes, uT, curW = 0, curH = 0;
  // 建立绘图程序；第一次打开和 3D 画面被浏览器回收后都会调用
  function init() {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uRes = gl.getUniformLocation(prog, 'uRes'); uT = gl.getUniformLocation(prog, 'uT');
    gl.uniform3fv(gl.getUniformLocation(prog, 'uShadow'), SHADOW);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uMid'), MID);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uLight'), LIGHT);
    curW = curH = 0;
  }
  try { init(); } catch (e) { canvas.remove(); return; }

  function resize() {
    var w = Math.max(1, Math.round(window.innerWidth * SCALE)), h = Math.max(1, Math.round(window.innerHeight * SCALE));
    if (w !== curW || h !== curH) { curW = w; curH = h; canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); gl.uniform2f(uRes, w, h); }
  }
  // elapsed 只在画面真的在动时累加，所以离开再回来会从原来的位置接着飘，不会跳一下
  var elapsed = 40, last = 0, raf = 0, lost = false, fps = FPS, sum = 0, samples = 0;
  function draw() {
    resize();
    gl.uniform1f(uT, elapsed * SPEED * 4.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (lost || now - last < 1000 / fps - 4) return;
    var dt = last ? now - last : 0;
    last = now;
    elapsed += Math.min(dt, 100) / 1000;
    // 设备跟不上时降低每秒帧数（最少 10 帧），但一直保持飘动
    if (dt > 0 && dt < 250) {
      sum += dt; samples++;
      if (samples >= 45) { var real = 1000 / (sum / samples); if (real < fps * 0.7) fps = Math.max(10, Math.round(real)); sum = 0; samples = 0; }
    }
    try { draw(); } catch (e) {}
  }
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function run() {
    cancelAnimationFrame(raf); raf = 0;
    if (document.hidden || lost) return;
    last = 0;
    if (still && still.matches) { try { draw(); } catch (e) {} return; }
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', run);
  window.addEventListener('pageshow', run);
  window.addEventListener('focus', function () { if (!raf) run(); });
  window.addEventListener('resize', function () { if (still && still.matches) run(); });
  if (still && still.addEventListener) still.addEventListener('change', run);
  // 浏览器回收 3D 画面（平板切 App 时常见）：等它还回来后重新建立并继续
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; }, false);
  canvas.addEventListener('webglcontextrestored', function () { try { init(); lost = false; run(); } catch (e) {} }, false);
  // 保险：画面看得到但超过 1.5 秒没动，就重新启动
  setInterval(function () {
    if (!document.hidden && !lost && !(still && still.matches) && performance.now() - last > 1500) run();
  }, 2000);
  canvas.classList.add('on');
  run();
})();
