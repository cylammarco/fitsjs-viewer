import "./style.css";
import { FitsFile } from "fitsjs";
import { decorateIcons, icon } from "./icons.js";
import { ImageViewer, formatNumber } from "./image-viewer.js";
import { MAX_PLOT_ROWS, TablePlotter } from "./table-plotter.js";

const MAX_TABLE_PREVIEW_ROWS = 80;
const app = document.querySelector("#app");

app.innerHTML = `
  <div class="viewer-shell">
    <header class="topbar">
      <div class="brand-lockup" aria-label="FITS Viewer">
        <span class="brand-mark">FITS</span><span class="brand-name">Viewer</span>
      </div>
      <output id="file-status" class="file-status" aria-live="polite">No file loaded</output>
      <div class="topbar-actions">
        <button id="open-file" class="command-button" type="button"><span data-icon="upload"></span><span>Open FITS</span></button>
        <button id="theme-toggle" class="icon-button" type="button" aria-label="Switch to dark mode" title="Switch to dark mode"><span id="theme-icon" data-icon="moon"></span></button>
        <input id="file-input" type="file" accept=".fit,.fits,.fts,application/fits" hidden>
      </div>
    </header>

    <section id="drop-zone" class="drop-zone" tabindex="0" role="button" aria-label="Open a FITS file">
      <div class="drop-glyph" data-icon="upload"></div>
      <div><p class="eyebrow">Local FITS workspace</p><h1>Drop a FITS file</h1></div>
      <span class="drop-action">or choose file</span>
    </section>

    <main id="workbench" class="workbench" hidden>
      <aside class="hdu-rail" aria-label="Header data units">
        <div class="rail-heading"><p class="eyebrow">HDU inventory</p><strong id="hdu-count">0 HDUs</strong></div>
        <div id="hdu-list" class="hdu-list" role="tablist" aria-orientation="vertical"></div>
      </aside>

      <section class="work-area" aria-labelledby="detail-title">
        <div class="detail-heading">
          <div><p id="detail-kind" class="eyebrow">HDU</p><h2 id="detail-title">Select an HDU</h2></div>
          <output id="detail-meta" class="detail-meta"></output>
        </div>
        <output id="viewer-status" class="viewer-status" aria-live="polite"></output>

        <section id="image-workspace" class="image-workspace" hidden>
          <div class="viewer-toolbar" aria-label="Image viewer controls">
            <div class="tool-group">
              <button class="tool-button" type="button" data-viewer-action="fit" aria-label="Fit image" title="Fit image"><span data-icon="fit"></span></button>
              <button class="tool-button" type="button" data-viewer-action="zoom-out" aria-label="Zoom out" title="Zoom out"><span data-icon="zoom-out"></span></button>
              <button class="tool-button" type="button" data-viewer-action="zoom-in" aria-label="Zoom in" title="Zoom in"><span data-icon="zoom-in"></span></button>
              <span id="zoom-readout" class="tool-readout">1.00x</span>
            </div>
            <div class="tool-group">
              <button class="tool-button" type="button" data-viewer-action="rotate" aria-label="Rotate image 90 degrees" title="Rotate image 90 degrees"><span data-icon="rotate"></span></button>
              <button id="flip-horizontal" class="tool-button" type="button" data-viewer-action="flip-horizontal" aria-label="Flip horizontal" title="Flip horizontal"><span data-icon="flip-horizontal"></span></button>
              <button id="flip-vertical" class="tool-button" type="button" data-viewer-action="flip-vertical" aria-label="Flip vertical" title="Flip vertical"><span data-icon="flip-vertical"></span></button>
              <button id="crosshair-toggle" class="tool-button" type="button" data-viewer-action="crosshair" aria-label="Toggle crosshair" title="Toggle crosshair"><span data-icon="crosshair"></span></button>
              <button id="pixel-grid-toggle" class="tool-button" type="button" data-viewer-action="pixel-grid" aria-label="Toggle pixel grid" title="Toggle pixel grid"><span data-icon="grid"></span></button>
            </div>
            <div class="tool-group region-tools" aria-label="Region tools">
              <button class="tool-button is-active" type="button" data-region-mode="pan" aria-label="Pan image" title="Pan image"><span data-icon="move"></span></button>
              <button class="tool-button" type="button" data-region-mode="box" aria-label="Draw box region" title="Draw box region"><span data-icon="square"></span></button>
              <button class="tool-button" type="button" data-region-mode="circle" aria-label="Draw circle region" title="Draw circle region"><span data-icon="circle"></span></button>
              <button class="tool-button" type="button" data-viewer-action="clear-regions" aria-label="Clear regions" title="Clear regions"><span data-icon="trash"></span></button>
            </div>
            <div class="tool-group toolbar-end">
              <label class="frame-field" for="frame-input">Frame<input id="frame-input" type="number" min="0" step="1" value="0"></label>
              <output id="frame-total" class="tool-readout"></output>
              <button class="tool-button" type="button" data-viewer-action="download" aria-label="Download PNG preview" title="Download PNG preview"><span data-icon="download"></span></button>
            </div>
          </div>

          <div class="image-layout">
            <div class="viewer-stage">
              <canvas id="image-canvas" aria-label="Interactive FITS image canvas"></canvas>
              <div id="probe-readout" class="probe-readout">Move over image for pixel values</div>
            </div>
            <aside class="display-panel" aria-label="Image display controls">
              <div class="control-section">
                <div class="section-label"><span data-icon="palette"></span><span>Display</span></div>
                <label class="control-field" for="palette-select">Palette<select id="palette-select"><option value="gray">Gray</option><option value="heat">Heat</option><option value="viridis">Viridis</option><option value="cividis">Cividis</option><option value="magma">Magma</option><option value="ice">Ice</option></select></label>
                <label class="control-field" for="stretch-select">Stretch<select id="stretch-select"><option value="linear">Linear</option><option value="log">Log</option><option value="sqrt">Sqrt</option><option value="square">Square</option><option value="asinh" selected>Asinh</option><option value="sinh">Sinh</option><option value="histeq">Histogram equalisation</option></select></label>
                <label class="toggle-line" for="invert-toggle">Invert<input id="invert-toggle" type="checkbox"></label>
              </div>
              <div class="control-section">
                <div class="section-label"><span data-icon="bar-chart"></span><span>Levels</span></div>
                <canvas id="histogram-canvas" aria-label="Image intensity histogram"></canvas>
                <label class="control-field" for="level-preset">Stretch preset<select id="level-preset"><option value="zscale">ZScale</option><option value="minmax">Data min / max</option><option value="90">90% range</option><option value="95">95% range</option><option value="99" selected>99% range</option><option value="99.5">99.5% range</option></select></label>
                <div class="value-grid">
                  <label class="control-field" for="black-level">Z min<input id="black-level" type="number" step="any"></label>
                  <label class="control-field" for="white-level">Z max<input id="white-level" type="number" step="any"></label>
                </div>
                <div class="value-grid">
                  <label class="control-field" for="percentile-low">Low %<input id="percentile-low" type="number" min="0" max="99.9" step="0.1" value="0.5"></label>
                  <label class="control-field" for="percentile-high">High %<input id="percentile-high" type="number" min="0.1" max="100" step="0.1" value="99.5"></label>
                </div>
                <button id="auto-levels" class="inline-button" type="button"><span data-icon="reset"></span><span>Auto levels</span></button>
                <p class="control-hint">Right-drag in the image: horizontal shifts black/white together; vertical changes contrast.</p>
              </div>
              <div class="control-section photometry-section">
                <div class="section-label"><span data-icon="circle"></span><span>Aperture photometry</span></div>
                <label class="toggle-line" for="photometry-enabled">Enable aperture<input id="photometry-enabled" type="checkbox"></label>
                <div id="photometry-controls" hidden>
                <div class="value-grid">
                  <label class="control-field" for="photometry-x">X (px)<input id="photometry-x" type="number" min="1" step="any"></label>
                  <label class="control-field" for="photometry-y">Y (px)<input id="photometry-y" type="number" min="1" step="any"></label>
                </div>
                <button id="photometry-use-pointer" class="inline-button" type="button">Use cursor position</button>
                <div class="photometry-radii">
                  <label class="control-field" for="photometry-radius">Aperture r (px)<input id="photometry-radius" type="number" min="0.1" step="any" value="5"></label>
                  <label class="control-field" for="photometry-annulus-inner">Annulus inner r<input id="photometry-annulus-inner" type="number" min="0.1" step="any" value="8"></label>
                  <label class="control-field" for="photometry-annulus-outer">Annulus outer r<input id="photometry-annulus-outer" type="number" min="0.1" step="any" value="12"></label>
                </div>
                <p id="photometry-header-values" class="control-hint">Header calibration is read when an image loads.</p>
                <div class="value-grid">
                  <label class="control-field" for="photometry-exposure">Exposure (s)<input id="photometry-exposure" type="number" min="0" step="any" placeholder="Header value"></label>
                  <label class="control-field" for="photometry-zeropoint">Zeropoint (mag)<input id="photometry-zeropoint" type="number" step="any" placeholder="Header value"></label>
                </div>
                <button id="photometry-use-header" class="inline-button" type="button">Restore header values</button>
                <button id="measure-photometry" class="inline-button photometry-measure" type="button">Measure aperture</button>
                <output id="photometry-result" class="photometry-result">Set a centre and radii to measure.</output>
                <p class="control-hint">Drag the centre cross to move the aperture. Drag any circle to resize its aperture or annulus radius.</p>
                </div>
              </div>
              <div class="control-section region-summary"><div class="section-label"><span data-icon="grid"></span><span>Regions</span></div><output id="region-readout">0 regions</output></div>
            </aside>
          </div>
          <div id="image-meta" class="image-meta"></div>
        </section>

        <section id="table-workspace" class="table-workspace" hidden>
          <div class="table-summary"><div><p class="eyebrow">Table preview</p><strong id="table-meta"></strong></div><output id="plot-sample-status" class="sample-status"></output></div>
          <div class="plot-workspace">
            <div class="plot-controls" aria-label="Plot controls">
              <label class="control-field" for="plot-type">Plot<select id="plot-type"><option value="scatter">Scatter</option><option value="histogram">Histogram 1D</option><option value="histogram2d">Histogram 2D</option></select></label>
              <label class="control-field" for="plot-x-scale">X scale<select id="plot-x-scale"><option value="linear">Linear</option><option value="log">Log</option><option value="symlog">Symlog</option></select></label>
              <label id="plot-y-scale-field" class="control-field" for="plot-y-scale">Y scale<select id="plot-y-scale"><option value="linear">Linear</option><option value="log">Log</option><option value="symlog">Symlog</option></select></label>
              <label id="plot-colormap-field" class="control-field" for="plot-colormap">Colour map<select id="plot-colormap"><option value="viridis">Viridis</option><option value="cividis">Cividis</option><option value="plasma">Plasma</option><option value="inferno">Inferno</option><option value="magma">Magma</option></select></label>
              <label id="symlog-field" class="control-field" for="symlog-threshold">Linthresh<input id="symlog-threshold" type="number" min="0" step="any" value="1"></label>
              <div class="series-control"><div class="series-control-heading"><span>Overplotted series</span><button id="add-plot-series" class="inline-button compact-button" type="button">Add series</button></div><div id="plot-series" class="plot-series"></div></div>
              <button id="render-plot" class="command-button plot-button" type="button"><span data-icon="bar-chart"></span><span>Render</span></button>
            </div>
            <div id="plot-container" class="plot-container" aria-label="Plotly chart"></div>
          </div>
          <div class="table-scroll"><table><thead id="table-head"></thead><tbody id="table-body"></tbody></table></div>
        </section>

        <details class="header-panel"><summary>Header cards</summary><pre id="header-cards"></pre></details>
      </section>
    </main>
  </div>
`;

