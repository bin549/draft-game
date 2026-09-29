/**
 * 换装模式 — 基于无面汉服女孩的换装小游戏
 * 鼠标点选分类与单品 · Esc / 返回菜单退出
 */

const BASE_DIR = "assets/player/girl/ready/";

const ROBES = [
  { id: "classic", name: "墨蓝典雅", src: "robe_classic.png" },
  { id: "crimson", name: "绯红宫装", src: "robe_crimson.png" },
  { id: "emerald", name: "青碧闲庭", src: "robe_emerald.png" },
  { id: "ink", name: "玄墨素衣", src: "robe_ink.png" },
  { id: "blush", name: "桃夭春衫", src: "robe_blush.png" },
  { id: "gold", name: "鎏金华服", src: "robe_gold.png" },
];

const FACES = [
  { id: "blank", name: "素面" },
  { id: "dots", name: "两点朱砂" },
  { id: "soft", name: "浅笑" },
  { id: "cool", name: "淡漠" },
  { id: "shy", name: "含羞" },
  { id: "star", name: "星眸" },
];

const HATS = [
  { id: "tall", name: "花冠高帽" },
  { id: "none", name: "卸下冠帽" },
  { id: "ribbon", name: "黑纱软帽" },
  { id: "petal", name: "繁花冠" },
];

const NECKS = [
  { id: "pearl", name: "珍珠项链" },
  { id: "none", name: "无项链" },
  { id: "jade", name: "翠玉环" },
  { id: "gold", name: "金链式" },
];

const HANDS = [
  { id: "fan", name: "团扇" },
  { id: "none", name: "空手" },
  { id: "lantern", name: "纸灯" },
  { id: "flower", name: "折枝" },
];

const BACKGROUNDS = [
  { id: "paper", name: "素纸" },
  { id: "garden", name: "庭院" },
  { id: "night", name: "夜色" },
  { id: "palace", name: "殿廊" },
  { id: "spring", name: "春日" },
  { id: "inkwash", name: "水墨" },
];

const CATEGORIES = [
  { id: "robe", name: "袍色", items: ROBES },
  { id: "face", name: "妆容", items: FACES },
  { id: "hat", name: "冠帽", items: HATS, disabled: true },
  { id: "neck", name: "项饰", items: NECKS, disabled: true },
  { id: "hand", name: "手持", items: HANDS, disabled: true },
  { id: "bg", name: "场景", items: BACKGROUNDS },
];

/** 相对角色精灵的锚点（基于 ready 图实测） */
const ANCHOR = {
  face: { x: 0.553, y: 0.301, r: 0.11 },
  hat: { x: 0.54, y: 0.145 },
  neck: { x: 0.55, y: 0.43 },
  /** 原图团扇所在手（画面左侧），用于遮盖 */
  fan: { x: 0.20, y: 0.62 },
  /** 手持物挂点：空着手尖（画面右侧袖口，箭头处） */
  hand: { x: 0.86, y: 0.55 },
};

let canvas, ctx;
let els = {};
let state = null;
let running = false;
let raf = 0;
let lastTs = 0;
let listeners = [];
let images = Object.create(null);
let pointer = { x: 0, y: 0, down: false };
let layout = null;

function on(t, type, fn) {
  t.addEventListener(type, fn);
  listeners.push([t, type, fn]);
}
function offAll() {
  for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  listeners = [];
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = encodeURI(src) + "?v=1";
  });
}

async function ensureAssets() {
  await Promise.all(
    ROBES.map(async (r) => {
      images[r.id] = await loadImage(BASE_DIR + r.src);
    })
  );
}

function initState() {
  state = {
    category: "robe",
    picks: {
      robe: "classic",
      face: "blank",
      hat: "tall",
      neck: "pearl",
      hand: "fan",
      bg: "paper",
    },
    time: 0,
    toast: 0,
    toastMsg: "",
  };
}

