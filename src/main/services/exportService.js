import path from "node:path";
import { exportRasterJob } from "./rasterExportService.js";
import { exportPdfJob } from "./pdfExportService.js";
import { exportPhotoshopJob } from "./photoshopExportService.js";
export async function exportJob(job,deps){const resolved=resolveFormat(job);const next={...job,output:{...job.output,format:resolved}};if(resolved==="PDF")return exportPdfJob(next,deps);if(resolved==="PSD"||resolved==="PSB")return exportPhotoshopJob(next,deps);if(["PNG","JPEG","TIFF","WEBP","AVIF"].includes(resolved))return exportRasterJob(next,deps);throw new Error(`Formato de saída não suportado: ${resolved}`);}
function resolveFormat(job){const requested=String(job?.output?.format||"PNG").toUpperCase();if(requested!=="SAME")return requested;const ext=String(job?.source?.format||path.extname(job?.source?.filePath||"").slice(1)).toUpperCase();const aliases={JPG:"JPEG",JPEG:"JPEG",TIF:"TIFF",TIFF:"TIFF",PNG:"PNG",WEBP:"WEBP",AVIF:"AVIF",PDF:"PDF",PSD:"PSD",PSB:"PSB"};const resolved=aliases[ext];if(!resolved)throw new Error(`Manter formato original não está disponível para ${ext||"este arquivo"}.`);return resolved;}
