import "./styles.css";
import { planCutJob, validateManualCuts } from "../shared/cutPlanner.js";
import { cloneDefaultFabricPresets, getFabricPreset, normalizeFabricPreset } from "../shared/presets.js";
import { DEFAULT_NAME_TEMPLATE, renderNameTemplate } from "../shared/naming.js";
import { cmToPx, formatCm } from "../shared/units.js";

const S = {
  source: null,
  image: null,
  presets: cloneDefaultFabricPresets(),
  fabricId: "oxford",
  margin: { sizeCm: 1, top: true, right: true, bottom: true, left: true, color: "#ffffff", transparent: false },
  identification: { enabled: true, font: "Arial", sizeCm: 2, color: "#111111", edgeDistanceCm: 0.18 },
  nameSides: { top: false, right: false, bottom: false, left: false },
  orientation: "auto",
  editMode: "linked",
  minimumLastSliceCm: 10,
  balanceCuts: false,
  baseName: "",
  pedido: "",
  namingTemplate: DEFAULT_NAME_TEMPLATE,
  outputDirectory: "",
  output: { format: "PNG", quality: 95, tiffCompression: "lzw", conflict: "version" },
  reprint: { enabled: false, index: 1 },
  plan: null,
  cuts: null,
  manual: null,
  drag: null,
  pan: null,
  view: { zoom: 1, x: 0, y: 0 },
  exportResult: null,
  mapResult: null
};

const app = document.querySelector("#app");
app.innerHTML = `
<header class="topbar">
  <div class="brand"><b>A</b><div><strong>AUTOCUT</strong><small>PREPARAÇÃO DIMENSIONAL PARA SUBLIMAÇÃO</small></div></div>
  <div class="top-actions"><button id="openProject">Abrir projeto</button><button id="saveProject">Salvar projeto</button><span id="status" class="status">AGUARDANDO ARTE</span></div>
</header>
<main class="layout">
  <aside class="side left">
    <section><h2><i>01</i> Arquivo</h2><button id="chooseFile" class="primary full">Selecionar arte</button><div id="fileMeta" class="meta">Nenhuma arte carregada.</div><label>DPI real<input id="sourceDpi" type="number" min="1" step="1"></label><label>Nome base<input id="baseName"></label><label>Pedido<input id="pedido"></label></section>
    <section><h2><i>02</i> Tecido</h2><label>Preset<select id="fabric"></select></label><div class="cols"><label>Nome<input id="fabricName"></label><label>Limite cm<input id="fabricLimit" type="number" min=".01" step=".01"></label></div><div class="buttons"><button id="newFabric">Novo</button><button id="saveFabric">Salvar</button><button id="deleteFabric" class="danger">Excluir</button></div></section>
    <section>
      <h2><i>03</i> Corte</h2>
      <div class="cols"><label>Orientação<select id="orientation"><option value="auto">Automática</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><label>Modo<select id="editMode"><option value="linked">Vinculado</option><option value="free">Livre</option></select></label></div>
      <label class="inline"><input id="balanceCuts" type="checkbox">Distribuir faixas igualmente</label>
      <p><b>Padrão desmarcado:</b> usa primeiro a maior medida útil imprimível. Ex.: 280 cm com útil de 145 cm → 145 + 135. Marque para equilibrar → 140 + 140.</p>
      <label>Última faixa desejável (cm)<input id="minLast" type="number" min="0" step=".1"></label>
      <p>Arraste as linhas na arte. Shift + arrastar move a visualização.</p>
    </section>
    <section><h2><i>04</i> Margens</h2><div class="cols"><label>Tamanho cm<input id="marginSize" type="number" min="0" step=".1"></label><label>Cor<input id="marginColor" type="color"></label></div><div class="checks"><label><input id="mTop" type="checkbox">Superior</label><label><input id="mRight" type="checkbox">Direita</label><label><input id="mBottom" type="checkbox">Inferior</label><label><input id="mLeft" type="checkbox">Esquerda</label></div><label class="inline"><input id="mTransparent" type="checkbox">Transparente</label></section>
    <section><h2><i>05</i> Identificação</h2><label class="inline"><input id="identEnabled" type="checkbox">A1/A2, B1/B2...</label><div class="cols"><label>Fonte<input id="identFont"></label><label>Altura cm<input id="identSize" type="number" min=".1" step=".1"></label><label>Cor<input id="identColor" type="color"></label><label>Dist. borda cm<input id="identEdge" type="number" min="0" step=".01"></label></div><small>Nome da arte nas margens</small><div class="checks"><label><input id="nTop" type="checkbox">Superior</label><label><input id="nRight" type="checkbox">Direita</label><label><input id="nBottom" type="checkbox">Inferior</label><label><input id="nLeft" type="checkbox">Esquerda</label></div></section>
  </aside>

  <section class="stage">
    <div class="stage-head"><div><h1>Pré-visualização real</h1><p id="previewInfo">Carregue uma arte.</p></div><div class="zoom"><button id="zoomOut">−</button><span id="zoomLabel">100%</span><button id="zoomIn">+</button><button id="fit">Ajustar</button></div></div>
    <div class="canvas-wrap"><canvas id="preview"></canvas><div id="empty" class="empty"><b>SEM ARTE</b><span>A imagem real e as linhas de produção aparecerão aqui.</span></div></div>
    <footer><span><em class="okdot"></em> válido <em class="warndot"></em> atenção <em class="baddot"></em> inválido</span><span>Roda do mouse: zoom · Shift+arrastar: pan</span></footer>
  </section>

  <aside class="side right">
    <section><h2><i>06</i> Nomenclatura</h2><label>Template<textarea id="template" rows="3"></textarea></label><p>{NOME} {FAIXA} {TOTAL_FAIXAS} {TECIDO} {LARGURA} {ALTURA} {DPI} {PEDIDO} {DATA}</p><div id="names" class="names">—</div></section>
    <section>
      <h2><i>07</i> Exportação</h2>
      <button id="chooseOutput" class="full">Escolher pasta</button><div id="outputPath" class="meta">Nenhuma pasta selecionada.</div>
      <div class="cols"><label>Formato<select id="format"><option>PNG</option><option>JPEG</option><option>TIFF</option><option disabled>PSD — engine pendente</option><option disabled>PSB — engine pendente</option><option disabled>PDF — engine pendente</option></select></label><label>Conflito<select id="conflict"><option value="version">Adicionar versão</option><option value="overwrite">Substituir</option><option value="skip">Ignorar</option></select></label></div>
      <label id="qualityRow">Qualidade JPEG<input id="quality" type="range" min="1" max="100"><span id="qualityValue"></span></label>
      <small>Reimpressão</small>
      <label class="inline"><input id="reprintEnabled" type="checkbox">Gerar somente uma faixa</label>
      <label>Faixa a reimprimir<input id="reprintIndex" type="number" min="1" step="1"></label>
      <button id="export" class="primary full big">GERAR E VALIDAR FAIXAS</button>
      <button id="generateMap" class="full big">GERAR MAPA DE COSTURA</button>
      <div id="mapStatus" class="meta">Mapa ainda não gerado.</div>
    </section>
    <section><h2><i>08</i> Validação</h2><div id="report" class="report"><span class="muted">Aguardando arte.</span></div></section>
  </aside>
</main>`;

