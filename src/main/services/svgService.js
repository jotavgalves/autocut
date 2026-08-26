export function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]));
}

function svgText(x, y, value, size, fill, family, anchor) {
  return `<text x="${Math.round(x)}" y="${Math.round(y)}" fill="${fill}" font-family="${family}" font-size="${Math.max(8, Math.round(size))}" font-weight="700" text-anchor="${anchor}" dominant-baseline="middle">${value}</text>`;
}
function svgRotatedText(x, y, value, size, fill, family, rotation) {
  return `<text transform="translate(${Math.round(x)} ${Math.round(y)}) rotate(${rotation})" fill="${fill}" font-family="${family}" font-size="${Math.max(8, Math.round(size))}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
}
function addHorizontalPair(out, labels, y, width, margins, requested, fill, family, pad) {
  const available = Math.max(8, (y <= margins.topPx ? margins.topPx : margins.bottomPx) - pad * 2);
  const size = Math.min(requested, available * 0.75);
  out.push(svgText(margins.leftPx + pad, y, escapeXml(labels[0]), size, fill, family, "start"));
  out.push(svgText(width - margins.rightPx - pad, y, escapeXml(labels[1]), size, fill, family, "end"));
}
function addVerticalPair(out, labels, x, height, margins, sideWidth, requested, fill, family, pad, rotation) {
  const size = Math.min(requested, Math.max(8, (sideWidth - pad * 2) * 0.75));
  out.push(svgRotatedText(x, margins.topPx + pad + size, escapeXml(labels[0]), size, fill, family, rotation));
  out.push(svgRotatedText(x, height - margins.bottomPx - pad - size, escapeXml(labels[1]), size, fill, family, rotation));
}

export function renderTechnicalOverlay({ width, height, margins, slice, orientation, dpi, identification, baseName, nameSides }) {
  if (!identification?.enabled && !Object.values(nameSides || {}).some(Boolean)) return null;
  const fill = escapeXml(identification?.color || "#111111");
  const family = escapeXml(identification?.font || "Arial");
  const requested = Math.max(8, Math.round(((Number(identification?.sizeCm) || 2) / 2.54) * dpi));
  const pad = Math.max(4, Math.round(((Number(identification?.edgeDistanceCm) || 0.18) / 2.54) * dpi));
  const text = [];
  if (identification?.enabled) {
    const before = slice.seam?.labels?.before;
    const after = slice.seam?.labels?.after;
    if (orientation === "horizontal") {
      if (before && margins.topPx > 0) addHorizontalPair(text, before, margins.topPx / 2, width, margins, requested, fill, family, pad);
      if (after && margins.bottomPx > 0) addHorizontalPair(text, after, height - margins.bottomPx / 2, width, margins, requested, fill, family, pad);
    } else {
      if (before && margins.leftPx > 0) addVerticalPair(text, before, margins.leftPx / 2, height, margins, margins.leftPx, requested, fill, family, pad, -90);
      if (after && margins.rightPx > 0) addVerticalPair(text, after, width - margins.rightPx / 2, height, margins, margins.rightPx, requested, fill, family, pad, 90);
    }
  }
  const artName = escapeXml(String(baseName || "").toUpperCase());
  if (artName && nameSides) {
    const nameSize = Math.max(8, Math.round(requested * 0.55));
    if (nameSides.top && margins.topPx > 0) text.push(svgText(width / 2, margins.topPx / 2, artName, Math.min(nameSize, margins.topPx * 0.55), fill, family, "middle"));
    if (nameSides.bottom && margins.bottomPx > 0) text.push(svgText(width / 2, height - margins.bottomPx / 2, artName, Math.min(nameSize, margins.bottomPx * 0.55), fill, family, "middle"));
    if (nameSides.left && margins.leftPx > 0) text.push(svgRotatedText(margins.leftPx / 2, height / 2, artName, Math.min(nameSize, margins.leftPx * 0.55), fill, family, -90));
    if (nameSides.right && margins.rightPx > 0) text.push(svgRotatedText(width - margins.rightPx / 2, height / 2, artName, Math.min(nameSize, margins.rightPx * 0.55), fill, family, 90));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text.join("")}</svg>`;
}
