export const CM_PER_INCH = 2.54;

export function cmToPx(cm, dpi) {
  assertFinitePositive(dpi, "DPI");
  if (!Number.isFinite(cm) || cm < 0) throw new Error("Centimetros invalidos.");
  return Math.round((cm / CM_PER_INCH) * dpi);
}

export function cmToFloorPx(cm, dpi) {
  assertFinitePositive(dpi, "DPI");
  if (!Number.isFinite(cm) || cm < 0) throw new Error("Centimetros invalidos.");
  return Math.floor((cm / CM_PER_INCH) * dpi);
}

export function cmToCeilPx(cm, dpi) {
  assertFinitePositive(dpi, "DPI");
  if (!Number.isFinite(cm) || cm < 0) throw new Error("Centimetros invalidos.");
  return Math.ceil((cm / CM_PER_INCH) * dpi);
}

export function pxToCm(px, dpi) {
  assertFinitePositive(dpi, "DPI");
  if (!Number.isFinite(px) || px < 0) throw new Error("Pixels invalidos.");
  return (px / dpi) * CM_PER_INCH;
}

export function formatCm(cm, precision = 2) {
  return Number(cm).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision
  });
}

export function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser maior que zero.`);
  }
}
