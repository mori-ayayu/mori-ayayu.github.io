/* ============================================================
 * CRT SCREEN —— 内容层（荧光屏上显示什么，全在这里）
 * ------------------------------------------------------------
 * 引擎把这块 640x480 的画布当成"荧光屏原生画面"逐帧上传。
 * 本文件负责：
 *   - 磷光体调色板（绿 / 琥珀 / 白，键盘 1/2/3 切换）
 *   - 冷启动流程：关机 -> 通电亮线 -> 展开 -> 几何校准网格
 *     -> 自检文本逐字输出 -> 待机
 *   - 终端行模型与打字机
 *
 * 后续替换页面内容：改 SCRIPT 数组即可（见 README.md）
 * ============================================================ */
'use strict';

window.CRT = window.CRT || {};

/* ---------- 磷光体调色板 ---------- */
CRT.PHOSPHORS = {
  green: {
    label: 'P1 GREEN',
    bg:    '#020602',   // 荧光屏黑位（不是纯黑，带一点磷光底色）
    line:  '#1d4f28',   // 暗线 / 网格
    text:  '#8ff28f',   // 正文
    dim:   '#2e8a4a',   // 低亮度元素（待机文字等）
    bright:'#e2ffe2'    // 高亮（强调行）
  },
  amber: {
    label: 'P3 AMBER',
    bg:    '#070400',
    line:  '#4a2e08',
    text:  '#ffb24d',
    dim:   '#a8621c',
    bright:'#ffe6bd'
  },
  white: {
    label: 'P4 WHITE',
    bg:    '#070708',
    line:  '#3a3a3f',
    text:  '#e2e2e2',
    dim:   '#83838a',
    bright:'#ffffff'
  }
};

/* ============================================================
 * 冷启动自检脚本
 * c: 颜色角色  t: 正文  b: 高亮  d: 暗
 * rate: 每“单元”基础间隔(ms)，行结束后自动停顿 hold
 * ------------------------------------------------------------
 * 文本语法：漢字《かんじ》 = 振假名（注音小字显示在汉字上方）。
 * 无注音的文本逐字输入；带注音的词整体输出。
 * 要新增/替换内容直接改这里，超过 MAX_ROWS 行会自动上滚。
 * ============================================================ */
var BOOT_SCRIPT = [
  { c: 't', rate: 45, hold: 700, t: 'KX-15 陰極線管装置《いんきょくせんかんそうち》     製造番号《せいぞうばんごう》 0721-409' },
  { c: 'd', rate: 18, hold: 500, t: '冷間起動《れいかんきどう》 手順《てじゅん》 v2.4' },
  { c: 'd', rate: 8,  hold: 220, t: '----------------------------------------' },
  { c: 't', rate: 26, hold: 240, t: '加熱器《かねつき》 ................ 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '高電圧《こうでんあつ》 .............. 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '水平偏向《すいへいへんこう》 15.75kHz .. 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '垂直偏向《すいちゅうへんこう》 60Hz ..... 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '焦点《しょうてん》 .................. 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '純度《じゅんど》 .................... 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '格子収束《こうししゅうそく》 ......... 正常《せいじょう》' },
  { c: 't', rate: 26, hold: 240, t: '真空《しんくう》 .................... 正常《せいじょう》' },
  { c: 'd', rate: 8,  hold: 220, t: '----------------------------------------' },
  { c: 'b', rate: 34, hold: 750, t: '全自検《ぜんじけん》 合格《ごうかく》' },
  { c: 't', rate: 26, hold: 550, t: '管理者《かんりしゃ》 認証《にんしょう》 .......... 完了《かんりょう》' },
  { c: 'b', rate: 30, hold: 900, t: '歓迎《かんげい》 円森 綾夕  (Madokamori Ayayu)' },
  { c: 't', rate: 28, hold: 200, t: '入力信号《にゅうりょくしんごう》 待機中《たいきちゅう》' }
];

/* BOOT_SCRIPT 解析缓存（文本单元：普通文本 / 带注音的词） */
var BOOT_PARSED = null;

/* ============================================================
 * 解析带振假名的文本：漢字《かんじ》
 * 规则：书名号《》前的连续汉字整段作为注音词（青空文库风格）。
 * 例：'高電圧《こうでんあつ》 正常《せいじょう》'
 *   -> [{t:'高電圧', r:'こうでんあつ'}, {t:' '}, {t:'正常', r:'せいじょう'}]
 * ============================================================ */
function parseRuby(str) {
  var out = [];
  var buf = '';
  var i = 0;
  function isKanji(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x4E00 && c <= 0x9FFF) || c === 0x3005 || c === 0x3007;
  }
  while (i < str.length) {
    if (str.charAt(i) === '《') {
      var end = str.indexOf('》', i + 1);
      if (end > i + 1) {
        var k = buf.length;
        while (k > 0 && isKanji(buf.charAt(k - 1))) k--;
        var target = buf.slice(k);
        if (target.length > 0) {
          if (k > 0) out.push({ t: buf.slice(0, k), r: null });
          out.push({ t: target, r: str.slice(i + 1, end) });
          buf = '';
          i = end + 1;
          continue;
        }
      }
    }
    buf += str.charAt(i);
    i++;
  }
  if (buf.length) out.push({ t: buf, r: null });
  return out;
}

/* ============================================================
 * 操作员信息与主菜单配置
 * 后续增加菜单内容：往 MENU_ITEMS 里加一项即可（id 唯一）。
 * 占位项点击后会在菜单里提示 NOT CONNECTED；
 * 要给某项接真实内容：在 Stage.tap 的 menu 分支里按 id 处理。
 * ============================================================ */
var OPERATOR = {
  name: '円森 綾夕',
  kana: 'まどかもり あやゆ',
  romaji: 'Madokamori Ayayu',
  role: '管理者'
};

var MENU_ITEMS = [
  { id: 'album',  label: '写真帖', ruby: 'しゃしんちょう', en: 'ALBUM' },
  { id: 'docs',   label: '文書',   ruby: 'ぶんしょ',       en: 'DOCUMENTS' },
  { id: 'world',  label: '世界',   ruby: 'せかい',         en: 'WORLD' },
  { id: 'reboot', label: '再起動', ruby: 'さいきどう',     en: 'REBOOT' }
];