const ids = [
  "openProject", "saveProject", "status", "chooseFile", "fileMeta", "sourceDpi", "baseName", "pedido",
  "fabric", "fabricName", "fabricLimit", "newFabric", "saveFabric", "deleteFabric",
  "orientation", "editMode", "balanceCuts", "minLast",
  "marginSize", "marginColor", "mTop", "mRight", "mBottom", "mLeft", "mTransparent",
  "identEnabled", "identFont", "identSize", "identColor", "identEdge", "nTop", "nRight", "nBottom", "nLeft",
  "previewInfo", "zoomOut", "zoomLabel", "zoomIn", "fit", "preview", "empty", "template", "names",
  "chooseOutput", "outputPath", "format", "conflict", "qualityRow", "quality", "qualityValue",
  "reprintEnabled", "reprintIndex", "export", "generateMap", "mapStatus", "report"
];
const E = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
let saveTimer;
await init();

async function init() {
  const saved = await window.autocut.getSettings();
  if (saved) loadSettings(saved);
  refreshFabric();
  sync();
  bind();
  recalc(true);
}

function loadSettings(x) {
  if (Array.isArray(x.presets) && x.presets.length) {
    try { S.presets = x.presets.map(normalizeFabricPreset); } catch {}
  }
  for (const k of ["fabricId", "orientation", "editMode", "minimumLastSliceCm", "balanceCuts", "namingTemplate", "outputDirectory", "pedido"]) {
    if (x[k] != null) S[k] = x[k];
  }
  if (x.margin) Object.assign(S.margin, x.margin);
  if (x.identification) Object.assign(S.identification, x.identification);
  if (x.nameSides) Object.assign(S.nameSides, x.nameSides);
  if (x.output) Object.assign(S.output, x.output);
  if (x.reprint) Object.assign(S.reprint, x.reprint);
}

function sync() {
  E.baseName.value = S.baseName;
  E.pedido.value = S.pedido;
  E.orientation.value = S.orientation;
  E.editMode.value = S.editMode;
  E.balanceCuts.checked = S.balanceCuts;
  E.minLast.value = S.minimumLastSliceCm;
  E.marginSize.value = S.margin.sizeCm;
  E.marginColor.value = S.margin.color;
  E.mTop.checked = S.margin.top;
  E.mRight.checked = S.margin.right;
  E.mBottom.checked = S.margin.bottom;
  E.mLeft.checked = S.margin.left;
  E.mTransparent.checked = S.margin.transparent;
  E.identEnabled.checked = S.identification.enabled;
  E.identFont.value = S.identification.font;
  E.identSize.value = S.identification.sizeCm;
  E.identColor.value = S.identification.color;
  E.identEdge.value = S.identification.edgeDistanceCm;
  E.nTop.checked = S.nameSides.top;
  E.nRight.checked = S.nameSides.right;
  E.nBottom.checked = S.nameSides.bottom;
  E.nLeft.checked = S.nameSides.left;
  E.template.value = S.namingTemplate;
  E.outputPath.textContent = S.outputDirectory || "Nenhuma pasta selecionada.";
  E.format.value = S.output.format;
  E.conflict.value = S.output.conflict;
  E.quality.value = S.output.quality;
  E.qualityValue.textContent = S.output.quality;
  E.reprintEnabled.checked = S.reprint.enabled;
  E.reprintIndex.value = S.reprint.index;
  updateFabricEditor();
  formatUI();
}