function hit(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function buildLayout(viewW, viewH) {
  const pad = 20;
  const panelW = Math.min(360, viewW * 0.34);
  const stageW = viewW - panelW - pad * 3;
  const stageH = viewH - pad * 2 - 56;
  const stageX = pad;
  const stageY = pad + 48;
  const panelX = stageX + stageW + pad;
  const panelY = stageY;
  const panelH = stageH;

  const tabs = [];
  const tabH = 40;
  CATEGORIES.forEach((c, i) => {
    tabs.push({
      id: c.id,
      disabled: !!c.disabled,
      x: panelX + 12,
      y: panelY + 12 + i * (tabH + 6),
      w: 88,
      h: tabH,
    });
  });

  const items = [];
  const cat = CATEGORIES.find((c) => c.id === state.category);
  const gridX = panelX + 110;
  const gridY = panelY + 12;
  const cellW = panelW - 130;
  const cellH = 56;
  if (cat && !cat.disabled) {
    cat.items.forEach((it, i) => {
      items.push({
        id: it.id,
        name: it.name,
        x: gridX,
        y: gridY + i * (cellH + 8),
        w: cellW,
        h: cellH,
      });
    });
  }

  const btnW = panelW - 24;
  const btnH = 40;
  const btnGap = 10;
  const saveBtn = {
    x: panelX + 12,
    y: panelY + panelH - 52,
    w: btnW,
    h: btnH,
  };
  const resetBtn = {
    x: panelX + 12,
    y: saveBtn.y - btnH - btnGap,
    w: btnW,
    h: btnH,
  };

  return {
    stage: { x: stageX, y: stageY, w: stageW, h: stageH },
    panel: { x: panelX, y: panelY, w: panelW, h: panelH },
    tabs,
    items,
    resetBtn,
    saveBtn,
  };
}

function drawPaperBg(x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#d8e4ec");
  g.addColorStop(0.55, "#e8e4d8");
  g.addColorStop(1, "#d4cbb8");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(26,26,26,0.05)";
  ctx.lineWidth = 1;
  for (let gx = x; gx < x + w; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, y);
    ctx.lineTo(gx + 0.5, y + h);
    ctx.stroke();
  }
  for (let gy = y; gy < y + h; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(x, gy + 0.5);
    ctx.lineTo(x + w, gy + 0.5);
    ctx.stroke();
  }
}

