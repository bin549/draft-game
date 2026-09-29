import { startSurvivor, stopSurvivor } from "./survivor.js?v=20260927e";
import { startPlatform, stopPlatform } from "./platform.js?v=20260929j";
import { startTower, stopTower } from "./tower.js";
import { startRhythm, stopRhythm, handleRhythmBack } from "./rhythm.js?v=20260927o";
import { startPaddle, stopPaddle } from "./paddle.js?v=20260929k";
import { drawNineTailFox, drawEyeball, drawHouse, drawSprout, drawTornado } from "./draw.js";
import { drawCharacter } from "./characters.js?v=20260927e";
import { loadMonsters } from "./monsters.js";

const menu = document.getElementById("menu");
const stage = document.getElementById("stage");
const canvas = document.getElementById("game");

const MODE_IDS = ["survivor", "platform", "tower", "rhythm", "paddle"];

let activeMode = null;

function hideAllModeUi() {
  for (const id of MODE_IDS) {
    document.getElementById(`hud-${id}`)?.classList.add("hidden");
    document.getElementById(`overlay-${id}`)?.classList.add("hidden");
    document.getElementById(`gameover-${id}`)?.classList.add("hidden");
  }
  document.getElementById("levelup")?.classList.add("hidden");
  document.getElementById("overlay-charselect")?.classList.add("hidden");
  document.getElementById("overlay-rhythm-levels")?.classList.add("hidden");
  document.getElementById("btn-join-2p")?.classList.add("hidden");
  document.getElementById("tower-dock")?.classList.add("hidden");
  document.getElementById("survivor-magic-dock")?.classList.add("hidden");
}

function showMenu() {
  stopActive();
  stage.classList.add("hidden");
  menu.classList.remove("hidden");
  drawMenuPreviews();
}

function stopActive() {
  if (activeMode === "survivor") stopSurvivor();
  if (activeMode === "platform") stopPlatform();
  if (activeMode === "tower") stopTower();
  if (activeMode === "rhythm") stopRhythm();
  if (activeMode === "paddle") stopPaddle();
  activeMode = null;
}

