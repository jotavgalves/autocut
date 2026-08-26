import "../renderer/styles.css";
import { planCutJob, validateManualCuts } from "../shared/cutPlanner.js";
import { getFabricPreset } from "../shared/presets.js";
import { baseNameFromPath } from "../shared/naming.js";
import { cmToPx } from "../shared/units.js";

const DESKTOP_TEST_IMAGE = "C:\\Users\\CRIACAO\\Desktop\\CENÁRIO BOLINHAS 1000X290.jpg";

const state = {
  image: null,
  dimensions: { widthCm: 1000, heightCm: 290, dpi: 300 },
  fabricId: "oxford",
  marginCm: 1,
  orientation: "auto",
  editMode: "linked",
  baseName: "CENARIO BOLINHAS 1000X290",
  plan: null,
  manualValidation: null
};

document.querySelector("#app").innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">AUTOCUT</p>
        <h1>Preparacao dimensional para sublimacao</h1>
      </div>
      <div class="status-pill" id="statusPill">Oxford 145 cm</div>
    </section>

    <section class="workspace">
      <aside class="panel controls">
        <div class="group">
          <h2>Arquivo</h2>
          <button id="loadDesktop">Validar imagem do Desktop</button>
          <button id="chooseFile">Escolher arquivo</button>
          <div class="meta" id="fileMeta">Cenario de teste: 1000 x 290 cm, 300 DPI.</div>
        </div>

        <div class="group grid">
          <h2>Dimensoes</h2>
          <label>Largura cm<input id="widthCm" type="number" step="0.01" value="1000"></label>
          <label>Altura cm<input id="heightCm" type="number" step="0.01" value="290"></label>
          <label>DPI<input id="dpi" type="number" step="1" value="300"></label>
        </div>

        <div class="group grid">
          <h2>Tecido</h2>
          <label>Preset<select id="fabric"><option value="oxford">Oxford - 145 cm</option><option value="helanca">Helanca - 158 cm</option><option value="tactel">Tactel - 155 cm</option></select></label>
          <label>Margem cm<input id="marginCm" type="number" step="0.1" value="1"></label>
        </div>

        <div class="group grid">
          <h2>Corte</h2>
          <label>Orientacao<select id="orientation"><option value="auto">Automatica</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
          <label>Modo<select id="editMode"><option value="linked">Vinculado</option><option value="free">Livre</option></select></label>
          <label>Nome<input id="baseName" value="CENARIO BOLINHAS 1000X290"></label>
        </div>
      </aside>

      <section class="preview-wrap">
        <div class="preview-head">
          <div>
            <h2>Pre-visualizacao</h2>
            <p id="previewSub">Linhas de corte, margens e emendas calculadas.</p>
          </div>
          <div class="legend"><span></span> valido <span></span> atencao <span></span> invalido</div>
        </div>
        <canvas id="preview" width="980" height="560"></canvas>
      </section>

      <aside class="panel report">
        <h2>Validacao</h2>
        <div id="report"></div>
      </aside>
    </section>
  </main>