decorateIcons(app);

const elementIds = {
  palette: "palette-select",
  stretch: "stretch-select",
  invert: "invert-toggle",
  plotColorMap: "plot-colormap",
  plotColorMapField: "plot-colormap-field"
};

const elements = Object.fromEntries([
  "fileInput", "fileStatus", "openFile", "themeToggle", "themeIcon", "dropZone", "workbench", "hduCount", "hduList", "detailKind", "detailTitle", "detailMeta", "viewerStatus", "imageWorkspace", "tableWorkspace", "imageCanvas", "histogramCanvas", "probeReadout", "zoomReadout", "frameInput", "frameTotal", "palette", "stretch", "invert", "blackLevel", "whiteLevel", "percentileLow", "percentileHigh", "levelPreset", "autoLevels", "photometryEnabled", "photometryControls", "photometryX", "photometryY", "photometryUsePointer", "photometryRadius", "photometryAnnulusInner", "photometryAnnulusOuter", "photometryHeaderValues", "photometryExposure", "photometryZeropoint", "photometryUseHeader", "measurePhotometry", "photometryResult", "regionReadout", "imageMeta", "tableMeta", "plotSampleStatus", "plotType", "plotSeries", "addPlotSeries", "plotXScale", "plotYScale", "plotYScaleField", "plotColorMap", "plotColorMapField", "symlogField", "symlogThreshold", "renderPlot", "plotContainer", "tableHead", "tableBody", "headerCards"
].map((name) => [name, document.querySelector(`#${elementIds[name] ?? name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)]));

const state = { fits: null, file: null, selectedIndex: 0, frame: 0, imageHdu: null, photometryHeader: { exposure: null, zeroPoint: null } };
const viewer = new ImageViewer({
  canvas: elements.imageCanvas,
  histogramCanvas: elements.histogramCanvas,
  onProbe: renderProbe,
  onStateChange: syncImageControls,
  onRegionChange: (regions) => { elements.regionReadout.textContent = `${regions.length} ${regions.length === 1 ? "region" : "regions"}`; },
  onApertureChange: syncApertureControls
});
const plotter = new TablePlotter({ element: elements.plotContainer, onStatus: (message) => { elements.plotSampleStatus.textContent = message; } });

function setStatus(message, error = false) {
  elements.viewerStatus.textContent = message;
  elements.viewerStatus.classList.toggle("is-error", error);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let index = -1;
  do { value /= 1024; index += 1; } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "bigint") return `${value}n`;
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatValue(item)}`).join(", ");
  if (typeof value === "number") return Number.isNaN(value) ? "NaN" : formatNumber(value);
  return String(value);
}

function hduLabel(hdu) {
  return hdu.header.get("EXTNAME") || (hdu.isPrimary ? "Primary HDU" : `HDU ${hdu.index}`);
}

function renderHduList() {
  elements.hduCount.textContent = `${state.fits.hdus.length} ${state.fits.hdus.length === 1 ? "HDU" : "HDUs"}`;
  elements.hduList.replaceChildren();
  state.fits.hdus.forEach((hdu) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hdu-tab";
    button.role = "tab";
    button.setAttribute("aria-selected", String(hdu.index === state.selectedIndex));
    button.setAttribute("aria-controls", "detail-title");
    button.innerHTML = `<span class="hdu-index">${String(hdu.index).padStart(2, "0")}</span><span class="hdu-copy"><span class="hdu-kind">${hdu.kind.replace(/-/g, " ")}</span><span class="hdu-name"></span></span>`;
    button.querySelector(".hdu-name").textContent = hduLabel(hdu);
    button.addEventListener("click", () => selectHdu(hdu.index));
    elements.hduList.append(button);
  });
}

function renderHeader(hdu) {
  elements.headerCards.textContent = hdu.header.cards.map((card) => card.raw).join("\n");
}

function updateDetail(hdu) {
  elements.detailKind.textContent = hdu.kind.replace(/-/g, " ");
  elements.detailTitle.textContent = hduLabel(hdu);
  elements.detailMeta.textContent = formatBytes(hdu.dataLength);
  renderHeader(hdu);
}

function clearPanels() {
  elements.imageWorkspace.hidden = true;
  elements.tableWorkspace.hidden = true;
  viewer.clear();
  plotter.clear();
  state.imageHdu = null;
  elements.tableHead.replaceChildren();
  elements.tableBody.replaceChildren();
}

async function loadFile(file) {
  if (!file) return;
  state.file = file;
  elements.fileStatus.textContent = `Reading ${file.name || "FITS data"}`;
  elements.workbench.hidden = true;
  clearPanels();
  try {
    state.fits = await FitsFile.fromFile(file);
    state.selectedIndex = Math.max(0, state.fits.hdus.findIndex((hdu) => ["image", "binary-table", "ascii-table"].includes(hdu.kind)));
    state.frame = 0;
    elements.fileStatus.textContent = `${file.name || "FITS data"} | ${formatBytes(file.size)} | ${state.fits.hdus.length} HDUs`;
    elements.dropZone.hidden = true;
    elements.workbench.hidden = false;
    await selectHdu(state.selectedIndex);
  } catch (error) {
    state.fits = null;
    elements.dropZone.hidden = false;
    elements.fileStatus.textContent = error.message;
    setStatus(error.message, true);
  }
}

async function selectHdu(index) {
  if (!state.fits) return;
  state.selectedIndex = index;
  state.frame = 0;
  const hdu = state.fits.hdus[index];
  renderHduList();
  updateDetail(hdu);
  clearPanels();
  try {
    if (hdu.kind === "image") {
      elements.imageWorkspace.hidden = false;
      await renderImage(hdu);
    } else if (hdu.kind === "binary-table" || hdu.kind === "ascii-table") {
      elements.tableWorkspace.hidden = false;
      await renderTable(hdu);
    } else if (hdu.kind === "compressed-image") {
      setStatus("Compressed image decoding is not available in this build.", true);
    } else {
      setStatus(hdu.hasData ? "Raw data unit" : "Header-only HDU");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function renderImage(hdu) {
  const image = hdu.data;
  state.imageHdu = hdu;
  elements.frameInput.max = String(Math.max(0, image.frameCount - 1));
  elements.frameInput.value = String(state.frame);
  elements.frameInput.disabled = image.frameCount <= 1;
  elements.frameTotal.textContent = `/${image.frameCount}`;
  setStatus(`Reading frame ${state.frame}`);
  const values = await image.readImage({ frame: state.frame });
  viewer.setImage({ values, image, header: hdu.header, frame: state.frame });
  populatePhotometryControls(hdu.header, image);
  elements.imageMeta.textContent = `${image.width} x ${image.height} | ${image.dimensions.join(" x ")} | ${values.constructor.name} | ${values.length.toLocaleString()} samples`;
  setStatus(`${values.length.toLocaleString()} samples loaded`);
}

function headerCalibration(header, names) {
  for (const name of names) {
    const value = Number(header.get(name));
    if (Number.isFinite(value)) return { key: name, value };
  }
  return null;
}

function populatePhotometryControls(header, image) {
  const exposure = headerCalibration(header, ["EXPTIME", "EXPOSURE", "ITIME", "TELAPSE"]);
  const zeroPoint = headerCalibration(header, ["MAGZP", "ZP", "ZEROPOINT", "PHOTZP", "MAGZERO"]);
  state.photometryHeader = { exposure, zeroPoint };
  elements.photometryX.value = ((image.width + 1) / 2).toFixed(1);
  elements.photometryY.value = ((image.height + 1) / 2).toFixed(1);
  restorePhotometryHeaderValues();
  const exposureLabel = exposure ? `${exposure.key} = ${formatNumber(exposure.value, 7)} s` : "no exposure keyword";
  const zeroPointLabel = zeroPoint ? `${zeroPoint.key} = ${formatNumber(zeroPoint.value, 7)} mag` : "no zeropoint keyword";
  elements.photometryHeaderValues.textContent = `Header: ${exposureLabel}; ${zeroPointLabel}. Fields below can be overridden.`;
  elements.photometryResult.textContent = "Ready to measure: median annulus background is subtracted from the aperture sum.";
  updatePhotometryOverlay();
}

function restorePhotometryHeaderValues() {
  elements.photometryExposure.value = state.photometryHeader.exposure ? state.photometryHeader.exposure.value : "";
  elements.photometryZeropoint.value = state.photometryHeader.zeroPoint ? state.photometryHeader.zeroPoint.value : "";
}

function photometryParameters() {
  return {
    x: Number(elements.photometryX.value), y: Number(elements.photometryY.value),
    radius: Number(elements.photometryRadius.value),
    annulusInner: Number(elements.photometryAnnulusInner.value), annulusOuter: Number(elements.photometryAnnulusOuter.value),
    exposureTime: elements.photometryExposure.value === "" ? null : Number(elements.photometryExposure.value),
    zeroPoint: elements.photometryZeropoint.value === "" ? null : Number(elements.photometryZeropoint.value)
  };
}

function updatePhotometryOverlay() {
  if (!elements.photometryEnabled.checked) {
    viewer.setApertureOverlay(null);
    return;
  }
  const parameters = photometryParameters();
  viewer.setApertureOverlay(parameters);
}

function syncPhotometryVisibility() {
  const enabled = elements.photometryEnabled.checked;
  elements.photometryControls.hidden = !enabled;
  if (enabled) updatePhotometryOverlay();
  else viewer.setApertureOverlay(null);
}

function syncApertureControls(aperture) {
  elements.photometryX.value = formatNumber(aperture.x, 7);
  elements.photometryY.value = formatNumber(aperture.y, 7);
  elements.photometryRadius.value = formatNumber(aperture.radius, 7);
  elements.photometryAnnulusInner.value = formatNumber(aperture.annulusInner, 7);
  elements.photometryAnnulusOuter.value = formatNumber(aperture.annulusOuter, 7);
}

function usePhotometryPointer() {
  const pointer = viewer.getPointer();
  if (!pointer) {
    elements.photometryResult.textContent = "Move the cursor over a valid image pixel, then choose Use cursor position.";
    return;
  }
  elements.photometryX.value = pointer.x;
  elements.photometryY.value = pointer.y;
  updatePhotometryOverlay();
}

function measurePhotometry() {
  try {
    const result = viewer.aperturePhotometry(photometryParameters());
    const rate = result.countRate === null ? "rate needs exposure" : `${formatNumber(result.countRate, 7)} count/s`;
    const magnitude = result.magnitude === null ? "mag needs positive rate + zeropoint" : `mag ${formatNumber(result.magnitude, 6)}`;
    const warning = result.clipped ? " Aperture is clipped by the image edge." : "";
    elements.photometryResult.textContent = `Net ${formatNumber(result.netCounts, 7)} count (${result.aperturePixels} px); sky median ${formatNumber(result.backgroundMedian, 7)} (${result.annulusPixels} annulus px); ${rate}; ${magnitude}.${warning}`;
    updatePhotometryOverlay();
  } catch (error) {
    elements.photometryResult.textContent = error.message;
  }
}

function renderTablePreview(columns, rows) {
  const headerRow = document.createElement("tr");
  columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column.name;
    headerRow.append(cell);
  });
  elements.tableHead.replaceChildren(headerRow);
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const rowElement = document.createElement("tr");
    columns.forEach((column) => {
      const cell = document.createElement("td");
      cell.textContent = formatValue(row[column.name]);
      cell.title = cell.textContent;
      rowElement.append(cell);
    });
    fragment.append(rowElement);
  });
  elements.tableBody.replaceChildren(fragment);
}

