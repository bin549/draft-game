/**
 * 线稿节奏天国 — 四关原型：
 * 1 躲刺字  2 跨栏  3 躲砍头  4 射击
 */

const BPM = 110;
const BEAT = 60 / BPM;
const LEVELS = [
  {
    id: "tattoo",
    name: "精忠报国",
    desc: "躲开妈妈的刺字 · 空格闪避",
    hint: "听节拍按空格躲开针尖",
    beats: 16,
  },
  {
    id: "hurdle",
    name: "跨栏冲刺",
    desc: "踩点跳过栏杆 · 空格起跳",
    hint: "栏杆靠近脚下时按空格跳跃",
    beats: 16,
  },
  {
    id: "chop",
    name: "斩台惊魂",
    desc: "躲开刽子手砍头 · 空格缩头",
    hint: "刀落下前缩头 · 失手一次即失败",
    beats: 14,
  },
  {
    id: "shoot",
    name: "靶场齐射",
    desc: "固定放箭 · 靶心飞来",
    hint: "靶心经过准星时按空格放箭",
    beats: 16,
  },
];

/** 射击关：固定准星（归一化坐标）与靶心移速（px / 拍） */
const SHOOT_AIM = { x: 0.55, y: 0.4 };
const SHOOT_ARCHER = { x: 0.22, y: 0.72 };
const SHOOT_SPEED = 200;

let canvas, ctx;
let els = {};
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let audioCtx = null;

let mode = "select"; // select | play | result
let selectedLevel = null;
let state = null;

function on(t, type, fn) {
  t.addEventListener(type, fn);
  listeners.push([t, type, fn]);
}
function offAll() {
  for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  listeners = [];
}

function beep(freq = 660, dur = 0.06, type = "square", gain = 0.04) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch (_) {}
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createPlayState(level) {
  // 每隔一拍一次判定点（更易上手）
  const cues = [];
  for (let i = 0; i < level.beats; i++) {
    cues.push({
      beat: 2 + i * 2, // 从第 2 拍开始
      hit: false,
      judged: false,
      result: null, // perfect | miss
    });
  }
  return {
    level,
    time: 0,
    beat: 0,
    lastBeatFlash: -1,
    cues,
    cueIndex: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    miss: 0,
    hp: 100,
    feedback: "",
    feedbackTimer: 0,
    bubble: null, // { text, life }
    anim: 0,
    // per-level visual
    sonDodge: 0,
    sonHit: 0,
    jump: 0,
    hurdles: [],
    chopSwing: 0,
    headPullAmt: 0,
    headFallen: false,
    headFall: null, // { x, y, vy, rot, vr }
    failTimer: 0, // 斩台失败后短暂播动画再结算
    aimPulse: 0,
    arrows: [],
    targetHits: [],
    movingTargets: [],
    activeTarget: 0,
    done: false,
    endless: level.id === "shoot",
  };
}

function showLevelSelect() {
  mode = "select";
  running = true;
  els.hud.classList.remove("hidden");
  els.result.classList.add("hidden");
  els.levelSelect.classList.remove("hidden");
  els.levelGrid.innerHTML = "";
  for (const lv of LEVELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "char-card rhythm-card";
    btn.innerHTML = `
      <div class="char-preview" data-lv="${lv.id}"></div>
      <div class="char-body">
        <h3>${lv.name}</h3>
        <p>${lv.desc}</p>
      </div>`;
    btn.addEventListener("click", () => startLevel(lv.id));
    els.levelGrid.appendChild(btn);
  }
  requestAnimationFrame(() => paintLevelPreviews());
  cancelAnimationFrame(raf);
  lastTs = performance.now();
  raf = requestAnimationFrame(loop);
}