function bind() {
  E.chooseFile.onclick = chooseFile;
  E.chooseOutput.onclick = chooseOutput;
  E.export.onclick = doExport;
  E.generateMap.onclick = doGenerateMap;
  E.openProject.onclick = openProject;
  E.saveProject.onclick = saveProject;
  E.newFabric.onclick = newFabric;
  E.saveFabric.onclick = saveFabric;
  E.deleteFabric.onclick = deleteFabric;

  E.fabric.onchange = () => {
    S.fabricId = E.fabric.value;
    const f = fabric();
    S.margin.sizeCm = f.defaultMarginCm;
    S.margin.color = f.marginColor;
    S.identification.color = f.labelColor;
    sync();
    recalc(true);
    persist();
  };

  E.sourceDpi.oninput = () => {
    if (S.source && !S.source.dpiDetected) {
      const d = +E.sourceDpi.value;
      S.source.dpi = d > 0 ? d : null;
      if (S.source.dpi) {
        S.source.widthCm = S.source.widthPx / S.source.dpi * 2.54;
        S.source.heightCm = S.source.heightPx / S.source.dpi * 2.54;
      }
      meta();
      recalc(true);
    }
  };

  const controls = [
    [E.baseName, () => { S.baseName = E.baseName.value; }],
    [E.pedido, () => { S.pedido = E.pedido.value; }],
    [E.orientation, () => { S.orientation = E.orientation.value; }, true],
    [E.editMode, () => { S.editMode = E.editMode.value; }],
    [E.balanceCuts, () => { S.balanceCuts = E.balanceCuts.checked; }, true],
    [E.minLast, () => { S.minimumLastSliceCm = Math.max(0, +E.minLast.value || 0); }],
    [E.marginSize, () => { S.margin.sizeCm = Math.max(0, +E.marginSize.value || 0); }],
    [E.marginColor, () => { S.margin.color = E.marginColor.value; }],
    [E.mTop, () => { S.margin.top = E.mTop.checked; }],
    [E.mRight, () => { S.margin.right = E.mRight.checked; }],
    [E.mBottom, () => { S.margin.bottom = E.mBottom.checked; }],
    [E.mLeft, () => { S.margin.left = E.mLeft.checked; }],
    [E.mTransparent, () => { S.margin.transparent = E.mTransparent.checked; }],
    [E.identEnabled, () => { S.identification.enabled = E.identEnabled.checked; }],
    [E.identFont, () => { S.identification.font = E.identFont.value || "Arial"; }],
    [E.identSize, () => { S.identification.sizeCm = Math.max(0.1, +E.identSize.value || 2); }],
    [E.identColor, () => { S.identification.color = E.identColor.value; }],
    [E.identEdge, () => { S.identification.edgeDistanceCm = Math.max(0, +E.identEdge.value || 0); }],
    [E.nTop, () => { S.nameSides.top = E.nTop.checked; }],
    [E.nRight, () => { S.nameSides.right = E.nRight.checked; }],
    [E.nBottom, () => { S.nameSides.bottom = E.nBottom.checked; }],
    [E.nLeft, () => { S.nameSides.left = E.nLeft.checked; }],
    [E.template, () => { S.namingTemplate = E.template.value || DEFAULT_NAME_TEMPLATE; }]
  ];
  for (const [node, fn, reset] of controls) {
    node.oninput = node.onchange = () => {
      fn();
      recalc(Boolean(reset));
      persist();
    };
  }

  E.format.onchange = () => { S.output.format = E.format.value; formatUI(); recalc(false); persist(); };
  E.conflict.onchange = () => { S.output.conflict = E.conflict.value; persist(); };
  E.quality.oninput = () => { S.output.quality = +E.quality.value; E.qualityValue.textContent = E.quality.value; persist(); };
  E.reprintEnabled.onchange = () => { S.reprint.enabled = E.reprintEnabled.checked; clampReprint(); render(); persist(); };
  E.reprintIndex.oninput = () => { S.reprint.index = Math.max(1, Math.round(+E.reprintIndex.value || 1)); clampReprint(); render(); persist(); };

  E.zoomIn.onclick = () => zoom(S.view.zoom * 1.2);
  E.zoomOut.onclick = () => zoom(S.view.zoom / 1.2);
  E.fit.onclick = fit;
  E.preview.onwheel = wheel;
  E.preview.onpointerdown = down;
  E.preview.onpointermove = move;
  E.preview.onpointerup = up;
  E.preview.onpointercancel = up;
  E.preview.oncontextmenu = (e) => e.preventDefault();
  window.onresize = draw;
}

async function chooseFile() {
  const r = await window.autocut.openImage();
  if (!r) return;
  S.reprint = { enabled: false, index: 1 };
  S.baseName = "";
  S.exportResult = null;
  S.mapResult = null;
  await applySource(r);
}

async function applySource(r) {
  S.exportResult = null;
  S.mapResult = null;
  if (!r.ok) {
    S.source = null;
    S.image = null;
    E.fileMeta.innerHTML = `<b>ERRO</b><span>${esc(r.error)}</span>`;
    recalc(true);
    return;
  }
  S.source = r;
  if (!S.baseName) S.baseName = String(r.baseName || "ARTE").toUpperCase();
  E.baseName.value = S.baseName;
  E.sourceDpi.value = r.dpi || "";
  E.sourceDpi.disabled = !!r.dpiDetected;
  meta();
  const img = new Image();
  img.src = r.previewDataUrl;
  await img.decode();
  S.image = img;
  fit();
  recalc(true);
}

