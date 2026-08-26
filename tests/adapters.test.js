import test from "node:test";
import assert from "node:assert/strict";
import { PHOTOSHOP_EXPORT_JSX, PHOTOSHOP_RUNNER_VBS } from "../src/main/services/photoshopScript.js";
import { photoshopSupportedPlatform } from "../src/main/services/photoshopExportService.js";

test("adapter Photoshop preserva texto como layer e salva PSD/PSB", () => {
  assert.match(PHOTOSHOP_RUNNER_VBS, /Photoshop\.Application/);
  assert.match(PHOTOSHOP_EXPORT_JSX, /LayerKind\.TEXT/);
  assert.match(PHOTOSHOP_EXPORT_JSX, /PhotoshopSaveOptions/);
  assert.match(PHOTOSHOP_EXPORT_JSX, /largeDocumentFormat/);
  assert.match(PHOTOSHOP_EXPORT_JSX, /embedColorProfile = true/);
  assert.equal(typeof photoshopSupportedPlatform(), "boolean");
});

test("Photoshop mede a camada, fixa a altura física e comprime somente X", () => {
  assert.match(PHOTOSHOP_EXPORT_JSX, /targetHeightPx \/ b\.height \* 100/);
  assert.match(PHOTOSHOP_EXPORT_JSX, /maxAdvancePx \/ b\.width \* 100, 100/);
  assert.doesNotMatch(PHOTOSHOP_EXPORT_JSX, /fitSizePt/);
  assert.match(PHOTOSHOP_EXPORT_JSX, /Number\(ident\.sizeCm\) \|\| 2/);
});
