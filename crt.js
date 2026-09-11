/* ============================================================
 * CRT SCREEN —— WebGL 渲染引擎
 * ------------------------------------------------------------
 * 工作方式：
 *   1. 一块 640x480 的离屏画布作为"荧光屏原生画面"（低分辨率）
 *      内容层（stage.js）每帧把画面画在这块画布上
 *   2. 每帧上传为纹理，全屏绘制，片元着色器负责：
 *      球面畸变（曲面变形）/ RGB 色差 / 行间暗纹扫描线 /
 *      暗角 / 噪点雪花 / 荧光粉伽马 / 玻璃反光 / 交流闪烁
 *
 * 可调参数集中在 CRT.CONFIG（可运行时修改，立即生效）
 * ============================================================ */
'use strict';

window.CRT = window.CRT || {};

CRT.CONFIG = {
  curve: -0.05,      // 曲面强度基准值（在 4:3 窗口下的数值；实际强度随窗口比例自动补偿，
                     // 宽屏自动减小、窄屏自动增大，保证各比例下屏幕角点的视觉畸变量一致）
  overscan: 0.94,    // 过扫描：屏幕显示源画面中心的比例（0.94 已接近全幅）
  chroma: 0.0,       // RGB 色差强度（彩色内容建议 0.01~0.03，单色磷光无意义）
  scanline: 0.9,     // 行间暗纹强度 0~1
  vignette: 0.5,     // 暗角强度 0~1
  noise: 0.05,       // 噪点雪花幅度
  glare: 0.65,       // 玻璃反光强度
  flicker: 0.01,     // 电源交流闪烁幅度
  glow: 0.10,        // 荧光晕散（磷光余晖感）0~1
  gamma: 1.0,        // 荧光粉曲线；1.0 = 调色板所见即所得，可调 0.7~1.2 微调层次
  brightness: 1.0    // 画面亮度（设置界面可调，0.4~1.6）
};

CRT.Engine = function (canvas) {
  this.canvas = canvas;
  this.contentWidth = 640;   // 内容层画布宽（= 荧光屏原生分辨率）
  this.contentHeight = 480;

  // --- 离屏内容画布（荧光屏原生画面，随窗口比例变化，高度固定 480） ---
  this._content = document.createElement('canvas');
  this._content.width = this.contentWidth;
  this._content.height = this.contentHeight;
  this._ctx2d = this._content.getContext('2d');

  // --- WebGL ---
  this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true })
    || canvas.getContext('experimental-webgl', { alpha: false });
  if (!this.gl) {
    document.body.innerHTML = '<p style="color:#888;text-align:center;padding:2em">这台浏览器不支持 WebGL，点不亮屏幕。</p>';
    throw new Error('WebGL unavailable');
  }

  this._raf = null;
  this._t0 = 0;
  this._resize();
  this._initGL();
  this._onFrameHook = null;

  window.addEventListener('resize', this._resize.bind(this));
};