/* ============================================================
 * 设置界面配置
 * type 'range'：数值项（min~max, step；get/set 均为 (stage) 签名）
 * type 'enum' ：枚举项（values 数组 + labels 显示文本）
 * 后续新增设置项：往这里加一项写好 get/set 即可（界面自动渲染）。
 * ============================================================ */
var SETTINGS_ITEMS = [
  {
    id: 'brightness', label: '明るさ', ruby: 'あかるさ', type: 'range',
    min: 0.4, max: 1.6, step: 0.1,
    get: function () { return CRT.CONFIG.brightness; },
    set: function (v) { CRT.CONFIG.brightness = v; }
  },
  {
    id: 'volume', label: '音量', ruby: 'おんりょう', type: 'range',
    min: 0, max: 1, step: 0.1,
    get: function () { return sound.getVolume(); },
    set: function (v) { sound.setVolume(v); }
  },
  {
    id: 'curve', label: '曲面', ruby: 'きょくめん', type: 'range',
    min: -0.1, max: 0, step: 0.01,
    get: function () { return CRT.CONFIG.curve; },
    set: function (v) { CRT.CONFIG.curve = v; }
  },
  {
    id: 'scanline', label: '走査線', ruby: 'そうさせん', type: 'range',
    min: 0, max: 1, step: 0.1,
    get: function () { return CRT.CONFIG.scanline; },
    set: function (v) { CRT.CONFIG.scanline = v; }
  },
  {
    id: 'noise', label: '雑音', ruby: 'ざつおん', type: 'range',
    min: 0, max: 0.12, step: 0.01,
    get: function () { return CRT.CONFIG.noise; },
    set: function (v) { CRT.CONFIG.noise = v; }
  },
  {
    id: 'glow', label: '残光', ruby: 'ざんこう', type: 'range',
    min: 0, max: 0.3, step: 0.05,
    get: function () { return CRT.CONFIG.glow; },
    set: function (v) { CRT.CONFIG.glow = v; }
  },
  {
    id: 'phosphor', label: '蛍光体', ruby: 'けいこうたい', type: 'enum',
    values: ['green', 'amber', 'white'],
    labels: [
      { t: '緑', ruby: 'みどり' },
      { t: '琥珀', ruby: 'こはく' },
      { t: '白', ruby: 'しろ' }
    ],
    get: function (st) { return this.values.indexOf(st.phosphor); },
    set: function (i, st) { st.setPhosphor(this.values[i]); }
  }
];

/* ---------- 字符雨（待机 -> 菜单 过渡） ---------- */
var RAIN_DUR_MS = 1700;    // 过渡总时长
var RAIN_TRAIL = 11;       // 拖尾行数
var RAIN_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789' +
  '!@#$%^&*()[]{}<>?/+=_-|:;,.~`' +
  'あいうえおかきくけこさしすせそたちつてとなにぬねの' +
  'はひふへほまみむめもやゆよらりるれろわをん' +
  'アイウエオカキクケコサシスセソタチツテトナニヌネノ' +
  'ハヒフヘホマミムメモヤユヨラリルレロワヲン';

/* ---------- 菜单界面布局常量（内容坐标） ---------- */
var LAYOUT = {
  wideMin: 520,     // 画布宽度 >= 此值用宽版布局（左侧用户栏 + 右侧内容区）
  lx: 40,           // 左栏 x
  avatar: { x: 40, y: 76, s: 64 },
  scope: { y: 76, h: 216 }     // 右侧内容区（背景图）：x 由左栏右缘推出
};

/* 菜单右侧背景图（四边羽化后自然融入画面；换图只改这一行） */
var MENU_BG_SRC = 'assets/Background.jpg';

/* ---------- 时间轴常量（相对重启时刻的毫秒） ---------- */
var T_GRID_START = 1000;   // 通电展开完成后出现几何校准网格
var T_TEXT_START = 2250;   // 网格退场，自检文本开始逐字输出
var T_HOLD_MS    = 1700;   // 打完字后停留时长
var T_FADE_MS    = 550;    // 淡出到待机

CRT.Stage = function (opts) {
  this.W = opts.width;
  this.H = opts.height;

  this.phosphor = 'green';
  this.phase = 'off';          // off | boot | grid | text | hold | fade | standby
  this.powered = false;
  this._powerCb = null;

  this.rows = [];              // 已换行的终端行
  this.cur = null;             // 正在输入的当前行
  this._curColor = 't';

  this._blockMaxW = null;      // 自检文本块宽度缓存（居中用）
  this._px = -1;               // 指针（内容坐标），-1 表示不在屏上
  this._py = -1;
  this._notice = null;         // 菜单提示 { text, until }
  this._ml = null;             // 当前菜单布局缓存（宽/窄版）
  this._rainAt = 0;            // 字符雨起始时刻
  this._rainCols = [];         // 每列 { y, spd }
  this._rainCells = [];        // 每格的字符
  this._rainRows = 0;
  this._rainLast = 0;

  this._settingsBtns = [];     // 设置界面按钮矩形（渲染时更新）
  this._settingsEntryRect = null;  // 菜单里「設定」入口的点击区域

  // 菜单背景图：外部高清图（先做 canvas 污染探测，干净才用）+ 内嵌 data URL 兜底
  // 说明：file:// 直接打开时，本地图片会被浏览器视为跨源，若直接画进 canvas 会让它"变脏"，
  //       进而导致 WebGL 纹理上传报安全错误（整屏黑屏）。所以外部图先探测，脏则回退内嵌图。
  this._bgImg = null;          // 外部图（通过污染探测后可用）
  this._bgFallback = null;     // 内嵌兜底图（data URL，永远干净）
  this._bgFeather = null;
  this._bgKey = '';
  var self = this;
  if (window.MENU_BG_DATA) {
    var fb = new Image();
    fb.onload = function () { self._bgFallback = fb; };
    fb.src = window.MENU_BG_DATA;
  }
  var bg = new Image();
  bg.onload = function () {
    try {
      // 污染探测：在临时 canvas 上画一小块并回读像素
      var t = document.createElement('canvas');
      t.width = 2; t.height = 2;
      var g = t.getContext('2d');
      g.drawImage(bg, 0, 0, 2, 2);
      g.getImageData(0, 0, 1, 1);
      self._bgImg = bg;        // 回读成功：图是干净的，可用
    } catch (e) {
      self._bgImg = null;      // 被污染（如 file://）：弃用，交给内嵌兜底
    }
  };
  bg.src = MENU_BG_SRC;

  this._actions = [];          // 打字动作队列
  this._ai = 0;

  this.bootAt = 0;             // 本次重启时刻(ms)
  this._t0 = 0;
  this._phaseT0 = 0;
  this.font = '18px Consolas, "Courier New", "MS Gothic", "Yu Gothic", monospace';
  this.fontSm = '13px Consolas, "Courier New", "MS Gothic", "Yu Gothic", monospace';
  this.fontLg = '26px "MS Gothic", "Yu Gothic", "SimHei", sans-serif';
  this.fontRuby = '9px "MS Gothic", "Yu Gothic", monospace';   // 振假名（注音）
  this._rubyGap = 9;   // 注音基线相对主字顶部的上探距离

  this.MX = 40;                // 文本左边距（overscan 裁切区外，内容安全区）
  this.TOP = 40;               // 首行 y
  this.LH = 25;                // 行高（留出振假名空间）
  this.MAX_ROWS = 16;          // 屏上最多行数（超出上滚）

  var self = this;
  if (opts && typeof opts.onPowerChange === 'function') {
    this._powerCb = opts.onPowerChange;
  }

  // 读取上次保存的设置（localStorage；file:// 或隐私模式失败时静默忽略）
  this._loadSettings();
};

