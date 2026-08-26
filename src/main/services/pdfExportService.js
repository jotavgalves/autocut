import fs from "node:fs/promises";
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { sanitizeFileName } from "../../shared/naming.js";
import { fullPlanReconstructionOk, selectedSlices } from "./jobService.js";

const PT_PER_INCH = 72;
const CM_PER_INCH = 2.54;
const SIZE_TOLERANCE_PT = 0.02;

export async function exportPdfJob(job, { dialog, resolveOutputPath }) {
  if (!job?.source?.filePath || !job?.outputDirectory) throw new Error("Origem e pasta de saída são obrigatórias.");
  if (!fullPlanReconstructionOk(job)) throw new Error("A reconstrução matemática do plano falhou antes da exportação PDF.");
  const slices = selectedSlices(job), results = [], warnings = [];
  const sourceIsPdf = String(job.source.format || "").toLowerCase() === "pdf" || job.source.engine === "pdf" || /\.pdf$/i.test(job.source.filePath);
  if (!sourceIsPdf) warnings.push("PDF gerado a partir de arte raster: pixels são preservados sem redimensionamento, mas o contêiner PDF pode não preservar o perfil ICC original.");
  const sourceBytes = sourceIsPdf ? await fs.readFile(job.source.filePath) : null;
  const sourcePdf = sourceIsPdf ? await PDFDocument.load(sourceBytes, { updateMetadata: false }) : null;
  const sourcePage = sourceIsPdf ? sourcePdf.getPage(Math.max(0, (job.source.pageNumber || 1) - 1)) : null;
  const pageSize = sourceIsPdf ? sourcePage.getSize() : null;
  const sourceDpi = Number(job.source.dpi);
  if (!sourceIsPdf && !(sourceDpi > 0)) throw new Error("DPI original é obrigatório para gerar PDF a partir de imagem raster.");

  for (const slice of slices) {
    const geometry = sourceIsPdf ? pdfGeometry(job, slice, pageSize) : rasterGeometry(job, slice, sourceDpi);
    const limitPt = cmToPt(job.fabric.maxPrintableWidthCm);
    const finalLimitedPt = job.orientation === "horizontal" ? geometry.finalHeightPt : geometry.finalWidthPt;
    if (finalLimitedPt > limitPt + SIZE_TOLERANCE_PT) throw new Error(`Faixa ${slice.index} excederia o limite do tecido em PDF.`);
    const out = await PDFDocument.create();
    const page = out.addPage([geometry.finalWidthPt, geometry.finalHeightPt]);
    drawMargins(page, geometry, job.margin);
    if (sourceIsPdf) {
      const embedded = await out.embedPage(sourcePage, geometry.sourceBoundingBox);
      page.drawPage(embedded, { x: geometry.marginLeftPt, y: geometry.marginBottomPt, width: geometry.contentWidthPt, height: geometry.contentHeightPt });
    } else {
      let crop = sharp(job.source.filePath, { limitInputPixels: false }).extract(geometry.extract);
      if (typeof crop.keepIccProfile === "function") crop = crop.keepIccProfile();
      const png = await crop.png().toBuffer();
      const embedded = await out.embedPng(png);
      page.drawImage(embedded, { x: geometry.marginLeftPt, y: geometry.marginBottomPt, width: geometry.contentWidthPt, height: geometry.contentHeightPt });
    }
    await drawPdfTechnicalText(out, page, geometry, slice, job);
    out.setTitle(String(job.baseName || "AUTOCUT")); out.setCreator("AUTOCUT"); out.setProducer("AUTOCUT / pdf-lib");
    const bytes = await out.save({ useObjectStreams: false });
    const baseName = sanitizeFileName(slice.fileName || `${job.baseName}_FAIXA_${slice.index}-DE-${job.slices.length}`);
    const outputPath = await resolveOutputPath({ dialog, folder: job.outputDirectory, baseName, extension: "pdf", policy: job.output?.conflict || "version" });
    if (!outputPath) { results.push({ index: slice.index, skipped: true }); continue; }
    await fs.writeFile(outputPath, bytes);
    const saved = await PDFDocument.load(await fs.readFile(outputPath), { updateMetadata: false });
    const savedPage = saved.getPage(0), savedSize = savedPage.getSize();
    const actualLimitedPt = job.orientation === "horizontal" ? savedSize.height : savedSize.width;
    const validation = { pageCountOk: saved.getPageCount() === 1, dimensionsOk: Math.abs(savedSize.width - geometry.finalWidthPt) <= SIZE_TOLERANCE_PT && Math.abs(savedSize.height - geometry.finalHeightPt) <= SIZE_TOLERANCE_PT, limitOk: actualLimitedPt <= limitPt + SIZE_TOLERANCE_PT, vectorContainerOk: true };
    validation.approved = Object.values(validation).every(Boolean);
    results.push({ index: slice.index, filePath: outputPath, widthPt: savedSize.width, heightPt: savedSize.height, validation });
  }
  const generated = results.filter((x) => !x.skipped), approved = generated.length > 0 && generated.every((x) => x.validation?.approved);
  return { ok: approved, status: approved ? "APROVADO" : "ERRO — NÃO LIBERAR PARA IMPRESSÃO", mode: slices.length !== job.slices.length ? "REPRINT" : "FULL", reconstructionOk: true, filesValidated: generated.filter((x) => x.validation?.approved).length, filesGenerated: generated.length, requestedSlices: slices.map((x) => x.index), results, warnings };
}

