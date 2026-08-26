import fs from "node:fs";
import sharp from "sharp";
import { planCutJob } from "../src/shared/cutPlanner.js";
import { getFabricPreset } from "../src/shared/presets.js";

const filePath = "C:\\Users\\CRIACAO\\Desktop\\CENÁRIO BOLINHAS 1000X290.jpg";
const fabric = getFabricPreset("oxford");
const margin = { sizeCm: 1, top: true, right: true, bottom: true, left: true };

const scenarioPlan = planCutJob({
  widthCm: 1000,
  heightCm: 290,
  dpi: 300,
  fabric,
  margin,
  orientation: "auto",
  baseName: "CENARIO BOLINHAS 1000X290"
});

console.log("CENARIO DIMENSIONAL");
console.log(`Status: ${scenarioPlan.status}`);
console.log(`Tecido: ${scenarioPlan.fabric.name} ${scenarioPlan.fabric.maxPrintableWidthCm} cm`);
console.log(`Orientacao: ${scenarioPlan.orientation}`);
console.log(`Faixas: ${scenarioPlan.slices.length}`);
console.log(`Maior eixo final: ${Math.max(...scenarioPlan.slices.map((slice) => slice.finalLimitedAxisCm)).toFixed(2)} cm`);
console.log(`Reconstrucao: ${scenarioPlan.validation.reconstruction.ok ? "OK" : "ERRO"}`);

if (!fs.existsSync(filePath)) {
  console.log("IMAGEM DESKTOP: ERRO - arquivo nao encontrado.");
  process.exitCode = 1;
} else {
  const stat = fs.statSync(filePath);
  console.log(`IMAGEM DESKTOP: ${filePath}`);
  console.log(`Tamanho em bytes: ${stat.size}`);
  if (stat.size === 0) {
    console.log("Validacao da imagem: ERRO - arquivo com 0 bytes, impossivel decodificar.");
    process.exitCode = 1;
  } else {
    const metadata = await sharp(filePath, { limitInputPixels: false }).metadata();
    console.log(`Pixels: ${metadata.width} x ${metadata.height}`);
    console.log(`DPI: ${metadata.density || 300}`);
    console.log("Validacao da imagem: OK");
  }
}