function paintLevelPreviews() {
  els.levelGrid.querySelectorAll(".char-preview").forEach((host) => {
    const id = host.dataset.lv;
    let c = host.querySelector("canvas");
    if (!c) {
      c = document.createElement("canvas");
      host.appendChild(c);
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = host.clientWidth || 140;
    const h = host.clientHeight || 100;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = w + "px";
    c.style.height = h + "px";
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#e8e0d2";
    g.fillRect(0, 0, w, h);
    drawLevelPreview(g, id, w, h);
  });
}

function drawLevelPreview(g, id, w, h) {
  g.strokeStyle = "#1a1a1a";
  g.lineWidth = 2;
  g.lineCap = "round";
  if (id === "tattoo") {
    drawMom(g, w * 0.38, h * 0.72, 0.75, 0.55);
    drawSonKneel(g, w * 0.58, h * 0.74, 0.75, 0);
  } else if (id === "hurdle") {
    drawHurdles(g, 10, h * 0.72, w - 20, 0);
    drawRunner(g, w * 0.45, h * 0.55, 0.85, 0.5);
  } else if (id === "chop") {
    drawBlock(g, w * 0.38, h * 0.74, 0.75);
    drawVictimHead(g, w * 0.38, h * 0.58, 0.75, 0);
    drawExecutioner(g, w * 0.58, h * 0.64, 0.78, 0.95);
  } else {
    drawArcherFG(g, w * 0.28, h * 0.78, 0.7, 0.4);
    drawTarget(g, w * 0.72, h * 0.4, 0.5, true);
  }
}

function startLevel(id) {
  selectedLevel = LEVELS.find((l) => l.id === id);
  if (!selectedLevel) return;
  state = createPlayState(selectedLevel);
  // 跨栏预置栏杆
  state.hurdles = [];
  for (let i = 0; i < selectedLevel.beats; i++) {
    state.hurdles.push({ beat: 2 + i * 2, passed: false });
  }
  // 射击：靶心与拍点绑定，无限续生
  state.movingTargets = [];
  for (const c of state.cues) {
    state.movingTargets.push({ beat: c.beat, destroyed: false, tripped: false });
  }
  mode = "play";
  els.levelSelect.classList.add("hidden");
  els.result.classList.add("hidden");
  updateHud();
  beep(440, 0.08);
  lastTs = performance.now();
}

function updateHud() {
  if (!state) {
    els.scoreText.textContent = "选择关卡";
    els.comboText.textContent = "";
    els.hpFill.style.transform = "scaleX(1)";
    return;
  }
  els.scoreText.textContent = `分数 ${state.score}`;
  els.comboText.textContent = state.combo > 1 ? `连击 ${state.combo}` : selectedLevel.name;
  els.hpFill.style.transform = `scaleX(${Math.max(0, state.hp / 100)})`;
}

function judgeInput() {
  if (mode !== "play" || !state || state.done || state.failTimer > 0) return;
  const beatTime = state.time / BEAT;
  const id = state.level.id;

  // 各关：按下立刻给动作反馈（判定另算）
  if (id === "hurdle") state.jump = 0.45;
  else if (id === "tattoo") state.sonDodge = 0.4;
  else if (id === "chop") state.headPullAmt = 1;
  else if (id === "shoot") fireShotVisual();

  // 找最近未判定 cue — 仅 Perfect / Miss
  // 跨栏 / 刺字：略放宽提前按，减轻「画面已到、音轨还早」的滞后感
  const HIT = id === "hurdle" || id === "tattoo" ? 0.3 : 0.22;
  const EARLY = id === "hurdle" ? 0.42 : id === "tattoo" ? 0.34 : 0.22;
  let best = null;
  let bestAbs = 999;
  for (const c of state.cues) {
    if (c.judged) continue;
    const d = beatTime - c.beat;
    const abs = Math.abs(d);
    // 过早超出 EARLY、过晚超出 HIT 都不收
    if (d < -EARLY || d > HIT) continue;
    if (abs < bestAbs) {
      bestAbs = abs;
      best = c;
    }
  }
  // 窗口外按下：不结算（等过点自动 Miss），也不显示 Good/太早
  if (!best) return;

  best.judged = true;
  best.hit = true;
  best.result = "perfect";
  state.perfect += 1;
  state.score += 300;
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  flashFeedback("Perfect!", "#3a8f6e");
  beep(880, 0.05);
  applySuccessAction(best);
  updateHud();
}

/** 拍点连续动作：靠近蓄力 → 越过续势，不会瞬间切到下一拍 */
function cueMotion(beat, cueBeat, wind = 0.55, follow = 0.45) {
  const d = cueBeat - beat;
  if (d >= wind) return 0;
  if (d > 0) return 1 - d / wind;
  if (d > -follow * 0.35) return 1;
  if (d > -follow) return 1 - (-d - follow * 0.35) / (follow * 0.65);
  return 0;
}

function maxCueMotion(beat, cues, wind, follow) {
  let m = 0;
  for (const c of cues) m = Math.max(m, cueMotion(beat, c.beat, wind, follow));
  return m;
}

function fireShotVisual(cue) {
  state.aimPulse = 0.35;
  // 弓固定朝准星射击
  state.arrows.push({
    x: SHOOT_ARCHER.x,
    y: SHOOT_ARCHER.y - 0.06,
    tx: SHOOT_AIM.x,
    ty: SHOOT_AIM.y,
    life: 0.42,
    maxLife: 0.42,
    hit: false,
  });
}

function applySuccessAction(cue) {
  const id = state.level.id;
  if (id === "tattoo") {
    state.sonDodge = 0.45;
  } else if (id === "hurdle") {
    state.jump = 0.45;
    if (cue) {
      const h = state.hurdles.find((x) => x.beat === cue.beat);
      if (h) h.passed = true;
    }
  } else if (id === "chop") {
    state.headPullAmt = 1;
  } else if (id === "shoot") {
    const t = state.movingTargets.find((x) => x.beat === cue.beat);
    if (t) t.destroyed = true;
    state.targetHits.push({
      x: SHOOT_AIM.x,
      y: SHOOT_AIM.y,
      life: 0.55,
      maxLife: 0.55,
    });
    const last = state.arrows[state.arrows.length - 1];
    if (last) last.hit = true;
  }
}

function missCue(c) {
  c.judged = true;
  c.result = "miss";
  state.miss += 1;
  state.combo = 0;
  state.hp -= 12;
  flashFeedback("Miss", "#c23b3b");
  beep(120, 0.1, "triangle", 0.05);
  const id = state.level.id;
  if (id === "tattoo") {
    state.sonHit = 0.8;
    state.bubble = { text: "妈妈你好狠!!!", life: 1.4 };
  } else if (id === "hurdle") {
    const h = state.hurdles.find((x) => x.beat === c.beat);
    if (h) {
      h.passed = true;
      h.tripped = true;
    }
    state.bubble = { text: "哎呦!", life: 0.8 };
  } else if (id === "chop") {
    state.bubble = { text: "咔！", life: 1.1 };
    state.headFallen = true;
    state.headPullAmt = 0;
    state.headFall = {
      x: 0,
      y: 0,
      vy: -80,
      rot: 0,
      vr: 3.5 + Math.random() * 2,
    };
    state.hp = 0;
    state.failTimer = 0.85; // 掉头动画后再出结果
    updateHud();
    return;
  } else if (id === "shoot") {
    state.bubble = { text: "脱靶…", life: 0.7 };
    const t = state.movingTargets.find((x) => x.beat === c.beat);
    if (t) t.tripped = true;
  }
  updateHud();
  if (state.hp <= 0) {
    state.hp = 0;
    endLevel(false);
  }
}

function flashFeedback(text, color) {
  state.feedback = text;
  state.feedbackColor = color;
  state.feedbackTimer = 0.55;
}

function endLevel(cleared) {
  state.done = true;
  mode = "result";
  const rank =
    state.miss === 0
      ? "Superb"
      : state.hp > 40
        ? "OK"
        : "Try Again";
  els.endTitle.textContent = cleared || state.hp > 0 ? `${rank}！` : "失败";
  els.resultText.textContent = `${state.level.name} · 分数 ${state.score} · Perfect ${state.perfect} · Miss ${state.miss} · 最高连击 ${state.maxCombo}`;
  els.result.classList.remove("hidden");
  beep(cleared || state.hp > 0 ? 520 : 200, 0.15);
}

function update(dt) {
  if (mode !== "play" || !state || state.done) return;
  // 失败演出期间只播动画，不再结算拍点
  if (state.failTimer > 0) {
    state.time += dt;
    state.anim += dt;
    if (state.feedbackTimer > 0) state.feedbackTimer -= dt;
    if (state.bubble) {
      state.bubble.life -= dt;
      if (state.bubble.life <= 0) state.bubble = null;
    }
    if (state.headFall) {
      state.headFall.vy += 980 * dt;
      state.headFall.y += state.headFall.vy * dt;
      state.headFall.rot += state.headFall.vr * dt;
    }
    state.failTimer -= dt;
    if (state.failTimer <= 0) {
      state.failTimer = 0;
      endLevel(false);
    }
    return;
  }
  state.time += dt;
  state.anim += dt;
  state.beat = state.time / BEAT;

  if (state.feedbackTimer > 0) state.feedbackTimer -= dt;
  if (state.bubble) {
    state.bubble.life -= dt;
    if (state.bubble.life <= 0) state.bubble = null;
  }
  if (state.sonDodge > 0) state.sonDodge -= dt;
  if (state.sonHit > 0) state.sonHit -= dt;
  if (state.jump > 0) state.jump -= dt;
  if (state.chopSwing > 0) state.chopSwing -= dt;
  // 缩头平滑回弹，不瞬切
  if (state.headPullAmt > 0 && !state.headFallen) {
    state.headPullAmt = Math.max(0, state.headPullAmt - dt * 1.6);
  }
  if (state.aimPulse > 0) state.aimPulse -= dt;

  for (let i = state.targetHits.length - 1; i >= 0; i--) {
    state.targetHits[i].life -= dt;
    if (state.targetHits[i].life <= 0) state.targetHits.splice(i, 1);
  }

  // 节拍闪烁音
  const b = Math.floor(state.beat);
  if (b !== state.lastBeatFlash && b >= 0) {
    state.lastBeatFlash = b;
    if (b % 2 === 0) beep(330, 0.03, "sine", 0.02);
  }

  // 错过窗口
  for (const c of state.cues) {
    if (!c.judged && state.beat > c.beat + 0.22) missCue(c);
  }

  for (let i = state.arrows.length - 1; i >= 0; i--) {
    state.arrows[i].life -= dt;
    if (state.arrows[i].life <= 0) state.arrows.splice(i, 1);
  }

  // 射击关：无限续生靶心 / 拍点
  if (state.level.id === "shoot" && state.endless) {
    const last = state.cues[state.cues.length - 1];
    if (last && state.beat > last.beat - 8) {
      const nextBeat = last.beat + 2;
      state.cues.push({ beat: nextBeat, hit: false, judged: false, result: null });
      state.movingTargets.push({ beat: nextBeat, destroyed: false, tripped: false });
    }
    // 清理过远的旧 cue，避免数组无限涨
    while (state.cues.length > 24 && state.cues[0].judged && state.beat > state.cues[0].beat + 4) {
      const old = state.cues.shift();
      const ti = state.movingTargets.findIndex((t) => t.beat === old.beat);
      if (ti >= 0) state.movingTargets.splice(ti, 1);
    }
    return; // 不按固定拍结束
  }

  // 结束
  const last = state.cues[state.cues.length - 1];
  if (last && last.judged && state.beat > last.beat + 1.2) {
    endLevel(state.hp > 0);
  }
}

/* ========== 矢量绘制角色/场景 ========== */

function drawMom(ctx, x, y, s, stab) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  // 头 + 马尾
  ctx.beginPath();
  ctx.arc(0, -36, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, -40);
  ctx.quadraticCurveTo(18, -30, 14, -18);
  ctx.stroke();
  // 身
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(0, 0);
  ctx.lineTo(-10, 22);
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 22);
  ctx.stroke();
  // 刺字手臂
  const reach = 18 + stab * 40;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(reach, -8 - stab * 6);
  ctx.stroke();
  // 针
  ctx.beginPath();
  ctx.moveTo(reach, -8 - stab * 6);
  ctx.lineTo(reach + 14, -6 - stab * 4);
  ctx.stroke();
  ctx.restore();
}