`;

const inputs = {
  widthCm: document.querySelector("#widthCm"),
  heightCm: document.querySelector("#heightCm"),
  dpi: document.querySelector("#dpi"),
  fabric: document.querySelector("#fabric"),
  marginCm: document.querySelector("#marginCm"),
  orientation: document.querySelector("#orientation"),
  editMode: document.querySelector("#editMode"),
  baseName: document.querySelector("#baseName")
};

document.querySelector("#chooseFile").addEventListener("click", async () => {
  const result = await window.autocut.openImage();
  if (result) applyImageInspection(result);
});

document.querySelector("#loadDesktop").addEventListener("click", async () => {
  const result = await window.autocut.inspectPath(DESKTOP_TEST_IMAGE);
  applyImageInspection(result);
});

for (const input of Object.values(inputs)) {
  input.addEventListener("input", syncAndRender);
  input.addEventListener("change", syncAndRender);
}

syncAndRender();
setTimeout(async () => {
  const result = await window.autocut.inspectPath(DESKTOP_TEST_IMAGE);
  applyImageInspection(result);
}, 250);

function applyImageInspection(result) {
  state.image = result;
  state.baseName = result.baseName ? result.baseName.toUpperCase() : state.baseName;
  inputs.baseName.value = state.baseName;
  const meta = document.querySelector("#fileMeta");

  if (!result.ok) {
    meta.innerHTML = `<strong>${result.baseName}</strong><br>${result.error}`;
    syncAndRender();
    return;
  }

  inputs.widthCm.value = result.widthCm.toFixed(2);
  inputs.heightCm.value = result.heightCm.toFixed(2);
  inputs.dpi.value = result.dpi;
  meta.innerHTML = `<strong>${result.baseName}</strong><br>${result.widthPx} x ${result.heightPx}px · ${result.widthCm.toFixed(2)} x ${result.heightCm.toFixed(2)} cm · ${result.dpi} DPI`;
  syncAndRender();
}

function syncAndRender() {
  state.dimensions.widthCm = Number(inputs.widthCm.value);
  state.dimensions.heightCm = Number(inputs.heightCm.value);
  state.dimensions.dpi = Number(inputs.dpi.value);
  state.fabricId = inputs.fabric.value;
  state.marginCm = Number(inputs.marginCm.value);
  state.orientation = inputs.orientation.value;
  state.editMode = inputs.editMode.value;
  state.baseName = inputs.baseName.value || baseNameFromPath(DESKTOP_TEST_IMAGE);

  const fabric = getFabricPreset(state.fabricId);
  const margin = { sizeCm: state.marginCm, top: true, right: true, bottom: true, left: true };

  state.plan = planCutJob({
    widthCm: state.dimensions.widthCm,
    heightCm: state.dimensions.heightCm,
    dpi: state.dimensions.dpi,
    fabric,
    margin,
    orientation: state.orientation,
    baseName: state.baseName,
    minimumLastSliceCm: 10
  });

  state.manualValidation = makeManualValidation(state.plan, fabric, margin);
  renderCanvas();
  renderReport();
}

function makeManualValidation(plan, fabric, margin) {
  if (!plan.slices?.length) return null;
  const dpi = state.dimensions.dpi;
  const axisPx = cmToPx(plan.orientation === "horizontal" ? state.dimensions.heightCm : state.dimensions.widthCm, dpi);
  const cutPositions = plan.slices.slice(0, -1).map((slice) => slice.endPx);
  return validateManualCuts({
    cutPositionsPx: cutPositions,
    totalAxisPx: axisPx,
    dpi,
    fabric,
    margin,
    orientation: plan.orientation,
    linkedMode: state.editMode === "linked"
  });
}

function renderCanvas() {
  const canvas = document.querySelector("#preview");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, w, h);

  const pad = 48;
  const ratio = Math.min((w - pad * 2) / state.dimensions.widthCm, (h - pad * 2) / state.dimensions.heightCm);
  const artW = state.dimensions.widthCm * ratio;
  const artH = state.dimensions.heightCm * ratio;
  const x = (w - artW) / 2;
  const y = (h - artH) / 2;

  drawPattern(ctx, x, y, artW, artH);
  ctx.strokeStyle = "#26221c";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, artW, artH);

  if (state.plan.status === "NO_CUT_NEEDED") {
    drawCentered(ctx, "ESTA ARTE NAO PRECISA SER DIVIDIDA", w / 2, h / 2, "#127a45", 22);
    return;
  }

  for (const slice of state.plan.slices) {
    const axisCm = slice.endPx / state.dimensions.dpi * 2.54;
    const pos = state.plan.orientation === "horizontal" ? y + axisCm * ratio : x + axisCm * ratio;
    ctx.strokeStyle = slice.finalLimitedAxisCm <= state.plan.fabric.maxPrintableWidthCm ? "#127a45" : "#b42318";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    if (state.plan.orientation === "horizontal") {
      ctx.beginPath();
      ctx.moveTo(x, pos);
      ctx.lineTo(x + artW, pos);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(pos, y);
      ctx.lineTo(pos, y + artH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (const slice of state.plan.slices) {
    const startCm = slice.startPx / state.dimensions.dpi * 2.54;
    const endCm = slice.endPx / state.dimensions.dpi * 2.54;
    const cx = state.plan.orientation === "vertical" ? x + ((startCm + endCm) / 2) * ratio : x + artW / 2;
    const cy = state.plan.orientation === "horizontal" ? y + ((startCm + endCm) / 2) * ratio : y + artH / 2;
    drawBadge(ctx, `FAIXA ${slice.index}/${slice.total}`, cx, cy);
    const dim = `${slice.finalLimitedAxisCm.toFixed(2).replace(".", ",")} cm final`;
    drawCentered(ctx, dim, cx, cy + 26, "#26221c", 13);
  }
}

function drawPattern(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#f7efe2";
  ctx.fillRect(x, y, w, h);
  for (let row = 0; row < 18; row += 1) {
    for (let col = 0; col < 36; col += 1) {
      ctx.beginPath();
      ctx.fillStyle = (row + col) % 3 === 0 ? "#006a71" : (row + col) % 3 === 1 ? "#d3452f" : "#f0b429";
      ctx.arc(x + col * 34 + (row % 2) * 16, y + row * 34, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBadge(ctx, text, x, y) {
  ctx.font = "700 14px Segoe UI";
  const metrics = ctx.measureText(text);
  const bw = metrics.width + 22;
  ctx.fillStyle = "#26221c";
  ctx.fillRect(x - bw / 2, y - 15, bw, 30);
  drawCentered(ctx, text, x, y + 5, "#ffffff", 14);
}

function drawCentered(ctx, text, x, y, color, size) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Segoe UI`;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