function drawScene(bgId, x, y, w, h) {
  if (bgId === "paper") {
    drawPaperBg(x, y, w, h);
    return;
  }
  if (bgId === "garden") {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#c5d8c8");
    g.addColorStop(0.5, "#e4e8d4");
    g.addColorStop(1, "#d0c4a8");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(80,120,70,0.25)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.2, y + h * 0.75, 80, 40, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.8, y + h * 0.7, 100, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (bgId === "night") {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#1a2238");
    g.addColorStop(1, "#3a4058");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(240,230,180,0.35)";
    ctx.beginPath();
    ctx.arc(x + w * 0.75, y + h * 0.2, 28, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (bgId === "palace") {
    ctx.fillStyle = "#e8dfd0";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#2a3548";
    ctx.fillRect(x, y, w, h * 0.18);
    ctx.fillStyle = "#c45c26";
    ctx.fillRect(x + w * 0.1, y + h * 0.18, w * 0.8, 10);
    ctx.strokeStyle = "rgba(26,26,26,0.15)";
    for (let i = 0; i < 5; i++) {
      const px = x + w * (0.18 + i * 0.16);
      ctx.beginPath();
      ctx.moveTo(px, y + h * 0.2);
      ctx.lineTo(px, y + h);
      ctx.stroke();
    }
    return;
  }
  if (bgId === "spring") {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#f0d8e0");
    g.addColorStop(1, "#e8e0d0");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(230,140,160,0.35)";
    for (let i = 0; i < 12; i++) {
      const px = x + ((i * 97) % w);
      const py = y + ((i * 53) % (h * 0.6));
      ctx.beginPath();
      ctx.arc(px, py, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // inkwash
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#e8e8e8");
  g.addColorStop(1, "#c8c8c8");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(26,26,26,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + h * 0.7);
  ctx.quadraticCurveTo(x + w * 0.4, y + h * 0.5, x + w - 20, y + h * 0.75);
  ctx.stroke();
}

function faceCenter(ox, oy, cw, ch) {
  return {
    x: ox + cw * ANCHOR.face.x,
    y: oy + ch * ANCHOR.face.y,
    r: cw * ANCHOR.face.r,
  };
}

function drawFace(faceId, fx, fy, r) {
  if (faceId === "blank") return;
  ctx.save();
  ctx.translate(fx, fy);
  if (faceId === "dots") {
    ctx.fillStyle = "#c45c6a";
    ctx.beginPath();
    ctx.arc(-r * 0.45, r * 0.15, r * 0.12, 0, Math.PI * 2);
    ctx.arc(r * 0.45, r * 0.15, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (faceId === "soft") {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.05, r * 0.08, 0, Math.PI * 2);
    ctx.arc(r * 0.35, -r * 0.05, r * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, r * 0.25, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (faceId === "cool") {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.1);
    ctx.lineTo(-r * 0.2, -r * 0.05);
    ctx.moveTo(r * 0.2, -r * 0.05);
    ctx.lineTo(r * 0.5, -r * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.35);
    ctx.lineTo(r * 0.15, r * 0.35);
    ctx.stroke();
  } else if (faceId === "shy") {
    ctx.fillStyle = "rgba(220,120,130,0.45)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, r * 0.2, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.4, r * 0.2, r * 0.22, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.beginPath();
    ctx.arc(-r * 0.32, 0, r * 0.1, 0, Math.PI * 2);
    ctx.arc(r * 0.32, 0, r * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  } else if (faceId === "star") {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(-r * 0.35, 0, r * 0.14, 0, Math.PI * 2);
    ctx.arc(r * 0.35, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.05, r * 0.05, 0, Math.PI * 2);
    ctx.arc(r * 0.38, -r * 0.05, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.beginPath();
    ctx.arc(0, r * 0.3, r * 0.18, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHatOverlay(hatId, ox, oy, cw, ch) {
  if (hatId === "tall") return; // 原图已有
  const hx = ox + cw * ANCHOR.hat.x;
  const hy = oy + ch * ANCHOR.hat.y;
  if (hatId === "none") {
    // 盖住高帽区域并补发髻
    ctx.fillStyle = "rgba(232,228,216,0.96)";
    ctx.beginPath();
    ctx.moveTo(hx - cw * 0.26, hy - ch * 0.08);
    ctx.lineTo(hx + cw * 0.26, hy - ch * 0.08);
    ctx.lineTo(hx + cw * 0.2, hy + ch * 0.1);
    ctx.lineTo(hx - cw * 0.2, hy + ch * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(hx, hy + ch * 0.06, cw * 0.17, ch * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (hatId === "ribbon") {
    ctx.fillStyle = "#2a2a32";
    ctx.beginPath();
    ctx.ellipse(hx, hy + ch * 0.02, cw * 0.2, ch * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - cw * 0.18, hy + ch * 0.03);
    ctx.quadraticCurveTo(hx - cw * 0.3, hy + ch * 0.22, hx - cw * 0.12, hy + ch * 0.32);
    ctx.moveTo(hx + cw * 0.18, hy + ch * 0.03);
    ctx.quadraticCurveTo(hx + cw * 0.3, hy + ch * 0.22, hx + cw * 0.12, hy + ch * 0.32);
    ctx.stroke();
    return;
  }
  if (hatId === "petal") {
    ctx.fillStyle = "#f2e8e0";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, cw * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8a7a7";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(
        hx + Math.cos(a) * cw * 0.1,
        hy + Math.sin(a) * cw * 0.1,
        cw * 0.04,
        cw * 0.025,
        a,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

function drawNeckOverlay(neckId, ox, oy, cw, ch) {
  if (neckId === "pearl") return;
  const nx = ox + cw * ANCHOR.neck.x;
  const ny = oy + ch * ANCHOR.neck.y;
  if (neckId === "none") {
    ctx.fillStyle = "rgba(245,240,225,0.9)";
    ctx.beginPath();
    ctx.ellipse(nx, ny, cw * 0.18, ch * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (neckId === "jade") {
    ctx.strokeStyle = "#3a8f6e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(nx, ny - ch * 0.01, cw * 0.14, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#5ec8a0";
    ctx.beginPath();
    ctx.arc(nx, ny + cw * 0.08, 6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (neckId === "gold") {
    ctx.strokeStyle = "#c4a03a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(nx, ny - ch * 0.01, cw * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#e8c86a";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(nx + i * cw * 0.035, ny + ch * 0.02 + Math.abs(i) * 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHandOverlay(handId, ox, oy, cw, ch) {
  if (handId === "fan") return;
  const fx = ox + cw * ANCHOR.fan.x;
  const fy = oy + ch * ANCHOR.fan.y;
  // 先盖住左侧原团扇（略加大，避免露边）
  ctx.fillStyle = "rgba(232,228,216,0.96)";
  ctx.beginPath();
  ctx.ellipse(fx, fy, cw * 0.14, ch * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  const hx = ox + cw * ANCHOR.hand.x;
  const hy = oy + ch * ANCHOR.hand.y;
  if (handId === "none") return;
  if (handId === "lantern") {
    const lw = Math.max(14, cw * 0.07);
    const lh = Math.max(18, ch * 0.055);
    ctx.fillStyle = "#e8c86a";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.fillRect(hx - lw / 2, hy - lh * 0.35, lw, lh);
    ctx.strokeRect(hx - lw / 2, hy - lh * 0.35, lw, lh);
    ctx.beginPath();
    ctx.moveTo(hx, hy - lh * 0.35);
    ctx.lineTo(hx, hy - lh * 0.35 - 10);
    ctx.stroke();
    ctx.fillStyle = "rgba(232,200,100,0.22)";
    ctx.beginPath();
    ctx.arc(hx, hy + lh * 0.15, lw * 0.9, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (handId === "flower") {
    ctx.strokeStyle = "#3a8f6e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy + cw * 0.06);
    ctx.lineTo(hx + 3, hy - cw * 0.05);
    ctx.stroke();
    ctx.fillStyle = "#d8a7a7";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(
        hx + 3 + Math.cos(a) * 7,
        hy - cw * 0.05 + Math.sin(a) * 7,
        4.5,
        2.8,
        a,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

function drawCharacter(stage) {
  const img = images[state.picks.robe] || images.classic;
  if (!img) return;
  const maxH = stage.h * 0.88;
  const maxW = stage.w * 0.55;
  const sc = Math.min(maxW / img.width, maxH / img.height);
  const cw = img.width * sc;
  const ch = img.height * sc;
  const ox = stage.x + (stage.w - cw) / 2;
  const oy = stage.y + (stage.h - ch) * 0.55;

  ctx.drawImage(img, ox, oy, cw, ch);

  const face = faceCenter(ox, oy, cw, ch);
  drawFace(state.picks.face, face.x, face.y, face.r);
  drawHatOverlay(state.picks.hat, ox, oy, cw, ch);
  drawNeckOverlay(state.picks.neck, ox, oy, cw, ch);
  drawHandOverlay(state.picks.hand, ox, oy, cw, ch);
}

function drawRounded(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  layout = buildLayout(viewW, viewH);

  drawPaperBg(0, 0, viewW, viewH);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 28px Songti SC, serif";
  ctx.textAlign = "left";
  ctx.fillText("换装模式", 24, 36);
  ctx.font = "14px Songti SC, serif";
  ctx.fillStyle = "rgba(26,26,26,0.55)";
  ctx.fillText("点选右侧分类与单品 · 装点这位无面仕女", 150, 34);

  const st = layout.stage;
  // 舞台框
  ctx.save();
  drawRounded(st.x, st.y, st.w, st.h, 8);
  ctx.clip();
  drawScene(state.picks.bg, st.x, st.y, st.w, st.h);
  drawCharacter(st);
  ctx.restore();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  drawRounded(st.x, st.y, st.w, st.h, 8);
  ctx.stroke();

  // 右侧面板
  const p = layout.panel;
  ctx.fillStyle = "#f2efe6";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  drawRounded(p.x, p.y, p.w, p.h, 8);
  ctx.fill();
  ctx.stroke();

  for (const tab of layout.tabs) {
    const on = state.category === tab.id;
    const dis = tab.disabled;
    ctx.fillStyle = dis ? "#ddd8ce" : on ? "#1a2238" : "#ebe4d6";
    ctx.strokeStyle = dis ? "rgba(26,26,26,0.25)" : "#1a1a1a";
    drawRounded(tab.x, tab.y, tab.w, tab.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = dis ? "rgba(26,26,26,0.35)" : on ? "#e8e0d2" : "#1a1a1a";
    ctx.font = "bold 14px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cat = CATEGORIES.find((c) => c.id === tab.id);
    ctx.fillText(cat.name, tab.x + tab.w / 2, tab.y + tab.h / 2);
  }

  if (!layout.items.length) {
    const cat = CATEGORIES.find((c) => c.id === state.category);
    if (cat?.disabled) {
      ctx.fillStyle = "rgba(26,26,26,0.45)";
      ctx.font = "14px Songti SC, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("该分类暂未开放", p.x + p.w * 0.62, p.y + p.h * 0.35);
    }
  }

  for (const it of layout.items) {
    const selected = state.picks[state.category] === it.id;
    ctx.fillStyle = selected ? "#e8d5c0" : "#f7f2e8";
    ctx.strokeStyle = selected ? "#c45c26" : "#1a1a1a";
    ctx.lineWidth = selected ? 2.5 : 1.5;
    drawRounded(it.x, it.y, it.w, it.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "15px Songti SC, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(it.name, it.x + 14, it.y + it.h / 2);
    if (selected) {
      ctx.fillStyle = "#c45c26";
      ctx.font = "12px Songti SC, serif";
      ctx.textAlign = "right";
      ctx.fillText("已选", it.x + it.w - 12, it.y + it.h / 2);
    }
  }

  const drawPanelBtn = (btn, label, fill, stroke) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    drawRounded(btn.x, btn.y, btn.w, btn.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 15px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
  };
  drawPanelBtn(layout.resetBtn, "恢复默认装扮", "#ebe4d6", "#1a1a1a");
  drawPanelBtn(layout.saveBtn, "保存到本地", "#e8d5c0", "#c45c26");

  if (state.toast > 0) {
    ctx.globalAlpha = Math.min(1, state.toast);
    ctx.fillStyle = "rgba(26,26,26,0.75)";
    const msg = state.toastMsg || "装扮已更新";
    const tw = Math.max(160, msg.length * 14 + 40);
    ctx.fillRect(viewW / 2 - tw / 2, 56, tw, 32);
    ctx.fillStyle = "#e8e0d2";
    ctx.font = "14px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(msg, viewW / 2, 72);
    ctx.globalAlpha = 1;
  }
}

function saveLookToLocal() {
  if (!layout || !state) return;
  const st = layout.stage;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(st.w * dpr));
  out.height = Math.max(1, Math.floor(st.h * dpr));
  const octx = out.getContext("2d");
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 复用舞台绘制逻辑
  const prev = ctx;
  ctx = octx;
  drawScene(state.picks.bg, 0, 0, st.w, st.h);
  drawCharacter({ x: 0, y: 0, w: st.w, h: st.h });
  ctx = prev;

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  out.toBlob((blob) => {
    if (!blob) {
      state.toastMsg = "保存失败";
      state.toast = 1.2;
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `换装-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    state.toastMsg = "已保存到本地";
    state.toast = 1.4;
  }, "image/png");
}

function onPointer(x, y) {
  if (!layout || !state) return;
  for (const tab of layout.tabs) {
    if (hit(x, y, tab)) {
      if (tab.disabled) {
        state.toastMsg = "该分类暂未开放";
        state.toast = 1.0;
        return;
      }
      state.category = tab.id;
      return;
    }
  }
  for (const it of layout.items) {
    if (hit(x, y, it)) {
      state.picks[state.category] = it.id;
      state.toastMsg = "装扮已更新";
      state.toast = 0.9;
      return;
    }
  }
  if (hit(x, y, layout.saveBtn)) {
    saveLookToLocal();
    return;
  }
  if (hit(x, y, layout.resetBtn)) {
    state.picks = {
      robe: "classic",
      face: "blank",
      hat: "tall",
      neck: "pearl",
      hand: "fan",
      bg: "paper",
    };
    state.toastMsg = "装扮已更新";
    state.toast = 0.9;
  }
}

function pointerPos(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * window.innerWidth,
    y: ((ev.clientY - rect.top) / rect.height) * window.innerHeight,
  };
}

function tick(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state) {
    state.time += dt;
    if (state.toast > 0) state.toast -= dt;
  }
  render();
  raf = requestAnimationFrame(tick);
}

export async function startDressup({ canvas: c, els: e }) {
  canvas = c;
  ctx = canvas.getContext("2d");
  els = e;
  running = true;
  lastTs = performance.now();
  offAll();
  resize();
  initState();

  on(window, "resize", resize);
  on(canvas, "pointerdown", (ev) => {
    const p = pointerPos(ev);
    onPointer(p.x, p.y);
  });

  els.hud?.classList.remove("hidden");
  els.overlay?.classList.add("hidden");
  els.gameover?.classList.add("hidden");

  await ensureAssets();
  raf = requestAnimationFrame(tick);
}

export function stopDressup() {
  running = false;
  cancelAnimationFrame(raf);
  offAll();
  state = null;
  els.hud?.classList.add("hidden");
  els.overlay?.classList.add("hidden");
}