function enterMode(mode) {
  if (document.documentElement.classList.contains("is-mobile")) return;
  stopActive();
  hideAllModeUi();
  menu.classList.add("hidden");
  stage.classList.remove("hidden");
  activeMode = mode;

  if (mode === "survivor") {
    startSurvivor({
      canvas,
      els: {
        hud: document.getElementById("hud-survivor"),
        overlay: document.getElementById("overlay-survivor"),
        charSelect: document.getElementById("overlay-charselect"),
        charGrid: document.getElementById("char-grid"),
        levelup: document.getElementById("levelup"),
        gameover: document.getElementById("gameover-survivor"),
        upgradeChoices: document.getElementById("upgrade-choices"),
        resultText: document.getElementById("result-text"),
        hpFill: document.getElementById("hp-fill"),
        hpText: document.getElementById("hp-text"),
        xpFill: document.getElementById("xp-fill"),
        levelText: document.getElementById("level-text"),
        timeText: document.getElementById("time-text"),
        killText: document.getElementById("kill-text"),
        stageText: document.getElementById("surv-stage-text"),
        btnStart: document.getElementById("btn-start-survivor"),
        btnRestart: document.getElementById("btn-restart-survivor"),
        magicDock: document.getElementById("survivor-magic-dock"),
        magicBtn: document.getElementById("btn-magic-tornado"),
        magicCd: document.getElementById("magic-tornado-cd"),
        magicPreview: document.getElementById("magic-preview-tornado"),
      },
    });
  } else if (mode === "platform") {
    startPlatform({
      canvas,
      els: {
        hud: document.getElementById("hud-platform"),
        overlay: document.getElementById("overlay-platform"),
        charSelect: document.getElementById("overlay-charselect"),
        charGrid: document.getElementById("char-grid"),
        gameover: document.getElementById("gameover-platform"),
        endTitle: document.getElementById("plat-end-title"),
        resultText: document.getElementById("plat-result-text"),
        hpFill: document.getElementById("plat-hp-fill"),
        hpText: document.getElementById("plat-hp-text"),
        scoreText: document.getElementById("plat-score-text"),
        killText: document.getElementById("plat-kill-text"),
        hint: document.getElementById("plat-hint"),
        stageText: document.getElementById("plat-stage-text"),
        dashText: document.getElementById("plat-dash-text"),
        ammoText: document.getElementById("ammo-text"),
        btnStart: document.getElementById("btn-start-platform"),
        btnRestart: document.getElementById("btn-restart-platform"),
        btnJoin2P: document.getElementById("btn-join-2p"),
        p2Stat: document.getElementById("plat-p2-stat"),
        hp2Fill: document.getElementById("plat-hp2-fill"),
        hp2Text: document.getElementById("plat-hp2-text"),
        p1Label: document.getElementById("plat-p1-label"),
        overlaySub: document.getElementById("plat-overlay-sub"),
      },
    });
  } else if (mode === "tower") {
    startTower({
      canvas,
      els: {
        hud: document.getElementById("hud-tower"),
        dock: document.getElementById("tower-dock"),
        overlay: document.getElementById("overlay-tower"),
        gameover: document.getElementById("gameover-tower"),
        endTitle: document.getElementById("tower-end-title"),
        resultText: document.getElementById("tower-result-text"),
        goldText: document.getElementById("tower-gold-text"),
        livesText: document.getElementById("tower-lives-text"),
        waveText: document.getElementById("tower-wave-text"),
        killText: document.getElementById("tower-kill-text"),
        btnStart: document.getElementById("btn-start-tower"),
        btnRestart: document.getElementById("btn-restart-tower"),
        towerBtns: {
          swordsman: document.getElementById("btn-tower-swordsman"),
          mage: document.getElementById("btn-tower-mage"),
          knight: document.getElementById("btn-tower-knight"),
          archer: document.getElementById("btn-tower-archer"),
        },
        btnWave: document.getElementById("btn-tower-wave"),
      },
    });
  } else if (mode === "rhythm") {
    startRhythm({
      canvas,
      els: {
        hud: document.getElementById("hud-rhythm"),
        levelSelect: document.getElementById("overlay-rhythm-levels"),
        levelGrid: document.getElementById("rhythm-level-grid"),
        result: document.getElementById("gameover-rhythm"),
        endTitle: document.getElementById("rhythm-end-title"),
        resultText: document.getElementById("rhythm-result-text"),
        scoreText: document.getElementById("rhythm-score-text"),
        comboText: document.getElementById("rhythm-combo-text"),
        hpFill: document.getElementById("rhythm-hp-fill"),
        btnRestart: document.getElementById("btn-restart-rhythm"),
      },
    });
  } else if (mode === "paddle") {
    startPaddle({
      canvas,
      els: {
        hud: document.getElementById("hud-paddle"),
        overlay: document.getElementById("overlay-paddle"),
        gameover: document.getElementById("gameover-paddle"),
        endTitle: document.getElementById("paddle-end-title"),
        resultText: document.getElementById("paddle-result-text"),
        hpFill: document.getElementById("paddle-hp-fill"),
        hpText: document.getElementById("paddle-hp-text"),
        scoreText: document.getElementById("paddle-score-text"),
        distText: document.getElementById("paddle-dist-text"),
        bestText: document.getElementById("paddle-best-text"),
        btnStart: document.getElementById("btn-start-paddle"),
        btnRestart: document.getElementById("btn-restart-paddle"),
      },
    });
  }
}

