import "./ux.css";

void enhanceAutocutUx();

async function enhanceAutocutUx() {
  const ready = await waitForApp();
  if (!ready || document.body.dataset.uxEnhanced === "true") return;
  document.body.dataset.uxEnhanced = "true";
  document.body.classList.add("ux-v2");

  const sections = sectionMap();
  const left = document.querySelector(".side.left");
  const right = document.querySelector(".side.right");
  const topbar = document.querySelector(".topbar");
  if (!left || !right || !topbar) return;

  simplifyCopy(sections);
  organizeAdvancedControls(sections);

  const wizard = document.createElement("div");
  wizard.className = "ux-wizard";

  const intro = document.createElement("div");
  intro.className = "ux-wizard-intro";
  intro.innerHTML = `<strong>Prepare a arte em 4 passos</strong><span>O AUTOCUT mantém as regras técnicas nos bastidores. Você só confirma o necessário.</span>`;
  wizard.appendChild(intro);

  const nav = document.createElement("nav");
  nav.className = "ux-steps";
  nav.setAttribute("aria-label", "Etapas de preparação");

  const stepDefs = [
    { id: 1, title: "Arte", subtitle: "Arquivo e tecido", sections: [sections["01"], sections["02"]] },
    { id: 2, title: "Corte", subtitle: "Como dividir", sections: [sections["03"]] },
    { id: 3, title: "Acabamento", subtitle: "Margem e A1/A2", sections: [sections["04"], sections["05"]] },
    { id: 4, title: "Saída", subtitle: "Nome e exportação", sections: [sections["06"], sections["07"]] }
  ];

  const stepPanels = [];
  for (const def of stepDefs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ux-step-button";
    button.dataset.step = String(def.id);
    button.innerHTML = `<span class="ux-step-number">${def.id}</span><span><b>${def.title}</b><small>${def.subtitle}</small></span><em aria-hidden="true">✓</em>`;
    nav.appendChild(button);

    const panel = document.createElement("div");
    panel.className = "ux-step-panel";
    panel.dataset.step = String(def.id);
    panel.hidden = def.id !== 1;

    const heading = document.createElement("div");
    heading.className = "ux-step-heading";
    heading.innerHTML = stepHeading(def.id);
    panel.appendChild(heading);

    for (const section of def.sections.filter(Boolean)) panel.appendChild(section);
    stepPanels.push(panel);
  }

  wizard.appendChild(nav);
  for (const panel of stepPanels) wizard.appendChild(panel);

  const actionBar = document.createElement("div");
  actionBar.className = "ux-action-bar";
  actionBar.innerHTML = `<button type="button" id="uxBack">Voltar</button><div id="uxStepHint">Selecione uma arte para começar.</div><button type="button" id="uxNext" class="primary">Continuar</button>`;
  wizard.appendChild(actionBar);

  left.replaceChildren(wizard);

  const summary = createSummaryCard();
  right.prepend(summary);
  if (sections["09"]) collapseSettings(sections["09"]);

  createTopQuickActions(topbar);
  installKeyboardShortcuts();

  let activeStep = 1;
  const setStep = (step) => {
    activeStep = Math.max(1, Math.min(4, Number(step) || 1));
    for (const panel of stepPanels) panel.hidden = Number(panel.dataset.step) !== activeStep;
    for (const button of nav.querySelectorAll(".ux-step-button")) {
      const active = Number(button.dataset.step) === activeStep;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
    }
    refreshUxState();
    left.scrollTo({ top: 0, behavior: "smooth" });
  };

  for (const button of nav.querySelectorAll(".ux-step-button")) {
    button.addEventListener("click", () => setStep(button.dataset.step));
  }

  document.getElementById("uxBack").addEventListener("click", () => setStep(activeStep - 1));
  document.getElementById("uxNext").addEventListener("click", () => {
    if (activeStep < 4) setStep(activeStep + 1);
    else document.getElementById("export")?.click();
  });

  const observer = new MutationObserver(refreshUxState);
  for (const id of ["fileMeta", "status", "previewInfo", "outputPath", "report", "mapStatus"]) {
    const node = document.getElementById(id);
    if (node) observer.observe(node, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  for (const eventName of ["input", "change", "click"]) {
    document.addEventListener(eventName, () => queueMicrotask(refreshUxState), true);
  }

  setStep(1);

  function refreshUxState() {
    const fileMeta = document.getElementById("fileMeta");
    const status = document.getElementById("status");
    const outputPath = document.getElementById("outputPath");
    const exportButton = document.getElementById("export");
    const hasArt = Boolean(fileMeta?.querySelector("b")) && !/ERRO/i.test(fileMeta?.textContent || "");
    const planOk = hasArt && !/BLOQUEADO|AGUARDANDO/i.test(status?.textContent || "");
    const hasOutput = Boolean(outputPath?.textContent) && !/Nenhuma pasta/i.test(outputPath.textContent);
    const exportReady = Boolean(exportButton && !exportButton.disabled);

    const complete = {
      1: hasArt,
      2: planOk,
      3: planOk,
      4: exportReady
    };

    for (const button of nav.querySelectorAll(".ux-step-button")) {
      button.classList.toggle("complete", Boolean(complete[Number(button.dataset.step)]));
    }

    const back = document.getElementById("uxBack");
    const next = document.getElementById("uxNext");
    const hint = document.getElementById("uxStepHint");
    back.disabled = activeStep === 1;

    if (activeStep === 1) {
      next.disabled = !hasArt;
      next.textContent = "Continuar para corte";
      hint.textContent = hasArt ? "Arte carregada. Confirme o tecido e continue." : "Selecione uma arte para começar.";
    } else if (activeStep === 2) {
      next.disabled = !hasArt;
      next.textContent = "Continuar";
      hint.textContent = planOk ? "Plano de corte calculado. Ajuste só se precisar." : "Revise o corte até o status ficar válido.";
    } else if (activeStep === 3) {
      next.disabled = !hasArt;
      next.textContent = "Continuar para saída";
      hint.textContent = "Margem e identificação usam os padrões seguros. Altere somente se necessário.";
    } else {
      next.disabled = !exportReady;
      next.textContent = exportReady ? "Gerar e validar" : "Gerar e validar";
      hint.textContent = !hasOutput
        ? "Escolha a pasta de saída."
        : exportReady
          ? "Tudo pronto para gerar e validar os arquivos."
          : "Revise os avisos de validação antes de exportar.";
    }

    updateSummary({ hasArt, planOk, hasOutput, exportReady });
  }
}

function sectionMap() {
  const result = {};
  for (const section of document.querySelectorAll(".side section")) {
    const code = section.querySelector("h2 i")?.textContent?.trim();
    if (code) result[code] = section;
  }
  return result;
}

function stepHeading(step) {
  const copy = {
    1: ["Escolha a arte e o tecido", "Normalmente você só precisa selecionar o arquivo e confirmar o preset do tecido."],
    2: ["Confira como a arte será dividida", "O padrão usa primeiro a maior faixa imprimível. Marque divisão equilibrada somente quando realmente quiser."],
    3: ["Defina margem e identificação", "O padrão mantém um único par de margens e identificação A1/A2 com 2 cm de altura física."],
    4: ["Escolha a saída e gere", "Selecione a pasta e o formato. O AUTOCUT valida os arquivos depois de salvar."]
  }[step];
  return `<span>PASSO ${step}</span><h3>${copy[0]}</h3><p>${copy[1]}</p>`;
}

function simplifyCopy(sections) {
  renameHeading(sections["01"], "01", "Arte");
  renameHeading(sections["02"], "02", "Tecido");
  renameHeading(sections["03"], "03", "Corte");
  renameHeading(sections["04"], "04", "Margem");
  renameHeading(sections["05"], "05", "Identificação da costura");
  renameHeading(sections["06"], "06", "Nome dos arquivos");
  renameHeading(sections["07"], "07", "Exportar");
  renameHeading(sections["08"], "08", "Validação");
  renameHeading(sections["09"], "09", "Preferências");

  setLabel("baseName", "Nome da arte");
  setLabel("pedido", "Pedido (opcional)");
  setLabel("orientation", "Direção do corte");
  setLabel("editMode", "Ajuste manual das linhas");
  setLabel("minLast", "Evitar última faixa menor que (cm)");
  setLabel("marginSize", "Tamanho da margem (cm)");
  setLabel("marginColor", "Cor da margem");
  setLabel("identFont", "Fonte");
  setLabel("identSize", "Altura física do texto (cm)");
  setLabel("identColor", "Cor do texto");
  setLabel("identEdge", "Distância da borda (cm)");
  setLabel("format", "Formato final");
  setLabel("conflict", "Se o arquivo já existir");
  setLabel("reprintIndex", "Número da faixa");

  const balance = document.getElementById("balanceCuts")?.closest("label");
  if (balance) replaceLabelText(balance, "Dividir igualmente / equilibrar faixas");
  const ident = document.getElementById("identEnabled")?.closest("label");
  if (ident) replaceLabelText(ident, "Adicionar A1/A2, B1/B2...");
  const reprint = document.getElementById("reprintEnabled")?.closest("label");
  if (reprint) replaceLabelText(reprint, "Gerar somente uma faixa");
  const transparent = document.getElementById("mTransparent")?.closest("label");
  if (transparent) replaceLabelText(transparent, "Margem transparente");

  const cutHelp = [...(sections["03"]?.querySelectorAll("p") || [])];
  if (cutHelp[0]) cutHelp[0].innerHTML = `<b>Padrão recomendado:</b> usa primeiro toda a largura imprimível. Ex.: 280 cm no Oxford → 145 + 135. Ative a divisão igual somente para obter 140 + 140.`;
  if (cutHelp[1]) cutHelp[1].textContent = "Você também pode arrastar as linhas diretamente na prévia. Segure Shift para mover a visualização.";
}

function organizeAdvancedControls(sections) {
  if (sections["02"] && !sections["02"].querySelector("details")) {
    const details = advancedDetails("Gerenciar tecidos");
    appendClosest(details, "fabricName");
    appendClosest(details, "fabricLimit");
    const buttons = sections["02"].querySelector(".buttons");
    if (buttons) details.appendChild(buttons);
    sections["02"].appendChild(details);
  }

  if (sections["03"] && !sections["03"].querySelector("details")) {
    const details = advancedDetails("Opções avançadas de corte");
    appendClosest(details, "editMode");
    appendClosest(details, "minLast");
    sections["03"].appendChild(details);
  }

  if (sections["04"] && !sections["04"].querySelector("details")) {
    const details = advancedDetails("Aparência da margem");
    appendClosest(details, "marginColor");
    const opacity = document.getElementById("marginOpacity")?.closest("label");
    if (opacity) details.appendChild(opacity);
    appendClosest(details, "mTransparent");
    sections["04"].appendChild(details);
  }

  if (sections["05"] && !sections["05"].querySelector("details")) {
    const details = advancedDetails("Fonte, cor e nome da arte");
    appendClosest(details, "identFont");
    appendClosest(details, "identColor");
    appendClosest(details, "identEdge");
    const nameTitle = [...sections["05"].querySelectorAll("small")].find((node) => /Nome da arte/i.test(node.textContent || ""));
    const checks = nameTitle?.nextElementSibling;
    if (nameTitle) details.appendChild(nameTitle);
    if (checks?.classList.contains("checks")) details.appendChild(checks);
    sections["05"].appendChild(details);
  }

  if (sections["06"] && !sections["06"].classList.contains("ux-optional-section")) {
    sections["06"].classList.add("ux-optional-section");
    const wrapper = document.createElement("details");
    wrapper.className = "ux-section-details";
    const summary = document.createElement("summary");
    summary.textContent = "Personalizar nomes dos arquivos";
    sections["06"].before(wrapper);
    wrapper.append(summary, sections["06"]);
  }

  if (sections["07"] && !sections["07"].querySelector(".ux-export-advanced")) {
    const details = advancedDetails("Opções avançadas de exportação", "ux-export-advanced");
    appendClosest(details, "conflict");
    appendClosest(details, "quality");
    appendClosest(details, "tiffCompression");
    const notice = document.getElementById("formatNotice");
    if (notice) details.appendChild(notice);
    sections["07"].appendChild(details);

    const reprintDetails = advancedDetails("Reimpressão e mapa de costura", "ux-reprint-details");
    const smalls = [...sections["07"].querySelectorAll("small")];
    const reprintTitle = smalls.find((node) => /Reimpressão/i.test(node.textContent || ""));
    if (reprintTitle) reprintDetails.appendChild(reprintTitle);
    appendClosest(reprintDetails, "reprintEnabled");
    appendClosest(reprintDetails, "reprintIndex");
    const mapButton = document.getElementById("generateMap");
    const mapStatus = document.getElementById("mapStatus");
    if (mapButton) reprintDetails.appendChild(mapButton);
    if (mapStatus) reprintDetails.appendChild(mapStatus);
    sections["07"].appendChild(reprintDetails);
  }

  for (const section of Object.values(sections)) cleanupEmptyGrids(section);
}

function createSummaryCard() {
  const card = document.createElement("div");
  card.className = "ux-summary";
  card.innerHTML = `
    <div class="ux-summary-head"><span>RESUMO</span><strong>Pronto para impressão?</strong></div>
    <div class="ux-summary-row"><span>Arte</span><b id="uxSummaryArt">Não carregada</b></div>
    <div class="ux-summary-row"><span>Plano</span><b id="uxSummaryPlan">Aguardando</b></div>
    <div class="ux-summary-row"><span>Saída</span><b id="uxSummaryOutput">Não definida</b></div>
    <div id="uxReadyCard" class="ux-ready waiting"><strong>Comece selecionando uma arte</strong><span>O status mudará conforme cada etapa for concluída.</span></div>`;
  return card;
}

function updateSummary({ hasArt, planOk, hasOutput, exportReady }) {
  const art = document.getElementById("uxSummaryArt");
  const plan = document.getElementById("uxSummaryPlan");
  const output = document.getElementById("uxSummaryOutput");
  const ready = document.getElementById("uxReadyCard");
  const fileName = document.getElementById("fileMeta")?.querySelector("b")?.textContent?.trim();
  const previewInfo = document.getElementById("previewInfo")?.textContent?.trim();
  if (art) art.textContent = hasArt ? fileName || "Carregada" : "Não carregada";
  if (plan) plan.textContent = planOk ? previewInfo || "Válido" : hasArt ? "Precisa de atenção" : "Aguardando";
  if (output) output.textContent = hasOutput ? "Pasta escolhida" : "Não definida";
  if (!ready) return;

  ready.className = "ux-ready";
  if (exportReady) {
    ready.classList.add("ready");
    ready.innerHTML = `<strong>Pronto para gerar</strong><span>O AUTOCUT fará a validação pós-exportação automaticamente.</span>`;
  } else if (hasArt && planOk) {
    ready.classList.add("attention");
    ready.innerHTML = `<strong>Falta definir a saída</strong><span>Escolha a pasta e confira o formato final.</span>`;
  } else if (hasArt) {
    ready.classList.add("attention");
    ready.innerHTML = `<strong>Revise o plano</strong><span>Existe alguma configuração que ainda bloqueia a produção.</span>`;
  } else {
    ready.classList.add("waiting");
    ready.innerHTML = `<strong>Comece selecionando uma arte</strong><span>O status mudará conforme cada etapa for concluída.</span>`;
  }
}

function collapseSettings(section) {
  if (!section || section.parentElement?.classList.contains("ux-settings-details")) return;
  const details = document.createElement("details");
  details.className = "ux-settings-details";
  const summary = document.createElement("summary");
  summary.textContent = "Preferências e configurações";
  section.before(details);
  details.append(summary, section);
}

function createTopQuickActions(topbar) {
  const actions = topbar.querySelector(".top-actions");
  if (!actions || document.getElementById("uxNewArt")) return;
  const newArt = document.createElement("button");
  newArt.type = "button";
  newArt.id = "uxNewArt";
  newArt.className = "ux-top-primary";
  newArt.textContent = "+ Nova arte";
  newArt.addEventListener("click", () => document.getElementById("chooseFile")?.click());
  actions.prepend(newArt);

  const openProject = document.getElementById("openProject");
  const saveProject = document.getElementById("saveProject");
  if (openProject) openProject.textContent = "Abrir projeto";
  if (saveProject) saveProject.textContent = "Salvar";
}

function installKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      document.getElementById("chooseFile")?.click();
    } else if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      document.getElementById("saveProject")?.click();
    } else if (event.key === "Enter") {
      const button = document.getElementById("export");
      if (button && !button.disabled) {
        event.preventDefault();
        button.click();
      }
    }
  });
}

