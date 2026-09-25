import { startSurvivor, stopSurvivor } from "./survivor.js";
import { startPlatform, stopPlatform } from "./platform.js";
import { startTower, stopTower } from "./tower.js";
import { startRhythm, stopRhythm, handleRhythmBack } from "./rhythm.js";
import { drawNineTailFox, drawEyeball, drawHouse, drawSprout, drawTornado } from "./draw.js";
import { drawCharacter } from "./characters.js";
import { loadMonsters } from "./monsters.js";

const menu = document.getElementById("menu");
const stage = document.getElementById("stage");
const canvas = document.getElementById("game");

const MODE_IDS = ["survivor", "platform", "tower", "rhythm"];

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
  activeMode = null;
}

function enterMode(mode) {
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
        stageText: document.getElementById("plat-stage-text"),
        ammoText: document.getElementById("ammo-text"),
        btnStart: document.getElementById("btn-start-platform"),
        btnRestart: document.getElementById("btn-restart-platform"),
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

loadMonsters(); // 预加载局内位图怪，菜单预览仍用矢量
drawMenuPreviews();