async function renderTable(hdu) {
  const table = hdu.data;
  const previewCount = Math.min(table.rowCount, MAX_TABLE_PREVIEW_ROWS);
  setStatus(`Reading ${previewCount.toLocaleString()} preview rows`);
  const rows = await table.readRows({ count: previewCount });
  renderTablePreview(table.columns, rows);
  elements.tableMeta.textContent = `${table.columns.length} columns | ${table.rowCount.toLocaleString()} rows`;
  setStatus(`${table.columns.length} columns | ${table.rowCount.toLocaleString()} rows`);
  const model = await plotter.setTable(table);
  populatePlotControls(model);
  if (model.columns.length) await renderPlot();
  else elements.plotSampleStatus.textContent = "No numeric columns available for plotting";
}

function replaceOptions(select, columns, addEmpty = false) {
  select.replaceChildren();
  if (addEmpty) {
    const option = new Option("None", "");
    select.add(option);
  }
  columns.forEach((column) => select.add(new Option(column.unit ? `${column.name} (${column.unit})` : column.name, column.name)));
}

function populatePlotControls(model) {
  elements.plotType.value = model.columns.length > 1 ? "scatter" : "histogram";
  elements.plotSeries.replaceChildren();
  addPlotSeries();
  elements.plotSampleStatus.textContent = `${model.loadedRows.toLocaleString()} of ${model.totalRows.toLocaleString()} rows sampled for Plotly`;
  syncPlotControls();
}