function pdfGeometry(job, slice, pageSize) {
  const { width: widthPt, height: heightPt } = pageSize, margins = marginPoints(job.margin);
  let left, right, bottom, top, contentWidthPt, contentHeightPt;
  if (job.orientation === "horizontal") { const start=slice.startPx/job.source.heightPx,end=slice.endPx/job.source.heightPx; left=0;right=widthPt;top=heightPt-start*heightPt;bottom=heightPt-end*heightPt;contentWidthPt=widthPt;contentHeightPt=top-bottom; }
  else { const start=slice.startPx/job.source.widthPx,end=slice.endPx/job.source.widthPx;left=start*widthPt;right=end*widthPt;bottom=0;top=heightPt;contentWidthPt=right-left;contentHeightPt=heightPt; }
  return { sourceBoundingBox:{left,right,bottom,top},contentWidthPt,contentHeightPt,finalWidthPt:contentWidthPt+margins.left+margins.right,finalHeightPt:contentHeightPt+margins.top+margins.bottom,marginLeftPt:margins.left,marginRightPt:margins.right,marginTopPt:margins.top,marginBottomPt:margins.bottom };
}
function rasterGeometry(job,slice,dpi){const margins=marginPoints(job.margin);const extract=job.orientation==="horizontal"?{left:0,top:slice.startPx,width:job.source.widthPx,height:slice.usefulPx}:{left:slice.startPx,top:0,width:slice.usefulPx,height:job.source.heightPx};const contentWidthPt=extract.width/dpi*PT_PER_INCH,contentHeightPt=extract.height/dpi*PT_PER_INCH;return{extract,contentWidthPt,contentHeightPt,finalWidthPt:contentWidthPt+margins.left+margins.right,finalHeightPt:contentHeightPt+margins.top+margins.bottom,marginLeftPt:margins.left,marginRightPt:margins.right,marginTopPt:margins.top,marginBottomPt:margins.bottom};}
function marginPoints(margin){const p=cmToPt(Math.max(0,Number(margin?.sizeCm)||0));return{top:margin?.top?p:0,right:margin?.right?p:0,bottom:margin?.bottom?p:0,left:margin?.left?p:0};}
function cmToPt(cm){return Number(cm)/CM_PER_INCH*PT_PER_INCH;}
function drawMargins(page,g,margin){if(margin?.transparent)return;const color=hexRgb(margin?.color||"#ffffff"),opacity=Number.isFinite(Number(margin?.opacity))?Math.max(0,Math.min(1,Number(margin.opacity))):1;if(g.marginTopPt)page.drawRectangle({x:0,y:g.finalHeightPt-g.marginTopPt,width:g.finalWidthPt,height:g.marginTopPt,color,opacity});if(g.marginBottomPt)page.drawRectangle({x:0,y:0,width:g.finalWidthPt,height:g.marginBottomPt,color,opacity});if(g.marginLeftPt)page.drawRectangle({x:0,y:g.marginBottomPt,width:g.marginLeftPt,height:g.contentHeightPt,color,opacity});if(g.marginRightPt)page.drawRectangle({x:g.finalWidthPt-g.marginRightPt,y:g.marginBottomPt,width:g.marginRightPt,height:g.contentHeightPt,color,opacity});}
async function drawPdfTechnicalText(doc,page,g,slice,job){if(!job.identification?.enabled&&!Object.values(job.nameSides||{}).some(Boolean))return;const font=await doc.embedFont(StandardFonts.HelveticaBold),color=hexRgb(job.identification?.color||"#111111"),desired=cmToPt(Math.max(.1,Number(job.identification?.sizeCm)||2)),pad=cmToPt(Math.max(0,Number(job.identification?.edgeDistanceCm)||.18)),before=slice.seam?.labels?.before,after=slice.seam?.labels?.after;if(job.identification?.enabled){if(job.orientation==="horizontal"){if(before&&g.marginTopPt)drawHorizontalPair(page,font,color,before,g.finalHeightPt-g.marginTopPt/2,g,desired,pad);if(after&&g.marginBottomPt)drawHorizontalPair(page,font,color,after,g.marginBottomPt/2,g,desired,pad);}else{if(before&&g.marginLeftPt)drawVerticalPair(page,font,color,before,g.marginLeftPt/2,g,desired,pad,90);if(after&&g.marginRightPt)drawVerticalPair(page,font,color,after,g.finalWidthPt-g.marginRightPt/2,g,desired,pad,-90);}}const name=String(job.baseName||"").toUpperCase();if(!name)return;const nameSize=Math.max(6,desired*.55);if(job.nameSides?.top&&g.marginTopPt)drawCentered(page,font,color,name,g.finalWidthPt/2,g.finalHeightPt-g.marginTopPt/2,Math.min(nameSize,g.marginTopPt*.55));if(job.nameSides?.bottom&&g.marginBottomPt)drawCentered(page,font,color,name,g.finalWidthPt/2,g.marginBottomPt/2,Math.min(nameSize,g.marginBottomPt*.55));if(job.nameSides?.left&&g.marginLeftPt)drawCentered(page,font,color,name,g.marginLeftPt/2,g.finalHeightPt/2,Math.min(nameSize,g.marginLeftPt*.55),90);if(job.nameSides?.right&&g.marginRightPt)drawCentered(page,font,color,name,g.finalWidthPt-g.marginRightPt/2,g.finalHeightPt/2,Math.min(nameSize,g.marginRightPt*.55),-90);}
function drawHorizontalPair(page,font,color,labels,y,g,desired,pad){const marginH=y>g.finalHeightPt/2?g.marginTopPt:g.marginBottomPt,size=Math.max(6,Math.min(desired,Math.max(6,marginH-pad*2)*.72));page.drawText(labels[0],{x:g.marginLeftPt+pad,y:y-size*.35,size,font,color});const w=font.widthOfTextAtSize(labels[1],size);page.drawText(labels[1],{x:g.finalWidthPt-g.marginRightPt-pad-w,y:y-size*.35,size,font,color});}
function drawVerticalPair(page,font,color,labels,x,g,desired,pad,rotation){const marginW=x<g.finalWidthPt/2?g.marginLeftPt:g.marginRightPt,size=Math.max(6,Math.min(desired,Math.max(6,marginW-pad*2)*.72));page.drawText(labels[0],{x,y:g.finalHeightPt-g.marginTopPt-pad,size,font,color,rotate:degrees(rotation)});page.drawText(labels[1],{x,y:g.marginBottomPt+pad,size,font,color,rotate:degrees(rotation)});}
function drawCentered(page,font,color,text,x,y,size,rotation=0){const w=font.widthOfTextAtSize(text,size);page.drawText(text,{x:x-w/2,y:y-size*.35,size,font,color,rotate:degrees(rotation)});}
function hexRgb(hex){const h=/^#[0-9a-f]{6}$/i.test(String(hex||""))?String(hex).slice(1):"ffffff";return rgb(parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255);}
