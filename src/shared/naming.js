const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

export const DEFAULT_NAME_TEMPLATE = "{NOME}_FAIXA_{FAIXA}-DE-{TOTAL_FAIXAS}_{TECIDO}_{LARGURA}X{ALTURA}CM";

export function baseNameFromPath(filePath) {
  const name = String(filePath).split(/[\\/]/).pop() ?? "ARTE";
  return name.replace(/\.[^.]+$/, "");
}

export function sanitizeFileName(value) {
  return String(value).replace(INVALID_FILE_CHARS, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

export function renderNameTemplate(template, variables) {
  const rendered = String(template || DEFAULT_NAME_TEMPLATE).replace(/\{([A-Z_]+)\}/g, (_, key) => variables[key] == null ? "" : String(variables[key]));
  return sanitizeFileName(rendered);
}
