const MAX_PLOT_ROWS = 25000;
const NUMERIC_TYPES = new Set(["B", "I", "J", "K", "E", "D", "F"]);
const SERIES_COLORS = ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#e69f00", "#56b4e9", "#332288", "#882255"];
const HISTOGRAM_COLOR_SCALES = {
  viridis: "Viridis",
  cividis: "Cividis",
  plasma: "Plasma",
  inferno: "Inferno",
  magma: "Magma"
};
let plotlyPromise;

function getPlotly() {
  if (!plotlyPromise) plotlyPromise = import("plotly.js-dist-min").then((module) => module.default ?? module);
  return plotlyPromise;
}

function numericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function symlog(value, threshold) { return Math.sign(value) * Math.log10(1 + Math.abs(value) / threshold); }

function formatNumber(value) {
  if (value === 0) return "0";
  const absolute = Math.abs(value);
  return absolute >= 10000 || absolute < 0.01 ? value.toExponential(1) : value.toPrecision(3);
}

function transformValue(value, scale, threshold) {
  if (scale === "log") return value > 0 ? value : null;
  return scale === "symlog" ? symlog(value, threshold) : value;
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}

function axisOptions(label, scale, rawValues, threshold, theme) {
  const base = { title: { text: label, standoff: 12 }, gridcolor: theme.grid, zerolinecolor: theme.zero, linecolor: theme.line, tickcolor: theme.line, automargin: true };
  if (scale === "log") return { ...base, type: "log" };
  if (scale !== "symlog") return base;
  const finiteValues = rawValues.filter(Number.isFinite);
  const minimum = Math.min(...finiteValues, 0);
  const maximum = Math.max(...finiteValues, 0);
  const maximumAbsolute = Math.max(Math.abs(minimum), Math.abs(maximum), threshold);
  const tickRawValues = [0, threshold, -threshold];
  const largestExponent = Math.ceil(Math.log10(maximumAbsolute / threshold + 1));
  for (let exponent = 1; exponent <= largestExponent; exponent += 1) {
    const value = (10 ** exponent - 1) * threshold;
    tickRawValues.push(value, -value);
  }
  const visible = tickRawValues.filter((value, index, values) => values.indexOf(value) === index && value >= minimum && value <= maximum).sort((left, right) => left - right);
  return { ...base, tickvals: visible.map((value) => symlog(value, threshold)), ticktext: visible.map(formatNumber), title: { text: `${label} (symlog)`, standoff: 12 } };
}

function currentTheme() {
  const styles = getComputedStyle(document.documentElement);
  return {
    font: styles.getPropertyValue("--plot-text").trim(), grid: styles.getPropertyValue("--plot-grid").trim(),
    line: styles.getPropertyValue("--plot-line").trim(), zero: styles.getPropertyValue("--plot-zero").trim(),
    paper: "rgba(0,0,0,0)", plot: styles.getPropertyValue("--plot-background").trim()
  };
}

function seriesLabel(series, index, type) {
  if (series.label?.trim()) return series.label.trim();
  return type === "histogram" ? series.xColumn : `${series.yColumn} vs ${series.xColumn}` || `Series ${index + 1}`;
}

export class TablePlotter {
  constructor({ element, onStatus }) {
    this.element = element;
    this.onStatus = onStatus;
    this.table = null;
    this.columns = [];
    this.numericColumns = [];
    this.values = new Map();
    this.loadedRows = 0;
    this.lastOptions = null;
    this.resizeObserver = new ResizeObserver(() => { if (this.lastOptions) getPlotly().then((plotly) => plotly.Plots.resize(this.element)); });
    this.resizeObserver.observe(element);
  }

  async setTable(table) {
    this.table = table;
    this.lastOptions = null;
    this.loadedRows = 0;
    this.columns = [];
    this.numericColumns = table.columns.filter((column) => NUMERIC_TYPES.has(column.type));
    this.values.clear();
    if (!this.numericColumns.length) {
      (await getPlotly()).purge(this.element);
      return this.getModel();
    }
    this.numericColumns.forEach((column) => this.values.set(column.name, []));
    return this.loadMoreRows();
  }