function buildSeriesSelect(label, className, columns, includeNone = false) {
  const field = document.createElement("label");
  field.className = "series-field";
  field.append(`${label} `);
  const select = document.createElement("select");
  select.className = className;
  replaceOptions(select, columns, includeNone);
  field.append(select);
  return field;
}

function addPlotSeries() {
  const columns = plotter.getModel().columns;
  if (!columns.length) return;
  const row = document.createElement("div");
  row.className = "plot-series-row";
  const index = elements.plotSeries.children.length;
  const xField = buildSeriesSelect("X", "series-x", columns);
  const yField = buildSeriesSelect("Y", "series-y", columns);
  const colorField = buildSeriesSelect("Colour", "series-colour", columns, true);
  const label = document.createElement("label");
  label.className = "series-field series-label";
  label.append("Label ");
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "series-name";
  labelInput.placeholder = `Series ${index + 1}`;
  label.append(labelInput);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "series-remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => { if (elements.plotSeries.children.length > 1) { row.remove(); renderPlot(); } });
  row.append(xField, yField, colorField, label, remove);
  const xSelect = row.querySelector(".series-x");
  const ySelect = row.querySelector(".series-y");
  if (columns.length > 1) {
    xSelect.selectedIndex = index % columns.length;
    ySelect.selectedIndex = (index + 1) % columns.length;
  }
  row.querySelectorAll("select, input").forEach((control) => control.addEventListener("change", renderPlot));
  elements.plotSeries.append(row);
  syncPlotControls();
}

