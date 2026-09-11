/* ============================================================
 * CRT SCREEN —— 开机音效（纯 WebAudio 合成，无外部音频文件）
 * ------------------------------------------------------------
 * 浏览器自动播放限制：首次点击屏幕时才会真正出声。
 * sound.boot() 由页面点击处理调用；若音频尚未解锁则静默跳过，
 * 不报错、不影响画面。
 * ============================================================ */
'use strict';

var sound = (function () {
  var ac = null;
  var master = null;
  var volume = 0.5;   // 用户音量档（0~1，设置界面可调）

  function unlock() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = volume;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  /* 设置音量（未解锁时先记住，解锁时生效） */
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }
  function getVolume() { return volume; }

  /* 一段带包络的振荡 */
  function tone(type, f0, f1, t0, dur, vol) {
    if (!ac) return;
    var t = ac.currentTime + t0;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* 一段滤波噪声（开关咔哒、高压冲击用） */
  function noiseBurst(t0, dur, vol, freq) {
    if (!ac) return;
    var t = ac.currentTime + t0;
    var len = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    var src = ac.createBufferSource();
    src.buffer = buf;
    var bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq || 900;
    bp.Q.value = 0.8;
    var g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t);
  }

  /* 冷启动音序：咔哒 -> 消磁哼 -> 高压啵 -> 行频啸叫 -> 电源哼消退 */
  function boot() {
    if (!unlock()) return;
    noiseBurst(0.00, 0.03, 0.16, 700);           // 电源开关咔哒
    tone('sine', 50, 47, 0.05, 0.55, 0.07);      // 消磁线圈 50Hz 哼
    tone('sine', 100, 96, 0.05, 0.55, 0.035);    // 哼的二次谐波
    tone('sine', 130, 28, 0.16, 0.12, 0.22);     // 高压建立的"啵"
    noiseBurst(0.18, 0.05, 0.10, 2400);          // 高压噼啪
    tone('sine', 15625, 15625, 0.30, 1.6, 0.004);// 行频啸叫（很轻）
    tone('sine', 100, 100, 0.30, 2.2, 0.010);    // 电源哼
    tone('sine', 200, 200, 0.30, 2.0, 0.005);    // 哼的高次
  }

  /* 菜单交互音：enter 进入 / back 返回 / notice 占位项 / reboot 冷启动 / tick 调节 */
  function ui(act) {
    if (!act) return;
    if (act === 'enter') {
      tone('square', 620, 880, 0, 0.09, 0.05);   // 唤醒上扬
    } else if (act === 'back') {
      tone('square', 520, 360, 0, 0.09, 0.045);  // 返回下沉
    } else if (act === 'notice') {
      tone('square', 220, 160, 0, 0.13, 0.05);   // 占位低鸣
    } else if (act === 'tick') {
      tone('square', 1400, 1400, 0, 0.03, 0.035); // 调节旋钮短促声
    } else if (act === 'reboot') {
      boot();
    }
  }

  return { boot: boot, ui: ui, unlock: unlock, setVolume: setVolume, getVolume: getVolume };
})();
