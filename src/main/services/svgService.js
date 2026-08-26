export function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]));
}

function estimatedAdvance(value, size) {
  return Math.max(1, String(value).length * size * 0.62);
}

function svgText({ x, y, value, size, fill, family, anchor = "middle", rotation = 0, maxAdvance = null }) {
  const estimated = estimatedAdvance(value, size);
  const target = Number.isFinite(maxAdvance) && maxAdvance > 0 ? Math.min(estimated, maxAdvance) : estimated;
  const lengthAttrs = target < estimated ? ` textLength="${Math.max(1, Math.round(target))}" lengthAdjust="spacingAndGlyphs"` : "";
  const transform = rotation ? ` transform="translate(${Math.round(x)} ${Math.round(y)}) rotate(${rotation})" x="0" y="0"` : ` x="${Math.round(x)}" y="${Math.round(y)}"`;
  return `<text${transform} fill="${fill}" font-family="${family}" font-size="${Math.max(8, Math.round(size))}" font-weight="700" text-anchor="${anchor}" dominant-baseline="middle"${lengthAttrs}>${escapeXml(value)}</text>`;
}

function addHorizontalSeamWithLateralMargins(out, labels, edge, width, height, margins, size, fill, family, edgePad, stripPad) {
  const y = edge === "before" ? edgePad + size / 2 : height - edgePad - size / 2;
  out.push(svgText({ x: margins.leftPx / 2, y, value: labels[0], size, fill, family, maxAdvance: Math.max(1, margins.leftPx - stripPad * 2) }));
  out.push(svgText({ x: width - margins.rightPx / 2, y, value: labels[1], size, fill, family, maxAdvance: Math.max(1, margins.rightPx - stripPad * 2) }));
}

function addHorizontalSeamWithTopBottomMargins(out, labels, edge, width, height, margins, size, fill, family, edgePad, stripPad) {
  const top = edge === "before";
  const y = top ? margins.topPx / 2 : height - margins.bottomPx / 2;
  const leftX = edgePad + size / 2;
  const rightX = width - edgePad - size / 2;
  const maxAdvance = Math.max(1, (top ? margins.topPx : margins.bottomPx) - stripPad * 2);
  out.push(svgText({ x: leftX, y, value: labels[0], size, fill, family, rotation: 90, maxAdvance }));
  out.push(svgText({ x: rightX, y, value: labels[1], size, fill, family, rotation: 90, maxAdvance }));
}

function addVerticalSeamWithLateralMargins(out, labels, edge, width, height, margins, size, fill, family, edgePad, stripPad) {
  const left = edge === "before";
  const x = left ? margins.leftPx / 2 : width - margins.rightPx / 2;
  const maxAdvance = Math.max(1, (left ? margins.leftPx : margins.rightPx) - stripPad * 2);
  out.push(svgText({ x, y: edgePad + size / 2, value: labels[0], size, fill, family, maxAdvance }));
  out.push(svgText({ x, y: height - edgePad - size / 2, value: labels[1], size, fill, family, maxAdvance }));
}

function addVerticalSeamWithTopBottomMargins(out, labels, edge, width, height, margins, size, fill, family, edgePad, stripPad) {
  const x = edge === "before" ? edgePad + size / 2 : width - edgePad - size / 2;
  out.push(svgText({ x, y: margins.topPx / 2, value: labels[0], size, fill, family, rotation: 90, maxAdvance: Math.max(1, margins.topPx - stripPad * 2) }));
  out.push(svgText({ x, y: height - margins.bottomPx / 2, value: labels[1], size, fill, family, rotation: 90, maxAdvance: Math.max(1, margins.bottomPx - stripPad * 2) }));
}

export function renderTechnicalOverlay({ width, height, margins, slice, orientation, dpi, identification, baseName, nameSides }) {
  if (!identification?.enabled && !Object.values(nameSides || {}).some(Boolean)) return null;

  const fill = escapeXml(identification?.color || "#111111");
  const family = escapeXml(identification?.font || "Arial");
  // O valor é a ALTURA FÍSICA final desejada. Não diminuímos Y para caber
  // na margem. Quando necessário, somente o avanço/largura é comprimido.
  const requested = Math.max(8, Math.round(((Number(identification?.sizeCm) || 2) / 2.54) * dpi));
  const edgePad = Math.max(0, Math.round(((Number(identification?.edgeDistanceCm) || 0.18) / 2.54) * dpi));
  const stripPad = Math.max(1, Math.round((0.08 / 2.54) * dpi));
  const text = [];
  const before = slice.seam?.labels?.before;
  const after = slice.seam?.labels?.after;

  if (identification?.enabled) {
    if (orientation === "horizontal") {
      if (margins.placement === "lateral") {
        if (before) addHorizontalSeamWithLateralMargins(text, before, "before", width, height, margins, requested, fill, family, edgePad, stripPad);
        if (after) addHorizontalSeamWithLateralMargins(text, after, "after", width, height, margins, requested, fill, family, edgePad, stripPad);
      } else {
        if (before) addHorizontalSeamWithTopBottomMargins(text, before, "before", width, height, margins, requested, fill, family, edgePad, stripPad);
        if (after) addHorizontalSeamWithTopBottomMargins(text, after, "after", width, height, margins, requested, fill, family, edgePad, stripPad);
      }
    } else if (margins.placement === "lateral") {
      if (before) addVerticalSeamWithLateralMargins(text, before, "before", width, height, margins, requested, fill, family, edgePad, stripPad);
      if (after) addVerticalSeamWithLateralMargins(text, after, "after", width, height, margins, requested, fill, family, edgePad, stripPad);
    } else {
      if (before) addVerticalSeamWithTopBottomMargins(text, before, "before", width, height, margins, requested, fill, family, edgePad, stripPad);
      if (after) addVerticalSeamWithTopBottomMargins(text, after, "after", width, height, margins, requested, fill, family, edgePad, stripPad);
    }
  }

  const artName = String(baseName || "").toUpperCase();
  if (artName && nameSides) {
    const nameSize = Math.max(8, Math.round(requested * 0.55));
    if (margins.placement === "lateral") {
      if (nameSides.left && margins.leftPx > 0) text.push(svgText({ x: margins.leftPx / 2, y: height / 2, value: artName, size: nameSize, fill, family, rotation: -90, maxAdvance: Math.max(1, height - edgePad * 2) }));
      if (nameSides.right && margins.rightPx > 0) text.push(svgText({ x: width - margins.rightPx / 2, y: height / 2, value: artName, size: nameSize, fill, family, rotation: 90, maxAdvance: Math.max(1, height - edgePad * 2) }));
    } else {
      if (nameSides.top && margins.topPx > 0) text.push(svgText({ x: width / 2, y: margins.topPx / 2, value: artName, size: nameSize, fill, family, maxAdvance: Math.max(1, width - edgePad * 2) }));
      if (nameSides.bottom && margins.bottomPx > 0) text.push(svgText({ x: width / 2, y: height - margins.bottomPx / 2, value: artName, size: nameSize, fill, family, maxAdvance: Math.max(1, width - edgePad * 2) }));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text.join("")}</svg>`;
}
