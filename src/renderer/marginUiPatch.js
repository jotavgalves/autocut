// Camada de compatibilidade da interface enquanto o renderer principal mantém
// os quatro checkboxes legados internamente. Para o operador existe somente
// uma escolha de par: esquerda/direita OU superior/inferior.

const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;

function callNativeFillText(ctx, text, x, y, maxWidth) {
  return maxWidth == null
    ? nativeFillText.call(ctx, text, x, y)
    : nativeFillText.call(ctx, text, x, y, maxWidth);
}

CanvasRenderingContext2D.prototype.drawImage = function (...args) {
  if (this.canvas?.id === "preview" && args.length >= 5) {
    const [, x, y, w, h] = args;
    if ([x, y, w, h].every(Number.isFinite)) this.canvas.__autocutArtBox = { x, y, w, h };
  }
  return nativeDrawImage.apply(this, args);
};

CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
  if (this.canvas?.id !== "preview" || !/^[A-Z]+[12]$/.test(String(text))) {
    return callNativeFillText(this, text, x, y, maxWidth);
  }

  const box = this.canvas.__autocutArtBox;
  const identSizeCm = Math.max(0.1, Number(document.getElementById("identSize")?.value) || 2);
  const marginSizeCm = Math.max(0, Number(document.getElementById("marginSize")?.value) || 0);
  const placement = document.getElementById("marginPlacement")?.value || "lateral";
  const metaText = document.getElementById("fileMeta")?.textContent || "";
  const physical = metaText.match(/([\d.,]+)\s*[×x]\s*([\d.,]+)\s*cm/i);

  if (!box || !physical) return callNativeFillText(this, text, x, y, maxWidth);
  const widthCm = Number(physical[1].replace(",", "."));
  if (!(widthCm > 0)) return callNativeFillText(this, text, x, y, maxWidth);

  const pxPerCm = box.w / widthCm;
  const targetHeight = Math.max(4, identSizeCm * pxPerCm);
  const strip = Math.max(1, marginSizeCm * pxPerCm);
  const oldFont = this.font;
  const oldAlign = this.textAlign;
  const oldBaseline = this.textBaseline;
  const matrix = this.getTransform?.();
  const identityTransform = !matrix || (
    Math.abs(matrix.a - 1) < 1e-6 &&
    Math.abs(matrix.b) < 1e-6 &&
    Math.abs(matrix.c) < 1e-6 &&
    Math.abs(matrix.d - 1) < 1e-6 &&
    Math.abs(matrix.e) < 1e-6 &&
    Math.abs(matrix.f) < 1e-6
  );

  this.font = `800 ${targetHeight}px Segoe UI`;
  this.textBaseline = "middle";
  const naturalWidth = Math.max(1, this.measureText(String(text)).width);
  const maxAdvance = Math.max(1, strip - Math.max(1, 0.16 * pxPerCm));
  const squeeze = Math.min(1, maxAdvance / naturalWidth);

  let drawX = x;
  if (identityTransform && placement === "lateral" && Number.isFinite(x)) {
    if (oldAlign === "left") drawX = box.x - strip / 2;
    else if (oldAlign === "right") drawX = box.x + box.w + strip / 2;
  }

  this.save();
  this.translate(drawX, y);
  if (identityTransform && placement === "top-bottom" && oldAlign !== "center") this.rotate(Math.PI / 2);
  this.scale(squeeze, 1);
  this.textAlign = "center";
  callNativeFillText(this, text, 0, 0, maxWidth);
  this.restore();

  this.font = oldFont;
  this.textAlign = oldAlign;
  this.textBaseline = oldBaseline;
};

void installMarginPairUi();

async function installMarginPairUi() {
  const controls = await waitForLegacyMarginControls();
  if (!controls) return;
  const { top, right, bottom, left } = controls;
  const checks = top.closest(".checks");
  if (!checks || document.getElementById("marginPlacement")) return;

  const row = document.createElement("label");
  row.innerHTML = `Posição da margem
    <select id="marginPlacement">
      <option value="lateral">Esquerda / Direita</option>
      <option value="top-bottom">Superior / Inferior</option>
    </select>`;
  checks.before(row);

  const info = document.createElement("p");
  info.className = "meta";
  info.textContent = "Somente um par de margens pode existir por vez. Padrão: esquerda/direita, como no AUTOCORTE.jsx.";
  checks.after(info);
  checks.hidden = true;

  const identSize = document.getElementById("identSize");
  if (identSize) {
    identSize.title = "Altura física final do caractere. Padrão 2 cm; a largura pode ser comprimida para caber na margem.";
    const identLabel = identSize.closest("label");
    if (identLabel && !identLabel.querySelector("small")) {
      const note = document.createElement("small");
      note.textContent = "Altura física final; padrão 2 cm. A largura é comprimida se necessário.";
      identLabel.appendChild(note);
    }
  }

  const select = document.getElementById("marginPlacement");
  const initiallyTopBottom = (top.checked || bottom.checked) && !(left.checked || right.checked);
  select.value = initiallyTopBottom ? "top-bottom" : "lateral";

  let applying = false;
  const apply = (persist = true) => {
    if (applying) return;
    applying = true;
    const lateral = select.value === "lateral";
    const desired = new Map([
      [top, !lateral],
      [right, lateral],
      [bottom, !lateral],
      [left, lateral]
    ]);
    for (const [node, checked] of desired) {
      if (node.checked === checked) continue;
      node.checked = checked;
      if (persist) node.oninput?.(new Event("input"));
    }
    applying = false;
  };

  select.addEventListener("change", () => apply(true));
  apply(true);

  setInterval(() => {
    if (applying) return;
    const lateralActive = left.checked || right.checked;
    const topBottomActive = top.checked || bottom.checked;
    const invalid = (lateralActive && topBottomActive) || (!lateralActive && !topBottomActive) || left.checked !== right.checked || top.checked !== bottom.checked;
    if (invalid) apply(true);
  }, 500);
}

async function waitForLegacyMarginControls() {
  for (let i = 0; i < 100; i += 1) {
    const top = document.getElementById("mTop");
    const right = document.getElementById("mRight");
    const bottom = document.getElementById("mBottom");
    const left = document.getElementById("mLeft");
    if (top && right && bottom && left && typeof left.oninput === "function") return { top, right, bottom, left };
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}
