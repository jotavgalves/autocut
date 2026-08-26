import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

export async function resolveOutputPath({ dialog, folder, baseName, extension, policy = "version" }) {
  await fs.mkdir(folder, { recursive: true });
  const initial = path.join(folder, `${baseName}.${extension}`);
  if (!existsSync(initial) || policy === "overwrite") return initial;
  if (policy === "skip") return null;

  if (policy === "ask") {
    const choice = await dialog.showMessageBox({
      type: "question",
      title: "Arquivo já existe",
      message: path.basename(initial),
      detail: "Escolha como o AUTOCUT deve tratar este conflito.",
      buttons: ["Substituir", "Criar versão", "Ignorar"],
      defaultId: 1,
      cancelId: 2,
      noLink: true
    });
    if (choice.response === 0) return initial;
    if (choice.response === 2) return null;
  }

  let version = 2;
  while (true) {
    const candidate = path.join(folder, `${baseName}_V${version}.${extension}`);
    if (!existsSync(candidate)) return candidate;
    version += 1;
  }
}