function selectedPlotSeries() {
  return [...elements.plotSeries.querySelectorAll(".plot-series-row")].map((row) => ({
    xColumn: row.querySelector(".series-x").value,
    yColumn: row.querySelector(".series-y").value,
    colorColumn: row.querySelector(".series-colour").value,
    label: row.querySelector(".series-name").value
  }));
}

function syncPlotControls() {
  const histogram = elements.plotType.value === "histogram";
  elements.plotYScaleField.hidden = histogram;
  elements.plotColorMapField.hidden = elements.plotType.value !== "histogram2d";
  elements.plotSeries.querySelectorAll(".plot-series-row").forEach((row) => {
    row.querySelector(".series-y").closest("label").hidden = histogram;
    row.querySelector(".series-colour").closest("label").hidden = elements.plotType.value !== "scatter";
  });
  elements.symlogField.hidden = ![elements.plotXScale.value, elements.plotYScale.value].includes("symlog");
}

async function renderPlot() {
  syncPlotControls();
  try {
    await plotter.plot({
      type: elements.plotType.value,
      series: selectedPlotSeries(),
      xScale: elements.plotXScale.value,
      yScale: elements.plotYScale.value,
      symlogThreshold: elements.symlogThreshold.value,
      histogramColorMap: elements.plotColorMap.value
    });
  } catch (error) {
    elements.plotSampleStatus.textContent = error.message;
  }
}