function meta() {
  if (!S.source) return;
  const r = S.source;
  const physical = r.dpi
    ? `${formatCm(r.widthCm)} × ${formatCm(r.heightCm)} cm · ${r.dpi} DPI`
    : `<strong class="warning">DPI NÃO ENCONTRADO — INFORME O DPI REAL</strong>`;
  E.fileMeta.innerHTML = `<b>${esc(r.baseName)}</b><span>${r.widthPx} × ${r.heightPx}px</span><span>${physical}</span><span>${esc(String(r.format).toUpperCase())} · ${esc(r.space)} · ${esc(r.depth)}</span>`;
}

function recalc(reset = false) {
  if (!S.source) {
    S.plan = null;
    S.manual = null;
    S.cuts = null;
    render();
    return;
  }
  try {
    if (!(S.source.dpi > 0)) throw Error("DPI não encontrado. Informe o DPI real para continuar.");
    S.plan = planCutJob({
      widthPx: S.source.widthPx,
      heightPx: S.source.heightPx,
      dpi: S.source.dpi,
      fabric: fabric(),
      margin: S.margin,
      orientation: S.orientation,
      baseName: S.baseName,
      namingTemplate: S.namingTemplate,
      minimumLastSliceCm: S.minimumLastSliceCm,
      balanceCuts: S.balanceCuts,
      outputFormat: S.output.format,
      pedido: S.pedido
    });
    if (reset || S._resolved !== S.plan.orientation || S.plan.status !== "CUT_REQUIRED") {
      S.cuts = S.plan.status === "CUT_REQUIRED" ? S.plan.slices.slice(0, -1).map((x) => x.endPx) : null;
      S._resolved = S.plan.orientation;
    }
    manual();
  } catch (e) {
    S.plan = { status: "INVALID", message: e.message, slices: [], validation: { approved: false, errors: [e.message] } };
    S.manual = null;
  }
  clampReprint();
  render();
}

function manual() {
  if (!S.plan || S.plan.status !== "CUT_REQUIRED" || !S.cuts) {
    S.manual = null;
    return;
  }
  const horizontal = S.plan.orientation === "horizontal";
  S.manual = validateManualCuts({
    cutPositionsPx: S.cuts,
    totalAxisPx: horizontal ? S.source.heightPx : S.source.widthPx,
    crossAxisPx: horizontal ? S.source.widthPx : S.source.heightPx,
    dpi: S.source.dpi,
    fabric: fabric(),
    margin: S.margin,
    orientation: S.plan.orientation,
    linkedMode: S.editMode === "linked",
    minimumLastSliceCm: S.minimumLastSliceCm
  });
  if (S.editMode === "linked") S.cuts = S.manual.slices.slice(0, -1).map((x) => x.endPx);
}

function slices() {
  const a = S.manual?.slices || S.plan?.slices || [];
  return a.map((x) => ({
    ...x,
    fileName: renderNameTemplate(S.namingTemplate, {
      NOME: S.baseName || S.source?.baseName || "ARTE",
      FAIXA: x.index,
      TOTAL_FAIXAS: a.length,
      FRACAO_FAIXA: `${x.index}-DE-${a.length}`,
      TECIDO: fabric()?.name || "",
      LARGURA: (x.finalWidthCm || 0).toFixed(2).replace(".", ","),
      ALTURA: (x.finalHeightCm || 0).toFixed(2).replace(".", ","),
      TAMANHO: `${(x.finalWidthCm || 0).toFixed(2)}X${(x.finalHeightCm || 0).toFixed(2)}`,
      FORMATO: S.output.format,
      DPI: S.source?.dpi || "",
      PEDIDO: S.pedido,
      DATA: new Date().toISOString().slice(0, 10)
    })
  }));
}

function valid() {
  if (!S.plan) return false;
  return S.plan.status === "NO_CUT_NEEDED"
    ? !!S.plan.validation?.approved
    : !!(S.manual?.approved ?? S.plan.validation?.approved);
}

function clampReprint() {
  const total = slices().length;
  if (total <= 1) S.reprint.enabled = false;
  S.reprint.index = Math.max(1, Math.min(Math.max(1, total), Math.round(Number(S.reprint.index) || 1)));
  E.reprintIndex.max = Math.max(1, total);
  E.reprintIndex.value = S.reprint.index;
  E.reprintEnabled.checked = S.reprint.enabled;
  E.reprintEnabled.disabled = total <= 1;
  E.reprintIndex.disabled = !S.reprint.enabled || total <= 1;
}

function render() {
  draw();
  report();
  names();
  clampReprint();
  E.empty.hidden = !!S.source;
  const canProcess = !!S.source && valid() && !!S.outputDirectory;
  E.export.disabled = !canProcess;
  E.generateMap.disabled = !canProcess;
  E.export.textContent = S.reprint.enabled ? `REIMPRIMIR FAIXA ${S.reprint.index}/${slices().length}` : "GERAR E VALIDAR FAIXAS";
  E.mapStatus.textContent = S.mapResult?.filePath ? `Mapa: ${S.mapResult.filePath}` : S.mapResult?.error || "Mapa ainda não gerado.";
  if (!S.source) setStatus("AGUARDANDO ARTE", "");
  else if (valid()) setStatus(S.plan.status === "NO_CUT_NEEDED" ? "SEM DIVISÃO" : "VÁLIDO", "ok");
  else setStatus("BLOQUEADO", "bad");

  const distribution = S.balanceCuts ? "distribuição equilibrada" : "máximo útil primeiro";
  E.previewInfo.textContent = !S.source
    ? "Carregue uma arte."
    : S.plan?.status === "NO_CUT_NEEDED"
      ? S.plan.message
      : `${slices().length} faixa(s) · ${S.plan?.orientation || "—"} · ${distribution} · limite ${fabric().maxPrintableWidthCm} cm`;
}
function setStatus(t, c) { E.status.textContent = t; E.status.className = `status ${c}`; }

