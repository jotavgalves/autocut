import test from "node:test";
import assert from "node:assert/strict";
import { planCutJob, validateManualCuts } from "../src/shared/cutPlanner.js";
import { getFabricPreset } from "../src/shared/presets.js";
import { cmToPx } from "../src/shared/units.js";

const oxford = getFabricPreset("oxford");
const noMargin = { sizeCm: 0, top: true, right: true, bottom: true, left: true };
const oneCmMargin = { sizeCm: 1, top: true, right: true, bottom: true, left: true };

function plan(overrides) {
  return planCutJob({
    widthCm: 300,
    heightCm: 290,
    dpi: 300,
    fabric: oxford,
    margin: noMargin,
    orientation: "auto",
    baseName: "TESTE",
    ...overrides
  });
}

test("Oxford 145: arte 500 x 145 cm nao precisa de corte", () => {
  const result = plan({ widthCm: 500, heightCm: 145 });
  assert.equal(result.status, "NO_CUT_NEEDED");
});

test("Oxford 145: arte 145 x 500 cm nao precisa de corte", () => {
  const result = plan({ widthCm: 145, heightCm: 500 });
  assert.equal(result.status, "NO_CUT_NEEDED");
});

test("Oxford 145: arte 146 x 500 cm exige corte", () => {
  const result = plan({ widthCm: 146, heightCm: 500 });
  assert.equal(result.status, "CUT_REQUIRED");
  assert.ok(result.slices.length > 1);
});

test("300 x 290 cm sem margem permite duas faixas na orientacao adequada", () => {
  const result = plan({ widthCm: 300, heightCm: 290, margin: noMargin });
  assert.equal(result.status, "CUT_REQUIRED");
  assert.equal(result.orientation, "horizontal");
  assert.equal(result.slices.length, 2);
  assert.ok(result.slices.every((slice) => slice.finalLimitedAxisCm <= 145.01));
});

test("margem impede faixa final de 147 cm e recalcula", () => {
  const result = plan({ widthCm: 300, heightCm: 290, margin: oneCmMargin });
  assert.equal(result.status, "CUT_REQUIRED");
  assert.ok(result.slices.length >= 3);
  assert.ok(result.slices.every((slice) => slice.finalLimitedAxisCm <= 145.01));
});

test("modo livre bloqueia faixa manual com 146 cm finais", () => {
  const dpi = 300;
  const totalAxisPx = cmToPx(290, dpi);
  const invalidCut = cmToPx(144, dpi);
  const result = validateManualCuts({
    cutPositionsPx: [invalidCut],
    totalAxisPx,
    dpi,
    fabric: oxford,
    margin: oneCmMargin,
    orientation: "horizontal",
    linkedMode: false
  });
  assert.equal(result.approved, false);
  assert.match(result.violations[0], /EXCEDE O LIMITE/);
});

test("modo vinculado redistribui/adiciona cortes para voltar ao limite", () => {
  const dpi = 300;
  const totalAxisPx = cmToPx(290, dpi);
  const invalidCut = cmToPx(144, dpi);
  const result = validateManualCuts({
    cutPositionsPx: [invalidCut],
    totalAxisPx,
    dpi,
    fabric: oxford,
    margin: oneCmMargin,
    orientation: "horizontal",
    linkedMode: true
  });
  assert.equal(result.approved, true);
  assert.ok(result.slices.every((slice) => slice.finalLimitedAxisCm <= 145.01));
});

test("tres faixas geram emendas A1/A2 e B1/B2", () => {
  const result = plan({ widthCm: 1000, heightCm: 290, margin: oneCmMargin, orientation: "horizontal" });
  assert.equal(result.slices.length, 3);
  assert.deepEqual(result.slices[0].seam.labels.after, ["A1", "A2"]);
  assert.deepEqual(result.slices[1].seam.labels.before, ["A1", "A2"]);
  assert.deepEqual(result.slices[1].seam.labels.after, ["B1", "B2"]);
  assert.deepEqual(result.slices[2].seam.labels.before, ["B1", "B2"]);
});

test("preserva DPI original no plano", () => {
  const result = plan({ dpi: 300, widthCm: 1000, heightCm: 290, margin: oneCmMargin });
  assert.equal(result.document.dpi, 300);
});

test("cenario BOLINHAS 1000 x 290 cm em Oxford escolhe 3 faixas horizontais com margem inclusa", () => {
  const result = plan({ widthCm: 1000, heightCm: 290, margin: oneCmMargin });
  assert.equal(result.status, "CUT_REQUIRED");
  assert.equal(result.orientation, "horizontal");
  assert.equal(result.slices.length, 3);
  assert.ok(result.slices.every((slice) => slice.finalLimitedAxisCm <= 145.01));
  assert.equal(result.validation.reconstruction.ok, true);
});