function renderProbe(probe) {
  if (!probe) {
    elements.probeReadout.textContent = "Move over image for pixel values";
    return;
  }
  const pixel = `x ${probe.x + 1}  y ${probe.y + 1}  value ${formatValue(probe.value)}`;
  const world = probe.world ? ` | RA ${formatNumber(probe.world.ra)}  Dec ${formatNumber(probe.world.dec)}` : "";
  elements.probeReadout.textContent = `${pixel}${world}`;
}

function syncImageControls(viewState) {
  if (!viewState.image) return;
  elements.zoomReadout.textContent = `${viewState.zoom.toFixed(2)}x`;
  elements.palette.value = viewState.palette;
  elements.stretch.value = viewState.stretch;
  elements.invert.checked = viewState.invert;
  elements.blackLevel.value = formatNumber(viewState.black, 7);
  elements.whiteLevel.value = formatNumber(viewState.white, 7);
  elements.percentileLow.value = viewState.percentileLow;
  elements.percentileHigh.value = viewState.percentileHigh;
  elements.regionReadout.textContent = `${viewState.regions.length} ${viewState.regions.length === 1 ? "region" : "regions"}`;
  document.querySelector("#crosshair-toggle").classList.toggle("is-active", viewState.crosshair);
  document.querySelector("#pixel-grid-toggle").classList.toggle("is-active", viewState.pixelGrid);
  document.querySelector("#flip-horizontal").classList.toggle("is-active", viewState.flipX);
  document.querySelector("#flip-vertical").classList.toggle("is-active", viewState.flipY);
  document.querySelectorAll("[data-region-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.regionMode === viewState.regionMode));
}

function currentTheme() {
  return document.documentElement.dataset.theme || "light";
}

async function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("fits-viewer-theme", theme);
  const dark = theme === "dark";
  elements.themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
  elements.themeToggle.title = `Switch to ${dark ? "light" : "dark"} mode`;
  elements.themeIcon.replaceChildren(icon(dark ? "sun" : "moon"));
  viewer.setTheme();
  await plotter.refreshTheme();
}