function transform() {
  const c = E.preview;
  const d = Math.min(devicePixelRatio || 1, 2);
  const pad = 44 * d;
  const base = Math.min((c.width - pad * 2) / S.source.widthPx, (c.height - pad * 2) / S.source.heightPx);
  const scale = base * S.view.zoom;
  const w = S.source.widthPx * scale;
  const h = S.source.heightPx * scale;
  return { d, scale, w, h, x: (c.width - w) / 2 + S.view.x * d, y: (c.height - h) / 2 + S.view.y * d };
}

function draw() {
  const c = E.preview;
  const ctx = c.getContext("2d");
  const r = c.getBoundingClientRect();
  const d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(600, Math.round(r.width * d));
  const h = Math.max(450, Math.round(r.height * d));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx.fillStyle = "#15191e";
  ctx.fillRect(0, 0, w, h);
  grid(ctx, w, h);
  if (!S.source || !S.image) return;

  const t = transform();
  ctx.drawImage(S.image, t.x, t.y, t.w, t.h);
  ctx.strokeStyle = "#667281";
  ctx.strokeRect(t.x, t.y, t.w, t.h);

  const ss = slices();
  if (S.plan?.status === "NO_CUT_NEEDED") {
    banner(ctx, "ESTA ARTE NÃO PRECISA SER DIVIDIDA", w / 2, 35 * t.d, "#32d583", t.d);
    badge(ctx, t, ss[0]);
    return;
  }
  marginsPreview(ctx, t, ss);
  for (let i = 0; i < ss.length - 1; i += 1) line(ctx, t, ss[i].endPx, i);
  for (const x of ss) badge(ctx, t, x);
  seamPreview(ctx, t, ss);
}

