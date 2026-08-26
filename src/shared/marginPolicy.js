import { cmToCeilPx } from "./units.js";

export const MARGIN_PLACEMENTS = Object.freeze({
  LATERAL: "lateral",
  TOP_BOTTOM: "top-bottom"
});

export function resolveMarginPlacement(margin) {
  if (margin?.placement === MARGIN_PLACEMENTS.TOP_BOTTOM) return MARGIN_PLACEMENTS.TOP_BOTTOM;
  if (margin?.placement === MARGIN_PLACEMENTS.LATERAL) return MARGIN_PLACEMENTS.LATERAL;

  const lateral = Boolean(margin?.left || margin?.right);
  const topBottom = Boolean(margin?.top || margin?.bottom);

  // Migração de configurações antigas: o AUTOCORTE original usava
  // 1 cm lateral e 0 cm superior/inferior por padrão. Se um build antigo
  // salvou quatro lados ativos, voltamos para o par lateral em vez de
  // continuar permitindo quatro margens simultâneas.
  if (topBottom && !lateral) return MARGIN_PLACEMENTS.TOP_BOTTOM;
  return MARGIN_PLACEMENTS.LATERAL;
}

export function normalizeMarginSelection(margin = {}) {
  const placement = resolveMarginPlacement(margin);
  return {
    ...margin,
    placement,
    top: placement === MARGIN_PLACEMENTS.TOP_BOTTOM,
    right: placement === MARGIN_PLACEMENTS.LATERAL,
    bottom: placement === MARGIN_PLACEMENTS.TOP_BOTTOM,
    left: placement === MARGIN_PLACEMENTS.LATERAL
  };
}

export function marginsForOrientation(margin, orientation, dpi) {
  if (!["horizontal", "vertical"].includes(orientation)) {
    throw new Error(`Orientação inválida para cálculo de margem: ${orientation}`);
  }

  const normalized = normalizeMarginSelection(margin);
  const sizeCm = Math.max(0, Number(normalized.sizeCm) || 0);
  const enabled = normalized.enabled !== false && sizeCm > 0;
  const sizePx = enabled ? cmToCeilPx(sizeCm, dpi) : 0;
  const lateral = normalized.placement === MARGIN_PLACEMENTS.LATERAL;

  const topPx = lateral ? 0 : sizePx;
  const rightPx = lateral ? sizePx : 0;
  const bottomPx = lateral ? 0 : sizePx;
  const leftPx = lateral ? sizePx : 0;

  const axisTotalPx = orientation === "horizontal"
    ? topPx + bottomPx
    : leftPx + rightPx;
  const crossAxisTotalPx = orientation === "horizontal"
    ? leftPx + rightPx
    : topPx + bottomPx;

  return {
    placement: normalized.placement,
    sizeCm,
    topPx,
    rightPx,
    bottomPx,
    leftPx,
    top: topPx,
    right: rightPx,
    bottom: bottomPx,
    left: leftPx,
    axisTotalPx,
    crossAxisTotalPx
  };
}
