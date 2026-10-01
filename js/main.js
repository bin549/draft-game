import { startSurvivor, stopSurvivor } from "./survivor.js?v=20260927e";
import { startPlatform, stopPlatform } from "./platform.js?v=20260929k";
import { startTower, stopTower } from "./tower.js";
import { startRhythm, stopRhythm, handleRhythmBack } from "./rhythm.js?v=20260927o";
import { startPaddle, stopPaddle } from "./paddle.js?v=20260930load";
import { startIcefire, stopIcefire } from "./icefire.js?v=20260930autonext";
import { startTowerfall, stopTowerfall, handleTowerfallBack } from "./towerfall.js?v=20260930a";
import { startThief, stopThief } from "./thief.js?v=20260929h";
import { startDressup, stopDressup } from "./dressup.js?v=20260929j";
import { startDoom, stopDoom } from "./doom.js?v=20260930spriteperf";
import { startMatch3, stopMatch3 } from "./match3.js?v=20261001b";
import { startSling, stopSling } from "./sling.js?v=20261001static";
import { startArcade, stopArcade } from "./arcade.js?v=20261001noshake";
import { drawNineTailFox, drawEyeball, drawHouse, drawSprout, drawTornado } from "./draw.js";
import { drawCharacter } from "./characters.js?v=20260927e";
import { loadMonsters, getMonsterSprite } from "./monsters.js";

const menu = document.getElementById("menu");
const stage = document.getElementById("stage");
const canvas = document.getElementById("game");
const loadingScreen = document.getElementById("loading-screen");

const MODE_IDS = ["survivor", "platform", "tower", "rhythm", "paddle", "icefire", "towerfall", "thief", "dressup", "doom", "match3", "sling", "arcade"];

let activeMode = null;

function showLoading(text = "正在加载中…") {
  const label = loadingScreen?.querySelector(".loading-text");
  if (label) label.textContent = text;
  if (loadingScreen) {
    loadingScreen.classList.remove("hidden");
    loadingScreen.style.display = "grid";
  }
}

function hideLoading() {
  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
    loadingScreen.style.display = "none";
  }
}

function waitFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

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
  hideLoading();
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
  if (activeMode === "icefire") stopIcefire();
  if (activeMode === "towerfall") stopTowerfall();
  if (activeMode === "thief") stopThief();
  if (activeMode === "dressup") stopDressup();
  if (activeMode === "doom") stopDoom();
  if (activeMode === "match3") stopMatch3();
  if (activeMode === "sling") stopSling();
  if (activeMode === "arcade") stopArcade();
  activeMode = null;
}