function renderReport() {
  const report = document.querySelector("#report");
  const plan = state.plan;
  const fileProblem = state.image && !state.image.ok ? `<div class="alert danger">${state.image.error}</div>` : "";
  const imageStatus = state.image?.ok ? "Imagem decodificada" : "Arquivo do Desktop nao decodificado";
  const max = plan.slices?.length ? Math.max(...plan.slices.map((slice) => slice.finalLimitedAxisCm)) : 0;
  const seamRows = plan.slices?.map((slice) => {
    const before = slice.seam.labels.before ? slice.seam.labels.before.join("/") : "-";
    const after = slice.seam.labels.after ? slice.seam.labels.after.join("/") : "-";
    return `<tr><td>${slice.index}/${slice.total}</td><td>${slice.usefulCm.toFixed(2)}</td><td>${slice.finalLimitedAxisCm.toFixed(2)}</td><td>${before}</td><td>${after}</td></tr>`;
  }).join("") ?? "";

  report.innerHTML = `
    ${fileProblem}
    <div class="metric ${plan.validation.approved ? "ok" : "danger"}">${plan.validation.approved ? "APROVADO" : "ERRO - NAO LIBERAR"}</div>
    <dl>
      <dt>Arquivo</dt><dd>${state.baseName.toUpperCase()}</dd>
      <dt>Imagem</dt><dd>${imageStatus}</dd>
      <dt>Original</dt><dd>${state.dimensions.widthCm} x ${state.dimensions.heightCm} cm</dd>
      <dt>DPI</dt><dd>${state.dimensions.dpi}</dd>
      <dt>Tecido</dt><dd>${plan.fabric.name} · limite ${plan.fabric.maxPrintableWidthCm} cm</dd>
      <dt>Orientacao</dt><dd>${plan.orientation}</dd>
      <dt>Faixas</dt><dd>${plan.slices?.length || 0}</dd>
      <dt>Maior eixo limitado</dt><dd>${max ? max.toFixed(2) : "-"} cm</dd>
      <dt>Reconstrucao</dt><dd>${plan.validation.reconstruction?.ok || plan.status === "NO_CUT_NEEDED" ? "OK" : "ERRO"}</dd>
    </dl>
    ${seamRows ? `<table><thead><tr><th>Faixa</th><th>Util cm</th><th>Final cm</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${seamRows}</tbody></table>` : ""}
  `;

  document.querySelector("#statusPill").textContent = plan.validation.approved ? "Validado" : "Revisar";
  document.querySelector("#statusPill").className = `status-pill ${plan.validation.approved ? "ok" : "danger"}`;
}