function pickFile() { elements.fileInput.click(); }

elements.openFile.addEventListener("click", pickFile);
elements.dropZone.addEventListener("click", pickFile);
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pickFile(); }
});
elements.fileInput.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
  event.target.value = "";
});
["dragenter", "dragover"].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
}));
elements.dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer?.files?.[0]));
elements.themeToggle.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

document.querySelectorAll("[data-viewer-action]").forEach((button) => button.addEventListener("click", () => {
  const action = button.dataset.viewerAction;
  if (action === "fit") viewer.resetView();
  if (action === "zoom-in") viewer.zoomBy(1.3);
  if (action === "zoom-out") viewer.zoomBy(1 / 1.3);
  if (action === "rotate") viewer.rotate();
  if (action === "flip-horizontal") viewer.toggleFlip("flipX");
  if (action === "flip-vertical") viewer.toggleFlip("flipY");
  if (action === "crosshair") viewer.setDisplayOption("crosshair", !viewer.getState().crosshair);
  if (action === "pixel-grid") viewer.setDisplayOption("pixelGrid", !viewer.getState().pixelGrid);
  if (action === "clear-regions") viewer.clearRegions();
  if (action === "download") viewer.exportPng(`${state.file?.name?.replace(/\.[^.]+$/, "") || "fits"}-frame-${state.frame}.png`);
}));
document.querySelectorAll("[data-region-mode]").forEach((button) => button.addEventListener("click", () => viewer.setRegionMode(button.dataset.regionMode)));