CRT.Engine.prototype = {

  /* 每帧回调：内容层把画面画到 2D ctx 上。参数 (ctx, ms) */
  set onFrame(fn) { this._onFrameHook = fn; },

  start: function () {
    var self = this;
    this._t0 = performance.now();
    var loop = function () {
      self._render();
      self._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },

  stop: function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  _resize: function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var w = Math.max(2, Math.round(window.innerWidth * dpr));
    var h = Math.max(2, Math.round(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // 内容层（荧光屏原生分辨率）跟随窗口比例：高固定 480，宽按比例
    // 限制 240~3000，避免极端窗口比例下内存爆炸
    var cw = Math.max(240, Math.min(3000, Math.round(480 * (w / h))));
    if (this._content.width !== cw) {
      this._content.width = cw;
      this._content.height = this.contentHeight;
      this.contentWidth = cw;
    }
    if (this.gl) this.gl.viewport(0, 0, w, h);
  },

  /* ---------- WebGL 初始化 ---------- */
  _initGL: function () {
    var gl = this.gl;
    var vs = this._compile(gl.VERTEX_SHADER, [
      'attribute vec2 aPos;',
      'varying vec2 vUv;',
      'void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }'
    ].join('\n'));
    var fs = this._compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('shader link: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);
    this._prog = prog;
    this._u = {};
    ['uRes','uTexSize','uTex','uTime','uCurve','uOverscan','uChroma',
     'uScan','uVign','uNoise','uGlare','uFlicker','uGamma','uGlow','uBright']
      .forEach(function (n) { this._u[n] = gl.getUniformLocation(prog, n); }, this);

    // 全屏四边形
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // 内容纹理
    this._tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._content);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  },

  _compile: function (type, src) {
    var gl = this.gl;
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  },

  /* ---------- 每帧渲染 ---------- */
  _render: function () {
    var gl = this.gl;
    var t = performance.now();
    if (this._onFrameHook) this._onFrameHook(this._ctx2d, t);

    gl.bindTexture(gl.TEXTURE_2D, this._tex);
    // 关键：canvas 顶部行是纹理 t=0，翻转后画面才不上下颠倒
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._content);

    var C = CRT.CONFIG;
    var U = this._u;
    gl.uniform2f(U.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(U.uTexSize, this.contentWidth, this.contentHeight);
    gl.uniform1f(U.uTime, t * 0.001);
    // 曲率随窗口比例自适应（三次方衰减）：
    //   4:3（及更窄的窗口）= 基准值（-0.05）
    //   16:9 全屏          ≈ 基准的 0.3 倍（-0.015）
    //   更宽的比例继续快速减弱，保证不同比例下观感一致
    var aspect = this.canvas.width / this.canvas.height;
    var k = aspect <= 4 / 3 ? 1 : Math.pow((1 + 16 / 9) / (1 + aspect * aspect), 3);
    this._curveEff = C.curve * k;
    gl.uniform1f(U.uCurve, this._curveEff);
    gl.uniform1f(U.uOverscan, C.overscan);
    gl.uniform1f(U.uChroma, C.chroma);
    gl.uniform1f(U.uScan, C.scanline);
    gl.uniform1f(U.uVign, C.vignette);
    gl.uniform1f(U.uNoise, C.noise);
    gl.uniform1f(U.uGlare, C.glare);
    gl.uniform1f(U.uFlicker, C.flicker);
    gl.uniform1f(U.uGamma, C.gamma);
    gl.uniform1f(U.uGlow, C.glow);
    gl.uniform1f(U.uBright, C.brightness);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
};

/* ============================================================
 * 片元着色器：一台 CRT 显像管该有的一切
 * ============================================================ */
var FRAG_SRC = [
'precision highp float;',
'varying vec2 vUv;',
'uniform vec2  uRes;',
'uniform vec2  uTexSize;',
'uniform sampler2D uTex;',
'uniform float uTime;',
'uniform float uCurve;',
'uniform float uOverscan;',
'uniform float uChroma;',
'uniform float uScan;',
'uniform float uVign;',
'uniform float uNoise;',
'uniform float uGlare;',
'uniform float uFlicker;',
'uniform float uGamma;',
'uniform float uGlow;',
'uniform float uBright;',
'',
'float hash21(vec2 p){',
'  p = fract(p * vec2(234.34, 435.345));',
'  p += dot(p, p + 34.23);',
'  return fract(p.x * p.y);',
'}',
'',
'vec2 toUv(vec2 q){',
'  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);',
'  return 0.5 + (q / aspect) * (0.5 * uOverscan);',
'}',
'',
'vec3 grab(vec2 uv){',
'  return texture2D(uTex, uv).rgb;',
'}',
'',
'void main(){',
'  vec2 px = gl_FragCoord.xy;',
'  vec2 p = (px - 0.5 * uRes) / (0.5 * uRes.y);',
'  float r2 = dot(p, p);',
'',
'  /* ---- 球面畸变：屏面弯曲，越靠边缘越被压缩 ---- */',
'  float coef = 1.0 + uCurve * (r2 + 0.35 * r2 * r2);',
'',
'  vec3 col;',
'  vec2 uvC;',
'  if (uChroma > 0.0005) {',
'    /* RGB 分色采样：边缘色散更明显（彩色显像管汇聚误差） */',
'    float cb = uChroma * r2;',
'    vec2 uvr = toUv(p / (coef + cb));',
'    vec2 uvg = toUv(p / coef);',
'    vec2 uvb = toUv(p / (coef - cb));',
'    uvC = uvg;',
'    col.r = grab(uvr).r;',
'    col.g = grab(uvg).g;',
'    col.b = grab(uvb).b;',
'  } else {',
'    uvC = toUv(p / coef);',
'    col = grab(uvC);',
'  }',
'',
'  /* ---- 荧光晕散：磷光点亮后向四周渗开 ---- */',
'  if (uGlow > 0.001) {',
'    vec2 off = vec2(0.6, 0.6) / uTexSize;',
'    vec3 blur = (grab(uvC + vec2(off.x, 0.0)) + grab(uvC - vec2(off.x, 0.0))',
'              +  grab(uvC + vec2(0.0, off.y)) + grab(uvC - vec2(0.0, off.y))) * 0.25;',
'    col = mix(col, blur, uGlow);',
'  }',
'',
'  /* ---- 行间暗缝（扫描线结构，随曲面一起弯曲） ---- */',
'  float linePos = fract(uvC.y * uTexSize.y);',
'  float dark = smoothstep(0.66, 0.9, linePos);',
'  col *= 1.0 - uScan * 0.74 * dark;',
'',
'  /* ---- 荫罩竖纹：只在彩色模式下有意义（默认关闭） ---- */',
'',
'  /* ---- 暗角：屏幕四边自然收暗 ---- */',
'  col *= 1.0 - uVign * smoothstep(0.25, 2.6, r2);',
'',
'  /* ---- 电源交流纹波引起的亮度不稳 ---- */',
'  col *= 1.0 + uFlicker * (sin(uTime * 125.0) + sin(uTime * 377.0) * 0.4);',
'',
'  /* ---- 噪点：细雪花 + 荧光粉颗粒团 ---- */',
'  float n1 = hash21(px + fract(uTime * 31.0) * 71.3);',
'  float n2 = hash21(floor(px * 0.22) + fract(uTime * 17.0) * 13.7);',
'  col *= 1.0 + (n1 - 0.5) * uNoise * 1.7 + (n2 - 0.5) * uNoise * 1.1;',
'',
'  /* ---- 高亮处的随机闪耀（磷光点抖动） ---- */',
'  float lum = dot(col, vec3(0.333));',
'  float spark = hash21(px + floor(uTime * 43.0) * 113.0);',
'  col += vec3(n1 * spark) * uNoise * 1.5 * smoothstep(0.2, 0.75, lum);',
'',
'  /* ---- 荧光粉发光特性 ---- */',
'  col = pow(max(col, 0.0), vec3(uGamma));',
'',
'  /* ---- 玻璃表面的弧光 ---- */',
'  if (uGlare > 0.001) {',
'    float band = exp(-pow((p.y - (0.14 + 0.07 * cos(p.x * 1.9 + 0.5))) * 3.2, 2.0));',
'    vec2  sh = p - vec2(0.12, 0.42);',
'    float sheen = exp(-dot(sh, sh) * 7.0);',
'    col += (band * 0.045 + sheen * 0.02) * uGlare;',
'  }',
'',
'  /* ---- 抖动，压住色带 ---- */',
'  col += (hash21(px + uTime * 13.0) - 0.5) / 70.0;',
'',
'  /* ---- 画面亮度（设置可调） ---- */',
'  col *= uBright;',
'',
'  gl_FragColor = vec4(col, 1.0);',
'}'
].join('\n');
