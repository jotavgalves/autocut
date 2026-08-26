import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sanitizeFileName } from "../../shared/naming.js";
import { cmToPx } from "../../shared/units.js";
import { fullPlanReconstructionOk, marginPixels, selectedSlices } from "./jobService.js";
import { PHOTOSHOP_EXPORT_JSX, PHOTOSHOP_RUNNER_VBS } from "./photoshopScript.js";

const execFileAsync = promisify(execFile);

export function photoshopSupportedPlatform() {
  return process.platform === "win32";
}

export async function exportPhotoshopJob(job, { dialog, resolveOutputPath }) {
  if (!photoshopSupportedPlatform()) throw new Error("PSD/PSB editável requer Adobe Photoshop no Windows neste build.");
  if (!fullPlanReconstructionOk(job)) throw new Error("A reconstrução matemática do plano falhou antes do Photoshop.");

  const dpi = Number(job.source?.dpi);
  if (!(dpi > 0) || job.source?.dpiSynthetic) throw new Error("PSD/PSB requer uma origem raster com DPI físico real; PDF vetorial não será rasterizado silenciosamente.");
  const format = String(job.output?.format || "PSD").toUpperCase();
  if (!new Set(["PSD", "PSB"]).has(format)) throw new Error(`Formato Photoshop inválido: ${format}`);

  const margins = marginPixels(job.margin, dpi, job.orientation);
  const limitPx = cmToPx(job.fabric.maxPrintableWidthCm, dpi);
  const selected = selectedSlices(job);
  const tasks = [];

  for (const slice of selected) {
    const expectedWidthPx = job.orientation === "horizontal"
      ? job.source.widthPx + margins.leftPx + margins.rightPx
      : slice.usefulPx + margins.leftPx + margins.rightPx;
    const expectedHeightPx = job.orientation === "horizontal"
      ? slice.usefulPx + margins.topPx + margins.bottomPx
      : job.source.heightPx + margins.topPx + margins.bottomPx;
    const limited = job.orientation === "horizontal" ? expectedHeightPx : expectedWidthPx;
    if (limited > limitPx) throw new Error(`Faixa ${slice.index} excederia o limite do tecido antes do Photoshop.`);
    if (format === "PSD" && (expectedWidthPx > 30000 || expectedHeightPx > 30000)) throw new Error(`Faixa ${slice.index} excede o limite dimensional do PSD. Selecione PSB.`);

    const baseName = sanitizeFileName(slice.fileName || `${job.baseName}_FAIXA_${slice.index}-DE-${job.slices.length}`);
    const outputPath = await resolveOutputPath({ dialog, folder: job.outputDirectory, baseName, extension: format.toLowerCase(), policy: job.output.conflict || "version" });
    if (!outputPath) continue;
    tasks.push({ slice, format, outputPath, expectedWidthPx, expectedHeightPx });
  }

  if (!tasks.length) return { ok: false, status: "NENHUM ARQUIVO GERADO", mode: selected.length !== job.slices.length ? "REPRINT" : "FULL", reconstructionOk: true, filesValidated: 0, filesGenerated: 0, results: [], warnings: [] };

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "autocut-photoshop-"));
  const jsxPath = path.join(temp, "autocut-export.jsx");
  const vbsPath = path.join(temp, "run-photoshop.vbs");
  const jobPath = path.join(temp, "job.json");
  const resultPath = path.join(temp, "result.json");
  const payload = { ...job, margins, tasks: tasks.map(({ slice, format: taskFormat, outputPath }) => ({ slice, format: taskFormat, outputPath })) };

  await Promise.all([
    fs.writeFile(jsxPath, PHOTOSHOP_EXPORT_JSX, "utf8"),
    fs.writeFile(vbsPath, PHOTOSHOP_RUNNER_VBS, "utf8"),
    fs.writeFile(jobPath, JSON.stringify(payload), "utf8")
  ]);

  try {
    await execFileAsync("cscript.exe", ["//nologo", vbsPath, jsxPath, jobPath, resultPath], { timeout: 15 * 60 * 1000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const ps = JSON.parse(await fs.readFile(resultPath, "utf8"));
    if (!ps.ok) throw new Error(`Photoshop: ${ps.error}${ps.line ? ` (linha ${ps.line})` : ""}`);

    const byIndex = new Map(tasks.map((task) => [task.slice.index, task]));
    const results = (ps.results || []).map((result) => {
      const expected = byIndex.get(result.index);
      const finalLimited = job.orientation === "horizontal" ? result.heightPx : result.widthPx;
      const validation = {
        dimensionsOk: !!expected && result.widthPx === expected.expectedWidthPx && result.heightPx === expected.expectedHeightPx,
        dpiOk: Math.abs(Number(result.dpi) - dpi) <= 0.05,
        limitOk: finalLimited <= limitPx,
        editableLayersOk: Number(result.layerCount) >= 1,
        exclusiveMarginPairOk: margins.placement === "lateral"
          ? margins.topPx === 0 && margins.bottomPx === 0
          : margins.leftPx === 0 && margins.rightPx === 0
      };
      validation.approved = Object.values(validation).every(Boolean);
      return { ...result, validation };
    });

    const approved = results.length === tasks.length && results.every((result) => result.validation.approved);
    return {
      ok: approved,
      status: approved ? "APROVADO" : "ERRO — NÃO LIBERAR PARA IMPRESSÃO",
      mode: selected.length !== job.slices.length ? "REPRINT" : "FULL",
      reconstructionOk: true,
      filesValidated: results.filter((result) => result.validation.approved).length,
      filesGenerated: results.length,
      requestedSlices: selected.map((slice) => slice.index),
      results,
      warnings: ["PSD/PSB foi processado pelo Adobe Photoshop; as identificações permanecem como camadas de texto editáveis com altura física preservada."]
    };
  } catch (error) {
    if (/PHOTOSHOP_COM_ERROR|ActiveX component|cannot create object|não pode criar/i.test(String(error?.stderr || error?.message || error))) {
      throw new Error("Adobe Photoshop não foi encontrado ou a automação COM não está disponível.");
    }
    throw error;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