function drawSonKneel(ctx, x, y, s, dodge) {
  // 闪避过程：先快速躲开再缓缓回来（dodge 从峰值降到 0）
  const slide = dodge > 0.2 ? 1 : dodge > 0 ? dodge / 0.2 : 0;
  ctx.save();
  ctx.translate(x + slide * 18, y - slide * 8);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  // 四肢着地
  ctx.beginPath();
  ctx.arc(-6, -28, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -21);
  ctx.lineTo(8, -8); // 背
  ctx.lineTo(22, 4);
  ctx.moveTo(8, -8);
  ctx.lineTo(0, 10);
  ctx.moveTo(8, -8);
  ctx.lineTo(18, 12);
  ctx.moveTo(-6, -21);
  ctx.lineTo(-18, 6);
  ctx.stroke();
  ctx.restore();
}

function drawBubble(ctx, x, y, text) {
  ctx.save();
  ctx.font = "16px Songti SC, Georgia, serif";
  const w = ctx.measureText(text).width + 24;
  const h = 36;
  ctx.fillStyle = "rgba(242,239,230,0.95)";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect?.(x - w / 2, y - h, w, h, 8);
  if (!ctx.roundRect) {
    ctx.rect(x - w / 2, y - h, w, h);
  }
  ctx.fill();
  ctx.stroke();
  // 小三角
  ctx.beginPath();
  ctx.moveTo(x - 6, y);
  ctx.lineTo(x, y + 8);
  ctx.lineTo(x + 6, y);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - h / 2);
  ctx.restore();
}