elements.palette.addEventListener("change", () => viewer.setDisplayOption("palette", elements.palette.value));
elements.stretch.addEventListener("change", () => viewer.setDisplayOption("stretch", elements.stretch.value));
elements.invert.addEventListener("change", () => viewer.setDisplayOption("invert", elements.invert.checked));
elements.blackLevel.addEventListener("change", () => viewer.setLevels(elements.blackLevel.value, elements.whiteLevel.value));
elements.whiteLevel.addEventListener("change", () => viewer.setLevels(elements.blackLevel.value, elements.whiteLevel.value));
elements.autoLevels.addEventListener("click", () => viewer.autoLevels(elements.percentileLow.value, elements.percentileHigh.value));
elements.levelPreset.addEventListener("change", () => viewer.applyLevelPreset(elements.levelPreset.value));
elements.percentileLow.addEventListener("change", () => viewer.autoLevels(elements.percentileLow.value, elements.percentileHigh.value));
elements.percentileHigh.addEventListener("change", () => viewer.autoLevels(elements.percentileLow.value, elements.percentileHigh.value));
[
  elements.photometryX,
  elements.photometryY,
  elements.photometryRadius,
  elements.photometryAnnulusInner,
  elements.photometryAnnulusOuter
].forEach((control) => control.addEventListener("input", updatePhotometryOverlay));
elements.photometryUsePointer.addEventListener("click", usePhotometryPointer);
elements.photometryUseHeader.addEventListener("click", () => { restorePhotometryHeaderValues(); updatePhotometryOverlay(); });
elements.measurePhotometry.addEventListener("click", measurePhotometry);
elements.photometryEnabled.addEventListener("change", syncPhotometryVisibility);
elements.frameInput.addEventListener("change", async () => {
  if (!state.imageHdu) return;
  const frame = Number(elements.frameInput.value);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= state.imageHdu.data.frameCount) { elements.frameInput.value = String(state.frame); return; }
  state.frame = frame;
  try { await renderImage(state.imageHdu); } catch (error) { setStatus(error.message, true); }
});
[
  elements.plotType,
  elements.plotXScale,
  elements.plotYScale,
  elements.plotColorMap,
  elements.symlogThreshold
].forEach((control) => control.addEventListener("change", () => {
  syncPlotControls();
  renderPlot();
}));
elements.addPlotSeries.addEventListener("click", () => { addPlotSeries(); renderPlot(); });
elements.renderPlot.addEventListener("click", renderPlot);
document.addEventListener("keydown", (event) => {
  if (!state.imageHdu || event.target.matches("input, select, textarea")) return;
  if (event.key === "+" || event.key === "=") viewer.zoomBy(1.3);
  if (event.key === "-") viewer.zoomBy(1 / 1.3);
  if (event.key === "0") viewer.resetView();
});

const savedTheme = localStorage.getItem("fits-viewer-theme");
setTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

export { loadFile, MAX_PLOT_ROWS };
