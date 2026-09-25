import { CHARACTERS, drawCharacter } from "./characters.js";

/** 填充角色选择网格，点击后回调 characterId */
export function mountCharSelect(container, onPick) {
  container.innerHTML = "";
  for (const c of CHARACTERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "char-card";
    btn.dataset.id = c.id;

    const preview = document.createElement("div");
    preview.className = "char-preview";
    const canvas = document.createElement("canvas");
    preview.appendChild(canvas);

    const body = document.createElement("div");
    body.className = "char-body";
    body.innerHTML = `<h3>${c.name}</h3><p>${c.desc}</p>`;

    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", () => onPick(c.id));
    container.appendChild(btn);

    requestAnimationFrame(() => paintPreview(canvas, preview, c.id));
  }
}

function paintPreview(canvas, host, id) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = host.clientWidth || 120;
  const h = host.clientHeight || 100;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#e8e0d2";
  ctx.fillRect(0, 0, w, h);
  drawCharacter(ctx, id, w / 2, h * 0.62, 1, 0.4);
}

export function showCharSelect(overlayEl, gridEl, title, onPick) {
  const titleEl = overlayEl.querySelector("h2");
  if (titleEl) titleEl.textContent = title;
  mountCharSelect(gridEl, (id) => {
    overlayEl.classList.add("hidden");
    onPick(id);
  });
  overlayEl.classList.remove("hidden");
}
