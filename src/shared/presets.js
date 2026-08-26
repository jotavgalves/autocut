export const DEFAULT_FABRIC_PRESETS = [
  { id: "oxford", name: "Oxford", maxPrintableWidthCm: 145, unit: "cm", defaultMarginCm: 1, marginColor: "#ffffff", labelColor: "#111111", preferredCutOrientation: "auto" },
  { id: "helanca", name: "Helanca", maxPrintableWidthCm: 158, unit: "cm", defaultMarginCm: 1, marginColor: "#ffffff", labelColor: "#111111", preferredCutOrientation: "auto" },
  { id: "tactel", name: "Tactel", maxPrintableWidthCm: 155, unit: "cm", defaultMarginCm: 1, marginColor: "#ffffff", labelColor: "#111111", preferredCutOrientation: "auto" }
];

export function cloneDefaultFabricPresets() { return DEFAULT_FABRIC_PRESETS.map((item) => ({ ...item })); }
export function getFabricPreset(id, presets = DEFAULT_FABRIC_PRESETS) { return presets.find((preset) => preset.id === id) ?? presets[0]; }

export function normalizeFabricPreset(value) {
  const name = String(value?.name || "Personalizado").trim() || "Personalizado";
  const maxPrintableWidthCm = Number(value?.maxPrintableWidthCm);
  if (!Number.isFinite(maxPrintableWidthCm) || maxPrintableWidthCm <= 0) throw new Error("A largura máxima do tecido deve ser maior que zero.");
  return {
    id: String(value?.id || slugify(name)), name, maxPrintableWidthCm, unit: "cm",
    defaultMarginCm: Math.max(0, Number(value?.defaultMarginCm) || 0),
    marginColor: normalizeHex(value?.marginColor, "#ffffff"), labelColor: normalizeHex(value?.labelColor, "#111111"),
    preferredCutOrientation: ["auto", "horizontal", "vertical"].includes(value?.preferredCutOrientation) ? value.preferredCutOrientation : "auto"
  };
}

function slugify(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `tecido-${Date.now()}`;
}
function normalizeHex(value, fallback) { const text = String(value || "").trim(); return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback; }