async function enterMode(mode) {
  if (document.documentElement.classList.contains("is-mobile")) return;
  stopActive();
  hideAllModeUi();

  const needsLoad = ["dressup", "thief", "icefire", "towerfall", "doom", "paddle", "match3", "sling", "arcade"].includes(mode);
  // 先盖住菜单再拉资源；舞台等 start 完成后再露，避免空白渐变
  if (needsLoad) {
    showLoading("正在加载中…");
    await waitFrame();
  } else {
    hideLoading();
    menu.classList.add("hidden");
    stage.classList.remove("hidden");
  }
  activeMode = mode;

  let loaded = false;
  try {
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
    await startPaddle({
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
  } else if (mode === "icefire") {
    await startIcefire({
      canvas,
      els: {
        hud: document.getElementById("hud-icefire"),
        overlay: document.getElementById("overlay-icefire"),
        gameover: document.getElementById("gameover-icefire"),
        endTitle: document.getElementById("icefire-end-title"),
        resultText: document.getElementById("icefire-result-text"),
        iceGems: document.getElementById("icefire-ice-gems"),
        fireGems: document.getElementById("icefire-fire-gems"),
        iceDoor: document.getElementById("icefire-ice-door"),
        fireDoor: document.getElementById("icefire-fire-door"),
        stageText: document.getElementById("icefire-stage-text"),
        timerText: document.getElementById("icefire-timer-text"),
        hint: document.getElementById("icefire-hint"),
        btnStart: document.getElementById("btn-start-icefire"),
        btnRestart: document.getElementById("btn-restart-icefire"),
      },
    });
  } else if (mode === "towerfall") {
    await startTowerfall({
      canvas,
      els: {
        hud: document.getElementById("hud-towerfall"),
        overlay: document.getElementById("overlay-towerfall"),
        gameover: document.getElementById("gameover-towerfall"),
        endTitle: document.getElementById("towerfall-end-title"),
        resultText: document.getElementById("towerfall-result-text"),
        p1Name: document.getElementById("towerfall-p1-name"),
        p2Name: document.getElementById("towerfall-p2-name"),
        p1Lives: document.getElementById("towerfall-p1-lives"),
        p2Lives: document.getElementById("towerfall-p2-lives"),
        p1Kills: document.getElementById("towerfall-p1-kills"),
        p2Kills: document.getElementById("towerfall-p2-kills"),
        btnRestart: document.getElementById("btn-restart-towerfall"),
        backBtn: document.querySelector("#hud-towerfall [data-back]"),
      },
    });
  } else if (mode === "thief") {
    await startThief({
      canvas,
      els: {
        hud: document.getElementById("hud-thief"),
        overlay: document.getElementById("overlay-thief"),
        gameover: document.getElementById("gameover-thief"),
        endTitle: document.getElementById("thief-end-title"),
        resultText: document.getElementById("thief-result-text"),
        p1Score: document.getElementById("thief-p1-score"),
        p2Score: document.getElementById("thief-p2-score"),
        p1Wins: document.getElementById("thief-p1-wins"),
        p2Wins: document.getElementById("thief-p2-wins"),
        btnStart: document.getElementById("btn-start-thief"),
        btnRestart: document.getElementById("btn-restart-thief"),
      },
    });
  } else if (mode === "dressup") {
    await startDressup({
      canvas,
      els: {
        hud: document.getElementById("hud-dressup"),
        overlay: document.getElementById("overlay-dressup"),
        gameover: document.getElementById("gameover-dressup"),
      },
    });
  } else if (mode === "doom") {
    await startDoom({
      canvas,
      els: {
        hud: document.getElementById("hud-doom"),
        overlay: document.getElementById("overlay-doom"),
        gameover: document.getElementById("gameover-doom"),
        endTitle: document.getElementById("doom-end-title"),
        resultText: document.getElementById("doom-result-text"),
        hpFill: document.getElementById("doom-hp-fill"),
        hpText: document.getElementById("doom-hp-text"),
        hp2Fill: document.getElementById("doom-hp2-fill"),
        hp2Text: document.getElementById("doom-hp2-text"),
        p1Label: document.getElementById("doom-p1-label"),
        p2Stat: document.getElementById("doom-p2-stat"),
        waveText: document.getElementById("doom-wave-text"),
        killText: document.getElementById("doom-kill-text"),
        enemyText: document.getElementById("doom-enemy-text"),
        overlaySub: document.getElementById("doom-overlay-sub"),
        btnStart: document.getElementById("btn-start-doom"),
        btnRestart: document.getElementById("btn-restart-doom"),
        btnJoin: document.getElementById("btn-join-doom"),
      },
    });
  } else if (mode === "match3") {
    await startMatch3({
      canvas,
      els: {
        hud: document.getElementById("hud-match3"),
        overlay: document.getElementById("overlay-match3"),
        gameover: document.getElementById("gameover-match3"),
        endTitle: document.getElementById("match3-end-title"),
        resultText: document.getElementById("match3-result-text"),
        scoreText: document.getElementById("match3-score-text"),
        movesText: document.getElementById("match3-moves-text"),
        goalText: document.getElementById("match3-goal-text"),
        stageText: document.getElementById("match3-stage-text"),
        progressFill: document.getElementById("match3-progress-fill"),
        btnStart: document.getElementById("btn-start-match3"),
        btnRestart: document.getElementById("btn-restart-match3"),
      },
    });
  } else if (mode === "sling") {
    await startSling({
      canvas,
      els: {
        hud: document.getElementById("hud-sling"),
        overlay: document.getElementById("overlay-sling"),
        gameover: document.getElementById("gameover-sling"),
        endTitle: document.getElementById("sling-end-title"),
        resultText: document.getElementById("sling-result-text"),
        scoreText: document.getElementById("sling-score-text"),
        birdsText: document.getElementById("sling-birds-text"),
        enemyText: document.getElementById("sling-enemy-text"),
        stageText: document.getElementById("sling-stage-text"),
        titleText: document.getElementById("sling-title-text"),
        btnStart: document.getElementById("btn-start-sling"),
        btnRestart: document.getElementById("btn-restart-sling"),
      },
    });
  } else if (mode === "arcade") {
    await startArcade({
      canvas,
      els: {
        hud: document.getElementById("hud-arcade"),
        overlay: document.getElementById("overlay-arcade"),
        gameover: document.getElementById("gameover-arcade"),
        endTitle: document.getElementById("arcade-end-title"),
        resultText: document.getElementById("arcade-result-text"),
        p1Text: document.getElementById("arcade-p1-text"),
        p2Text: document.getElementById("arcade-p2-text"),
        p2Stat: document.getElementById("arcade-p2-stat"),
        mobText: document.getElementById("arcade-mob-text"),
        stageText: document.getElementById("arcade-stage-text"),
        overlaySub: document.getElementById("arcade-overlay-sub"),
        btnStart: document.getElementById("btn-start-arcade"),
        btnRestart: document.getElementById("btn-restart-arcade"),
        btnJoin: document.getElementById("btn-join-arcade"),
        modePick: document.getElementById("arcade-mode-pick"),
        versusPick: document.getElementById("arcade-versus-pick"),
        btnModeMonster: document.getElementById("btn-arcade-monster"),
        btnModeVersus: document.getElementById("btn-arcade-versus"),
        btnVersusPvp: document.getElementById("btn-versus-pvp"),
        btnVersusCpu: document.getElementById("btn-versus-cpu"),
        btnVersusCoop: document.getElementById("btn-versus-coop"),
      },
    });
  }
  if (needsLoad) {
    menu.classList.add("hidden");
    stage.classList.remove("hidden");
    await waitFrame();
  }
  loaded = true;
  } catch (err) {
    console.error(err);
    stopActive();
    stage.classList.add("hidden");
    menu.classList.remove("hidden");
    drawMenuPreviews();
    showLoading("加载失败，请刷新重试");
    setTimeout(hideLoading, 1800);
  } finally {
    if (needsLoad && loaded) hideLoading();
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

  setupPreviewCanvas("preview-icefire", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(0.55, "#e8e4d8");
    sky.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#ebe4d6";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(8, h * 0.72, w - 16, 14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(w * 0.35, h * 0.48, 70, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#7ab8d8";
    ctx.fillRect(w * 0.22, h * 0.74, 28, 10);
    ctx.strokeRect(w * 0.22, h * 0.74, 28, 10);
    ctx.fillStyle = "#c45c26";
    ctx.fillRect(w * 0.55, h * 0.74, 28, 10);
    ctx.strokeRect(w * 0.55, h * 0.74, 28, 10);
    ctx.fillStyle = "#3a8f6e";
    ctx.fillRect(w * 0.4, h * 0.5, 22, 8);
    ctx.strokeRect(w * 0.4, h * 0.5, 22, 8);

    const gem = (x, y, color) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(-4, -4, 8, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    gem(w * 0.3, h * 0.38, "#5ec8ff");
    gem(w * 0.68, h * 0.36, "#e87848");

    ctx.fillStyle = "#c45c26";
    ctx.strokeStyle = "#1a1a1a";
    ctx.fillRect(w * 0.12, h * 0.55, 18, 26);
    ctx.strokeRect(w * 0.12, h * 0.55, 18, 26);
    ctx.fillStyle = "#3a6ea5";
    ctx.fillRect(w * 0.82, h * 0.55, 18, 26);
    ctx.strokeRect(w * 0.82, h * 0.55, 18, 26);

    const drawSilhouette = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y - 16, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y);
      ctx.lineTo(x - 6, y + 9);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6, y + 9);
      ctx.stroke();
    };
    drawSilhouette(w * 0.28, h * 0.62, "#6aa8c8");
    drawSilhouette(w * 0.48, h * 0.62, "#c86848");
  });

  setupPreviewCanvas("preview-towerfall", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(0.55, "#e8e4d8");
    sky.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(26,26,26,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const plat = (x, y, pw) => {
      ctx.fillStyle = "#ebe4d6";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, pw, 11);
      ctx.strokeRect(x, y, pw, 11);
      ctx.fillStyle = "#f2efe6";
      ctx.fillRect(x + 1, y + 1, pw - 2, 3);
    };
    plat(8, h * 0.78, w - 16);
    plat(w * 0.08, h * 0.52, 58);
    plat(w * 0.62, h * 0.52, 58);
    plat(w * 0.34, h * 0.36, 70);

    // 灯笼
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 6);
    ctx.lineTo(w * 0.5, h * 0.22);
    ctx.stroke();
    ctx.fillStyle = "#e8c86a";
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.24, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const mouse = (x, y, color, faceRight) => {
      ctx.save();
      ctx.translate(x, y);
      if (faceRight) ctx.scale(-1, 1);
      ctx.fillStyle = color;
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.3;
      // 耳
      ctx.beginPath();
      ctx.ellipse(-5, -18, 4, 5.5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(5, -18, 4, 5.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 头+身
      ctx.beginPath();
      ctx.ellipse(0, -8, 8, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 枪
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(-18, -2, 14, 3);
      ctx.strokeRect(-18, -2, 14, 3);
      // 尾
      ctx.strokeStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.moveTo(8, 8);
      ctx.quadraticCurveTo(18, 4, 16, -2);
      ctx.stroke();
      ctx.restore();
    };
    mouse(w * 0.28, h * 0.52 - 2, "#6aba98", true);
    mouse(w * 0.72, h * 0.52 - 2, "#9a70c0", false);

    // 对射箭头示意
    ctx.strokeStyle = "#1a1a1a";
    ctx.fillStyle = "#e8e0d2";
    ctx.lineWidth = 1.2;
    const arrow = (x, y, dir) => {
      ctx.beginPath();
      ctx.moveTo(x + dir * 8, y);
      ctx.lineTo(x - dir * 4, y - 3);
      ctx.lineTo(x - dir * 4, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    arrow(w * 0.42, h * 0.44, 1);
    arrow(w * 0.58, h * 0.48, -1);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 15px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("FIGHT!", w * 0.5, h * 0.14);
  });

  setupPreviewCanvas("preview-thief", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(0.55, "#e8e4d8");
    sky.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(26,26,26,0.05)";
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // 中缝
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(w * 0.5 - 2, 0, 4, h);
    // 纸色楼影
    ctx.fillStyle = "#e4ddd0";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    ctx.fillRect(8, h * 0.35, 28, h * 0.35);
    ctx.strokeRect(8.5, h * 0.35 + 0.5, 27, h * 0.35 - 1);
    ctx.fillRect(w - 40, h * 0.3, 32, h * 0.4);
    ctx.strokeRect(w - 39.5, h * 0.3 + 0.5, 31, h * 0.4 - 1);
    // 掉落物
    ctx.fillStyle = "#e8c86a";
    ctx.beginPath();
    ctx.arc(w * 0.28, h * 0.28, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5ec8ff";
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.22);
    ctx.lineTo(w * 0.76, h * 0.3);
    ctx.lineTo(w * 0.72, h * 0.38);
    ctx.lineTo(w * 0.68, h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 小偷剪影
    const thief = (x, color) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, h * 0.62, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(x - 7, h * 0.68, 14, 22);
      ctx.strokeRect(x - 7, h * 0.68, 14, 22);
      ctx.fillStyle = "#8a5a38";
      ctx.beginPath();
      ctx.ellipse(x + 10, h * 0.7, 8, 7, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    thief(w * 0.28, "#e8b090");
    thief(w * 0.72, "#90b0e8");
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 12px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("STEAL!", w * 0.5, h * 0.14);
  });

  setupPreviewCanvas("preview-dressup", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(0.55, "#e8e4d8");
    sky.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(26,26,26,0.05)";
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // 仕女剪影
    ctx.fillStyle = "#f0e6d4";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.28, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1d2a3a";
    ctx.fillRect(w * 0.35, h * 0.42, w * 0.3, h * 0.4);
    ctx.strokeRect(w * 0.35, h * 0.42, w * 0.3, h * 0.4);
    ctx.fillStyle = "#f5f2e6";
    ctx.fillRect(w * 0.42, h * 0.45, w * 0.16, h * 0.32);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(w * 0.38, h * 0.12, w * 0.24, 14);
    ctx.fillStyle = "#d8a7a7";
    ctx.beginPath();
    ctx.arc(w * 0.45, h * 0.16, 3, 0, Math.PI * 2);
    ctx.arc(w * 0.55, h * 0.16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 12px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("换装", w * 0.5, h * 0.92);
  });

  setupPreviewCanvas("preview-doom", (ctx, w, h) => {
    // 伪 3D 走廊剪影
    const ceil = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    ceil.addColorStop(0, "#c8d6e0");
    ceil.addColorStop(1, "#d8e4ec");
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, w, h * 0.5);
    const floor = ctx.createLinearGradient(0, h * 0.5, 0, h);
    floor.addColorStop(0, "#ddd4c4");
    floor.addColorStop(1, "#cfc4b0");
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);

    // 透视墙
    ctx.fillStyle = "#d8cfc0";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.32, h * 0.28);
    ctx.lineTo(w * 0.32, h * 0.72);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#cfc4b0";
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w * 0.68, h * 0.28);
    ctx.lineTo(w * 0.68, h * 0.72);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 远墙
    ctx.fillStyle = "#e4ddd0";
    ctx.fillRect(w * 0.32, h * 0.28, w * 0.36, h * 0.44);
    ctx.strokeRect(w * 0.32 + 0.5, h * 0.28 + 0.5, w * 0.36 - 1, h * 0.44 - 1);

    drawEyeball(ctx, w * 0.5, h * 0.58, 0.95, 1.2, 0);

    // 准星
    ctx.strokeStyle = "rgba(26,26,26,0.55)";
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 8, h * 0.48);
    ctx.lineTo(w * 0.5 + 8, h * 0.48);
    ctx.moveTo(w * 0.5, h * 0.48 - 8);
    ctx.lineTo(w * 0.5, h * 0.48 + 8);
    ctx.stroke();

    // 分屏示意中缝
    ctx.fillStyle = "rgba(26,26,26,0.35)";
    ctx.fillRect(w * 0.5 - 1, 0, 2, h);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 12px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("射击", w * 0.5, h * 0.14);
  });

  setupPreviewCanvas("preview-match3", (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#ebe4d6");
    g.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const types = ["eyeball-1", "nine-tail-fox-1", "tiger-1", "thief-1", "official-1", "boat-man-1"];
    const cols = 4;
    const rows = 2;
    const cell = Math.min((w - 28) / cols, (h - 36) / rows);
    const ox = (w - cell * cols) / 2;
    const oy = (h - cell * rows) / 2 + 4;
    ctx.fillStyle = "rgba(242,239,230,0.9)";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(ox - 6, oy - 6, cell * cols + 12, cell * rows + 12, 8);
    else ctx.rect(ox - 6, oy - 6, cell * cols + 12, cell * rows + 12);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell * cols, cell * rows);
    ctx.clip();
    for (let i = 0; i < types.length; i++) {
      const c = i % cols;
      const r = (i / cols) | 0;
      const x = ox + (c + 0.5) * cell;
      const y = oy + (r + 0.5) * cell;
      ctx.fillStyle = (c + r) % 2 === 0 ? "rgba(255,255,255,0.4)" : "rgba(26,26,26,0.04)";
      ctx.fillRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
      const spr = getMonsterSprite(types[i]);
      if (!spr) continue;
      const fit = cell * 0.82;
      const sc = Math.min(fit / spr.w, fit / spr.h);
      const dw = spr.w * sc;
      const dh = spr.h * sc;
      ctx.drawImage(spr.canvas, x - dw / 2, y - dh / 2, dw, dh);
    }
    ctx.restore();
  });

  setupPreviewCanvas("preview-sling", (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#d8e4ec");
    g.addColorStop(0.55, "#e8e0d2");
    g.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#8faf7a";
    ctx.fillRect(0, h * 0.78, w, h * 0.05);
    ctx.fillStyle = "#cfc4b0";
    ctx.fillRect(0, h * 0.82, w, h);

    // 弹弓贴地
    ctx.strokeStyle = "#5a3a22";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.78);
    ctx.lineTo(w * 0.2, h * 0.48);
    ctx.moveTo(w * 0.28, h * 0.78);
    ctx.lineTo(w * 0.26, h * 0.48);
    ctx.stroke();
    ctx.strokeStyle = "#6b3030";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.5);
    ctx.lineTo(w * 0.14, h * 0.6);
    ctx.lineTo(w * 0.26, h * 0.5);
    ctx.stroke();

    // 弹射体：怪物
    const ammo = getMonsterSprite("eyeball-1");
    if (ammo) {
      const s = Math.min(28 / ammo.w, 28 / ammo.h);
      ctx.drawImage(ammo.canvas, w * 0.14 - (ammo.w * s) / 2, h * 0.6 - (ammo.h * s) / 2, ammo.w * s, ammo.h * s);
    } else {
      drawEyeball(ctx, w * 0.14, h * 0.6, 0.45, 0, 0);
    }

    // 木结构 + 鼠敌
    ctx.fillStyle = "#c4a574";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.fillRect(w * 0.58, h * 0.52, 12, 40);
    ctx.strokeRect(w * 0.58, h * 0.52, 12, 40);
    ctx.fillRect(w * 0.72, h * 0.52, 12, 40);
    ctx.strokeRect(w * 0.72, h * 0.52, 12, 40);
    ctx.fillRect(w * 0.58, h * 0.45, 86, 12);
    ctx.strokeRect(w * 0.58, h * 0.45, 86, 12);

    ctx.fillStyle = "#e890b0";
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.72, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.stroke();

    ctx.strokeStyle = "rgba(26,26,26,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.55);
    ctx.quadraticCurveTo(w * 0.4, h * 0.22, w * 0.62, h * 0.58);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  setupPreviewCanvas("preview-arcade", (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#d8e4ec");
    sky.addColorStop(0.55, "#e8e4d8");
    sky.addColorStop(1, "#d4cbb8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#7fbf63";
    ctx.fillRect(12, 18, w - 24, h - 30);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(12.5, 18.5, w - 24, h - 30);
    ctx.fillStyle = "#e8d3a4";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(28 + i * ((w - 50) / 4), 28, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#d8b06a";
    ctx.fillRect(w * 0.42, h * 0.38, 22, 22);
    ctx.strokeRect(w * 0.42, h * 0.38, 22, 22);
    ctx.fillStyle = "#3aa0e8";
    ctx.beginPath();
    ctx.arc(w * 0.32, h * 0.62, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawEyeball(ctx, w * 0.68, h * 0.62, 0.55, 0, 0);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 12px Songti SC, serif";
    ctx.textAlign = "center";
    ctx.fillText("炸弹", w * 0.5, h * 0.16);
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
    // 对决：对战中返回选角；选角再返回模式选择
    if (activeMode === "towerfall" && handleTowerfallBack()) return;
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

loadMonsters().then(() => {
  if (!menu.classList.contains("hidden")) drawMenuPreviews();
});
drawMenuPreviews();
hideLoading();