  async loadMoreRows(count = MAX_PLOT_ROWS) {
    if (!this.table || !this.numericColumns.length || this.loadedRows >= this.table.rowCount) return this.getModel();
    const amount = Math.min(Math.max(1, Number(count) || MAX_PLOT_ROWS), this.table.rowCount - this.loadedRows);
    const start = this.loadedRows;
    this.onStatus?.(`Sampling rows ${(start + 1).toLocaleString()}–${(start + amount).toLocaleString()} for Plotly`);
    const rows = await this.table.readRows({ start, count: amount, columns: this.numericColumns.map((column) => column.name) });
    this.numericColumns.forEach((column) => {
      const values = this.values.get(column.name);
      rows.forEach((row) => values.push(numericValue(row[column.name])));
    });
    this.loadedRows += rows.length;
    this.columns = this.numericColumns.filter((column) => this.values.get(column.name).filter((value) => value !== null).length > 1);
    this.onStatus?.(this.columns.length ? `Plot sample: ${this.loadedRows.toLocaleString()} rows` : "No numeric table columns found");
    return this.getModel();
  }

  getModel() {
    return {
      columns: this.columns,
      numericColumnCount: this.numericColumns.length,
      loadedRows: this.loadedRows,
      totalRows: this.table?.rowCount ?? 0
    };
  }

  recordsFor(series, xScale, yScale, threshold, withY) {
    const xRaw = this.requireValues(series.xColumn);
    const yRaw = withY ? this.requireValues(series.yColumn) : null;
    const colorRaw = series.colorColumn ? this.requireValues(series.colorColumn) : null;
    const records = [];
    for (let index = 0; index < xRaw.length; index += 1) {
      const rawX = numericValue(xRaw[index]);
      const rawY = withY ? numericValue(yRaw[index]) : null;
      if (rawX === null || (withY && rawY === null)) continue;
      const x = transformValue(rawX, xScale, threshold);
      const y = withY ? transformValue(rawY, yScale, threshold) : null;
      if (x === null || (withY && y === null)) continue;
      records.push({ rawX, rawY, x, y, color: colorRaw ? numericValue(colorRaw[index]) : null });
    }
    return records;
  }