function grid(ctx, w, h) {
  ctx.strokeStyle = "rgba(255,255,255,.025)";
  for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function marginsPreview(ctx, t, ss) {
  if (!S.margin.sizeCm) return;
  const m = Math.max(2 * t.d, cmToPx(S.margin.sizeCm, S.source.dpi) * t.scale);
  ctx.fillStyle = rgba(S.margin.color, S.margin.transparent ? 0.16 : 0.30);
  for (const x of ss) {
    if (S.plan.orientation === "horizontal") {
      const a = t.y + x.startPx * t.scale;
      const b = t.y + x.endPx * t.scale;
      if (S.margin.top) ctx.fillRect(t.x, a - m, t.w, m);
      if (S.margin.bottom) ctx.fillRect(t.x, b, t.w, m);
    } else {
      const a = t.x + x.startPx * t.scale;
      const b = t.x + x.endPx * t.scale;
      if (S.margin.left) ctx.fillRect(a - m, t.y, m, t.h);
      if (S.margin.right) ctx.fillRect(b, t.y, m, t.h);
    }
  }
}

function line(ctx, t, p, i) {
  const pos = S.plan.orientation === "horizontal" ? t.y + p * t.scale : t.x + p * t.scale;
  const active = S.drag?.index === i;
  ctx.strokeStyle = active ? "#fdb022" : "#32d583";
  ctx.lineWidth = (active ? 3 : 2) * t.d;
  ctx.setLineDash([8 * t.d, 6 * t.d]);
  ctx.beginPath();
  if (S.plan.orientation === "horizontal") { ctx.moveTo(t.x, pos); ctx.lineTo(t.x + t.w, pos); }
  else { ctx.moveTo(pos, t.y); ctx.lineTo(pos, t.y + t.h); }
  ctx.stroke();
  ctx.setLineDash([]);
}

function badge(ctx, t, x) {
  if (!x) return;
  const cx = S.plan.orientation === "vertical" ? t.x + (x.startPx + x.endPx) / 2 * t.scale : t.x + t.w / 2;
  const cy = S.plan.orientation === "horizontal" ? t.y + (x.startPx + x.endPx) / 2 * t.scale : t.y + t.h / 2;
  const ok = x.valid !== false && x.finalLimitedAxisPx <= cmToPx(fabric().maxPrintableWidthCm, S.source.dpi);
  const txt = `FAIXA ${x.index}/${x.total}`;
  const sub = `${formatCm(x.usefulCm)} útil · ${formatCm(x.finalLimitedAxisCm)} final`;
  ctx.font = `700 ${12 * t.d}px Segoe UI`;
  const bw = Math.max(ctx.measureText(txt).width, ctx.measureText(sub).width) + 24 * t.d;
  ctx.fillStyle = "rgba(10,13,17,.88)";
  ctx.fillRect(cx - bw / 2, cy - 27 * t.d, bw, 54 * t.d);
  ctx.strokeStyle = ok ? "#32d583" : "#f04438";
  ctx.strokeRect(cx - bw / 2, cy - 27 * t.d, bw, 54 * t.d);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(txt, cx, cy - 5 * t.d);
  ctx.fillStyle = ok ? "#98a2b3" : "#f97066";
  ctx.font = `600 ${10 * t.d}px Segoe UI`;
  ctx.fillText(sub, cx, cy + 14 * t.d);
}

function seamPreview(ctx, t, ss) {
  if (!S.identification.enabled) return;
  ctx.fillStyle = S.identification.color;
  ctx.font = `800 ${11 * t.d}px Segoe UI`;
  for (const x of ss) {
    const before = x.seam?.labels?.before;
    const after = x.seam?.labels?.after;
    if (S.plan.orientation === "horizontal") {
      if (before) pairH(ctx, t, x.startPx, before, -1);
      if (after) pairH(ctx, t, x.endPx, after, 1);
    } else {
      if (before) pairV(ctx, t, x.startPx, before, -1);
      if (after) pairV(ctx, t, x.endPx, after, 1);
    }
  }
}

function pairH(ctx, t, p, labels, dir) {
  const y = t.y + p * t.scale + dir * 14 * t.d;
  ctx.textAlign = "left";
  ctx.fillText(labels[0], t.x + 8 * t.d, y);
  ctx.textAlign = "right";
  ctx.fillText(labels[1], t.x + t.w - 8 * t.d, y);
}

function pairV(ctx, t, p, labels, dir) {
  const x = t.x + p * t.scale + dir * 16 * t.d;
  ctx.save();
  ctx.translate(x, t.y + 12 * t.d);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "right";
  ctx.fillText(labels[0], 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(x, t.y + t.h - 12 * t.d);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "left";
  ctx.fillText(labels[1], 0, 0);
  ctx.restore();
}

function banner(ctx, text, x, y, color, d) {
  ctx.font = `800 ${12 * d}px Segoe UI`;
  const bw = ctx.measureText(text).width + 24 * d;
  ctx.fillStyle = "rgba(10,13,17,.9)";
  ctx.fillRect(x - bw / 2, y - 16 * d, bw, 32 * d);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 4 * d);
}

function report() {
  if (!S.source || !S.plan) {
    E.report.innerHTML = `<span class="muted">Aguardando arte.</span>`;
    return;
  }
  const ss = slices();
  const ok = valid();
  const max = ss.length ? Math.max(...ss.map((x) => x.finalLimitedAxisCm)) : 0;
  const errs = S.manual?.violations || S.plan.validation?.errors || [];
  const warnings = preWarnings();
  const reprint = S.reprint.enabled
    ? `<div class="alert warn">REIMPRESSÃO ATIVA: somente faixa ${S.reprint.index}/${ss.length} será gerada. As posições e emendas permanecem idênticas ao projeto.</div>`
    : "";
  const distribution = S.balanceCuts ? "Equilibrada (opção marcada)" : "Máximo útil primeiro";
  E.report.innerHTML = `<div class="approval ${ok ? "approved" : "rejected"}">${ok ? "PRÉ-CÁLCULO APROVADO" : "ERRO — NÃO LIBERAR"}</div>${reprint}${errs.map((x) => `<div class="alert error">${esc(x)}</div>`).join("")}${warnings.map((x) => `<div class="alert warn">${esc(x)}</div>`).join("")}<dl><dt>Original</dt><dd>${S.source.dpi ? `${formatCm(S.source.widthCm)} × ${formatCm(S.source.heightCm)} cm` : "DPI pendente"}</dd><dt>Pixels</dt><dd>${S.source.widthPx} × ${S.source.heightPx}</dd><dt>DPI</dt><dd>${S.source.dpi || "—"}</dd><dt>Tecido</dt><dd>${esc(fabric().name)}</dd><dt>Limite</dt><dd>${formatCm(fabric().maxPrintableWidthCm)} cm</dd><dt>Orientação</dt><dd>${esc(S.plan.orientation || "—")}</dd><dt>Distribuição</dt><dd>${distribution}</dd><dt>Faixas</dt><dd>${ss.length}</dd><dt>Maior final</dt><dd>${max ? formatCm(max) + " cm" : "—"}</dd><dt>Reconstrução</dt><dd>${(S.manual?.reconstruction?.ok ?? S.plan.validation?.reconstruction?.ok) ? "OK — 0 px" : "ERRO"}</dd></dl><div class="slice-list">${ss.map((x) => `<div><b>${x.index}/${x.total}</b><span>${formatCm(x.usefulCm)} útil</span><span>${formatCm(x.finalLimitedAxisCm)} final</span></div>`).join("")}</div>${S.exportResult ? exportReport(S.exportResult) : ""}`;
}

function preWarnings() {
  const w = [];
  if (!S.source?.dpi) w.push("O arquivo não informa DPI. Informe o DPI real antes de exportar.");
  if (S.output.format === "JPEG" && (S.source?.hasAlpha || S.margin.transparent)) w.push("JPEG não suporta transparência; a saída será composta sobre branco.");
  if (S.output.format === "JPEG" && S.source?.depth && S.source.depth !== "uchar") w.push(`JPEG reduzirá a profundidade ${S.source.depth} para 8 bits por canal.`);
  if (S.source && !["srgb", "rgb", "b-w"].includes(String(S.source.space).toLowerCase())) w.push(`Espaço ${S.source.space}: a pós-validação exigirá preservação.`);
  const current = S.manual || S.plan;
  if (!S.balanceCuts && current?.lastSmall) w.push("A última faixa ficou abaixo do tamanho desejável. O AUTOCUT manteve o máximo útil primeiro; marque ‘Distribuir faixas igualmente’ se quiser redistribuir.");
  return w;
}

function exportReport(r) {
  return `<div class="post"><div class="approval ${r.ok ? "approved" : "rejected"}">PÓS-EXPORTAÇÃO: ${esc(r.status)}</div><p>${r.filesValidated}/${r.filesGenerated} arquivo(s) validados · reconstrução do plano ${r.reconstructionOk ? "OK" : "ERRO"}${r.mode === "REPRINT" ? " · REIMPRESSÃO" : ""}</p>${(r.warnings || []).map((x) => `<div class="alert warn">${esc(x)}</div>`).join("")}${(r.results || []).map((x) => `<div class="file-result"><b>Faixa ${x.index}</b><span>${x.skipped ? "Ignorada" : esc(x.filePath || "")}</span><strong>${x.skipped ? "SKIP" : x.validation?.approved ? "OK" : "ERRO"}</strong></div>`).join("")}</div>`;
}

function names() {
  const ss = slices();
  E.names.innerHTML = ss.length ? ss.slice(0, 5).map((x) => `<code>${esc(x.fileName)}.${ext(S.output.format)}</code>`).join("") : "—";
}

async function chooseOutput() {
  const p = await window.autocut.chooseOutput();
  if (p) {
    S.outputDirectory = p;
    E.outputPath.textContent = p;
    persist();
    render();
  }
}

function buildJob({ forMap = false } = {}) {
  const ss = slices();
  return {
    source: { filePath: S.source.filePath, widthPx: S.source.widthPx, heightPx: S.source.heightPx, dpi: S.source.dpi },
    baseName: S.baseName,
    pedido: S.pedido,
    fabric: fabric(),
    orientation: S.plan.orientation,
    slices: ss,
    margin: S.margin,
    identification: S.identification,
    nameSides: S.nameSides,
    outputDirectory: S.outputDirectory,
    output: S.output,
    exportSliceIndices: !forMap && S.reprint.enabled ? [S.reprint.index] : undefined
  };
}

async function doExport() {
  if (!valid() || !S.outputDirectory) return;
  const originalLabel = E.export.textContent;
  E.export.disabled = true;
  E.export.textContent = "PROCESSANDO...";
  try {
    S.exportResult = await window.autocut.exportJob(buildJob());
  } catch (e) {
    S.exportResult = { ok: false, status: e.message, reconstructionOk: false, filesValidated: 0, filesGenerated: 0, results: [], warnings: [] };
  } finally {
    E.export.textContent = originalLabel;
    render();
  }
}

async function doGenerateMap() {
  if (!valid() || !S.outputDirectory) return;
  E.generateMap.disabled = true;
  E.generateMap.textContent = "GERANDO MAPA...";
  try {
    const result = await window.autocut.generateSewingMap(buildJob({ forMap: true }));
    S.mapResult = result?.ok
      ? result
      : { error: result?.skipped ? "Mapa ignorado pela política de conflito." : "Falha ao validar o mapa." };
  } catch (e) {
    S.mapResult = { error: e.message };
  } finally {
    E.generateMap.textContent = "GERAR MAPA DE COSTURA";
    render();
  }
}

function refreshFabric() {
  E.fabric.innerHTML = S.presets.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} — ${formatCm(x.maxPrintableWidthCm)} cm</option>`).join("");
  if (!S.presets.some((x) => x.id === S.fabricId)) S.fabricId = S.presets[0]?.id;
  E.fabric.value = S.fabricId;
}

function fabric() { return getFabricPreset(S.fabricId, S.presets); }
function updateFabricEditor() {
  const f = fabric();
  if (f) {
    E.fabricName.value = f.name;
    E.fabricLimit.value = f.maxPrintableWidthCm;
  }
}

function newFabric() {
  const id = `personalizado-${Date.now()}`;
  S.presets.push(normalizeFabricPreset({ id, name: "Personalizado", maxPrintableWidthCm: 145, defaultMarginCm: 1 }));
  S.fabricId = id;
  refreshFabric();
  updateFabricEditor();
  persist();
}

function saveFabric() {
  try {
    const f = fabric();
    const n = normalizeFabricPreset({
      ...f,
      name: E.fabricName.value,
      maxPrintableWidthCm: +E.fabricLimit.value,
      defaultMarginCm: S.margin.sizeCm,
      marginColor: S.margin.color,
      labelColor: S.identification.color,
      preferredCutOrientation: S.orientation
    });
    n.id = f.id;
    S.presets[S.presets.findIndex((x) => x.id === f.id)] = n;
    refreshFabric();
    E.fabric.value = n.id;
    recalc(true);
    persist();
  } catch (e) {
    alert(e.message);
  }
}

function deleteFabric() {
  if (S.presets.length < 2) return alert("Mantenha pelo menos um tecido.");
  const i = S.presets.findIndex((x) => x.id === S.fabricId);
  S.presets.splice(i, 1);
  S.fabricId = S.presets[Math.max(0, i - 1)].id;
  refreshFabric();
  updateFabricEditor();
  recalc(true);
  persist();
}

async function saveProject() {
  if (!S.source) return alert("Carregue uma arte.");
  await window.autocut.saveProject(snapshot());
}

async function openProject() {
  const r = await window.autocut.openProject();
  if (!r?.project) return;
  const p = r.project;
  if (p.presets) S.presets = p.presets.map(normalizeFabricPreset);
  for (const k of ["fabricId", "orientation", "editMode", "minimumLastSliceCm", "balanceCuts", "baseName", "pedido", "namingTemplate", "outputDirectory"]) {
    if (p[k] != null) S[k] = p[k];
  }
  if (p.margin) Object.assign(S.margin, p.margin);
  if (p.identification) Object.assign(S.identification, p.identification);
  if (p.nameSides) Object.assign(S.nameSides, p.nameSides);
  if (p.output) Object.assign(S.output, p.output);
  if (p.reprint) Object.assign(S.reprint, p.reprint);
  refreshFabric();
  sync();

  if (p.sourceFile) {
    const ins = await window.autocut.inspectPath(p.sourceFile);
    await applySource(ins);
    if (p.baseName) { S.baseName = p.baseName; E.baseName.value = p.baseName; }
    if (!ins.dpiDetected && p.sourceMetadata?.dpi) {
      S.source.dpi = p.sourceMetadata.dpi;
      S.source.widthCm = S.source.widthPx / S.source.dpi * 2.54;
      S.source.heightCm = S.source.heightPx / S.source.dpi * 2.54;
      E.sourceDpi.value = S.source.dpi;
    }
    recalc(true);
    if (Array.isArray(p.cutPositionsPx)) {
      S.cuts = p.cutPositionsPx;
      manual();
    }
    clampReprint();
    render();
  }
}

function snapshot() {
  return {
    projectSchema: 3,
    sourceFile: S.source?.filePath,
    baseName: S.baseName,
    pedido: S.pedido,
    presets: S.presets,
    fabricId: S.fabricId,
    orientation: S.orientation,
    resolvedOrientation: S.plan?.orientation,
    editMode: S.editMode,
    minimumLastSliceCm: S.minimumLastSliceCm,
    balanceCuts: S.balanceCuts,
    cutPositionsPx: S.cuts,
    margin: S.margin,
    identification: S.identification,
    nameSides: S.nameSides,
    namingTemplate: S.namingTemplate,
    outputDirectory: S.outputDirectory,
    output: S.output,
    reprint: S.reprint,
    sourceMetadata: S.source ? { widthPx: S.source.widthPx, heightPx: S.source.heightPx, dpi: S.source.dpi } : null
  };
}

function down(e) {
  if (!S.source || S.plan?.status !== "CUT_REQUIRED") return;
  E.preview.setPointerCapture(e.pointerId);
  const i = hit(point(e));
  if (i != null && e.button === 0) {
    S.drag = { index: i };
    draw();
    return;
  }
  if (e.shiftKey || e.button === 1 || e.button === 2) {
    S.pan = { cx: e.clientX, cy: e.clientY, x: S.view.x, y: S.view.y };
  }
}

function move(e) {
  if (!S.source) return;
  if (S.drag) {
    const t = transform();
    const p = point(e);
    const total = S.plan.orientation === "horizontal" ? S.source.heightPx : S.source.widthPx;
    let v = Math.round((S.plan.orientation === "horizontal" ? p.y - t.y : p.x - t.x) / t.scale);
    const cuts = [...(S.cuts || [])];
    const i = S.drag.index;
    v = Math.max(i ? cuts[i - 1] + 1 : 1, Math.min(i === cuts.length - 1 ? total - 1 : cuts[i + 1] - 1, v));
    cuts[i] = v;
    S.cuts = cuts;
    manual();
    clampReprint();
    render();
    return;
  }
  if (S.pan) {
    S.view.x = S.pan.x + e.clientX - S.pan.cx;
    S.view.y = S.pan.y + e.clientY - S.pan.cy;
    draw();
    return;
  }
  const i = hit(point(e));
  E.preview.style.cursor = i == null ? "default" : S.plan?.orientation === "horizontal" ? "ns-resize" : "ew-resize";
}

function up(e) {
  S.drag = null;
  S.pan = null;
  try { E.preview.releasePointerCapture(e.pointerId); } catch {}
  persist();
  render();
}

function hit(p) {
  const ss = slices();
  if (ss.length < 2) return null;
  const t = transform();
  const tol = 10 * t.d;
  for (let i = 0; i < ss.length - 1; i += 1) {
    const pos = S.plan.orientation === "horizontal" ? t.y + ss[i].endPx * t.scale : t.x + ss[i].endPx * t.scale;
    if (Math.abs((S.plan.orientation === "horizontal" ? p.y : p.x) - pos) <= tol) return i;
  }
  return null;
}

function point(e) {
  const r = E.preview.getBoundingClientRect();
  return { x: (e.clientX - r.left) * E.preview.width / r.width, y: (e.clientY - r.top) * E.preview.height / r.height };
}

function wheel(e) {
  if (!S.source) return;
  e.preventDefault();
  zoom(S.view.zoom * (e.deltaY < 0 ? 1.12 : 0.89));
}

function zoom(z) {
  S.view.zoom = Math.max(0.2, Math.min(8, z));
  E.zoomLabel.textContent = `${Math.round(S.view.zoom * 100)}%`;
  draw();
}

function fit() {
  S.view = { zoom: 1, x: 0, y: 0 };
  E.zoomLabel.textContent = "100%";
  draw();
}

function formatUI() { E.qualityRow.style.display = S.output.format === "JPEG" ? "grid" : "none"; }

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.autocut.setSettings({
    presets: S.presets,
    fabricId: S.fabricId,
    margin: S.margin,
    identification: S.identification,
    nameSides: S.nameSides,
    orientation: S.orientation,
    editMode: S.editMode,
    minimumLastSliceCm: S.minimumLastSliceCm,
    balanceCuts: S.balanceCuts,
    namingTemplate: S.namingTemplate,
    outputDirectory: S.outputDirectory,
    output: S.output,
    pedido: S.pedido,
    reprint: S.reprint
  }), 250);
}

function ext(f) { return f === "JPEG" ? "JPG" : f === "TIFF" ? "TIF" : f; }
function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function rgba(hex, a) {
  const h = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : "#ffffff";
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
}