function drawRunner(ctx, x, y, s, jumpT) {
  const lift = jumpT > 0 ? Math.sin((1 - jumpT / 0.45) * Math.PI) * 40 : 0;
  ctx.save();
  ctx.translate(x, y - lift);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  // 乱发
  ctx.beginPath();
  ctx.arc(0, -30, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -36);
  ctx.lineTo(-2, -42);
  ctx.moveTo(0, -38);
  ctx.lineTo(2, -44);
  ctx.moveTo(5, -36);
  ctx.lineTo(8, -41);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, 0);
  // 跑姿腿
  const a = jumpT > 0 ? 0.9 : Math.sin(state?.anim * 12 || 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(-12, 18 - a * 6);
  ctx.moveTo(0, 0);
  ctx.lineTo(14, 10 + a * 8);
  ctx.moveTo(0, -14);
  ctx.lineTo(-10, -4);
  ctx.moveTo(0, -14);
  ctx.lineTo(12, -8);
  ctx.stroke();
  ctx.restore();
}

function drawHurdles(ctx, x, y, w, scroll) {
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  const spacing = w / 7;
  const offset = ((scroll % 1) + 1) % 1;
  ctx.beginPath();
  for (let i = -1; i < 9; i++) {
    const hx = x + (i + 1 - offset) * spacing;
    if (hx < x - 10 || hx > x + w + 10) continue;
    const t = (hx - x) / w;
    const hy = y - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 12;
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, hy + 28);
  }
  ctx.stroke();
  ctx.beginPath();
  let started = false;
  for (let i = -1; i < 9; i++) {
    const hx = x + (i + 1 - offset) * spacing;
    if (hx < x - 10 || hx > x + w + 10) continue;
    const t = (hx - x) / w;
    const hy = y - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 12;
    if (!started) {
      ctx.moveTo(hx, hy);
      started = true;
    } else ctx.lineTo(hx, hy);
  }
  ctx.stroke();
}