  async plot(options) {
    const Plotly = await getPlotly();
    const { type, xScale, yScale, symlogThreshold, histogramColorMap = "viridis" } = options;
    const series = (options.series ?? [{ xColumn: options.xColumn, yColumn: options.yColumn, colorColumn: options.colorColumn }])
      .filter((entry) => entry?.xColumn && (type === "histogram" || entry.yColumn));
    if (!this.table || !series.length) throw new Error(type === "histogram" ? "Add at least one X series." : "Add at least one X/Y series.");
    const threshold = Math.max(Number(symlogThreshold) || 1, Number.MIN_VALUE);
    const theme = currentTheme();
    const layout = {
      paper_bgcolor: theme.paper, plot_bgcolor: theme.plot,
      font: { family: "DM Mono, ui-monospace, monospace", color: theme.font, size: 11 },
      margin: { l: 62, r: 26, t: 32, b: 58 },
      hoverlabel: { bgcolor: theme.plot, bordercolor: theme.line, font: { color: theme.font } },
      showlegend: series.length > 1,
      legend: { bgcolor: "rgba(0,0,0,0)", bordercolor: theme.line, borderwidth: 0, orientation: "h", y: 1.12 }
    };
    const plotted = series.map((entry) => ({ entry, records: this.recordsFor(entry, xScale, yScale, threshold, type !== "histogram") }));
    if (plotted.some(({ records }) => !records.length)) throw new Error("A selected series has no finite values at the current axis scales.");
    const xLabel = [...new Set(series.map((entry) => entry.xColumn))].join(" / ");
    const yLabel = [...new Set(series.map((entry) => entry.yColumn).filter(Boolean))].join(" / ");
    const xValues = plotted.flatMap(({ records }) => records.map((record) => record.rawX));
    const yValues = plotted.flatMap(({ records }) => records.map((record) => record.rawY));
    let data;

    if (type === "histogram") {
      data = plotted.map(({ entry, records }, index) => ({
        type: "histogram", x: records.map((record) => record.x), name: seriesLabel(entry, index, type),
        marker: { color: SERIES_COLORS[index % SERIES_COLORS.length], line: { color: theme.line, width: 0.35 } }, opacity: 0.58,
        hovertemplate: `${entry.xColumn}: %{x}<br>Count: %{y}<extra>${seriesLabel(entry, index, type)}</extra>`, nbinsx: 48
      }));
      layout.barmode = "overlay";
      layout.xaxis = axisOptions(xLabel, xScale, xValues, threshold, theme);
      layout.yaxis = axisOptions("Count", "linear", [], threshold, theme);
    } else if (type === "histogram2d") {
      const colorScale = HISTOGRAM_COLOR_SCALES[histogramColorMap] ?? HISTOGRAM_COLOR_SCALES.viridis;
      data = plotted.flatMap(({ entry, records }, index) => {
        const label = seriesLabel(entry, index, type);
        const x = records.map((record) => record.x);
        const y = records.map((record) => record.y);
        const color = SERIES_COLORS[index % SERIES_COLORS.length];
        return [
          { type: "histogram2d", x, y, xaxis: "x", yaxis: "y", name: label, showlegend: false, opacity: plotted.length > 1 ? 0.66 : 1, coloraxis: "coloraxis", hovertemplate: `${entry.xColumn}: %{x}<br>${entry.yColumn}: %{y}<br>Count: %{z}<extra>${label}</extra>`, nbinsx: 40, nbinsy: 40 },
          { type: "histogram", x, xaxis: "x", yaxis: "y2", name: label, legendgroup: `series-${index}`, showlegend: true, marker: { color }, opacity: 0.62, hovertemplate: `${entry.xColumn}: %{x}<br>Count: %{y}<extra>${label} · X marginal</extra>`, nbinsx: 40 },
          { type: "histogram", y, xaxis: "x2", yaxis: "y", name: label, legendgroup: `series-${index}`, showlegend: false, orientation: "h", marker: { color }, opacity: 0.62, hovertemplate: `${entry.yColumn}: %{y}<br>Count: %{x}<extra>${label} · Y marginal</extra>`, nbinsy: 40 }
        ];
      });
      layout.barmode = "overlay";
      layout.coloraxis = { colorscale: colorScale, colorbar: { title: "Count", outlinecolor: theme.line, tickfont: { color: theme.font }, len: 0.76, y: 0.39 } };
      layout.xaxis = { ...axisOptions(xLabel, xScale, xValues, threshold, theme), domain: [0, 0.78] };
      layout.yaxis = { ...axisOptions(yLabel, yScale, yValues, threshold, theme), domain: [0, 0.78] };
      layout.yaxis2 = { ...axisOptions("Count", "linear", [], threshold, theme), domain: [0.84, 1], anchor: "x", showticklabels: false, showgrid: false, title: { text: "", standoff: 0 } };
      layout.xaxis2 = { ...axisOptions("Count", "linear", [], threshold, theme), domain: [0.84, 1], anchor: "y", showticklabels: false, showgrid: false, title: { text: "", standoff: 0 } };
      layout.margin = { l: 62, r: 88, t: 54, b: 58 };
    } else {
      data = plotted.map(({ entry, records }, index) => {
        const label = seriesLabel(entry, index, type);
        const useColorValues = plotted.length === 1 && entry.colorColumn && records.some((record) => record.color !== null);
        return {
          type: supportsWebGL() ? "scattergl" : "scatter", mode: "markers", name: label,
          x: records.map((record) => record.x), y: records.map((record) => record.y),
          marker: useColorValues ? { size: 5, color: records.map((record) => record.color), colorscale: "Viridis", opacity: 0.78, colorbar: { outlinecolor: theme.line, tickfont: { color: theme.font }, title: { text: entry.colorColumn } } } : { size: 5, color: SERIES_COLORS[index % SERIES_COLORS.length], opacity: 0.78 },
          hovertemplate: `${entry.xColumn}: %{x}<br>${entry.yColumn}: %{y}<extra>${label}</extra>`
        };
      });
      layout.xaxis = axisOptions(xLabel, xScale, xValues, threshold, theme);
      layout.yaxis = axisOptions(yLabel, yScale, yValues, threshold, theme);
    }
    await Plotly.react(this.element, data, layout, { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] });
    this.lastOptions = options;
  }

  refreshTheme() { return this.lastOptions ? this.plot(this.lastOptions) : Promise.resolve(); }
  clear() {
    this.table = null; this.columns = []; this.numericColumns = []; this.values.clear(); this.loadedRows = 0; this.lastOptions = null;
    plotlyPromise?.then((plotly) => plotly.purge(this.element));
  }
  requireValues(column) {
    const values = this.values.get(column);
    if (!values) throw new Error(`No sampled numeric values are available for ${column}.`);
    return values;
  }
}

export { MAX_PLOT_ROWS };
