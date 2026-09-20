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

/* 世界资料数据已移至 world-data.js（由 index.html 在 stage.js 之前加载，
   结构与填写规则见 world-template.md） */

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

/* ---------- 树节点箭头 ---------- */
var TREE_ARROW_MS = 150;   // 箭头翻转过渡时长（'›' 向右 → 旋转 90° 向下的动画）

/* ---------- 菜单界面布局常量（内容坐标） ---------- */
var LAYOUT = {
  wideMin: 520,     // 画布宽度 >= 此值用宽版内容布局
  triMin: 940,      // 画布宽度 >= 此值用三栏常驻布局（左信息 / 中内容 / 右待定）
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

  this._settingsBtns = [];     // 设置控件按钮矩形（渲染时更新）
  this._settingsRows = [];     // 设置项行矩形（树式展开用）
  this._settingsEnums = [];    // 枚举子选项矩形
  this._leftBtnRect = null;    // 左面板 [≡] 按钮矩形
  this._rightBtnRect = null;   // 右面板 [≡] 按钮矩形
  this._settingsToggleRect = null;  // 「設定」树节点矩形
  this._rightPanelOpen = false;  // 浮动模式右侧面板浮层（默认折叠）
  this._worldScroll = 0;       // 世界页树视图滚动偏移（像素）
  this._worldRowsCache = null; // 世界页可见行缓存（展开/折叠后重建）
  this._skipPrompt = false;    // 冷启动跳过确认弹窗
  this._rainNext = 'menu';     // 字符雨结束后的目标页面
  this._userPanelOpen = false; // 浮动模式下用户面板是否展开（默认折叠）
  this._leftCollapsed = false; // 三栏模式：左面板收起状态
  this._rightCollapsed = false;// 三栏模式：右面板收起状态
  this._settingsOpen = false;  // 面板内「設定」树的展开状态
  this._settingsOpenIdx = -1;  // 设定树内当前展开的项（手风琴，-1 为全收）

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
  this._rubyGap = 12;  // 注音基线相对主字顶部的上探距离（与主字分开一点）

  this.MX = 40;                // 文本左边距（overscan 裁切区外，内容安全区）
  this.TOP = 40;               // （保留）安全区上边距
  this.LH = 25;                // 行高（留出振假名空间）
  this.MAX_ROWS = 9;           // 已完成后保留行数（打字线在屏幕中心，上方能完整容纳 9 行）

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

  /* 树节点箭头角度：0=向右（收起）/ 90=向下（展开），状态变化时平滑翻转、
     中途切换从当前角度接续，不跳变。首次出现直接到位。 */
  _treeArrowAngle: function (holder, key, open, ms) {
    var ar = holder[key];
    if (!ar) ar = holder[key] = { o: open, from: open ? 90 : 0, t0: -1e9 };
    if (ar.o !== open) {
      var p = (ms - ar.t0) / TREE_ARROW_MS;
      if (p < 0) p = 0; if (p > 1) p = 1;
      p = p * (2 - p);                       // easeOutQuad：当前所处角度
      ar.from = ar.o ? 90 * p : 90 * (1 - p);
      ar.o = open;
      ar.t0 = ms;
    }
    var t = (ms - ar.t0) / TREE_ARROW_MS;
    if (t < 0) t = 0; if (t > 1) t = 1;
    t = t * (2 - t);
    var to = open ? 90 : 0;
    return ar.from + (to - ar.from) * t;
  },

  /* 绘制树节点箭头：'›' 字符绕自身中心旋转（deg 度）。x 为原字符绘制点，
     16px 字符框内居中，旋转前后位置一致。 */
  _drawTreeArrow: function (ctx, x, y, deg, color) {
    var ch = '›';
    var w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + 8, y + 8);
    if (deg) ctx.rotate(deg * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(ch, -w / 2, -8);
    ctx.restore();
  },

  /* 右下角时钟（所有页面统一，与待机页一致） */
  _drawClockBR: function (ctx) {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var clock = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var cw = this._unitsWidth(ctx, [{ t: clock }]);
    this._drawUnits(ctx, [{ t: clock }], this.W - this.MX - cw, this.H - 52, this.color('text'));
  },

  /* ============================================================
   * 每帧渲染（引擎调用）
   * ============================================================ */
  render: function (ctx, ms) {
    // 画布尺寸随窗口变化（引擎维护）；内容包括层仍按 480 设计高绘制，
    // 竖向窗口时整体垂直居中（上下留出屏幕玻璃的暗区）
    var pH = ctx.canvas.height;
    this.W = ctx.canvas.width;
    this.H = 480;
    this._yOff = Math.max(0, Math.round((pH - this.H) / 2));
    this._ctx = ctx;

    // 每帧重置变换（防止上一帧的 translate 累积），先用底色铺满全画布
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = (!this.powered || this.phase === 'boot') ? '#000' : this.color('bg');
    ctx.fillRect(0, 0, ctx.canvas.width, pH);

    if (!this.powered) {
      return;
    }

    // 进入内容坐标系（设计高 480，居中）
    ctx.translate(0, this._yOff);

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
      // 字符雨播完进入目标页面（菜单 / 待机）
      if (ms - this._rainAt >= RAIN_DUR_MS) this.phase = this._rainNext || 'menu';
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
      case 'world':    this._drawWorld(ctx, ms); break;
    }

    /* ---- 跳过确认弹窗（覆盖在冷启动画面上） ---- */
    if (this._skipPrompt) {
      if (this.phase === 'boot' || this.phase === 'grid' || this.phase === 'text' ||
          this.phase === 'hold' || this.phase === 'fade') {
        this._drawSkipPrompt(ctx);
      } else {
        this._skipPrompt = false;   // 动画已自然结束，弹窗自动消失
      }
    }
  },

  /* ============================================================
   * 指针与点击（坐标均为内容层物理坐标，由 index.html 换算后传入；
   * 竖向窗口时先减去居中偏移，映射到 480 设计坐标系）
   * ============================================================ */
  pointer: function (x, y) {
    this._px = x;
    this._py = y - (this._yOff || 0);
  },

  /* 返回动作名供外部播音效：enter / back / notice / reboot */
  tap: function (x, y) {
    y = y - (this._yOff || 0);
    // 跳过确认弹窗优先响应：确认 → 字符雨 → 待机；其余点击取消
    if (this._skipPrompt) {
      var yes = this._skipYesRect;
      if (yes && x >= yes.x && x <= yes.x + yes.w && y >= yes.y && y <= yes.y + yes.h) {
        this._skipPrompt = false;
        this._startRain('standby');
        this.phase = 'rain';
        return 'enter';
      }
      this._skipPrompt = false;
      return 'back';
    }
    // 左面板按钮：三栏控制左面板收合；浮动模式控制浮层
    if (this._hitLeftBtn(x, y)) {
      if (this._ml && this._ml.tri) {
        this._leftCollapsed = !this._leftCollapsed;
      } else {
        this._userPanelOpen = !this._userPanelOpen;
      }
      return 'tick';
    }
    // 右面板按钮：三栏控制右面板收合；浮动模式控制右浮层
    if (this._hitRightBtn(x, y)) {
      if (this._ml && this._ml.tri) {
        this._rightCollapsed = !this._rightCollapsed;
      } else {
        this._rightPanelOpen = !this._rightPanelOpen;
      }
      return 'tick';
    }
    // 面板内「設定」树与设置项（任意页面通用）
    var sAct = this._hitSettingsZone(x, y);
    if (sAct) return sAct;
    switch (this.phase) {
      case 'standby':
        // 字符雨过渡后进入主菜单
        this._startRain();
        this.phase = 'rain';
        return 'enter';
      case 'rain':
        return 'enter';   // 过渡进行中，不打断
      case 'menu': {
        // 返回按钮：回待机
        if (this._hitRect(this._backBtnRect, x, y)) {
          this.phase = 'standby';
          return 'back';
        }
        var idx = this._hitItem(x, y);
        if (idx >= 0) {
          var it = MENU_ITEMS[idx];
          if (it.id === 'reboot') {
            this.restart();
            return 'reboot';
          }
          if (it.id === 'world') {
            this.phase = 'world';
            return 'enter';
          }
          // 占位项：后续在这里按 id 接入真实内容
          this._notice = {
            text: it.label + ' .......... 未接続《みせつぞく》',
            until: performance.now() + 2600
          };
          return 'notice';
        }
        return null;   // 空白处：无动作
      }
      case 'world': {
        // 树行：展开 / 折叠（详情行与叶子节点仅轻响）
        var wi = this._hitWorldRow(x, y);
        if (wi >= 0) {
          var row = this._worldRowsCache && this._worldRowsCache[wi];
          if (row && row.type === 'node') {
            var node = row.node;
            var canOpen = (node.children && node.children.length) ||
                          (node.lines && node.lines.length);
            if (canOpen) {
              node.open = !node.open;
              this._worldRowsCache = null;   // 行列表重建
            }
          }
          return 'tick';
        }
        // 「設定」入口已移入用户面板（见 _hitSettingsZone）
        // 返回按钮：回菜单
        if (this._hitRect(this._backBtnRect, x, y)) {
          this.phase = 'menu';
          return 'back';
        }
        return null;
      }
      default:
        // 冷启动流程进行中：弹出跳过确认弹窗
        this._skipPrompt = true;
        return 'notice';
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

  /* 菜单布局：三栏常驻 / 宽版 / 窄版自适应 */
  _layoutMenu: function () {
    var wide = this.W >= LAYOUT.wideMin;
    var tri = this.W >= LAYOUT.triMin;
    if (tri) {
      // 三栏布局：左右面板各占一侧；**中间内容位置恒定**，不随面板收合移动
      var tSx = 288;                          // 内容区左缘（左面板区 260 + 间隔）
      var tRight = this.W - 214;              // 内容区右缘（右面板区左缘 - 间隔）
      var tSw = Math.max(240, tRight - tSx);
      return {
        wide: true, tri: true,
        lx: LAYOUT.lx,
        avatar: LAYOUT.avatar,
        nameY: LAYOUT.avatar.y + LAYOUT.avatar.s + 12,
        sx: tSx, sy: LAYOUT.scope.y, sw: tSw, sh: LAYOUT.scope.h,
        contentRight: tRight,
        mx: tSx + 12,
        my: LAYOUT.scope.y + LAYOUT.scope.h + 20,
        rowH: 25,
        enX: tSx + 12 + 132
      };
    }
    if (wide) {
      var lx = LAYOUT.lx;
      var sx = lx + 178 + 24;              // 内容区 x
      var sw = this.W - sx - this.MX;      // 内容区宽
      return {
        wide: true, tri: false,
        lx: lx,
        avatar: LAYOUT.avatar,
        nameY: LAYOUT.avatar.y + LAYOUT.avatar.s + 12,
        sx: sx, sy: LAYOUT.scope.y, sw: sw, sh: LAYOUT.scope.h,
        contentRight: this.W - this.MX,
        mx: sx + 12,
        my: LAYOUT.scope.y + LAYOUT.scope.h + 20,
        rowH: 25,
        enX: sx + 12 + 132
      };
    }
    // 窄版：紧凑纵排
    return {
      wide: false, tri: false,
      lx: LAYOUT.lx,
      avatar: { x: LAYOUT.lx, y: 76, s: 44 },
      nameY: 80,
      sx: LAYOUT.lx, sy: 158,
      sw: this.W - LAYOUT.lx * 2, sh: 118,
      contentRight: this.W - this.MX,
      mx: LAYOUT.lx,
      my: 292,
      rowH: 24,
      enX: 0
    };
  },

  /* ---------- 用户面板与右侧待定面板（三栏左右独立控制 / 浮动折叠） ---------- */
  _drawUserOverlay: function (ctx, ms) {
    var dim = this.color('dim');
    var text = this.color('text');
    var bright = this.color('bright');
    var tri = this._ml && this._ml.tri;
    ctx.globalAlpha = 1;

    // 本帧命中数据重置
    this._leftBtnRect = null;
    this._rightBtnRect = null;
    this._settingsToggleRect = null;
    this._settingsRows = [];
    this._settingsEnums = [];
    this._settingsBtns = [];

    if (tri) {
      // ===== 三栏模式：左右面板各占一侧（中间内容固定不动） =====
      // 左上角按钮（控制左面板）
      this._drawPanelToggle(ctx, this.MX, 68, this._leftCollapsed, -1);
      if (!this._leftCollapsed) {
        this._drawUserPanelBox(ctx, ms, this.MX, 102, 220);
      }
      // 右上角按钮（与左按钮对称，控制右面板）
      ctx.font = this.font;
      var rbw = ctx.measureText('[×]').width;
      this._drawPanelToggle(ctx, this.W - this.MX - rbw, 68, this._rightCollapsed, 1);
      // 右侧「未定」面板
      if (!this._rightCollapsed) {
        var rw = 150, rh = 80;
        var rx = this.W - this.MX - rw;
        ctx.fillStyle = this.color('bg');
        ctx.fillRect(rx, 102, rw, rh);
        this._drawUnits(ctx, parseRuby('『未定《みてい》』'), rx + rw / 2, 130, bright, 'center');
      }
      return;
    }

    // ===== 浮动折叠模式：左右按钮各控一个浮层（默认均折叠） =====
    this._drawPanelToggle(ctx, this.MX, 68, !this._userPanelOpen, -1);
    ctx.font = this.font;
    var rbw = ctx.measureText('[×]').width;
    this._drawPanelToggle(ctx, this.W - this.MX - rbw, 68, !this._rightPanelOpen, 1);
    // 右浮层先画（左面板打开时叠在它上层）
    if (this._rightPanelOpen) {
      var rw = 150, rh = 80;
      var rx = this.W - this.MX - rw;
      ctx.fillStyle = this.color('bg');
      ctx.fillRect(rx, 102, rw, rh);
      this._drawUnits(ctx, parseRuby('『未定《みてい》』'), rx + rw / 2, 130, bright, 'center');
    }
    if (!this._userPanelOpen) return;
    this._drawUserPanelBox(ctx, ms, this.MX, 102, 220);
  },

  /* 面板折叠按钮：[≡] 展开 / [×] 收起（which: -1 左 / 1 右） */
  _drawPanelToggle: function (ctx, x, y, collapsed, which) {
    ctx.font = this.font;
    var btn = collapsed ? '[≡]' : '[×]';
    var bw = ctx.measureText(btn).width;
    var r = { x: x - 4, y: y - 4, w: bw + 8, h: 28 };
    if (which === -1) this._leftBtnRect = r; else this._rightBtnRect = r;
    var hov = this._hitRect(r, this._px, this._py);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hov ? this.color('bright') : this.color('text');
    ctx.fillText(btn, x, y);
  },

  /* 用户面板内容：头部（原尺寸）+ 「設定」树（就地展开设置项） */
  _drawUserPanelBox: function (ctx, ms, px, py, pw) {
    var line = this.color('line');
    var dim = this.color('dim');
    var text = this.color('text');
    var bright = this.color('bright');

    // ---- 面板背景（高度动态：設定树展开时向下延伸） ----
    var zoneY = py + 134;      // 设置区起点（紧接設定行下方，压缩整体高度避免压到底部按钮）
    var zoneH = 0;
    if (this._settingsOpen) {
      zoneH = SETTINGS_ITEMS.length * 18;
      if (this._settingsOpenIdx >= 0) {
        var oit = SETTINGS_ITEMS[this._settingsOpenIdx];
        zoneH += (oit.type === 'enum') ? 22 : 24;
      }
    }
    var panelBottom = this._settingsOpen ? (zoneY + zoneH + 4) : (py + 148);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(px, py, pw, panelBottom - py);

    // ---- 头部（原尺寸）：头像 + 名字/假名/罗马字 + 身份 ----
    var avS = 52;
    var avX = px + 14, avY = py + 16;
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(avX + 0.5, avY + 0.5, avS, avS);
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(avX + 2, avY + 2, avS - 4, avS - 4);
    this._drawLissajous(ctx, avX + avS / 2, avY + avS / 2, Math.max(8, avS / 2 - 8), ms * 0.001, line, dim, text, bright);

    ctx.font = this.font;
    ctx.fillStyle = bright;
    ctx.textAlign = 'left';
    var tx0 = avX + avS + 14;
    ctx.fillText(OPERATOR.name, tx0, py + 18);
    ctx.font = this.fontSm;
    ctx.fillStyle = text;
    ctx.fillText(OPERATOR.kana, tx0, py + 44);
    ctx.fillStyle = dim;
    ctx.fillText(OPERATOR.romaji, tx0, py + 62);
    this._drawUnits(ctx, parseRuby('身分《みぶん》 : 管理者《かんりしゃ》'), px + 14, py + 82, text);

    // ---- 「設定」树节点（点击展开 / 折叠） ----
    var setY = py + 112;
    var setRect = { x: px + 8, y: setY - 20, w: pw - 16, h: 34 };
    this._settingsToggleRect = setRect;
    var setHover = this._hitRect(setRect, this._px, this._py);
    ctx.font = this.font;
    ctx.globalAlpha = 1;
    this._drawTreeArrow(ctx, px + 14, setY, this._treeArrowAngle(this, '_setAr', this._settingsOpen, ms), setHover ? bright : dim);
    var sNameX = px + 14 + ctx.measureText('▼').width + 6;
    var sUnits = setHover
      ? [{ t: '『' }, { t: '設定', r: 'せってい' }, { t: '』' }]
      : [{ t: '設定', r: 'せってい' }];
    this._drawUnits(ctx, sUnits, sNameX, setY, setHover ? bright : text);

    // ---- 设置区（就地展开，树式 16px 字体；紧凑行高） ----
    if (!this._settingsOpen) return;
    var oldFont = this.font, oldRuby = this.fontRuby, oldGap = this._rubyGap;
    this.font = '16px Consolas, "MS Gothic", "Yu Gothic", monospace';
    this.fontRuby = '8px "MS Gothic", "Yu Gothic", monospace';
    this._rubyGap = 10;
    var y = zoneY;
    for (var i = 0; i < SETTINGS_ITEMS.length; i++) {
      var it = SETTINGS_ITEMS[i];
      var open = this._settingsOpenIdx === i;
      var rowRect = { x: px + 14, y: y - 2, w: pw - 24, h: 16 };
      this._settingsRows.push({ idx: i, rect: rowRect });
      var rowHover = this._hitRect(rowRect, this._px, this._py);
      ctx.font = this.font;
      ctx.globalAlpha = 1;
      if (!this._rowAr) this._rowAr = {};
      this._drawTreeArrow(ctx, px + 20, y, this._treeArrowAngle(this._rowAr, 'r' + i, open, ms), rowHover ? bright : dim);
      var nameX = px + 20 + ctx.measureText('▼').width + 4;
      var nameUnits = rowHover
        ? [{ t: '『' }, { t: it.label }, { t: '』' }]
        : [{ t: it.label }];
      this._drawUnits(ctx, nameUnits, nameX, y, rowHover ? bright : text);
      y += 18;
      if (!open) continue;
      if (it.type === 'enum') {
        // 三选项横排：●緑  ○琥珀  ○白
        var ex = px + 40;
        var cur = it.get(this);
        for (var v = 0; v < it.values.length; v++) {
          var sel = cur === v;
          ctx.font = this.font;
          ctx.fillStyle = sel ? bright : dim;
          ctx.globalAlpha = 1;
          var mark = sel ? '●' : '○';
          ctx.fillText(mark, ex, y + 1);
          var labX = ex + ctx.measureText('●').width + 3;
          var lab = it.labels[v] || { t: '?' };
          var labW = this._unitsWidth(ctx, [lab]);
          var vr = { x: ex - 2, y: y - 2, w: ctx.measureText('●').width + labW + 8, h: 20 };
          var vHover = this._hitRect(vr, this._px, this._py);
          this._settingsEnums.push({ idx: i, value: v, rect: vr });
          this._drawUnits(ctx, [lab], labX, y + 1, (sel || vHover) ? bright : text);
          ex = labX + labW + 12;
        }
        y += 22;
      } else {
        // 数值控件行：[－] 滑条 [＋]
        var ctrlY = y + 2;
        var btnW = 34, gap2 = 8, barW = 60;
        var minusX = px + 40;
        var barX = minusX + btnW + gap2;
        var plusX = barX + barW + gap2;
        var mRect = { x: minusX - 4, y: ctrlY - 2, w: btnW, h: 20 };
        var pRect = { x: plusX - 4, y: ctrlY - 2, w: btnW, h: 20 };
        this._settingsBtns.push({ idx: i, dir: -1, rect: mRect });
        this._settingsBtns.push({ idx: i, dir: 1, rect: pRect });
        this._drawSettingBtn(ctx, minusX, ctrlY, '－', this._hitRect(mRect, this._px, this._py));
        this._drawSettingBtn(ctx, plusX, ctrlY, '＋', this._hitRect(pRect, this._px, this._py));
        var v2 = it.get(this);
        var frac = Math.max(0, Math.min(1, (v2 - it.min) / (it.max - it.min)));
        this._drawSlider(ctx, barX, ctrlY, barW, frac);
        y += 24;
      }
    }
    this.font = oldFont;
    this.fontRuby = oldRuby;
    this._rubyGap = oldGap;
  },

  /* 面板内「設定」树与设置项命中（任意页面通用），命中返回 'tick' */
  _hitSettingsZone: function (x, y) {
    // [－] / [＋]
    for (var i = 0; i < this._settingsBtns.length; i++) {
      var b = this._settingsBtns[i];
      if (this._hitRect(b.rect, x, y)) {
        this._adjustSetting(b.idx, b.dir);
        return 'tick';
      }
    }
    // 枚举选项
    for (var j = 0; j < this._settingsEnums.length; j++) {
      var en = this._settingsEnums[j];
      if (this._hitRect(en.rect, x, y)) {
        SETTINGS_ITEMS[en.idx].set(en.value, this);
        this._saveSettings();
        return 'tick';
      }
    }
    // 设置项行（手风琴）
    for (var k = 0; k < this._settingsRows.length; k++) {
      var r = this._settingsRows[k];
      if (this._hitRect(r.rect, x, y)) {
        this._settingsOpenIdx = (this._settingsOpenIdx === r.idx) ? -1 : r.idx;
        return 'tick';
      }
    }
    // 「設定」节点：展开 / 折叠
    if (this._hitRect(this._settingsToggleRect, x, y)) {
      this._settingsOpen = !this._settingsOpen;
      if (!this._settingsOpen) this._settingsOpenIdx = -1;
      return 'tick';
    }
    return null;
  },

  _hitLeftBtn: function (x, y) {
    return this._hitRect(this._leftBtnRect, x, y);
  },

  _hitRightBtn: function (x, y) {
    return this._hitRect(this._rightBtnRect, x, y);
  },

  /* 底部导航按钮（含 hover 高亮），返回点击区域 */
  _drawNavButton: function (ctx, units, x, y) {
    var w = this._unitsWidth(ctx, units);
    var hovered = this._hitRect({ x: x - 6, y: y - 4, w: w + 12, h: 28 }, this._px, this._py);
    if (hovered) {
      ctx.fillStyle = this.color('line');
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x - 6, y - 4, w + 12, 28);
      ctx.globalAlpha = 1;
    }
    this._drawUnits(ctx, units, x, y, hovered ? this.color('bright') : this.color('text'));
    return { x: x - 6, y: y - 4, w: w + 12, h: 28 };
  },

  _hitRect: function (r, x, y) {
    if (!r) return false;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  },

  /* ---------- 主菜单（宽版：左侧用户栏 + 右侧示波器/菜单） ---------- */
  _drawMenu: function (ctx, ms) {
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    var dim = this.color('dim');
    var text = this.color('text');
    var bright = this.color('bright');

    // ---- 顶部状态行 ----
    var titleX = this.MX;
    this._drawUnits(ctx, parseRuby('KX-15 :: 機能一覧《きのういちらん》'), titleX, 46, text);

    // ---- 布局（三栏/宽/窄自适应，缓存） ----
    var wide = this.W >= LAYOUT.wideMin;
    var tri = this.W >= LAYOUT.triMin;
    if (!this._ml || this._ml.wide !== wide || this._ml.tri !== tri) this._ml = this._layoutMenu();
    var ml = this._ml;

    // ================= 底部导航按钮与右下角时钟 =================
    this._backBtnRect = this._drawNavButton(ctx, parseRuby('[待機《たいき》へ戻る]'), this.MX, 424);
    this._drawClockBR(ctx);

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

    // ================= 两侧面板层：最后绘制（浮层永远压在页面内容之上） =================
    this._drawUserOverlay(ctx, ms);
  },

  /* ============================================================
   * 世界页：树视图
   * ============================================================ */
  scrollBy: function (dy) {
    this._worldScroll = (this._worldScroll || 0) + dy;
  },
  setWorldScroll: function (v) {
    this._worldScroll = v;
  },

  /* 把树展开状态铺平成可见行列表（节点行 + 详情行；无连线符号，层级靠缩进） */
  _worldFlatten: function () {
    var rows = [];
    var walk = function (node, depth) {
      rows.push({ type: 'node', node: node, depth: depth });
      if (node.open && node.lines && node.lines.length) {
        for (var li = 0; li < node.lines.length; li++) {
          rows.push({ type: 'text', text: node.lines[li], depth: depth + 1 });
        }
      }
      if (node.open && node.children) {
        for (var i = 0; i < node.children.length; i++) {
          walk(node.children[i], depth + 1);
        }
      }
    };
    walk(WORLD_DATA, 0);
    return rows;
  },

  /* 折行（16px 树字体）：先按句读分段，再逐段排行——避免一大段文字堆在一行；
     单段超宽时再字符级硬折（半角约 8px / 全角 16px 估算） */
  _wrapTreeText: function (s, maxW) {
    if (!s) return [''];
    function charW(c) { return c.charCodeAt(0) < 0x2E80 ? 8 : 16; }
    // 1) 按句读切段（句号、叹号、问号、引号尾）
    var segs = [];
    var cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      cur += ch;
      if ('。！？'.indexOf(ch) >= 0 || ch === '」') {
        segs.push(cur);
        cur = '';
      }
    }
    if (cur.length) segs.push(cur);
    // 2) 逐段排行
    var out = [];
    var line = '';
    var w = 0;
    function flush() { if (line.length) { out.push(line); line = ''; w = 0; } }
    for (var k = 0; k < segs.length; k++) {
      var seg = segs[k];
      var segW = 0;
      for (var j = 0; j < seg.length; j++) segW += charW(seg.charAt(j));
      if (w + segW <= maxW) {
        line += seg;
        w += segW;
      } else {
        flush();
        if (segW <= maxW) {
          line = seg;
          w = segW;
        } else {
          for (var m = 0; m < seg.length; m++) {
            var c2 = seg.charAt(m);
            var cw2 = charW(c2);
            if (w + cw2 > maxW && line.length) {
              // 避头点：标点不允许落在行首，吸到上一行
              if ('，。、；：？！）」』］｝'.indexOf(c2) >= 0) {
                line += c2;
                w += cw2;
                flush();
                continue;
              }
              flush();
            }
            line += c2;
            w += cw2;
          }
        }
      }
    }
    flush();
    if (!out.length) out.push('');
    return out;
  },

  /* 构建树的行布局（节点行固定高、详情行按折行可变高） */
  _worldBuildLayout: function (tw) {
    var rows = this._worldRowsCache;
    var items = [];
    var y = 0;
    var ROWH = 23;
    var LINEH = 19;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.type === 'node') {
        items.push({ row: row, rowIndex: i, y: y, h: ROWH, lines: null, indent: row.depth * 20 });
        y += ROWH;
      } else {
        var indent = row.depth * 20 + 10;
        var maxW = Math.max(60, tw - indent - 8);
        var lines = this._wrapTreeText(row.text, maxW);
        var h = lines.length * LINEH + 3;
        items.push({ row: row, rowIndex: i, y: y, h: h, lines: lines, indent: indent });
        y += h;
      }
    }
    return { w: tw, items: items, total: y, rowsStamp: rows };
  },

  /* 树行命中（渲染时缓存几何；返回对应 rows 索引） */
  _hitWorldRow: function (x, y) {
    var g = this._worldGeom;
    var layout = this._worldLayout;
    if (!g || !layout) return -1;
    if (x < g.tx - 12 || x > g.tx + g.tw + 12) return -1;
    if (y < g.ty || y > g.ty + g.th) return -1;
    var ly = y - g.ty + this._worldScroll;
    var items = layout.items;
    for (var i = 0; i < items.length; i++) {
      if (ly >= items[i].y && ly < items[i].y + items[i].h) return items[i].rowIndex;
    }
    return -1;
  },

  _drawWorld: function (ctx, ms) {
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    var dim = this.color('dim');
    var text = this.color('text');
    var bright = this.color('bright');

    // 顶部状态行
    var titleX = this.MX;
    this._drawUnits(ctx, parseRuby('KX-15 :: 世界《せかい》'), titleX, 46, text);

    // 布局（与菜单共用）
    var wide = this.W >= LAYOUT.wideMin;
    var tri = this.W >= LAYOUT.triMin;
    if (!this._ml || this._ml.wide !== wide || this._ml.tri !== tri) this._ml = this._layoutMenu();
    var ml = this._ml;

    // 树视图区几何：宽版下内容右界以背景图视觉右缘为分界线（屏幕右边留空）
    var tx = ml.wide ? ml.sx : this.MX;
    var tw;
    if (ml.wide) {
      var bgRight = ml.mx + Math.min((ml.sx + ml.sw) - ml.mx, LAYOUT.scope.h * 16 / 9);
      tw = Math.max(240, bgRight - tx);
    } else {
      tw = this.W - this.MX * 2;
    }
    var ty = ml.wide ? 84 : 110;   // 紧凑模式：整体下移，让开左上角按钮与首行注音空间
    var th = this.H - ty - 64;
    var rowH = 23;
    this._worldGeom = { tx: tx, ty: ty, tw: tw, th: th, rowH: rowH };

    if (!this._worldRowsCache) {
      this._worldRowsCache = this._worldFlatten();
      this._worldLayout = null;
    }
    if (!this._worldLayout || this._worldLayout.w !== tw || this._worldLayout.rowsStamp !== this._worldRowsCache) {
      this._worldLayout = this._worldBuildLayout(tw);
    }
    var layout = this._worldLayout;
    var total = layout.total;
    var maxScroll = Math.max(0, total - th);
    if (this._worldScroll > maxScroll) this._worldScroll = maxScroll;
    if (this._worldScroll < 0) this._worldScroll = 0;
    var scroll = this._worldScroll;

    // 树字体临时切紧凑（不影响其它页面）
    var oldFont = this.font, oldRuby = this.fontRuby, oldGap = this._rubyGap;
    this.font = '16px Consolas, "MS Gothic", "Yu Gothic", monospace';
    this.fontRuby = '8px "MS Gothic", "Yu Gothic", monospace';
    this._rubyGap = 10;

    ctx.save();
    ctx.beginPath();
    ctx.rect(tx - 6, ty - 16, tw + 12, th + 16);   // 上边多留 16px，保证第一行的注音完整
    ctx.clip();

    var hoverIdx = this._hitWorldRow(this._px, this._py);
    for (var i = 0; i < layout.items.length; i++) {
      var item = layout.items[i];
      var y = ty - scroll + item.y;
      if (y + item.h < ty + 1 || y > ty + th) continue;

      if (item.row.type === 'text') {
        // 详情行（缩进、暗色、已按宽度折行）
        ctx.font = this.font;
        ctx.fillStyle = dim;
        ctx.globalAlpha = 0.95;
        for (var li = 0; li < item.lines.length; li++) {
          ctx.fillText(item.lines[li], tx + item.indent, y + li * 19 + 2);
        }
        continue;
      }

      var node = item.row.node;
      var hasKids = (node.children && node.children.length) || (node.lines && node.lines.length);
      var isHover = item.rowIndex === hoverIdx;
      var px = tx + item.indent;
      // 展开箭头
      ctx.font = this.font;
      ctx.globalAlpha = 1;
      if (hasKids) {
        this._drawTreeArrow(ctx, px, y + 1, this._treeArrowAngle(node, '_ar', node.open, ms), isHover ? bright : dim);
      } else {
        ctx.fillStyle = dim;
        ctx.fillText('　', px, y + 1);
      }
      px += ctx.measureText('▼').width + 3;
      // 节点名（含注音）；鼠标选中时用 『』框选
      var units = isHover
        ? [{ t: '『' }, { t: node.label, r: node.ruby || null }, { t: '』' }]
        : [{ t: node.label, r: node.ruby || null }];
      this._drawUnits(ctx, units, px, y + 1, isHover ? bright : text);
    }
    ctx.restore();

    // 恢复字体
    this.font = oldFont;
    this.fontRuby = oldRuby;
    this._rubyGap = oldGap;

    // 滚动条（内容超出一屏时显示）
    if (maxScroll > 0) {
      var sbH = Math.max(18, th * (th / total));
      var sbY = ty + (th - sbH) * (scroll / maxScroll);
      ctx.fillStyle = dim;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(tx + tw + 8, sbY, 3, sbH);
      ctx.globalAlpha = 1;
    }

    // 底部导航按钮 + 右下角时钟 + 用户面板层
    this._backBtnRect = this._drawNavButton(ctx, parseRuby('[戻《もど》る]'), this.MX, 424);
    this._drawClockBR(ctx);
    this._drawUserOverlay(ctx, ms);
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
   * 设置辅助（用户面板内「設定」树使用）
   * ============================================================ */

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

  /* ---------- 字符雨（待机 -> 菜单 过渡；next 指定雨后的页面） ---------- */
  _startRain: function (next) {
    this._rainAt = performance.now();
    this._rainLast = this._rainAt;
    this._rainNext = next || 'menu';
    var ph = this._ctx ? this._ctx.canvas.height : this.H;
    this._rainTop = -(this._yOff || 0);   // 设计坐标中画布物理顶端（雨覆盖全画布，含上下暗区）
    var cols = Math.max(20, Math.floor(this.W / 12));
    var rows = Math.max(24, Math.ceil(ph / 14) + 2);
    var list = [];
    for (var i = 0; i < cols; i++) {
      // 一半列从画布顶端上方落下，一半列预先散布全屏——开场即满屏雨
      var fromTop = Math.random() < 0.5;
      var y0 = fromTop ? -(Math.random() * 12) : (Math.random() * rows);
      list.push({
        y: y0,
        ly: y0,
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
        ctx.fillText(ch, c * colW + 1, this._rainTop + yy * rowH + 1);
      }
    }
    ctx.globalAlpha = 1;
  },

  /* ---------- 跳过确认弹窗（冷启动中点击时出现） ---------- */
  _drawSkipPrompt: function (ctx) {
    var pw = 380;
    var phgt = 138;
    var px = Math.round((this.W - pw) / 2);
    var py = Math.round((this.H - phgt) / 2) - 8;
    // 面板底与边框
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color('bg');
    ctx.fillRect(px, py, pw, phgt);
    ctx.strokeStyle = this.color('dim');
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, pw - 2, phgt - 2);
    // 文字
    this._drawUnits(ctx, parseRuby('冷間起動《れいかんきどう》をスキップしますか？'), px + 26, py + 30, this.color('text'));
    // 按钮 [はい] / [いいえ]
    var btnY = py + 82;
    ctx.font = this.font;
    var b1 = '[はい]';
    var b2 = '[いいえ]';
    var b1w = ctx.measureText(b1).width;
    var b2w = ctx.measureText(b2).width;
    var b1x = px + 64;
    var b2x = px + pw - 64 - b2w;
    var self = this;
    function drawBtn(text, bx, bw) {
      var hov = self._px >= bx - 4 && self._px <= bx + bw + 4 &&
                self._py >= btnY - 4 && self._py <= btnY + 26;
      if (hov) {
        ctx.fillStyle = self.color('line');
        ctx.globalAlpha = 0.55;
        ctx.fillRect(bx - 4, btnY - 2, bw + 8, 26);
        ctx.globalAlpha = 1;
        ctx.fillStyle = self.color('bright');
      } else {
        ctx.fillStyle = self.color('text');
      }
      ctx.fillText(text, bx, btnY);
    }
    drawBtn(b1, b1x, b1w);
    drawBtn(b2, b2x, b2w);
    // 记录确认按钮的命中区（其余点击视作取消）
    this._skipYesRect = { x: b1x - 4, y: btnY - 4, w: b1w + 8, h: 28 };
    this._skipNoRect = { x: b2x - 4, y: btnY - 4, w: b2w + 8, h: 28 };
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
    // 打字基准线固定在屏幕中心：已完成的行向上排列，当前行停在中心，
    // 新行出现时旧行被顶上去（终端式向上生长）
    var cy = Math.round(this.H / 2);
    var n = this.rows.length;
    for (i = 0; i < n; i++) {
      this._drawUnits(ctx, this.rows[i].units, bx, cy - (n - i) * this.LH, this.color(this.rows[i].c));
    }
    // 正在输入的一行（固定在中心线）
    if (this.cur && this.phase !== 'fade') {
      this._drawUnits(ctx, this.cur.units, bx, cy, this.color(this.cur.c));
    }
    // 光标（打字与停留阶段闪烁）
    if (this.phase === 'text' || this.phase === 'hold') {
      var blinkOn = (Math.floor(rel / 480) % 2) === 0;
      if (blinkOn) {
        var y, x = bx;
        if (this.cur) {
          y = cy;
          x += this._unitsWidth(ctx, this.cur.units);
        } else if (n) {
          y = cy - this.LH;
          x += this._unitsWidth(ctx, this.rows[n - 1].units);
        } else {
          y = cy;
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

    // 右下角时钟
    this._drawClockBR(ctx);

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
