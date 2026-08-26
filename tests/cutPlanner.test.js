import test from "node:test";
import assert from "node:assert/strict";
import { planCutJob, validateManualCuts } from "../src/shared/cutPlanner.js";
import { DEFAULT_FABRIC_PRESETS } from "../src/shared/presets.js";
import { cmToPx } from "../src/shared/units.js";
import { numberToLetters } from "../src/shared/seams.js";

const oxford = DEFAULT_FABRIC_PRESETS.find((item) => item.id === "oxford");
const noMargin = { sizeCm: 0, top: true, right: true, bottom: true, left: true };
const oneCmAll = { sizeCm: 1, top: true, right: true, bottom: true, left: true };
function plan(overrides = {}) { return planCutJob({ widthCm: 300, heightCm: 290, dpi: 300, fabric: oxford, margin: noMargin, orientation: "auto", baseName: "TESTE", ...overrides }); }

test("500 x 145 sem margem não corta", () => assert.equal(plan({ widthCm: 500, heightCm: 145 }).status, "NO_CUT_NEEDED"));
test("145 x 500 sem margem não corta", () => assert.equal(plan({ widthCm: 145, heightCm: 500 }).status, "NO_CUT_NEEDED"));
test("sem corte ainda produz uma faixa técnica 1/1 exportável", () => { const result = plan({ widthCm: 500, heightCm: 145 }); assert.equal(result.slices.length, 1); assert.equal(result.slices[0].index, 1); assert.equal(result.slices[0].total, 1); assert.equal(result.slices[0].startPx, 0); assert.equal(result.slices[0].endPx, result.document.heightPx); assert.equal(result.validation.reconstruction.ok, true); });
test("146 x 500 exige corte", () => { const result = plan({ widthCm: 146, heightCm: 500 }); assert.equal(result.status, "CUT_REQUIRED"); assert.ok(result.slices.length > 1); });
test("500 x 145 com margens de 1cm não é aprovado como sem corte", () => { const result = plan({ widthCm: 500, heightCm: 145, margin: oneCmAll }); assert.equal(result.status, "CUT_REQUIRED"); const limitPx = cmToPx(145, 300); assert.ok(result.slices.every((slice) => slice.finalLimitedAxisPx <= limitPx)); });

test("por padrão o corte automático usa o máximo imprimível antes do restante", () => {
  const dpi = 300;
  const result = plan({ widthCm: 300, heightCm: 280, orientation: "horizontal", balanceCuts: false });
  assert.equal(result.slices.length, 2);
  assert.equal(result.distributionMode, "maximum-fill");
  assert.equal(result.slices[0].usefulPx, cmToPx(145, dpi));
  assert.equal(result.slices[1].usefulPx, cmToPx(280, dpi) - cmToPx(145, dpi));
});

test("divisão equilibrada só acontece quando a opção é marcada", () => {
  const result = plan({ widthCm: 300, heightCm: 280, orientation: "horizontal", balanceCuts: true });
  assert.equal(result.slices.length, 2);
  assert.equal(result.distributionMode, "balanced");
  assert.ok(Math.abs(result.slices[0].usefulPx - result.slices[1].usefulPx) <= 1);
});

test("300 x 290 sem margem usa duas faixas horizontais", () => { const result = plan({ widthCm: 300, heightCm: 290 }); assert.equal(result.orientation, "horizontal"); assert.equal(result.slices.length, 2); assert.equal(result.validation.reconstruction.ok, true); });
test("300 x 290 com 1cm em todos os lados recalcula para três faixas", () => { const result = plan({ widthCm: 300, heightCm: 290, margin: oneCmAll }); assert.equal(result.slices.length, 3); const limitPx = cmToPx(145, 300); assert.ok(result.slices.every((slice) => slice.finalLimitedAxisPx <= limitPx)); });
test("fonte de verdade em pixels é preservada", () => { const result = planCutJob({ widthPx: 123457, heightPx: 65431, dpi: 300, fabric: oxford, margin: noMargin, orientation: "horizontal" }); assert.equal(result.document.widthPx, 123457); assert.equal(result.document.heightPx, 65431); assert.equal(result.validation.reconstruction.ok, true); });
test("modo livre bloqueia faixa acima do limite sem tolerância positiva", () => { const dpi = 300, total = cmToPx(290, dpi), limitPx = cmToPx(145, dpi); const result = validateManualCuts({ cutPositionsPx: [limitPx + 1], totalAxisPx: total, crossAxisPx: cmToPx(300, dpi), dpi, fabric: oxford, margin: noMargin, orientation: "horizontal", linkedMode: false }); assert.equal(result.approved, false); assert.match(result.violations[0], /EXCEDE O LIMITE/); });
test("modo vinculado subdivide intervalos inválidos até ficarem válidos", () => { const dpi = 300, total = cmToPx(290, dpi); const result = validateManualCuts({ cutPositionsPx: [cmToPx(144, dpi)], totalAxisPx: total, crossAxisPx: cmToPx(300, dpi), dpi, fabric: oxford, margin: oneCmAll, orientation: "horizontal", linkedMode: true }); assert.equal(result.approved, true); const limitPx = cmToPx(145, dpi); assert.ok(result.slices.every((slice) => slice.finalLimitedAxisPx <= limitPx)); });
test("três faixas mantêm emendas A e B correspondentes", () => { const result = plan({ widthCm: 1000, heightCm: 290, margin: oneCmAll, orientation: "horizontal" }); assert.deepEqual(result.slices[0].seam.labels.after, ["A1", "A2"]); assert.deepEqual(result.slices[1].seam.labels.before, ["A1", "A2"]); assert.deepEqual(result.slices[1].seam.labels.after, ["B1", "B2"]); assert.deepEqual(result.slices[2].seam.labels.before, ["B1", "B2"]); });
test("emendas continuam após Z", () => { assert.equal(numberToLetters(26), "Z"); assert.equal(numberToLetters(27), "AA"); assert.equal(numberToLetters(28), "AB"); });