function setupPreviewCanvas(hostId, drawFn) {
  const host = document.getElementById(hostId);
  if (!host) return;
  let c = host.querySelector("canvas");
  if (!c) {
    c = document.createElement("canvas");
    host.appendChild(c);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = host.clientWidth || 300;
  const h = host.clientHeight || 150;
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  c.style.width = w + "px";
  c.style.height = h + "px";
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFn(ctx, w, h);
}

function drawMenuPreviews() {
  setupPreviewCanvas("preview-survivor", (ctx, w, h) => {
    ctx.fillStyle = "#e8e0d2";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(26,26,26,0.08)";
    for (let x = 0; x < w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    drawHouse(ctx, w * 0.18, h * 0.72, 0.9, 0);
    drawHouse(ctx, w * 0.28, h * 0.74, 0.75, 1);
    drawSprout(ctx, w * 0.12, h * 0.76, 0.9, 0, 1);
    drawSprout(ctx, w * 0.34, h * 0.78, 0.8, 1, 2);
    drawTornado(ctx, w * 0.72, h * 0.78, 0.55, 1.2, 1);
    drawCharacter(ctx, "archer", w * 0.42, h * 0.62, 1, 0.4);
    drawNineTailFox(ctx, w * 0.58, h * 0.7, 0.55, 1.2, 0);
  });

  setupPreviewCanvas("preview-platform", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(1, "#e4ddd0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#e8e0d2";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(20, h * 0.72, w - 40, 18);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(w * 0.55, h * 0.48, 90, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1a1a1a";
    const spikeBase = h * 0.72;
    for (let i = 0; i < 4; i++) {
      const x0 = w * 0.58 + i * 11;
      ctx.beginPath();
      ctx.moveTo(x0, spikeBase);
      ctx.lineTo(x0 + 5.5, spikeBase - 13);
      ctx.lineTo(x0 + 11, spikeBase);
      ctx.fill();
    }
    ctx.fillStyle = "#d7cebf";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.3);
    ctx.lineTo(w * 0.76, h * 0.22);
    ctx.lineTo(w * 0.84, h * 0.24);
    ctx.lineTo(w * 0.86, h * 0.32);
    ctx.lineTo(w * 0.8, h * 0.36);
    ctx.lineTo(w * 0.73, h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    drawCharacter(ctx, "swordsman", w * 0.22, h * 0.58, 1, 0.2);
    drawCharacter(ctx, "mage", w * 0.42, h * 0.58, 1, 0.3);
    drawEyeball(ctx, w * 0.72, h * 0.38, 0.5, 0.8, 0);
  });

  setupPreviewCanvas("preview-tower", (ctx, w, h) => {
    ctx.fillStyle = "#e6e0d4";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#d0c6b4";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(12, h * 0.55);
    ctx.lineTo(w * 0.35, h * 0.55);
    ctx.lineTo(w * 0.35, h * 0.28);
    ctx.lineTo(w * 0.7, h * 0.28);
    ctx.lineTo(w * 0.7, h * 0.7);
    ctx.lineTo(w - 16, h * 0.7);
    ctx.stroke();

    ctx.fillStyle = "#c23b3b";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w - 16, h * 0.7, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawCharacter(ctx, "knight", w * 0.2, h * 0.4, 1, 0.3);
    drawCharacter(ctx, "archer", w * 0.38, h * 0.42, 1, 0.2);
    drawNineTailFox(ctx, w * 0.55, h * 0.55, 0.4, 1, 0);
    drawEyeball(ctx, w * 0.78, h * 0.42, 0.38, 0.6, 0);
  });

  setupPreviewCanvas("preview-rhythm", (ctx, w, h) => {
    ctx.fillStyle = "#e8e0d2";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    // 妈妈刺字缩略
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.4, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.46);
    ctx.lineTo(w * 0.22, h * 0.68);
    ctx.lineTo(w * 0.38, h * 0.55);
    ctx.stroke();
    // 跨栏小人
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.38, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.43);
    ctx.lineTo(w * 0.55, h * 0.55);
    ctx.lineTo(w * 0.48, h * 0.68);
    ctx.moveTo(w * 0.55, h * 0.55);
    ctx.lineTo(w * 0.62, h * 0.62);
    ctx.stroke();
    // 音符
    ctx.font = "22px Songti SC, serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText("♪", w * 0.78, h * 0.45);
    ctx.fillText("♫", w * 0.72, h * 0.7);
  });

  setupPreviewCanvas("preview-paddle", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(0.5, "#e8e4d8");
    sky.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 云（圆瓣 + 墨线 + 折痕）
    const drawPreviewCloud = (cx, cy, sc) => {
      const lobes = [
        { x: 0, y: 4, r: 7 },
        { x: 10, y: -2, r: 9 },
        { x: 22, y: 2, r: 7 },
        { x: 10, y: 6, r: 6 },
      ];
      const ink = 1.35;
      ctx.fillStyle = "#1a1a1a";
      for (const L of lobes) {
        ctx.beginPath();
        ctx.arc(cx + L.x * sc, cy + L.y * sc, L.r * sc + ink, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffffff";
      for (const L of lobes) {
        ctx.beginPath();
        ctx.arc(cx + L.x * sc, cy + L.y * sc, L.r * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx + 10 * sc, cy, 6 * sc, 0.1, 1.25);
      ctx.stroke();
    };
    drawPreviewCloud(w * 0.18, h * 0.18, 1);
    drawPreviewCloud(w * 0.72, h * 0.14, 0.85);

    // 远山
    ctx.fillStyle = "#ddd6c8";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const y = h * 0.42 + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.045) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = h * 0.42 + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.045) * 6;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 近山
    ctx.fillStyle = "#d0c8b8";
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const y = h * 0.52 + Math.sin(x * 0.028 + 1) * 10;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = h * 0.52 + Math.sin(x * 0.028 + 1) * 10;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 水面
    const water = ctx.createLinearGradient(0, h * 0.58, 0, h);
    water.addColorStop(0, "rgba(170, 206, 224, 0.35)");
    water.addColorStop(1, "rgba(122, 172, 200, 0.55)");
    ctx.fillStyle = water;
    ctx.fillRect(0, h * 0.58, w, h * 0.42);
    ctx.strokeStyle = "rgba(26,26,26,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const yy = h * 0.68 + i * 10;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 10) {
        const y = yy + Math.sin(x * 0.1 + i) * 1.5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 小船
    ctx.fillStyle = "#3a3a3a";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.72);
    ctx.quadraticCurveTo(w * 0.38, h * 0.78, w * 0.55, h * 0.72);
    ctx.quadraticCurveTo(w * 0.38, h * 0.66, w * 0.22, h * 0.72);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.38, h * 0.58, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.63);
    ctx.lineTo(w * 0.38, h * 0.7);
    ctx.moveTo(w * 0.38, h * 0.65);
    ctx.lineTo(w * 0.48, h * 0.6);
    ctx.stroke();

    ctx.fillStyle = "#d7cebf";
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.68);
    ctx.lineTo(w * 0.76, h * 0.6);
    ctx.lineTo(w * 0.82, h * 0.62);
    ctx.lineTo(w * 0.8, h * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

document.getElementById("game-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".game-card");
  if (!card) return;
  enterMode(card.dataset.mode);
});

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    // 节奏关卡内返回 → 选关菜单；选关页再返回 → 主菜单
    if (activeMode === "rhythm" && handleRhythmBack()) return;
    showMenu();
  });
});

window.addEventListener("resize", () => {
  if (!menu.classList.contains("hidden")) drawMenuPreviews();
});

if (document.documentElement.classList.contains("is-mobile")) {
  menu.setAttribute("inert", "");
  stage.setAttribute("inert", "");
}

loadMonsters(); // 预加载局内位图怪，菜单预览仍用矢量
drawMenuPreviews();