function advancedDetails(label, className = "") {
  const details = document.createElement("details");
  details.className = `ux-advanced ${className}`.trim();
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.appendChild(summary);
  return details;
}

function appendClosest(parent, id) {
  const node = document.getElementById(id);
  const label = node?.closest("label");
  if (label) parent.appendChild(label);
}

function cleanupEmptyGrids(section) {
  if (!section) return;
  for (const grid of section.querySelectorAll(".cols,.checks")) {
    if (!grid.children.length) grid.remove();
    else if (grid.children.length === 1) grid.classList.add("ux-single");
  }
}

function renameHeading(section, number, text) {
  const heading = section?.querySelector("h2");
  if (heading) heading.innerHTML = `<i>${number}</i>${text}`;
}

function setLabel(id, text) {
  const input = document.getElementById(id);
  const label = input?.closest("label");
  if (label) replaceLabelText(label, text);
}

function replaceLabelText(label, text) {
  for (const node of [...label.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = `${text}`;
      return;
    }
  }
  label.prepend(document.createTextNode(text));
}

async function waitForApp() {
  for (let i = 0; i < 160; i += 1) {
    const choose = document.getElementById("chooseFile");
    const exportButton = document.getElementById("export");
    const marginPlacement = document.getElementById("marginPlacement");
    if (choose && exportButton && marginPlacement && typeof choose.onclick === "function") return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}
