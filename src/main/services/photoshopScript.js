export const PHOTOSHOP_RUNNER_VBS = `Option Explicit
On Error Resume Next
Dim appRef, jsxPath, jobPath, resultPath
jsxPath = WScript.Arguments(0)
jobPath = WScript.Arguments(1)
resultPath = WScript.Arguments(2)
Set appRef = CreateObject("Photoshop.Application")
If Err.Number <> 0 Then
  WScript.Echo "PHOTOSHOP_COM_ERROR:" & Err.Description
  WScript.Quit 31
End If
Err.Clear
appRef.BringToFront
Call appRef.DoJavaScriptFile(jsxPath, Array(jobPath, resultPath), 1)
If Err.Number <> 0 Then
  WScript.Echo "PHOTOSHOP_SCRIPT_ERROR:" & Err.Description
  WScript.Quit 32
End If
WScript.Quit 0
`;

export const PHOTOSHOP_EXPORT_JSX = String.raw`#target photoshop
app.displayDialogs = DialogModes.NO;
(function () {
  var jobPath = arguments[0];
  var resultPath = arguments[1];
  var oldRuler = app.preferences.rulerUnits;
  var oldType = app.preferences.typeUnits;
  var source = null;
  var results = [];

  function readJson(filePath) {
    var f = File(filePath);
    if (!f.open("r")) throw new Error("Não foi possível ler job JSON.");
    var t = f.read();
    f.close();
    return JSON.parse(t);
  }

  function writeJson(filePath, data) {
    var f = File(filePath);
    f.encoding = "UTF8";
    if (!f.open("w")) throw new Error("Não foi possível gravar resultado JSON.");
    f.write(JSON.stringify(data));
    f.close();
  }

  function px(v) { return UnitValue(Math.round(v), "px"); }
  function pt(v) { return UnitValue(v, "pt"); }
  function cmToPxValue(cm, dpi) { return Number(cm) / 2.54 * dpi; }
  function pxToPtValue(value, dpi) { return Number(value) / dpi * 72; }

  function hexColor(hex) {
    var h = String(hex || "#ffffff").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = "ffffff";
    var c = new SolidColor();
    c.rgb.red = parseInt(h.substr(0, 2), 16);
    c.rgb.green = parseInt(h.substr(2, 2), 16);
    c.rgb.blue = parseInt(h.substr(4, 2), 16);
    return c;
  }

  function boundsPx(layer) {
    var b = layer.bounds;
    return {
      left: b[0].as("px"),
      top: b[1].as("px"),
      right: b[2].as("px"),
      bottom: b[3].as("px"),
      width: b[2].as("px") - b[0].as("px"),
      height: b[3].as("px") - b[1].as("px")
    };
  }

  function centerLayer(layer, cx, cy) {
    var b = boundsPx(layer);
    layer.translate(px(cx - (b.left + b.right) / 2), px(cy - (b.top + b.bottom) / 2));
  }

  function resizeMargins(doc, m) {
    if (m.topPx > 0) doc.resizeCanvas(doc.width, px(doc.height.as("px") + m.topPx), AnchorPosition.BOTTOMCENTER);
    if (m.bottomPx > 0) doc.resizeCanvas(doc.width, px(doc.height.as("px") + m.bottomPx), AnchorPosition.TOPCENTER);
    if (m.leftPx > 0) doc.resizeCanvas(px(doc.width.as("px") + m.leftPx), doc.height, AnchorPosition.MIDDLERIGHT);
    if (m.rightPx > 0) doc.resizeCanvas(px(doc.width.as("px") + m.rightPx), doc.height, AnchorPosition.MIDDLELEFT);
  }

  function fillMargins(doc, m, margin) {
    if (margin.transparent || margin.enabled === false) return;
    var w = doc.width.as("px");
    var h = doc.height.as("px");
    var layer = doc.artLayers.add();
    layer.name = "AUTOCUT_MARGENS";
    layer.opacity = Math.max(0, Math.min(100, Number(margin.opacity == null ? 1 : margin.opacity) * 100));
    var color = hexColor(margin.color || "#ffffff");
    function fillRect(a, b, c, d) {
      if (c <= a || d <= b) return;
      doc.selection.select([[a, b], [c, b], [c, d], [a, d]]);
      doc.selection.fill(color, ColorBlendMode.NORMAL, 100, false);
      doc.selection.deselect();
    }
    fillRect(0, 0, w, m.topPx);
    fillRect(0, h - m.bottomPx, w, h);
    fillRect(0, m.topPx, m.leftPx, h - m.bottomPx);
    fillRect(w - m.rightPx, m.topPx, w, h - m.bottomPx);
    try { layer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER); } catch (e) {}
  }

  function createEditableText(doc, name, value, targetHeightPx, maxAdvancePx, ident, rotation) {
    var layer = doc.artLayers.add();
    layer.name = name;
    layer.kind = LayerKind.TEXT;
    var t = layer.textItem;
    t.contents = value;
    t.color = hexColor(ident.color || "#111111");
    try { if (ident.font) t.font = ident.font; } catch (e1) {
      try { t.font = "ArialMT"; } catch (e2) { try { t.font = "Arial"; } catch (e3) {} }
    }

    // Mesma lógica produtiva do AUTOCORTE.jsx: primeiro garante a ALTURA
    // física configurada; só depois comprime X caso o texto seja largo demais.
    t.size = pt(pxToPtValue(targetHeightPx, doc.resolution) * 1.10);
    t.justification = Justification.LEFT;
    t.position = [px(0), px(targetHeightPx * 1.2)];

    var b = boundsPx(layer);
    if (b.height > 0) {
      layer.resize(100, targetHeightPx / b.height * 100, AnchorPosition.TOPLEFT);
    }
    b = boundsPx(layer);
    if (maxAdvancePx > 0 && b.width > maxAdvancePx) {
      layer.resize(maxAdvancePx / b.width * 100, 100, AnchorPosition.TOPLEFT);
    }
    if (rotation) layer.rotate(rotation, AnchorPosition.MIDDLECENTER);
    return layer;
  }

  function placeLabel(doc, name, value, cx, cy, targetHeightPx, maxAdvancePx, ident, rotation) {
    var layer = createEditableText(doc, name, value, targetHeightPx, maxAdvancePx, ident, rotation || 0);
    centerLayer(layer, cx, cy);
    return layer;
  }

  function technicalText(doc, slice, job, m) {
    var dpi = Number(job.source.dpi);
    var w = doc.width.as("px");
    var h = doc.height.as("px");
    var ident = job.identification || {};
    var edgePx = Math.max(0, cmToPxValue(Number(ident.edgeDistanceCm) || 0.18, dpi));
    var stripPad = Math.max(1, cmToPxValue(0.08, dpi));
    var targetHeightPx = Math.max(1, cmToPxValue(Number(ident.sizeCm) || 2, dpi));
    var before = slice.seam && slice.seam.labels ? slice.seam.labels.before : null;
    var after = slice.seam && slice.seam.labels ? slice.seam.labels.after : null;

    if (ident.enabled) {
      if (job.orientation === "horizontal" && m.placement === "lateral") {
        var lateralLeftMax = Math.max(1, m.leftPx - stripPad * 2);
        var lateralRightMax = Math.max(1, m.rightPx - stripPad * 2);
        if (before) {
          var topY = edgePx + targetHeightPx / 2;
          placeLabel(doc, "AUTOCUT_" + before[0], before[0], m.leftPx / 2, topY, targetHeightPx, lateralLeftMax, ident, 0);
          placeLabel(doc, "AUTOCUT_" + before[1], before[1], w - m.rightPx / 2, topY, targetHeightPx, lateralRightMax, ident, 0);
        }
        if (after) {
          var bottomY = h - edgePx - targetHeightPx / 2;
          placeLabel(doc, "AUTOCUT_" + after[0], after[0], m.leftPx / 2, bottomY, targetHeightPx, lateralLeftMax, ident, 0);
          placeLabel(doc, "AUTOCUT_" + after[1], after[1], w - m.rightPx / 2, bottomY, targetHeightPx, lateralRightMax, ident, 0);
        }
      } else if (job.orientation === "horizontal") {
        if (before) {
          var topMax = Math.max(1, m.topPx - stripPad * 2);
          placeLabel(doc, "AUTOCUT_" + before[0], before[0], edgePx + targetHeightPx / 2, m.topPx / 2, targetHeightPx, topMax, ident, 90);
          placeLabel(doc, "AUTOCUT_" + before[1], before[1], w - edgePx - targetHeightPx / 2, m.topPx / 2, targetHeightPx, topMax, ident, 90);
        }
        if (after) {
          var bottomMax = Math.max(1, m.bottomPx - stripPad * 2);
          placeLabel(doc, "AUTOCUT_" + after[0], after[0], edgePx + targetHeightPx / 2, h - m.bottomPx / 2, targetHeightPx, bottomMax, ident, 90);
          placeLabel(doc, "AUTOCUT_" + after[1], after[1], w - edgePx - targetHeightPx / 2, h - m.bottomPx / 2, targetHeightPx, bottomMax, ident, 90);
        }
      } else if (m.placement === "lateral") {
        if (before) {
          var leftMax = Math.max(1, m.leftPx - stripPad * 2);
          placeLabel(doc, "AUTOCUT_" + before[0], before[0], m.leftPx / 2, edgePx + targetHeightPx / 2, targetHeightPx, leftMax, ident, 0);
          placeLabel(doc, "AUTOCUT_" + before[1], before[1], m.leftPx / 2, h - edgePx - targetHeightPx / 2, targetHeightPx, leftMax, ident, 0);
        }
        if (after) {
          var rightMax = Math.max(1, m.rightPx - stripPad * 2);
          placeLabel(doc, "AUTOCUT_" + after[0], after[0], w - m.rightPx / 2, edgePx + targetHeightPx / 2, targetHeightPx, rightMax, ident, 0);
          placeLabel(doc, "AUTOCUT_" + after[1], after[1], w - m.rightPx / 2, h - edgePx - targetHeightPx / 2, targetHeightPx, rightMax, ident, 0);
        }
      } else {
        if (before) {
          var topStripMax = Math.max(1, m.topPx - stripPad * 2);
          var bottomStripMax = Math.max(1, m.bottomPx - stripPad * 2);
          var leftX = edgePx + targetHeightPx / 2;
          placeLabel(doc, "AUTOCUT_" + before[0], before[0], leftX, m.topPx / 2, targetHeightPx, topStripMax, ident, 90);
          placeLabel(doc, "AUTOCUT_" + before[1], before[1], leftX, h - m.bottomPx / 2, targetHeightPx, bottomStripMax, ident, 90);
        }
        if (after) {
          var topStripMax2 = Math.max(1, m.topPx - stripPad * 2);
          var bottomStripMax2 = Math.max(1, m.bottomPx - stripPad * 2);
          var rightX = w - edgePx - targetHeightPx / 2;
          placeLabel(doc, "AUTOCUT_" + after[0], after[0], rightX, m.topPx / 2, targetHeightPx, topStripMax2, ident, 90);
          placeLabel(doc, "AUTOCUT_" + after[1], after[1], rightX, h - m.bottomPx / 2, targetHeightPx, bottomStripMax2, ident, 90);
        }
      }
    }

    var artName = String(job.baseName || "").toUpperCase();
    var ns = job.nameSides || {};
    if (!artName) return;
    var nameHeightPx = targetHeightPx * 0.55;
    if (m.placement === "lateral") {
      if (ns.left && m.leftPx > 0) placeLabel(doc, "AUTOCUT_NOME_LEFT", artName, m.leftPx / 2, h / 2, nameHeightPx, Math.max(1, h - edgePx * 2), ident, -90);
      if (ns.right && m.rightPx > 0) placeLabel(doc, "AUTOCUT_NOME_RIGHT", artName, w - m.rightPx / 2, h / 2, nameHeightPx, Math.max(1, h - edgePx * 2), ident, 90);
    } else {
      if (ns.top && m.topPx > 0) placeLabel(doc, "AUTOCUT_NOME_TOP", artName, w / 2, m.topPx / 2, nameHeightPx, Math.max(1, w - edgePx * 2), ident, 0);
      if (ns.bottom && m.bottomPx > 0) placeLabel(doc, "AUTOCUT_NOME_BOTTOM", artName, w / 2, h - m.bottomPx / 2, nameHeightPx, Math.max(1, w - edgePx * 2), ident, 0);
    }
  }

  function savePsd(doc, filePath) {
    var o = new PhotoshopSaveOptions();
    o.alphaChannels = true;
    o.annotations = false;
    o.embedColorProfile = true;
    o.layers = true;
    o.spotColors = true;
    doc.saveAs(File(filePath), o, true, Extension.LOWERCASE);
  }

  function savePsb(doc, filePath) {
    var d1 = new ActionDescriptor();
    var d2 = new ActionDescriptor();
    d2.putBoolean(stringIDToTypeID("maximizeCompatibility"), true);
    d1.putObject(stringIDToTypeID("as"), stringIDToTypeID("largeDocumentFormat"), d2);
    d1.putPath(stringIDToTypeID("in"), File(filePath));
    d1.putBoolean(stringIDToTypeID("copy"), true);
    executeAction(stringIDToTypeID("save"), d1, DialogModes.NO);
  }

  try {
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.POINTS;
    var job = readJson(jobPath);
    source = app.open(File(job.source.filePath));
    if (Math.round(source.width.as("px")) !== Math.round(job.source.widthPx) || Math.round(source.height.as("px")) !== Math.round(job.source.heightPx)) throw new Error("A origem mudou desde o cálculo.");
    if (Math.abs(source.resolution - Number(job.source.dpi)) > 0.05) throw new Error("O DPI da origem mudou desde o cálculo.");

    for (var i = 0; i < job.tasks.length; i++) {
      var task = job.tasks[i];
      var slice = task.slice;
      var doc = source.duplicate();
      app.activeDocument = doc;
      if (job.orientation === "horizontal") doc.crop([px(0), px(slice.startPx), px(job.source.widthPx), px(slice.endPx)]);
      else doc.crop([px(slice.startPx), px(0), px(slice.endPx), px(job.source.heightPx)]);

      resizeMargins(doc, job.margins);
      fillMargins(doc, job.margins, job.margin || {});
      technicalText(doc, slice, job, job.margins);
      if (task.format === "PSB") savePsb(doc, task.outputPath);
      else savePsd(doc, task.outputPath);
      doc.close(SaveOptions.DONOTSAVECHANGES);

      var check = app.open(File(task.outputPath));
      results.push({
        index: slice.index,
        filePath: task.outputPath,
        widthPx: Math.round(check.width.as("px")),
        heightPx: Math.round(check.height.as("px")),
        dpi: check.resolution,
        layerCount: check.layers.length
      });
      check.close(SaveOptions.DONOTSAVECHANGES);
    }

    source.close(SaveOptions.DONOTSAVECHANGES);
    source = null;
    writeJson(resultPath, { ok: true, results: results });
  } catch (err) {
    try { if (source) source.close(SaveOptions.DONOTSAVECHANGES); } catch (e4) {}
    writeJson(resultPath, { ok: false, error: String(err), line: err.line || null, results: results });
  } finally {
    app.preferences.rulerUnits = oldRuler;
    app.preferences.typeUnits = oldType;
  }
})();`;