CRT.Stage.prototype = {

  color: function (role) {
    // 终端行颜色存短名：t=正文 d=暗 b=高亮；其余按完整键名直通
    var map = { t: 'text', d: 'dim', b: 'bright' };
    return CRT.PHOSPHORS[this.phosphor][map[role] || role];
  },

  setPhosphor: function (name) {
    if (CRT.PHOSPHORS[name]) this.phosphor = name;
  },

  /* ---------- 电源 ---------- */
  _setPowered: function (on) {
    if (this.powered !== on) {
      this.powered = on;
      if (this._powerCb) this._powerCb(on);
    }
  },

  restart: function () {
    var now = performance.now();
    this._setPowered(true);
    this.bootAt = now;
    this.rows = [];
    this.cur = null;
    this._curColor = 't';
    this._blockMaxW = null;   // 居中块宽缓存，重启后重新测量
    this.phase = 'boot';
    this._buildActions();
  },

  /* ---------- 把脚本展开为打字动作（注音词整体输出，其余逐字） ---------- */
  _buildActions: function () {
    var self = this;
    var at = T_TEXT_START;
    var a = [];
    var i;
    if (!BOOT_PARSED) {
      BOOT_PARSED = [];
      for (var bi = 0; bi < BOOT_SCRIPT.length; bi++) {
        BOOT_PARSED.push({
          c: BOOT_SCRIPT[bi].c,
          rate: BOOT_SCRIPT[bi].rate,
          hold: BOOT_SCRIPT[bi].hold,
          units: parseRuby(BOOT_SCRIPT[bi].t)
        });
      }
    }
    for (i = 0; i < BOOT_PARSED.length; i++) {
      (function (line) {
        a.push({ at: at, fn: function () { self._startLine(line.c); } });
        at += 70;
        for (var u = 0; u < line.units.length; u++) {
          (function (unit) {
            if (unit.r) {
              // 带注音的词：整词输出
              a.push({ at: at, fn: function () { self._typeWord(unit); } });
              at += unit.t.length * line.rate * (0.5 + Math.random() * 0.5);
            } else {
              // 普通文本：逐字输出
              for (var k = 0; k < unit.t.length; k++) {
                (function (ch2) {
                  a.push({ at: at, fn: function () { self._typeChar(ch2); } });
                })(unit.t.charAt(k));
                at += line.rate * (0.6 + Math.random() * 0.85);
              }
            }
          })(line.units[u]);
        }
        // 行尾收行（空行也会成为一行空位）
        a.push({ at: at, fn: function () { self._endLine(); } });
        at += line.hold;
      })(BOOT_PARSED[i]);
    }
    this._actions = a;
    this._ai = 0;
  },

  /* ---------- 终端行模型（行内容为带注音标记的单元序列） ---------- */
  _startLine: function (c) {
    if (this.cur) this._endLine();  // 上一行先收尾
    this._curColor = c;
  },
  _typeChar: function (ch) {
    if (!this.cur) this.cur = { units: [], c: this._curColor };
    var us = this.cur.units;
    var last = us[us.length - 1];
    if (!last || last.r) { us.push({ t: ch, r: null }); }
    else { last.t += ch; }
    this._checkWrap();
  },
  _typeWord: function (unit) {
    if (!this.cur) this.cur = { units: [], c: this._curColor };
    this.cur.units.push({ t: unit.t, r: unit.r });
    this._checkWrap();
  },
  _checkWrap: function () {
    var ctx = this._ctx;
    if (!ctx || !this.cur) return;
    var maxW = this.W - this.MX * 2;
    if (this._unitsWidth(ctx, this.cur.units) > maxW) {
      // 本行已满：收行，溢出的最后一段挪到新行
      var last = this.cur.units.pop();
      this._endLine();
      this.cur = { units: last ? [last] : [], c: this._curColor };
    }
  },
  _endLine: function () {
    if (this.cur && this.cur.units.length) this.rows.push(this.cur);
    else this.rows.push({ units: [], c: this._curColor });  // 空行占位
    this.cur = null;
    while (this.rows.length > this.MAX_ROWS) this.rows.shift();
  },

  /* ---------- 文本单元：宽度计算 / 绘制（含振假名） ---------- */
  _unitsWidth: function (ctx, units) {
    var w = 0;
    ctx.font = this.font;
    for (var i = 0; i < units.length; i++) w += ctx.measureText(units[i].t).width;
    return w;
  },

  _drawUnits: function (ctx, units, x, y, color, align) {
    var total = this._unitsWidth(ctx, units);
    var sx = (align === 'center') ? x - total / 2 : x;
    if (sx < 0) sx = 0;
    ctx.textAlign = 'left';
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      ctx.font = this.font;
      var w = ctx.measureText(u.t).width;
      if (u.r) {
        ctx.font = this.fontRuby;
        var rw = ctx.measureText(u.r).width;
        var rx = sx + w / 2 - rw / 2;
        if (rx < 0) rx = 0;
        ctx.fillStyle = color;
        ctx.fillText(u.r, rx, y - this._rubyGap);
      }
      ctx.font = this.font;
      ctx.fillStyle = color;
      ctx.fillText(u.t, sx, y);
      sx += w;
    }
    ctx.font = this.font;
  },

  /* ============================================================
   * 每帧渲染（引擎调用）
   * ============================================================ */
  render: function (ctx, ms) {
    // 画布尺寸随时可能随窗口变化（引擎维护），每帧同步
    this.W = ctx.canvas.width;
    this.H = ctx.canvas.height;
    this._ctx = ctx;
    if (!this.powered) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.W, this.H);
      return;
    }

    var rel = ms - this.bootAt;

    /* ---- 阶段推进 ---- */
    if (this.phase === 'boot' && rel >= T_GRID_START) {
      this.phase = 'grid';
    } else if (this.phase === 'grid' && rel >= T_TEXT_START) {
      this.phase = 'text';
    } else if (this.phase === 'text') {
      // 消费到期动作
      while (this._ai < this._actions.length && rel >= this._actions[this._ai].at) {
        this._actions[this._ai].fn();
        this._ai++;
      }
      if (this._ai >= this._actions.length) {
        this._phaseT0 = rel;
        this.phase = 'hold';
      }
    } else if (this.phase === 'hold') {
      if (rel - this._phaseT0 >= T_HOLD_MS) {
        this._phaseT0 = rel;
        this.phase = 'fade';
      }
    } else if (this.phase === 'fade') {
      if (rel - this._phaseT0 >= T_FADE_MS) {
        this.phase = 'standby';
      }
    } else if (this.phase === 'rain') {
      // 字符雨播完进入主菜单
      if (ms - this._rainAt >= RAIN_DUR_MS) this.phase = 'menu';
    }

    /* ---- 绘制 ---- */
    switch (this.phase) {
      case 'boot':    this._drawBoot(ctx, rel); break;
      case 'grid':    this._drawGrid(ctx, rel); break;
      case 'text':
      case 'hold':
      case 'fade':    this._drawText(ctx, rel); break;
      case 'standby': this._drawStandby(ctx, ms); break;
      case 'rain':    this._drawRain(ctx, ms); break;
      case 'menu':    this._drawMenu(ctx, ms); break;
      case 'settings': this._drawSettings(ctx, ms); break;
    }
  },

  /* ============================================================
   * 指针与点击（坐标均为内容层坐标，由 index.html 换算后传入）
   * ============================================================ */
  pointer: function (x, y) {
    this._px = x;
    this._py = y;
  },

  /* 返回动作名供外部播音效：enter / back / notice / reboot */
  tap: function (x, y) {
    switch (this.phase) {
      case 'standby':
        // 字符雨过渡后进入主菜单
        this._startRain();
        this.phase = 'rain';
        return 'enter';
      case 'rain':
        return 'enter';   // 过渡进行中，不打断
      case 'menu': {
        // 左侧「設定」入口
        if (this._hitSettingsBtn(x, y)) {
          this.phase = 'settings';
          return 'enter';
        }
        var idx = this._hitItem(x, y);
        if (idx >= 0) {
          var it = MENU_ITEMS[idx];
          if (it.id === 'reboot') {
            this.restart();
            return 'reboot';
          }
          // 占位项：后续在这里按 id 接入真实内容
          this._notice = {
            text: it.label + ' .......... 未接続《みせつぞく》',
            until: performance.now() + 2600
          };
          return 'notice';
        }
        this.phase = 'standby';
        return 'back';
      }
      case 'settings': {
        // 命中 ＋/－ 按钮：调节对应设置项
        for (var sbi = 0; sbi < this._settingsBtns.length; sbi++) {
          var b = this._settingsBtns[sbi];
          if (x >= b.rect.x && x <= b.rect.x + b.rect.w &&
              y >= b.rect.y && y <= b.rect.y + b.rect.h) {
            this._adjustSetting(b.idx, b.dir);
            return 'tick';
          }
        }
        // 点空白：返回菜单
        this.phase = 'menu';
        return 'back';
      }
      default:
        // 冷启动流程进行中：点击 = 重新冷启动
        this.restart();
        return 'reboot';
    }
  },

  /* 命中菜单项（含 hover 与点击共用）；未命中返回 -1 */
  _hitItem: function (x, y) {
    var ml = this._ml;
    if (!ml) return -1;
    for (var i = 0; i < MENU_ITEMS.length; i++) {
      var ty = ml.my + i * ml.rowH;
      if (y >= ty - 6 && y <= ty + 24) {
        if (ml.wide) {
          if (x >= ml.mx - 24 && x <= ml.enX + 120) return i;
        } else {
          if (x >= ml.mx - 24 && x <= ml.mx + 280) return i;
        }
      }
    }
    return -1;
  },

  /* 菜单布局：宽版（左侧用户栏 + 右侧示波器/菜单）与窄版自适应 */
  _layoutMenu: function () {
    var wide = this.W >= LAYOUT.wideMin;
    if (wide) {
      var lx = LAYOUT.lx;
      var sx = lx + 178 + 24;              // 示波器 x
      var sw = this.W - sx - this.MX;      // 示波器宽
      return {
        wide: true,
        lx: lx,
        avatar: LAYOUT.avatar,
        nameY: LAYOUT.avatar.y + LAYOUT.avatar.s + 12,
        sx: sx, sy: LAYOUT.scope.y, sw: sw, sh: LAYOUT.scope.h,
        mx: sx + 12,                       // 菜单列表 x（示波器下方，同左缘）
        my: LAYOUT.scope.y + LAYOUT.scope.h + 20,
        rowH: 25,
        enX: sx + 12 + 132                 // 菜单英文装饰列（下位装饰）
      };
    }
    // 窄版：头像缩小靠左，示波器居中，菜单紧凑纵排
    return {
      wide: false,
      lx: LAYOUT.lx,
      avatar: { x: LAYOUT.lx, y: 76, s: 44 },
      nameY: 80,
      sx: LAYOUT.lx, sy: 158,
      sw: this.W - LAYOUT.lx * 2, sh: 118,
      mx: LAYOUT.lx,
      my: 292,
      rowH: 24,
      enX: 0
    };
  },

  /* ---------- 主菜单（宽版：左侧用户栏 + 右侧示波器/菜单） ---------- */
  _drawMenu: function (ctx, ms) {
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    var line = this.color('line');
    var dim = this.color('dim');
    var text = this.color('text');
    var bright = this.color('bright');

    // ---- 顶部状态行与时钟 ----
    this._drawUnits(ctx, parseRuby('KX-15 :: 機能一覧《きのういちらん》'), this.MX, 46, text);
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var clock = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var cw = this._unitsWidth(ctx, [{ t: clock }]);
    this._drawUnits(ctx, [{ t: clock }], this.W - this.MX - cw, 46, text);

    // ---- 布局（宽/窄自适应，缓存） ----
    var wide = this.W >= LAYOUT.wideMin;
    if (!this._ml || this._ml.wide !== wide) this._ml = this._layoutMenu();
    var ml = this._ml;

    // ================= 左栏：头像框（内嵌微型李萨如图形）+ 用户信息 =================
    var av = ml.avatar;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(av.x + 0.5, av.y + 0.5, av.s, av.s);
    // 框内：黑底上缓缓旋转的李萨如图形
    ctx.fillStyle = this.color('bg');
    ctx.globalAlpha = 1;
    ctx.fillRect(av.x + 2, av.y + 2, av.s - 4, av.s - 4);
    this._drawLissajous(ctx, av.x + av.s / 2, av.y + av.s / 2, Math.max(8, av.s / 2 - 10), ms * 0.001, line, dim, text, bright);

    if (wide) {
      // 名字 / 假名 / 罗马字 / 身份（亮度统一到冷启动文字标准，不再额外减淡）
      ctx.font = this.font;
      ctx.fillStyle = bright;
      ctx.textAlign = 'left';
      ctx.fillText(OPERATOR.name, ml.lx, ml.nameY);
      ctx.font = this.fontSm;
      ctx.fillStyle = text;
      ctx.fillText(OPERATOR.kana, ml.lx, ml.nameY + 26);
      ctx.fillStyle = dim;
      ctx.fillText(OPERATOR.romaji, ml.lx, ml.nameY + 42);
      this._drawUnits(ctx, parseRuby('身分《みぶん》 : 管理者《かんりしゃ》'), ml.lx, ml.nameY + 60, text);
      // 「設定」入口（身份下方）
      var setHover = this._hitSettingsBtn(this._px, this._py);
      var setUnits = setHover
        ? [{ t: '> 『' }, { t: '設定', r: 'せってい' }, { t: '』' }]
        : [{ t: '> ' }, { t: '設定', r: 'せってい' }];
      var setY = ml.nameY + 94;
      this._drawUnits(ctx, setUnits, ml.lx, setY, setHover ? bright : text);
      this._settingsEntryRect = { x: ml.lx, y: setY, w: this._unitsWidth(ctx, setUnits), h: 22 };
      // 底部提示（左栏最下方）
      this._drawUnits(ctx, parseRuby('余白《よはく》を押すと待機《たいき》に戻る'), ml.lx, this.H - 52, text);
    } else {
      // 窄版：名字在头像右侧，身份一行（紧凑小字）
      ctx.font = this.font;
      ctx.fillStyle = bright;
      ctx.textAlign = 'left';
      ctx.fillText(OPERATOR.name, av.x + av.s + 10, 78);
      ctx.font = this.fontSm;
      ctx.fillStyle = text;
      ctx.fillText('身分 : 管理者', av.x + av.s + 10, 106);
      // 窄版「設定」入口
      var setHoverN = this._hitSettingsBtn(this._px, this._py);
      var setUnitsN = setHoverN
        ? [{ t: '> 『' }, { t: '設定', r: 'せってい' }, { t: '』' }]
        : [{ t: '> ' }, { t: '設定', r: 'せってい' }];
      this._drawUnits(ctx, setUnitsN, av.x + av.s + 10, 136, setHoverN ? bright : text);
      this._settingsEntryRect = { x: av.x + av.s + 10, y: 136, w: this._unitsWidth(ctx, setUnitsN), h: 22 };
      // 窄版底部提示（短文案）
      this._drawUnits(ctx, parseRuby('余白《よはく》を押すと待機《たいき》に戻る'), this.MX, this.H - 52, text);
    }

    // ================= 右侧：背景图（原波形图位置，四边羽化自然融入） =================
    // 图片素材左缘与菜单 『>』 列对齐
    var sy = ml.sy, sh = ml.sh;
    var bgX = ml.mx;
    var bgW = (ml.sx + ml.sw) - ml.mx;
    this._drawMenuBg(ctx, bgX, sy, bgW, sh);

    // ================= 菜单列表（悬停 『』 框选；英文作下位装饰） =================
    var hover = this._hitItem(this._px, this._py);
    ctx.textAlign = 'left';
    for (var i = 0; i < MENU_ITEMS.length; i++) {
      var it = MENU_ITEMS[i];
      var y = ml.my + i * ml.rowH;
      var hoverUnits = [{ t: '> 『' }, { t: it.label, r: it.ruby }, { t: '』' }];
      var plainUnits = [{ t: '> ' }, { t: it.label, r: it.ruby }];
      var units = (i === hover) ? hoverUnits : plainUnits;
      this._drawUnits(ctx, units, ml.mx, y, (i === hover) ? bright : text);
      // 英文作为下位装饰：小字、更暗
      if (ml.wide) {
        ctx.font = '12px Consolas, "MS Gothic", monospace';
        ctx.fillStyle = dim;
        ctx.globalAlpha = (i === hover) ? 0.85 : 0.55;
        ctx.fillText(it.en, ml.enX, y + 6);
      } else {
        var uw = this._unitsWidth(ctx, units);
        ctx.font = '12px Consolas, "MS Gothic", monospace';
        ctx.fillStyle = dim;
        ctx.globalAlpha = (i === hover) ? 0.85 : 0.55;
        ctx.fillText(it.en, ml.mx + uw + 10, y + 7);
      }
    }

    // notice（占位项提示）显示在菜单列表下方
    if (this._notice && ms < this._notice.until) {
      this._drawUnits(ctx, parseRuby(this._notice.text), ml.mx, ml.my + MENU_ITEMS.length * ml.rowH + 10, text);
    }
    ctx.globalAlpha = 1;
  },

  /* ---------- 菜单背景图：四边羽化自然融入 ---------- */
  _drawMenuBg: function (ctx, sx, sy, sw, sh) {
    if (sw < 40 || sh < 30) return;
    var src = this._bgImg || this._bgFallback;
    if (!src) return;
    var w = Math.round(sw), h = Math.round(sh);
    var key = w + 'x' + h + (src === this._bgImg ? ':e' : ':f');
    if (this._bgKey !== key || !this._bgFeather) {
      this._bgFeather = this._makeFeather(src, w, h);
      this._bgKey = key;
    }
    if (!this._bgFeather) return;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this._bgFeather, sx, sy);
    ctx.globalAlpha = 1;
  },

  _makeFeather: function (img, w, h) {
    if (!img) return null;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    // contain 适配（保持完整构图；水平左对齐，与菜单 『>』 列齐平，垂直居中）
    var ir = img.width / img.height, r = w / h;
    var dw, dh, dx, dy;
    if (ir > r) { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
    else { dh = h; dw = h * ir; dx = 0; dy = 0; }
    g.drawImage(img, dx, dy, dw, dh);
    // 四边羽化：destination-out 用线性渐变把边缘 alpha 擦掉
    var fx = Math.max(12, Math.round(w * 0.18));
    var fy = Math.max(10, Math.round(h * 0.24));
    var edges = [
      [0, 0, fx, h, 0, 0, fx, 0],
      [w - fx, 0, fx, h, w, 0, w - fx, 0],
      [0, 0, w, fy, 0, 0, 0, fy],
      [0, h - fy, w, fy, 0, h, 0, h - fy]
    ];
    g.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var gr = g.createLinearGradient(e[4], e[5], e[6], e[7]);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(e[0], e[1], e[2], e[3]);
    }
    return c;
  },

  /* ---------- 李萨如曲线：Fy:Fx=1:1，相位差缓慢扫描 ---------- */
  _drawLissajous: function (ctx, cx, cy, R, t, line, dim, text, bright) {
    if (R < 8) return;
    // 参考十字（大小随半径缩放）
    var cs = Math.max(2, R * 0.16);
    ctx.fillStyle = line;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(cx - cs / 2, cy - 0.5, cs, 1);
    ctx.fillRect(cx - 0.5, cy - cs / 2, 1, cs);

    // 相位差 delta 每 ~12s 扫过一整周：圆 ↔ 椭圆 ↔ 直线 循环
    var delta = (t * 0.5) % (Math.PI * 2);
    // 亮点沿曲线转圈（~7s 一周），只保留亮点附近的尾迹
    var head = (t * 0.9) % (Math.PI * 2);
    var tau = 1.5;

    // 整圈暗影（示波器余晖感）
    ctx.strokeStyle = dim;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var th = 0; th <= Math.PI * 2 + 0.02; th += 0.05) {
      var px = cx + Math.sin(th) * R;
      var py = cy + Math.sin(th + delta) * R;
      if (th === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 亮点尾迹（跟随 head，亮度向尾部衰减）
    var SEG = 46;
    ctx.strokeStyle = text;
    ctx.lineWidth = 1.4;
    for (var s = 0; s < SEG; s++) {
      var a = s / SEG;
      var th2 = head - tau + tau * a;
      var px2 = cx + Math.sin(th2) * R;
      var py2 = cy + Math.sin(th2 + delta) * R;
      ctx.globalAlpha = 0.15 + 0.8 * a * a;
      ctx.beginPath();
      ctx.moveTo(px2, py2);
      ctx.lineTo(px2 + 0.6, py2 + 0.6);
      ctx.stroke();
    }

    // 亮点
    var hx = cx + Math.sin(head) * R;
    var hy = cy + Math.sin(head + delta) * R;
    ctx.fillStyle = bright;
    ctx.globalAlpha = 1;
    ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
    ctx.globalAlpha = 1;
  },

  /* ============================================================
   * 设置界面
   * ============================================================ */
  _hitSettingsBtn: function (x, y) {
    var r = this._settingsEntryRect;
    if (!r) return false;
    return x >= r.x - 20 && x <= r.x + r.w + 24 && y >= r.y - 4 && y <= r.y + r.h;
  },

  _drawSettings: function (ctx, ms) {
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    var text = this.color('text');
    var bright = this.color('bright');

    // 标题与时钟
    this._drawUnits(ctx, parseRuby('KX-15 :: 設定《せってい》'), this.MX, 46, text);
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var clock = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var cw = this._unitsWidth(ctx, [{ t: clock }]);
    this._drawUnits(ctx, [{ t: clock }], this.W - this.MX - cw, 46, text);

    // 布局
    var wide = this.W >= LAYOUT.wideMin;
    var rowH = wide ? 36 : 30;
    var nameW = wide ? 160 : 130;
    var btnW = wide ? 46 : 40;
    var barW = wide ? 130 : 90;
    var gap = wide ? 14 : 10;
    var blockW = nameW + btnW + gap + barW + gap + btnW;
    var x0 = Math.max(this.MX, Math.round((this.W - blockW) / 2));
    var y0 = 120;
    var px = this._px, py = this._py;
    var inRect = function (r) {
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    };

    this._settingsBtns = [];
    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      var it = SETTINGS_ITEMS[i];
      var y = y0 + i * rowH;
      // 名称
      this._drawUnits(ctx, [{ t: it.label, r: it.ruby }], x0, y, text);
      // 控件位置
      var minusX = x0 + nameW;
      var barX = x0 + nameW + btnW + gap;
      var plusX = barX + barW + gap;
      var mRect = { x: minusX - 4, y: y - 3, w: btnW, h: 26 };
      var pRect = { x: plusX - 4, y: y - 3, w: btnW, h: 26 };
      this._settingsBtns.push({ idx: i, dir: -1, rect: mRect });
      this._settingsBtns.push({ idx: i, dir: 1, rect: pRect });
      // [－] [＋]
      this._drawSettingBtn(ctx, minusX, y, '－', inRect(mRect));
      this._drawSettingBtn(ctx, plusX, y, '＋', inRect(pRect));
      // 中间：滑条或枚举文本
      if (it.type === 'enum') {
        var lab = it.labels[it.get(this)] || { t: '?' };
        this._drawUnits(ctx, [lab], barX + barW / 2, y, bright, 'center');
      } else {
        var v = it.get(this);
        var frac = Math.max(0, Math.min(1, (v - it.min) / (it.max - it.min)));
        this._drawSlider(ctx, barX, y, barW, frac);
      }
    }

    // 底部提示
    this._drawUnits(ctx, parseRuby('余白《よはく》を押すと戻る'), this.MX, this.H - 52, text);
    ctx.globalAlpha = 1;
  },

  /* 小的 [－]/[＋] 按钮 */
  _drawSettingBtn: function (ctx, x, y, ch, hovered) {
    var s = '[' + ch + ']';
    ctx.font = this.font;
    if (hovered) {
      ctx.fillStyle = this.color('line');
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x - 3, y - 2, 44, 24);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.color('bright');
    } else {
      ctx.fillStyle = this.color('text');
    }
    ctx.fillText(s, x, y);
  },

  /* 分段滑条 */
  _drawSlider: function (ctx, x, y, w, frac) {
    var seg = 10;
    var g = 3;
    var segW = (w - (seg - 1) * g) / seg;
    var lit = Math.round(frac * seg);
    for (var i = 0; i < seg; i++) {
      if (i < lit) {
        ctx.fillStyle = this.color('text');
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = this.color('line');
        ctx.globalAlpha = 0.5;
      }
      ctx.fillRect(x + i * (segW + g), y + 5, segW, 10);
    }
    ctx.globalAlpha = 1;
  },

  /* 调节一项设置（dir: -1 / +1），并持久化 */
  _adjustSetting: function (idx, dir) {
    var it = SETTINGS_ITEMS[idx];
    if (!it) return;
    if (it.type === 'enum') {
      var n = it.values.length;
      var cur = it.get(this);
      it.set((cur + dir + n) % n, this);
    } else {
      var v = it.get(this) + dir * it.step;
      v = Math.round(v / it.step) * it.step;
      v = +v.toFixed(4);
      v = Math.max(it.min, Math.min(it.max, v));
      it.set(v, this);
    }
    this._saveSettings();
  },

  _saveSettings: function () {
    try {
      var data = {};
      for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
        data[SETTINGS_ITEMS[i].id] = SETTINGS_ITEMS[i].get(this);
      }
      localStorage.setItem('kx15-settings', JSON.stringify(data));
    } catch (e) { /* 隐私模式/file:// 下静默 */ }
  },

  _loadSettings: function () {
    var raw = null;
    try { raw = localStorage.getItem('kx15-settings'); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      var it = SETTINGS_ITEMS[i];
      if (data[it.id] === undefined || data[it.id] === null) continue;
      try {
        if (it.type === 'enum') {
          var n = it.values.length;
          it.set(Math.max(0, Math.min(n - 1, data[it.id] | 0)), this);
        } else {
          var v = +data[it.id];
          if (isNaN(v)) continue;
          v = Math.max(it.min, Math.min(it.max, v));
          it.set(v, this);
        }
      } catch (e) { /* 单项失败不影响其它 */ }
    }
  },

  /* ---------- 字符雨（待机 -> 菜单过渡） ---------- */
  _startRain: function () {
    this._rainAt = performance.now();
    this._rainLast = this._rainAt;
    var cols = Math.max(20, Math.floor(this.W / 12));
    var rows = Math.floor(this.H / 14);
    var list = [];
    for (var i = 0; i < cols; i++) {
      list.push({
        y: -(Math.random() * rows * 0.6),
        ly: -(Math.random() * rows * 0.6),
        spd: 3 + Math.random() * 7
      });
    }
    var cells = [];
    for (var c = 0; c < cols; c++) cells.push(new Array(rows));
    this._rainCols = list;
    this._rainCells = cells;
    this._rainRows = rows;
  },

  _drawRain: function (ctx, ms) {
    var bg = this.color('bg');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    var cols = this._rainCols.length;
    var rows = this._rainRows;
    if (!cols || !rows) return;

    var dt = Math.min(90, Math.max(1, ms - this._rainLast));
    this._rainLast = ms;
    var t = ms - this._rainAt;
    // 结尾淡出
    var fade = Math.min(1, (RAIN_DUR_MS - t) / 260);
    if (fade <= 0) return;

    // ---- 推进 ----
    var c, yy;
    for (c = 0; c < cols; c++) {
      var col = this._rainCols[c];
      col.y += col.spd * dt / 1000;
      var lo = Math.floor(col.ly) + 1;
      var hi = Math.floor(col.y);
      if (lo < 0) lo = 0;
      if (hi > rows - 1) hi = rows - 1;
      for (yy = lo; yy <= hi; yy++) {
        this._rainCells[c][yy] = RAIN_CHARS.charAt(Math.floor(Math.random() * RAIN_CHARS.length));
      }
      col.ly = col.y;
      // 出底后整列重置
      if (col.y > rows + RAIN_TRAIL) {
        col.y = col.ly = -(2 + Math.random() * 12);
        col.spd = 3 + Math.random() * 7;
        for (yy = 0; yy < rows; yy++) this._rainCells[c][yy] = null;
      }
    }

    // ---- 绘制 ----
    ctx.font = '12px Consolas, "Courier New", "MS Gothic", "Yu Gothic", monospace';
    var text = this.color('text');
    var bright = this.color('bright');
    var colW = 12, rowH = 14;
    for (c = 0; c < cols; c++) {
      var col2 = this._rainCols[c];
      var headY = Math.floor(col2.y);
      for (var k = 0; k <= RAIN_TRAIL; k++) {
        yy = headY - k;
        if (yy < 0 || yy >= rows) continue;
        var ch = this._rainCells[c][yy];
        if (!ch) continue;
        var step = k / (RAIN_TRAIL + 1);
        ctx.fillStyle = (k === 0) ? bright : text;
        ctx.globalAlpha = Math.max(0, (1 - step)) * Math.max(0, (1 - step)) * 0.95 * fade;
        ctx.fillText(ch, c * colW + 1, yy * rowH + 1);
      }
    }
    ctx.globalAlpha = 1;
  },

  /* ---------- 通电：亮线展开 ---------- */
  _drawBoot: function (ctx, rel) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W, this.H);
    var cy = this.H / 2;
    var v;
    if (rel < 260) {
      // 中心一条亮线建立（偏转线圈启动）
      v = Math.round(255 * (rel / 260));
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      ctx.fillRect(0, cy - 2, this.W, 4);
    } else if (rel < 620) {
      // 垂直展开到全屏，亮度由刺眼回落
      var e = 1 - Math.pow(1 - (rel - 260) / 360, 3);
      var h = 4 + (this.H - 4) * e;
      var vv = Math.round(255 - (255 - 150) * e);
      ctx.fillStyle = 'rgb(' + vv + ',' + vv + ',' + vv + ')';
      ctx.fillRect(0, cy - h / 2, this.W, h);
    } else if (rel < 860) {
      // 预热稳定：全屏辉光缓缓收敛
      var k = (rel - 620) / 240;
      var v3 = Math.round(150 - (150 - 70) * k);
      ctx.fillStyle = 'rgb(' + v3 + ',' + v3 + ',' + v3 + ')';
      ctx.fillRect(0, 0, this.W, this.H);
    } else {
      // 熄灭，让位给几何校准
      var k2 = Math.min(1, (rel - 860) / 140);
      var v4 = Math.round(70 * (1 - k2));
      ctx.fillStyle = 'rgb(' + v4 + ',' + v4 + ',' + v4 + ')';
      ctx.fillRect(0, 0, this.W, this.H);
    }
  },

  /* ---------- 几何校准网格（曲面效果最直观的段落） ---------- */
  _drawGrid: function (ctx, rel) {
    var bg = this.color('bg');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.W, this.H);

    // 网格
    ctx.fillStyle = this.color('line');
    var i;
    for (i = 48; i < this.W; i += 48) ctx.fillRect(i, 0, 1, this.H);
    for (i = 48; i < this.H; i += 48) ctx.fillRect(0, i, this.W, 1);

    // 中央十字（长短随画布比例自适应）
    ctx.fillStyle = this.color('dim');
    var cx = this.W / 2, cy = this.H / 2;
    var armW = Math.min(this.W * 0.3, 240);
    var armH = Math.min(this.H * 0.3, 180);
    ctx.fillRect(cx - armW, cy, armW * 2, 2);
    ctx.fillRect(cx, cy - armH, 2, armH * 2);

    // 底部一行说明（注意：y 需在 overscan 裁切区之内；亮度与冷启动文字一致）
    ctx.globalAlpha = 1;
    this._drawUnits(ctx, parseRuby('図形《ずけい》・収束《しゅうそく》・検査《けんさ》'), this.W / 2, this.H - 58, this.color('text'), 'center');
    ctx.textAlign = 'left';
  },

  /* ---------- 自检文本 ---------- */
  _drawText: function (ctx, rel) {
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(0, 0, this.W, this.H);

    var alpha = 1;
    if (this.phase === 'fade') {
      alpha = Math.max(0, 1 - (rel - this._phaseT0) / T_FADE_MS);
    }
    ctx.globalAlpha = alpha;
    ctx.font = this.font;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // 文本块整体居中：以自检脚本最宽一行宽度为块宽，块中心对准画布中心
    if (this._blockMaxW === null) {
      var bw = 0;
      for (var bi = 0; bi < BOOT_SCRIPT.length; bi++) {
        var tw = this._unitsWidth(ctx, parseRuby(BOOT_SCRIPT[bi].t));
        if (tw > bw) bw = tw;
      }
      this._blockMaxW = bw;
    }
    var bx = Math.max(this.MX, Math.round((this.W - this._blockMaxW) / 2));

    var i;
    for (i = 0; i < this.rows.length; i++) {
      this._drawUnits(ctx, this.rows[i].units, bx, this.TOP + i * this.LH, this.color(this.rows[i].c));
    }
    // 正在输入的一行
    if (this.cur && this.phase !== 'fade') {
      this._drawUnits(ctx, this.cur.units, bx, this.TOP + this.rows.length * this.LH, this.color(this.cur.c));
    }
    // 光标（打字与停留阶段闪烁）
    if (this.phase === 'text' || this.phase === 'hold') {
      var blinkOn = (Math.floor(rel / 480) % 2) === 0;
      if (blinkOn) {
        var y, x = bx;
        if (this.cur) {
          y = this.TOP + this.rows.length * this.LH;
          x += this._unitsWidth(ctx, this.cur.units);
        } else if (this.rows.length) {
          y = this.TOP + (this.rows.length - 1) * this.LH;
          x += this._unitsWidth(ctx, this.rows[this.rows.length - 1].units);
        } else {
          y = this.TOP;
        }
        ctx.fillStyle = this.color('bright');
        ctx.globalAlpha = alpha;
        ctx.fillRect(x + 2, y + 2, 10, 15);
      }
    }
    ctx.globalAlpha = 1;
  },

  /* ---------- 待机画面（等待后续接入内容） ---------- */
  _drawStandby: function (ctx, ms) {
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 1;
    var dim = this.color('dim');

    // 左上角状态小字（亮度统一到冷启动文字标准：正文=text 色满亮）
    this._drawUnits(ctx, parseRuby('KX-15 :: 待機中《たいきちゅう》'), this.MX, 46, this.color('text'));

    // 右下角真实时钟
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var clock = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var clockUnits = [{ t: clock }];
    var cw = this._unitsWidth(ctx, clockUnits);
    this._drawUnits(ctx, clockUnits, this.W - this.MX - cw, this.H - 52, this.color('text'));

    // 底部提示
    this._drawUnits(ctx, parseRuby('画面《がめん》を押してください'), this.MX, this.H - 52, this.color('text'));

    // ---- 中央：当前管理员 - 円森 綾夕 ----
    var cx = this.W / 2;
    var blinkOn = (Math.floor(ms / 1300) % 2) === 0;

    this._drawUnits(ctx, parseRuby('管理者《かんりしゃ》'), cx, this.H / 2 - 88, dim, 'center');

    ctx.font = this.fontLg;
    ctx.fillStyle = this.color('bright');
    ctx.textAlign = 'center';
    ctx.fillText('円森 綾夕', cx, this.H / 2 - 66);
    ctx.textAlign = 'left';

    ctx.font = this.fontSm;
    ctx.fillStyle = this.color('text');
    ctx.textAlign = 'center';
    ctx.fillText('まどかもり あやゆ', cx, this.H / 2 - 30);
    ctx.textAlign = 'left';
    ctx.fillStyle = dim;
    ctx.textAlign = 'center';
    ctx.fillText('Madokamori Ayayu', cx, this.H / 2 - 12);
    ctx.textAlign = 'left';

    // 闪烁的待命信息 + 块状光标（与冷启动文字同亮度）
    ctx.globalAlpha = blinkOn ? 1.0 : 0.35;
    var msgUnits = parseRuby('信号《しんごう》を待っています');
    this._drawUnits(ctx, msgUnits, cx, this.H / 2 + 26, this.color('text'), 'center');

    if (blinkOn) {
      var tw = this._unitsWidth(ctx, msgUnits);
      ctx.fillStyle = this.color('text');
      ctx.fillRect(cx + tw / 2 + 6, this.H / 2 + 27, 10, 17);
    }
    ctx.globalAlpha = 1;
  }
};
