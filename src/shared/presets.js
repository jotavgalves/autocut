export const FABRIC_PRESETS = [
  {
    id: "oxford",
    name: "Oxford",
    maxPrintableWidthCm: 145,
    unit: "cm",
    defaultMarginCm: 1,
    marginColor: "#ffffff",
    labelColor: "#111111",
    preferredCutOrientation: "auto"
  },
  {
    id: "helanca",
    name: "Helanca",
    maxPrintableWidthCm: 158,
    unit: "cm",
    defaultMarginCm: 1,
    marginColor: "#ffffff",
    labelColor: "#111111",
    preferredCutOrientation: "auto"
  },
  {
    id: "tactel",
    name: "Tactel",
    maxPrintableWidthCm: 155,
    unit: "cm",
    defaultMarginCm: 1,
    marginColor: "#ffffff",
    labelColor: "#111111",
    preferredCutOrientation: "auto"
  }
];

export function getFabricPreset(id) {
  return FABRIC_PRESETS.find((preset) => preset.id === id) ?? FABRIC_PRESETS[0];
}