function drawOneHurdle(ctx, hx, y, tripped = false) {
  ctx.save();
  ctx.strokeStyle = tripped ? "#c23b3b" : "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hx, y - 30);
  ctx.lineTo(hx, y + 30);
  ctx.moveTo(hx - 20, y - 22);
  ctx.lineTo(hx + 20, y - 22);
  ctx.moveTo(hx - 16, y - 8);
  ctx.lineTo(hx + 16, y - 8);
  ctx.stroke();
  // 底座
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx - 10, y + 30);
  ctx.lineTo(hx + 10, y + 30);
  ctx.stroke();
  ctx.restore();
}

function drawExecutioner(ctx, x, y, s, swing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.fillStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(0, -34, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(0, 2);
  ctx.lineTo(-8, 22);
  ctx.moveTo(0, 2);
  ctx.lineTo(8, 22);
  ctx.stroke();
  // 长刀：挥到位时刀刃够到左侧脖子
  const ang = -1.25 + swing * 2.55;
  ctx.save();
  ctx.translate(4, -18);
  ctx.rotate(ang);
  // 刀柄
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(0, 0);
  ctx.stroke();
  // 刀刃（加长）
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-4, -18);
  ctx.lineTo(0, -72);
  ctx.lineTo(12, -58);
  ctx.lineTo(5, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 护手
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawBlock(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(-28, -18);
  ctx.quadraticCurveTo(-28, -36, 0, -36);
  ctx.quadraticCurveTo(28, -36, 28, -18);
  ctx.lineTo(28, 0);
  ctx.stroke();
  ctx.restore();
}

function drawVictimHead(ctx, x, y, s, pull, fall = null) {
  ctx.save();
  if (fall) {
    ctx.translate(x + fall.x, y + fall.y);
    ctx.rotate(fall.rot);
  } else {
    ctx.translate(x - pull * 20, y);
  }
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.fillStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  // 乱线脑袋
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
    ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArcherFG(ctx, x, y, s, pull) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -28, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -21);
  ctx.lineTo(0, 0);
  ctx.lineTo(-8, 18);
  ctx.moveTo(0, 0);
  ctx.lineTo(8, 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(16, -12, 14, -1.1, 1.1);
  ctx.stroke();
  const px = 16 - 8 * (0.5 + pull);
  ctx.beginPath();
  ctx.moveTo(16 + Math.cos(-1.1) * 14, -12 + Math.sin(-1.1) * 14);
  ctx.lineTo(px, -12);
  ctx.lineTo(16 + Math.cos(1.1) * 14, -12 + Math.sin(1.1) * 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px, -12);
  ctx.lineTo(30, -12);
  ctx.stroke();
  ctx.restore();
}

function drawTarget(ctx, x, y, s, lit) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 靶面
  ctx.strokeRect(-22, -22, 44, 44);
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.stroke();
  if (lit) {
    ctx.fillStyle = "rgba(196,92,38,0.25)";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 支架：竖杆 + 左右撑脚（脚底落在虚线轨道上）
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(0, 46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 46);
  ctx.lineTo(-16, 54);
  ctx.moveTo(0, 46);
  ctx.lineTo(16, 54);
  ctx.stroke();
  // 底座横档
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-18, 54);
  ctx.lineTo(18, 54);
  ctx.stroke();

  ctx.restore();
}

/** 靶心中心到支架脚底的本地距离（未乘 scale） */
const TARGET_STAND_FOOT = 54;

function drawBeatBar(ctx, w, h) {
  if (!state) return;
  const barW = Math.min(520, w * 0.7);
  const bx = (w - barW) / 2;
  const by = h - 56;
  ctx.fillStyle = "rgba(26,26,26,0.08)";
  ctx.fillRect(bx, by, barW, 10);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, barW, 10);

  // 判定中线
  ctx.strokeStyle = "#c45c26";
  ctx.beginPath();
  ctx.moveTo(bx + barW / 2, by - 8);
  ctx.lineTo(bx + barW / 2, by + 18);
  ctx.stroke();

  const windowBeats = 4;
  for (const c of state.cues) {
    const dt = c.beat - state.beat;
    if (dt < -1 || dt > windowBeats) continue;
    const px = bx + barW / 2 + (dt / windowBeats) * (barW / 2);
    ctx.fillStyle = c.judged
      ? c.result === "miss"
        ? "#c23b3b"
        : "#3a8f6e"
      : "#1a1a1a";
    ctx.beginPath();
    ctx.arc(px, by + 5, c.judged ? 4 : 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderPlay() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#f2efe6");
  g.addColorStop(1, "#e4ddd0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const id = state.level.id;
  const cx = w / 2;
  const cy = h * 0.55;

  // 提示
  ctx.fillStyle = "rgba(26,26,26,0.55)";
  ctx.font = "15px Songti SC, serif";
  ctx.textAlign = "center";
  ctx.fillText(state.level.hint, cx, 72);

  if (id === "tattoo") {
    // 刺下峰值对齐判定拍（偶数拍：2/4/6…），避免「音轨已到、针还在蓄力」的滞后
    const phase = ((state.beat % 2) + 2) % 2; // 0..2
    let stab = 0;
    if (phase >= 1.05) {
      // 上半拍后段：蓄力，临近下一判定拍
      stab = (phase - 1.05) / 0.95;
    } else if (phase < 0.28) {
      // 判定拍附近：刺下
      stab = 1;
    } else if (phase < 0.85) {
      // 收回
      stab = Math.max(0, 1 - (phase - 0.28) / 0.57);
    }

    // 「快点趴下」仅开局提示一次
    if (state.beat < 1.8) {
      drawBubble(ctx, cx - 70, cy - 100, "快点趴下!");
    }

    drawMom(ctx, cx - 55, cy + 40, 1.35, stab * 1.15);
    const dodgeT = Math.max(0, state.sonDodge);
    const hitShake = state.sonHit > 0 ? Math.sin(state.sonHit * 40) * 4 : 0;
    drawSonKneel(ctx, cx + 45 + hitShake, cy + 50, 1.35, dodgeT);
  } else if (id === "hurdle") {
    // 地面持续向左滚动（不因判定重置）
    const scroll = state.beat * 0.35;
    drawHurdles(ctx, 40, cy + 50, w - 80, scroll);

    // 每根栏杆按自己的拍点连续移动
    // 提前量加大：判定拍点时栏杆仍在身前，按空格与起跳观感对齐
    const runnerX = cx - 40;
    const speed = 170;
    const leadPx = 96;
    for (const h of state.hurdles) {
      const dist = h.beat - state.beat;
      const hx = runnerX + dist * speed + leadPx;
      if (hx < -40 || hx > w + 40) continue;
      drawOneHurdle(ctx, hx, cy + 40, !!h.tripped);
    }
    drawRunner(ctx, runnerX, cy + 20, 1.4, state.jump);
  } else if (id === "chop") {
    drawBlock(ctx, cx - 35, cy + 60, 1.5);
    // 头：缩头 / 失败掉落
    if (state.headFallen && state.headFall) {
      drawVictimHead(ctx, cx - 35, cy + 10, 1.4, 0, state.headFall);
    } else {
      drawVictimHead(ctx, cx - 35, cy + 10, 1.4, state.headPullAmt);
    }
    // 刽子手：失败时停在落刀姿态
    let swing = 0;
    if (state.headFallen) {
      swing = 1;
    } else {
      const phase = ((state.beat % 2) + 2) % 2;
      if (phase < 1.15) swing = phase / 1.15;
      else if (phase < 1.4) swing = 1;
      else swing = Math.max(0, 1 - (phase - 1.4) / 0.6);
    }
    // 站近一点，长刀够到脖子
    drawExecutioner(ctx, cx + 38, cy + 22, 1.45, swing);
  } else if (id === "shoot") {
    const aimX = w * SHOOT_AIM.x;
    const aimY = h * SHOOT_AIM.y;
    const archerX = w * SHOOT_ARCHER.x;
    const archerY = h * SHOOT_ARCHER.y;
    const targetScale = 1.05;
    // 虚线轨道：贴在支架脚底之下
    const railY = aimY + TARGET_STAND_FOOT * targetScale + 2;

    // 靶道：从右向左，位于支架下方
    ctx.strokeStyle = "rgba(26,26,26,0.28)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(w + 20, railY);
    ctx.lineTo(-20, railY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 固定准星（对准靶心中心）
    const pulse = cueMotion(
      state.beat,
      state.cues.find((c) => !c.judged)?.beat ?? state.beat,
      0.35,
      0.2
    );
    ctx.strokeStyle = pulse > 0.4 ? "#c45c26" : "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(aimX - 16, aimY);
    ctx.lineTo(aimX + 16, aimY);
    ctx.moveTo(aimX, aimY - 16);
    ctx.lineTo(aimX, aimY + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(aimX, aimY, 10, 0, Math.PI * 2);
    ctx.stroke();

    // 移动靶心：到拍点时正好经过准星
    for (const t of state.movingTargets) {
      if (t.destroyed && state.beat > t.beat + 0.15) continue;
      const dist = t.beat - state.beat;
      const tx = aimX + dist * SHOOT_SPEED;
      const ty = aimY;
      if (tx < -60 || tx > w + 80) continue;
      const lit = !t.destroyed && !t.tripped && Math.abs(dist) < 0.35;
      const scale = t.destroyed ? 0.7 : t.tripped ? 0.85 : targetScale;
      ctx.globalAlpha = t.destroyed ? 0.35 : t.tripped ? 0.45 : 1;
      drawTarget(ctx, tx, ty, scale, lit);
      ctx.globalAlpha = 1;
    }

    // 命中涟漪（准星处）
    for (const hit of state.targetHits) {
      const fade = hit.life / hit.maxLife;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "#3a8f6e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w * hit.x, h * hit.y, 18 + (1 - fade) * 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const drawAmt = state.aimPulse > 0 ? Math.min(1, state.aimPulse * 3) : 0.4;
    drawArcherFG(ctx, archerX, archerY, 1.5, drawAmt);

    for (const a of state.arrows) {
      const t = 1 - a.life / (a.maxLife || 0.42);
      const fly = Math.min(1, t / 0.75);
      const ax = w * (a.x + (a.tx - a.x) * fly);
      const ay = h * (a.y + (a.ty - a.y) * fly);
      const ang = Math.atan2(a.ty - a.y, a.tx - a.x);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(6, -5);
      ctx.lineTo(6, 5);
      ctx.closePath();
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
      ctx.restore();
    }
  }

  if (state.bubble) {
    drawBubble(ctx, cx + 40, cy - 80, state.bubble.text);
  }

  if (state.feedbackTimer > 0) {
    ctx.globalAlpha = Math.min(1, state.feedbackTimer * 3);
    ctx.fillStyle = state.feedbackColor || "#1a1a1a";
    ctx.font = "bold 42px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText(state.feedback, cx, h * 0.22);
    ctx.globalAlpha = 1;
  }

  drawBeatBar(ctx, w, h);

  // 倒计时/拍号
  ctx.fillStyle = "rgba(26,26,26,0.4)";
  ctx.font = "14px Songti SC, serif";
  ctx.textAlign = "left";
  ctx.fillText(`♪ ${Math.max(0, Math.floor(state.beat))}`, 24, h - 24);
}

function renderSelectBg() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#ebe4d6");
  g.addColorStop(1, "#d9d0c0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (mode === "play") {
    update(dt);
    renderPlay();
  } else if (mode === "select" || mode === "result") {
    renderSelectBg();
  }
  raf = requestAnimationFrame(loop);
}

export function startRhythm(options) {
  canvas = options.canvas;
  ctx = canvas.getContext("2d");
  els = options.els;
  resize();
  on(window, "resize", () => {
    resize();
    if (mode === "select") paintLevelPreviews();
  });
  on(window, "keydown", (e) => {
    if (e.code === "Space" || e.code === "KeyJ" || e.code === "Enter") {
      e.preventDefault();
      if (mode === "play") judgeInput();
    }
  });
  on(canvas, "mousedown", () => {
    if (mode === "play") judgeInput();
  });

  els.btnRestart.onclick = () => {
    els.result.classList.add("hidden");
    showLevelSelect();
  };
  showLevelSelect();
}

export function stopRhythm() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  mode = "select";
  state = null;
  els.hud?.classList.add("hidden");
  els.levelSelect?.classList.add("hidden");
  els.result?.classList.add("hidden");
}
