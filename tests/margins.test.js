import test from "node:test";
import assert from "node:assert/strict";
import { marginsForOrientation, normalizeMarginSelection, resolveMarginPlacement } from "../src/shared/marginPolicy.js";
import { cmToCeilPx } from "../src/shared/units.js";
import { renderTechnicalOverlay } from "../src/main/services/svgService.js";

const dpi = 300;

test("margem nunca mantém quatro lados ativos", () => {
  const normalized = normalizeMarginSelection({ sizeCm: 1, top: true, right: true, bottom: true, left: true });
  assert.equal(normalized.placement, "lateral");
  assert.deepEqual({ top: normalized.top, right: normalized.right, bottom: normalized.bottom, left: normalized.left }, { top: false, right: true, bottom: false, left: true });
});

test("par superior/inferior permanece exclusivo", () => {
  const normalized = normalizeMarginSelection({ sizeCm: 1, placement: "top-bottom", top: true, right: true, bottom: true, left: true });
  assert.equal(resolveMarginPlacement(normalized), "top-bottom");
  assert.deepEqual({ top: normalized.top, right: normalized.right, bottom: normalized.bottom, left: normalized.left }, { top: true, right: false, bottom: true, left: false });
});

test("margem lateral não reduz limite de corte horizontal", () => {
  const m = marginsForOrientation({ sizeCm: 1, placement: "lateral" }, "horizontal", dpi);
  assert.equal(m.axisTotalPx, 0);
  assert.equal(m.crossAxisTotalPx, cmToCeilPx(1, dpi) * 2);
});

test("margem superior/inferior reduz limite de corte horizontal", () => {
  const m = marginsForOrientation({ sizeCm: 1, placement: "top-bottom" }, "horizontal", dpi);
  assert.equal(m.axisTotalPx, cmToCeilPx(1, dpi) * 2);
  assert.equal(m.crossAxisTotalPx, 0);
});

test("overlay raster mantém altura nominal de 2cm e comprime apenas avanço", () => {
  const margins = marginsForOrientation({ sizeCm: 1, placement: "lateral" }, "horizontal", dpi);
  const svg = renderTechnicalOverlay({
    width: 4000,
    height: 1800,
    margins,
    slice: { seam: { labels: { before: ["A1", "A2"], after: null } } },
    orientation: "horizontal",
    dpi,
    identification: { enabled: true, sizeCm: 2, edgeDistanceCm: 0.18, color: "#111111", font: "Arial" },
    baseName: "",
    nameSides: {}
  });
  const targetPx = Math.round(2 / 2.54 * dpi);
  assert.match(svg, new RegExp(`font-size="${targetPx}"`));
  assert.match(svg, /textLength=/, "A largura deve ser comprimida em vez de reduzir a altura");
});
