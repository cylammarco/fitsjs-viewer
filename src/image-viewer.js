const PALETTES = {
  gray: [[0, [0, 0, 0]], [1, [255, 255, 255]]],
  heat: [[0, [8, 14, 24]], [0.28, [4, 66, 96]], [0.55, [27, 167, 145]], [0.78, [243, 179, 68]], [1, [255, 249, 225]]],
  viridis: [[0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 97]], [1, [253, 231, 37]]],
  cividis: [[0, [0, 32, 76]], [0.25, [40, 76, 112]], [0.5, [101, 114, 112]], [0.75, [170, 153, 90]], [1, [255, 233, 69]]],
  plasma: [[0, [13, 8, 135]], [0.25, [126, 3, 168]], [0.5, [204, 71, 120]], [0.75, [248, 149, 64]], [1, [240, 249, 33]]],
  inferno: [[0, [0, 0, 4]], [0.25, [87, 16, 110]], [0.5, [188, 55, 84]], [0.75, [249, 142, 9]], [1, [252, 255, 164]]],
  cubehelix: [[0, [0, 0, 0]], [0.25, [22, 83, 76]], [0.5, [160, 121, 73]], [0.75, [191, 181, 233]], [1, [255, 255, 255]]],
  blueorange: [[0, [33, 102, 172]], [0.25, [103, 169, 207]], [0.5, [247, 247, 247]], [0.75, [239, 138, 98]], [1, [178, 24, 43]]],
  magma: [[0, [0, 0, 4]], [0.25, [79, 18, 123]], [0.5, [182, 55, 121]], [0.75, [248, 142, 82]], [1, [252, 253, 191]]],
  ice: [[0, [5, 18, 39]], [0.25, [15, 64, 95]], [0.5, [50, 140, 164]], [0.75, [175, 222, 209]], [1, [248, 254, 232]]]
};

const LUT_SIZE = 1024;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quantile(values, fraction) {
  if (values.length === 0) {
    return 0;
  }

  const position = clamp(fraction, 0, 1) * (values.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const blend = position - lower;
  return values[lower] * (1 - blend) + values[upper] * blend;
}

function percentileRank(values, value) {
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (values[middle] < value) lower = middle + 1;
    else upper = middle;
  }
  return values.length > 1 ? lower / (values.length - 1) : 0;
}

function toRgb(value) {
  return value.split(",").map((part) => Number(part.trim()));
}

function formatNumber(value, precision = 5) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (value === 0) {
    return "0";
  }
  const absolute = Math.abs(value);
  if (absolute >= 10000 || absolute < 0.001) {
    return value.toExponential(3);
  }
  return value.toPrecision(precision).replace(/\.0+$/, "");
}

function interpolatePalette(stops, position) {
  const value = clamp(position, 0, 1);
  let rightIndex = stops.findIndex(([stop]) => stop >= value);
  if (rightIndex <= 0) {
    return stops[0][1];
  }
  if (rightIndex < 0) {
    return stops.at(-1)[1];
  }

  const [rightPosition, right] = stops[rightIndex];
  const [leftPosition, left] = stops[rightIndex - 1];
  const ratio = (value - leftPosition) / (rightPosition - leftPosition);
  return left.map((channel, index) => Math.round(channel + (right[index] - channel) * ratio));
}

function binnedValues(values, width, height, factor) {
  if (factor <= 1) return { values: Float64Array.from(values, Number), width, height };
  const outputWidth = Math.ceil(width / factor);
  const outputHeight = Math.ceil(height / factor);
  const output = new Float64Array(outputWidth * outputHeight);
  for (let outputY = 0; outputY < outputHeight; outputY += 1) {
    for (let outputX = 0; outputX < outputWidth; outputX += 1) {
      let sum = 0;
      let count = 0;
      for (let y = outputY * factor; y < Math.min(height, (outputY + 1) * factor); y += 1) {
        for (let x = outputX * factor; x < Math.min(width, (outputX + 1) * factor); x += 1) {
          const value = finiteNumber(values[y * width + x]);
          if (value !== null) { sum += value; count += 1; }
        }
      }
      output[outputY * outputWidth + outputX] = count ? sum / count : Number.NaN;
    }
  }
  return { values: output, width: outputWidth, height: outputHeight };
}

function convolveSeparable(values, width, height, kernel) {
  const radius = Math.floor(kernel.length / 2);
  const temporary = new Float64Array(values.length);
  const output = new Float64Array(values.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let sum = 0; let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sourceX = clamp(x + offset, 0, width - 1);
      const value = finiteNumber(values[y * width + sourceX]);
      if (value !== null) { sum += value * kernel[offset + radius]; weight += kernel[offset + radius]; }
    }
    temporary[y * width + x] = weight ? sum / weight : Number.NaN;
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let sum = 0; let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sourceY = clamp(y + offset, 0, height - 1);
      const value = finiteNumber(temporary[sourceY * width + x]);
      if (value !== null) { sum += value * kernel[offset + radius]; weight += kernel[offset + radius]; }
    }
    output[y * width + x] = weight ? sum / weight : Number.NaN;
  }
  return output;
}

function gaussianFilter(values, width, height, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, index) => Math.exp(-0.5 * ((index - radius) / sigma) ** 2));
  return convolveSeparable(values, width, height, kernel);
}

function medianFilter(values, width, height, size) {
  const radius = Math.floor(size / 2);
  const output = new Float64Array(values.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const neighbourhood = [];
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const sourceX = clamp(x + dx, 0, width - 1);
      const sourceY = clamp(y + dy, 0, height - 1);
      const value = finiteNumber(values[sourceY * width + sourceX]);
      if (value !== null) neighbourhood.push(value);
    }
    neighbourhood.sort((left, right) => left - right);
    output[y * width + x] = neighbourhood.length ? quantile(neighbourhood, 0.5) : Number.NaN;
  }
  return output;
}

export class ImageViewer {
  constructor({ canvas, histogramCanvas, onProbe, onStateChange, onRegionChange, onApertureChange, onCircleMenu }) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    this.histogramCanvas = histogramCanvas;
    this.histogramContext = histogramCanvas.getContext("2d", { alpha: true });
    this.onProbe = onProbe;
    this.onStateChange = onStateChange;
    this.onRegionChange = onRegionChange;
    this.onApertureChange = onApertureChange;
    this.onCircleMenu = onCircleMenu;

    this.image = null;
    this.sample = [];
    this.statistics = null;
    this.queued = false;
    this.drag = null;
    this.pointer = null;
    this.state = this.defaultState();
    this.colorLut = new Uint8ClampedArray(LUT_SIZE * 3);
    this.updateColorLut();
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.queueRender());
    this.resizeObserver.observe(this.canvas);
    this.histogramResizeObserver = new ResizeObserver(() => this.drawHistogram());
    this.histogramResizeObserver.observe(this.histogramCanvas);
  }

  defaultState() {
    return {
      centerX: 0,
      centerY: 0,
      zoom: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      stretch: "asinh",
      palette: "gray",
      invert: false,
      crosshair: true,
      pixelGrid: false,
      aperture: null,
      binning: 1,
      filter: "none",
      filterSize: 1,
      regionMode: "pan",
      regions: [],
      regionDraft: null,
      black: 0,
      white: 1,
      percentileLow: 0.5,
      percentileHigh: 99.5
    };
  }

  bindEvents() {
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!this.image) return;
      const point = this.eventPoint(event);
      const source = this.screenToSource(point.x, point.y);
      const circleIndex = this.circleRegionAt(source);
      if (circleIndex !== null) this.onCircleMenu?.({ index: circleIndex, clientX: event.clientX, clientY: event.clientY });
    });
    this.canvas.addEventListener("wheel", (event) => {
      if (!this.image) {
        return;
      }
      event.preventDefault();
      const point = this.eventPoint(event);
      this.zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, point);
    }, { passive: false });

    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.image) {
        return;
      }
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      const point = this.eventPoint(event);
      const source = this.screenToSource(point.x, point.y);
      const apertureHandle = event.button === 0 ? this.apertureHandleAt(source) : null;
      this.drag = {
        pointerId: event.pointerId,
        screenX: point.x,
        screenY: point.y,
        centerX: this.state.centerX,
        centerY: this.state.centerY,
        black: this.state.black,
        white: this.state.white,
        mode: event.button === 2 ? "levels" : (apertureHandle ?? "view")
      };

      if (event.button === 0 && !apertureHandle && this.state.regionMode !== "pan") {
        this.state.regionDraft = {
          shape: this.state.regionMode,
          start: source,
          end: source
        };
      }
      this.queueRender();
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.image) {
        return;
      }
      const point = this.eventPoint(event);
      const source = this.screenToSource(point.x, point.y);
      this.pointer = source;
      this.emitProbe(source);

      if (!this.drag || this.drag.pointerId !== event.pointerId) {
        this.updateApertureCursor(source);
        this.queueRender();
        return;
      }

      if (this.drag.mode === "levels") {
        this.adjustLevelsFromDrag(point.x - this.drag.screenX, point.y - this.drag.screenY);
      } else if (this.drag.mode.startsWith("aperture-")) {
        this.adjustApertureFromPointer(source, this.drag.mode);
      } else if (this.state.regionDraft) {
        this.state.regionDraft.end = source;
      } else {
        const delta = this.screenDeltaToSource(point.x - this.drag.screenX, point.y - this.drag.screenY);
        this.state.centerX = this.drag.centerX - delta.x;
        this.state.centerY = this.drag.centerY - delta.y;
      }
      this.queueRender();
    });

    this.canvas.addEventListener("pointerup", (event) => this.finishPointer(event));
    this.canvas.addEventListener("pointercancel", (event) => this.finishPointer(event));
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.drag) {
        this.pointer = null;
        this.onProbe?.(null);
        this.queueRender();
      }
    });
  }

  finishPointer(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) {
      return;
    }

    if (this.state.regionDraft) {
      const { start, end } = this.state.regionDraft;
      if (Math.hypot(end.x - start.x, end.y - start.y) > 1) {
        this.state.regions.push(this.state.regionDraft);
        this.onRegionChange?.(this.state.regions);
      }
      this.state.regionDraft = null;
    }

    this.drag = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    this.emitState();
    this.queueRender();
  }

  setImage({ values, image, header, frame = 0 }) {
    this.image = {
      values,
      originalValues: values,
      width: image.width,
      height: image.height,
      originalWidth: image.width,
      originalHeight: image.height,
      header,
      frame,
      type: values.constructor.name
    };
    this.sample = this.buildSample(values);
    this.statistics = this.calculateStatistics(this.sample);
    this.state.centerX = Math.max(0, (this.image.width - 1) / 2);
    this.state.centerY = Math.max(0, (this.image.height - 1) / 2);
    this.state.zoom = 1;
    this.state.rotation = 0;
    this.state.flipX = false;
    this.state.flipY = false;
    this.state.regions = [];
    this.state.regionDraft = null;
    this.state.aperture = null;
    this.state.binning = 1;
    this.state.filter = "none";
    this.state.filterSize = 1;
    this.autoLevels();
    this.emitState();
    this.queueRender();
  }

  clear() {
    this.image = null;
    this.pointer = null;
    this.state.aperture = null;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.histogramContext.clearRect(0, 0, this.histogramCanvas.width, this.histogramCanvas.height);
  }

  resetSettings() {
    this.state = this.defaultState();
    this.pointer = null;
    this.drag = null;
    this.canvas.dataset.mode = this.state.regionMode;
    this.updateColorLut();
    this.emitState();
    this.queueRender();
  }

  buildSample(values) {
    const sample = [];
    const stride = Math.max(1, Math.floor(values.length / 50000));
    for (let index = 0; index < values.length; index += stride) {
      const value = finiteNumber(values[index]);
      if (value !== null) {
        sample.push(value);
      }
    }
    sample.sort((left, right) => left - right);
    return sample;
  }

  calculateStatistics(sample) {
    if (sample.length === 0) {
      return { minimum: 0, maximum: 1, p01: 0, p99: 1 };
    }
    const minimum = sample[0];
    const maximum = sample.at(-1);
    return {
      minimum,
      maximum: maximum === minimum ? minimum + 1 : maximum,
      p01: quantile(sample, 0.01),
      p99: quantile(sample, 0.99)
    };
  }

  autoLevels(low = this.state.percentileLow, high = this.state.percentileHigh) {
    if (!this.statistics || this.sample.length === 0) {
      return;
    }
    const normalizedLow = clamp(Number(low) || 0, 0, 99.9);
    const normalizedHigh = clamp(Number(high) || 100, normalizedLow + 0.1, 100);
    this.state.percentileLow = normalizedLow;
    this.state.percentileHigh = normalizedHigh;
    this.state.black = quantile(this.sample, normalizedLow / 100);
    this.state.white = quantile(this.sample, normalizedHigh / 100);
    if (this.state.white <= this.state.black) {
      this.state.white = this.state.black + 1;
    }
    this.emitState();
    this.queueRender();
  }

  setLevels(black, white) {
    const nextBlack = Number(black);
    const nextWhite = Number(white);
    if (!Number.isFinite(nextBlack) || !Number.isFinite(nextWhite)) {
      return;
    }
    this.state.black = Math.min(nextBlack, nextWhite - Number.EPSILON);
    this.state.white = Math.max(nextWhite, this.state.black + Number.EPSILON);
    this.emitState();
    this.queueRender();
  }

  applyLevelPreset(preset) {
    if (!this.statistics || !this.sample.length) return;
    if (preset === "minmax") {
      this.setLevels(this.statistics.minimum, this.statistics.maximum);
      return;
    }
    if (preset === "zscale") {
      const [black, white] = this.zscaleLevels();
      this.setLevels(black, white);
      return;
    }
    const coverage = clamp(Number(preset), 1, 100);
    const tail = (100 - coverage) / 200;
    this.autoLevels(tail * 100, (1 - tail) * 100);
  }

  zscaleLevels() {
    // This follows the useful part of the IRAF/DS9 ZScale approach: fit a line
    // to sorted sampled pixels, repeatedly reject outliers, then expand the fit
    // around the median by the conventional contrast factor.
    const values = this.sample;
    const middleIndex = Math.floor((values.length - 1) / 2);
    let included = values.map(() => true);
    let slope = 0;
    for (let iteration = 0; iteration < 5; iteration += 1) {
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumXY = 0;
      values.forEach((value, index) => {
        if (!included[index]) return;
        count += 1; sumX += index; sumY += value; sumXX += index * index; sumXY += index * value;
      });
      const denominator = count * sumXX - sumX ** 2;
      if (count < 16 || Math.abs(denominator) < Number.EPSILON) break;
      slope = (count * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / count;
      const residuals = values.reduce((result, value, index) => {
        if (included[index]) result.push(value - (intercept + slope * index));
        return result;
      }, []);
      const residualCenter = quantile([...residuals].sort((left, right) => left - right), 0.5);
      const mad = quantile(residuals.map((value) => Math.abs(value - residualCenter)).sort((left, right) => left - right), 0.5);
      const limit = Math.max(mad * 1.4826 * 2.5, Number.EPSILON);
      const next = values.map((value, index) => included[index] && Math.abs(value - (intercept + slope * index) - residualCenter) <= limit);
      if (next.every((value, index) => value === included[index])) break;
      included = next;
    }
    const median = values[middleIndex];
    const contrast = 0.25;
    return [
      clamp(median - (middleIndex * slope) / contrast, this.statistics.minimum, this.statistics.maximum),
      clamp(median + ((values.length - 1 - middleIndex) * slope) / contrast, this.statistics.minimum, this.statistics.maximum)
    ];
  }

  adjustLevelsFromDrag(deltaX, deltaY) {
    const initialRange = Math.max(this.drag.white - this.drag.black, Number.EPSILON);
    const shift = (deltaX / Math.max(this.canvas.width, 1)) * initialRange;
    const range = initialRange * Math.exp(deltaY / Math.max(this.canvas.height * 0.55, 1));
    const center = (this.drag.black + this.drag.white) / 2 + shift;
    this.state.black = center - range / 2;
    this.state.white = center + range / 2;
    this.state.percentileLow = percentileRank(this.sample, this.state.black) * 100;
    this.state.percentileHigh = percentileRank(this.sample, this.state.white) * 100;
    this.emitState();
    this.queueRender();
  }

  setDisplayOption(option, value) {
    if (!(option in this.state)) {
      return;
    }
    this.state[option] = value;
    if (option === "palette" || option === "invert") {
      this.updateColorLut();
    }
    this.emitState();
    this.queueRender();
  }

  setProcessingOptions({ binning = this.state.binning, filter = this.state.filter, filterSize = this.state.filterSize }) {
    if (!this.image) return;
    const normalizedBinning = [1, 2, 4, 8].includes(Number(binning)) ? Number(binning) : 1;
    const normalizedFilter = ["none", "gaussian", "median"].includes(filter) ? filter : "none";
    const normalizedSize = clamp(Number(filterSize) || 1, 0.2, 15);
    const binned = binnedValues(this.image.originalValues, this.image.originalWidth, this.image.originalHeight, normalizedBinning);
    let values = binned.values;
    if (normalizedFilter === "gaussian") values = gaussianFilter(values, binned.width, binned.height, normalizedSize);
    if (normalizedFilter === "median") {
      let windowSize = Math.max(1, Math.round(normalizedSize));
      if (windowSize % 2 === 0) windowSize += 1;
      values = medianFilter(values, binned.width, binned.height, Math.min(windowSize, 15));
    }
    this.image.values = values;
    this.image.width = binned.width;
    this.image.height = binned.height;
    this.state.binning = normalizedBinning;
    this.state.filter = normalizedFilter;
    this.state.filterSize = normalizedSize;
    this.state.centerX = (binned.width - 1) / 2;
    this.state.centerY = (binned.height - 1) / 2;
    this.state.zoom = 1;
    this.state.regions = [];
    this.state.regionDraft = null;
    this.sample = this.buildSample(values);
    this.statistics = this.calculateStatistics(this.sample);
    this.autoLevels();
    this.onRegionChange?.([]);
    this.emitState();
    this.queueRender();
  }

  setRegionMode(mode) {
    if (!["pan", "circle"].includes(mode)) return;
    this.state.regionMode = mode;
    this.canvas.dataset.mode = mode;
    this.emitState();
  }

  clearRegions() {
    this.state.regions = [];
    this.state.regionDraft = null;
    this.onRegionChange?.(this.state.regions);
    this.queueRender();
  }

  circleRegionAt(source) {
    let match = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.state.regions.forEach((region, index) => {
      if (region.shape !== "circle") return;
      const radius = Math.hypot(region.end.x - region.start.x, region.end.y - region.start.y);
      const distance = Math.hypot(source.x - region.start.x, source.y - region.start.y);
      if (distance <= radius && distance < bestDistance) { match = index; bestDistance = distance; }
    });
    return match;
  }

  circleCatalog() {
    return this.state.regions.flatMap((region, index) => {
      if (region.shape !== "circle") return [];
      const fits = this.sourceToFits(region.start.x, region.start.y);
      const world = this.worldCoordinateAt(region.start.x, region.start.y);
      return [{ index, x: fits.x, y: fits.y, ra: world?.ra ?? null, dec: world?.dec ?? null, radius: Math.hypot(region.end.x - region.start.x, region.end.y - region.start.y) * this.state.binning }];
    });
  }

  centroidCircle(index) {
    const region = this.state.regions[index];
    if (!region || region.shape !== "circle" || !this.image) return null;
    const radius = Math.hypot(region.end.x - region.start.x, region.end.y - region.start.y);
    const startX = Math.max(0, Math.floor(region.start.x - radius));
    const endX = Math.min(this.image.width - 1, Math.ceil(region.start.x + radius));
    const startY = Math.max(0, Math.floor(region.start.y - radius));
    const endY = Math.min(this.image.height - 1, Math.ceil(region.start.y + radius));
    const samples = [];
    for (let y = startY; y <= endY; y += 1) for (let x = startX; x <= endX; x += 1) {
      if (Math.hypot(x + 0.5 - region.start.x, y + 0.5 - region.start.y) > radius) continue;
      const value = finiteNumber(this.image.values[y * this.image.width + x]);
      if (value !== null) samples.push({ x: x + 0.5, y: y + 0.5, value });
    }
    if (!samples.length) return null;
    const sorted = samples.map((sample) => sample.value).sort((left, right) => left - right);
    const background = quantile(sorted, 0.25);
    let weightSum = 0; let weightedX = 0; let weightedY = 0;
    for (const sample of samples) {
      const weight = Math.max(0, sample.value - background);
      weightSum += weight; weightedX += sample.x * weight; weightedY += sample.y * weight;
    }
    if (weightSum <= 0) return null;
    const nextX = weightedX / weightSum;
    const nextY = weightedY / weightSum;
    const dx = nextX - region.start.x;
    const dy = nextY - region.start.y;
    region.start = { x: nextX, y: nextY };
    region.end = { x: region.end.x + dx, y: region.end.y + dy };
    this.onRegionChange?.(this.state.regions);
    this.queueRender();
    return this.circleCatalog().find((circle) => circle.index === index) ?? null;
  }

  centroidAllCircles() {
    const results = [];
    this.state.regions.forEach((region, index) => { if (region.shape === "circle") results.push(this.centroidCircle(index)); });
    return results.filter(Boolean);
  }

  removeRegion(index) {
    if (index < 0 || index >= this.state.regions.length) return;
    this.state.regions.splice(index, 1);
    this.onRegionChange?.(this.state.regions);
    this.queueRender();
  }

  getPointer() {
    if (!this.pointer || !this.image) return null;
    const x = Math.floor(this.pointer.x);
    const y = Math.floor(this.pointer.y);
    if (x < 0 || y < 0 || x >= this.image.width || y >= this.image.height) return null;
    return { x: x + 1, y: y + 1 };
  }

  setApertureOverlay(aperture) {
    if (!aperture) {
      this.state.aperture = null;
    } else {
      const values = [aperture.x, aperture.y, aperture.radius, aperture.annulusInner, aperture.annulusOuter];
      this.state.aperture = values.every(Number.isFinite) && aperture.radius > 0 && aperture.annulusInner > aperture.radius && aperture.annulusOuter > aperture.annulusInner ? aperture : null;
    }
    this.queueRender();
  }

  apertureHandleAt(source) {
    const aperture = this.state.aperture;
    if (!aperture) return null;
    const centerX = aperture.x - 0.5;
    const centerY = aperture.y - 0.5;
    const distance = Math.hypot(source.x - centerX, source.y - centerY);
    const tolerance = Math.max(0.65, 9 / Math.max(this.getScale(), 1));
    if (distance <= tolerance) return "aperture-center";
    const rings = [["aperture-radius", aperture.radius], ["aperture-inner", aperture.annulusInner], ["aperture-outer", aperture.annulusOuter]];
    return rings.find(([, radius]) => Math.abs(distance - radius) <= tolerance)?.[0] ?? null;
  }

  updateApertureCursor(source) {
    const handle = this.apertureHandleAt(source);
    this.canvas.style.cursor = handle === "aperture-center" ? "move" : handle ? "ew-resize" : "";
  }

  adjustApertureFromPointer(source, mode) {
    const current = this.state.aperture;
    if (!current) return;
    const next = { ...current };
    if (mode === "aperture-center") {
      next.x = source.x + 0.5;
      next.y = source.y + 0.5;
    } else {
      const centerX = current.x - 0.5;
      const centerY = current.y - 0.5;
      const distance = Math.max(0.1, Math.hypot(source.x - centerX, source.y - centerY));
      if (mode === "aperture-radius") next.radius = Math.min(distance, current.annulusInner - 0.1);
      if (mode === "aperture-inner") next.annulusInner = clamp(distance, current.radius + 0.1, current.annulusOuter - 0.1);
      if (mode === "aperture-outer") next.annulusOuter = Math.max(distance, current.annulusInner + 0.1);
    }
    this.state.aperture = next;
    this.onApertureChange?.(next);
    this.queueRender();
  }

  aperturePhotometry({ x, y, radius, annulusInner, annulusOuter, exposureTime = null, zeroPoint = null }) {
    if (!this.image) throw new Error("Load an image before measuring photometry.");
    const parameters = [x, y, radius, annulusInner, annulusOuter].map(Number);
    if (!parameters.every(Number.isFinite) || radius <= 0 || annulusInner <= radius || annulusOuter <= annulusInner) {
      throw new Error("Use finite X/Y coordinates and radii with aperture < annulus inner < annulus outer.");
    }
    // UI coordinates are FITS-style 1-based pixel centres; sampled image coordinates are 0-based.
    const centerX = x - 0.5;
    const centerY = y - 0.5;
    const outerSquared = annulusOuter ** 2;
    const innerSquared = annulusInner ** 2;
    const apertureSquared = radius ** 2;
    const startX = Math.max(0, Math.floor(centerX - annulusOuter));
    const endX = Math.min(this.image.width - 1, Math.ceil(centerX + annulusOuter));
    const startY = Math.max(0, Math.floor(centerY - annulusOuter));
    const endY = Math.min(this.image.height - 1, Math.ceil(centerY + annulusOuter));
    let apertureSum = 0;
    let aperturePixels = 0;
    const skyPixels = [];
    for (let pixelY = startY; pixelY <= endY; pixelY += 1) {
      for (let pixelX = startX; pixelX <= endX; pixelX += 1) {
        const dx = pixelX + 0.5 - centerX;
        const dy = pixelY + 0.5 - centerY;
        const distanceSquared = dx ** 2 + dy ** 2;
        if (distanceSquared > outerSquared) continue;
        const value = finiteNumber(this.image.values[pixelY * this.image.width + pixelX]);
        if (value === null) continue;
        if (distanceSquared <= apertureSquared) {
          apertureSum += value;
          aperturePixels += 1;
        } else if (distanceSquared >= innerSquared) {
          skyPixels.push(value);
        }
      }
    }
    if (!aperturePixels) throw new Error("The aperture does not contain valid image pixels.");
    if (skyPixels.length < 8) throw new Error("The annulus needs at least 8 valid pixels for a median background.");
    skyPixels.sort((left, right) => left - right);
    const backgroundMedian = quantile(skyPixels, 0.5);
    const backgroundCounts = backgroundMedian * aperturePixels;
    const netCounts = apertureSum - backgroundCounts;
    const normalizedExposure = finiteNumber(exposureTime);
    const normalizedZeroPoint = finiteNumber(zeroPoint);
    const countRate = normalizedExposure !== null && normalizedExposure > 0 ? netCounts / normalizedExposure : null;
    const magnitude = countRate !== null && countRate > 0 && normalizedZeroPoint !== null ? normalizedZeroPoint - 2.5 * Math.log10(countRate) : null;
    return {
      x, y, radius, annulusInner, annulusOuter,
      apertureSum, aperturePixels, backgroundMedian, backgroundCounts, netCounts,
      annulusPixels: skyPixels.length, countRate, magnitude,
      clipped: aperturePixels < Math.PI * apertureSquared * 0.85
    };
  }

  resetView() {
    if (!this.image) {
      return;
    }
    this.state.centerX = Math.max(0, (this.image.width - 1) / 2);
    this.state.centerY = Math.max(0, (this.image.height - 1) / 2);
    this.state.zoom = 1;
    this.state.rotation = 0;
    this.state.flipX = false;
    this.state.flipY = false;
    this.emitState();
    this.queueRender();
  }

  rotate() {
    this.state.rotation = (this.state.rotation + 90) % 360;
    this.emitState();
    this.queueRender();
  }

  toggleFlip(axis) {
    this.state[axis] = !this.state[axis];
    this.emitState();
    this.queueRender();
  }

  zoomBy(factor, anchor = null) {
    if (!this.image) {
      return;
    }
    const focus = anchor ?? { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const sourceBefore = this.screenToSource(focus.x, focus.y);
    this.state.zoom = clamp(this.state.zoom * factor, 0.15, 80);
    const sourceAfter = this.screenToSource(focus.x, focus.y);
    this.state.centerX += sourceBefore.x - sourceAfter.x;
    this.state.centerY += sourceBefore.y - sourceAfter.y;
    this.emitState();
    this.queueRender();
  }

  exportPng(name = "fits-view.png") {
    this.canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  getState() {
    return {
      ...this.state,
      statistics: this.statistics,
      image: this.image
    };
  }

  setTheme() {
    this.queueRender();
  }

  eventPoint(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (this.canvas.width / Math.max(bounds.width, 1)),
      y: (event.clientY - bounds.top) * (this.canvas.height / Math.max(bounds.height, 1))
    };
  }

  syncCanvasSize(canvas, context) {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = false;
    }
  }

  getScale() {
    if (!this.image || this.canvas.width === 0 || this.canvas.height === 0) {
      return 1;
    }
    const isQuarterTurn = this.state.rotation === 90 || this.state.rotation === 270;
    const displayWidth = isQuarterTurn ? this.image.height : this.image.width;
    const displayHeight = isQuarterTurn ? this.image.width : this.image.height;
    return Math.min(this.canvas.width / displayWidth, this.canvas.height / displayHeight) * 0.92 * this.state.zoom;
  }

  sourceToScreen(x, y) {
    const scale = this.getScale();
    let deltaX = x - this.state.centerX;
    let deltaY = y - this.state.centerY;
    if (this.state.flipX) {
      deltaX *= -1;
    }
    if (this.state.flipY) {
      deltaY *= -1;
    }

    let screenX = deltaX;
    let screenY = deltaY;
    if (this.state.rotation === 90) {
      screenX = -deltaY;
      screenY = deltaX;
    } else if (this.state.rotation === 180) {
      screenX = -deltaX;
      screenY = -deltaY;
    } else if (this.state.rotation === 270) {
      screenX = deltaY;
      screenY = -deltaX;
    }
    return {
      x: this.canvas.width / 2 + screenX * scale,
      y: this.canvas.height / 2 + screenY * scale
    };
  }

  screenToSource(screenX, screenY) {
    const scale = this.getScale();
    let deltaX = (screenX - this.canvas.width / 2) / scale;
    let deltaY = (screenY - this.canvas.height / 2) / scale;
    if (this.state.rotation === 90) {
      [deltaX, deltaY] = [deltaY, -deltaX];
    } else if (this.state.rotation === 180) {
      deltaX *= -1;
      deltaY *= -1;
    } else if (this.state.rotation === 270) {
      [deltaX, deltaY] = [-deltaY, deltaX];
    }
    if (this.state.flipX) {
      deltaX *= -1;
    }
    if (this.state.flipY) {
      deltaY *= -1;
    }
    return {
      x: this.state.centerX + deltaX,
      y: this.state.centerY + deltaY
    };
  }

  screenDeltaToSource(deltaScreenX, deltaScreenY) {
    const scale = this.getScale();
    let deltaX = deltaScreenX / scale;
    let deltaY = deltaScreenY / scale;
    if (this.state.rotation === 90) {
      [deltaX, deltaY] = [deltaY, -deltaX];
    } else if (this.state.rotation === 180) {
      deltaX *= -1;
      deltaY *= -1;
    } else if (this.state.rotation === 270) {
      [deltaX, deltaY] = [-deltaY, deltaX];
    }
    if (this.state.flipX) {
      deltaX *= -1;
    }
    if (this.state.flipY) {
      deltaY *= -1;
    }
    return { x: deltaX, y: deltaY };
  }

  normalize(value) {
    const range = this.state.white - this.state.black;
    const clipped = clamp((value - this.state.black) / range, 0, 1);
    switch (this.state.stretch) {
      case "log":
        return Math.log1p(clipped * 999) / Math.log(1000);
      case "sqrt":
        return Math.sqrt(clipped);
      case "square":
        return clipped ** 2;
      case "asinh":
        return Math.asinh(clipped * 10) / Math.asinh(10);
      case "sinh":
        return Math.sinh(clipped * 3) / Math.sinh(3);
      case "histeq":
        {
          const low = percentileRank(this.sample, this.state.black);
          const high = percentileRank(this.sample, this.state.white);
          return clamp((percentileRank(this.sample, value) - low) / Math.max(high - low, Number.EPSILON), 0, 1);
        }
      default:
        return clipped;
    }
  }

  updateColorLut() {
    const palette = PALETTES[this.state.palette] ?? PALETTES.gray;
    for (let index = 0; index < LUT_SIZE; index += 1) {
      const position = this.state.invert ? 1 - index / (LUT_SIZE - 1) : index / (LUT_SIZE - 1);
      const [red, green, blue] = interpolatePalette(palette, position);
      const offset = index * 3;
      this.colorLut[offset] = red;
      this.colorLut[offset + 1] = green;
      this.colorLut[offset + 2] = blue;
    }
  }

  queueRender() {
    if (this.queued) {
      return;
    }
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.render();
    });
  }

  render() {
    if (!this.image) {
      return;
    }
    this.syncCanvasSize(this.canvas, this.context);
    this.renderImage();
    this.drawHistogram();
  }

  renderImage() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const imageData = this.context.createImageData(width, height);
    const pixels = imageData.data;
    const colors = getComputedStyle(document.documentElement);
    const background = toRgb(colors.getPropertyValue("--viewer-rgb"));
    const scale = this.getScale();
    const centerScreenX = width / 2;
    const centerScreenY = height / 2;
    const rotation = this.state.rotation;

    for (let screenY = 0; screenY < height; screenY += 1) {
      const displayY = (screenY - centerScreenY) / scale;
      for (let screenX = 0; screenX < width; screenX += 1) {
        let displayX = (screenX - centerScreenX) / scale;
        let sourceX = displayX;
        let sourceY = displayY;
        if (rotation === 90) {
          sourceX = displayY;
          sourceY = -displayX;
        } else if (rotation === 180) {
          sourceX = -displayX;
          sourceY = -displayY;
        } else if (rotation === 270) {
          sourceX = -displayY;
          sourceY = displayX;
        }
        if (this.state.flipX) {
          sourceX *= -1;
        }
        if (this.state.flipY) {
          sourceY *= -1;
        }
        sourceX += this.state.centerX;
        sourceY += this.state.centerY;

        const offset = (screenY * width + screenX) * 4;
        const pixelX = Math.floor(sourceX);
        const pixelY = Math.floor(sourceY);
        if (pixelX < 0 || pixelX >= this.image.width || pixelY < 0 || pixelY >= this.image.height) {
          pixels[offset] = background[0];
          pixels[offset + 1] = background[1];
          pixels[offset + 2] = background[2];
          pixels[offset + 3] = 255;
          continue;
        }

        const value = finiteNumber(this.image.values[pixelY * this.image.width + pixelX]);
        if (value === null) {
          pixels[offset] = background[0];
          pixels[offset + 1] = background[1];
          pixels[offset + 2] = background[2];
          pixels[offset + 3] = 255;
          continue;
        }
        const colorOffset = Math.round(this.normalize(value) * (LUT_SIZE - 1)) * 3;
        pixels[offset] = this.colorLut[colorOffset];
        pixels[offset + 1] = this.colorLut[colorOffset + 1];
        pixels[offset + 2] = this.colorLut[colorOffset + 2];
        pixels[offset + 3] = 255;
      }
    }

    this.context.putImageData(imageData, 0, 0);
    this.drawOverlays();
  }

  drawOverlays() {
    const colors = getComputedStyle(document.documentElement);
    const overlay = colors.getPropertyValue("--viewer-overlay").trim();
    const regionColor = colors.getPropertyValue("--region-color").trim();
    const lineWidth = Math.max(1, Math.round((window.devicePixelRatio || 1) * 0.85));
    this.context.save();
    this.context.lineWidth = lineWidth;

    if (this.state.crosshair && this.pointer) {
      const point = this.sourceToScreen(this.pointer.x, this.pointer.y);
      this.context.strokeStyle = overlay;
      this.context.setLineDash([5 * lineWidth, 4 * lineWidth]);
      this.context.beginPath();
      this.context.moveTo(0, point.y);
      this.context.lineTo(this.canvas.width, point.y);
      this.context.moveTo(point.x, 0);
      this.context.lineTo(point.x, this.canvas.height);
      this.context.stroke();
      this.context.setLineDash([]);
    }

    const regions = [...this.state.regions, ...(this.state.regionDraft ? [this.state.regionDraft] : [])];
    this.context.strokeStyle = regionColor;
    let circleNumber = 0;
    for (const region of regions) {
      this.drawRegion(region, circleNumber);
      if (region.shape === "circle") circleNumber += 1;
    }
    if (this.state.aperture) this.drawApertureOverlay(this.state.aperture);
    if (this.state.pixelGrid && this.getScale() >= 7) this.drawPixelGrid();
    this.context.restore();
  }

  drawApertureOverlay(aperture) {
    const center = this.sourceToScreen(aperture.x - 0.5, aperture.y - 0.5);
    const edge = this.sourceToScreen(aperture.x - 0.5 + aperture.radius, aperture.y - 0.5);
    const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
    const innerEdge = this.sourceToScreen(aperture.x - 0.5 + aperture.annulusInner, aperture.y - 0.5);
    const outerEdge = this.sourceToScreen(aperture.x - 0.5 + aperture.annulusOuter, aperture.y - 0.5);
    const colors = getComputedStyle(document.documentElement);
    this.context.save();
    this.context.strokeStyle = colors.getPropertyValue("--photometry-aperture").trim() || "#ffcf5a";
    this.context.lineWidth = Math.max(3, (window.devicePixelRatio || 1) * 3.3);
    [radius, Math.hypot(innerEdge.x - center.x, innerEdge.y - center.y), Math.hypot(outerEdge.x - center.x, outerEdge.y - center.y)].forEach((value, index) => {
      this.context.setLineDash(index === 0 ? [] : [5, 4]);
      this.context.beginPath(); this.context.arc(center.x, center.y, value, 0, Math.PI * 2); this.context.stroke();
    });
    this.context.setLineDash([]);
    this.context.beginPath(); this.context.moveTo(center.x - 4, center.y); this.context.lineTo(center.x + 4, center.y); this.context.moveTo(center.x, center.y - 4); this.context.lineTo(center.x, center.y + 4); this.context.stroke();
    this.context.restore();
  }

  drawPixelGrid() {
    const scale = this.getScale();
    const topLeft = this.screenToSource(0, 0);
    const bottomRight = this.screenToSource(this.canvas.width, this.canvas.height);
    const minX = Math.max(0, Math.floor(Math.min(topLeft.x, bottomRight.x)) - 1);
    const maxX = Math.min(this.image.width, Math.ceil(Math.max(topLeft.x, bottomRight.x)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(topLeft.y, bottomRight.y)) - 1);
    const maxY = Math.min(this.image.height, Math.ceil(Math.max(topLeft.y, bottomRight.y)) + 1);
    this.context.save();
    this.context.strokeStyle = "rgba(255, 255, 255, 0.28)";
    this.context.lineWidth = 1;
    for (let x = minX; x <= maxX; x += 1) {
      const start = this.sourceToScreen(x, minY);
      const end = this.sourceToScreen(x, maxY);
      this.context.beginPath(); this.context.moveTo(start.x - scale / 2, start.y); this.context.lineTo(end.x - scale / 2, end.y); this.context.stroke();
    }
    for (let y = minY; y <= maxY; y += 1) {
      const start = this.sourceToScreen(minX, y);
      const end = this.sourceToScreen(maxX, y);
      this.context.beginPath(); this.context.moveTo(start.x, start.y - scale / 2); this.context.lineTo(end.x, end.y - scale / 2); this.context.stroke();
    }
    this.context.restore();
  }

  drawRegion(region, index = 0) {
    if (region.shape === "circle") {
      const center = this.sourceToScreen(region.start.x, region.start.y);
      const edge = this.sourceToScreen(region.end.x, region.end.y);
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      this.context.beginPath();
      this.context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      this.context.stroke();
      this.context.save();
      this.context.fillStyle = this.context.strokeStyle;
      this.context.font = `${Math.max(11, 10 * (window.devicePixelRatio || 1))}px DM Mono, monospace`;
      this.context.fillText(String(index + 1), center.x + radius + 5, center.y - 5);
      this.context.restore();
      return;
    }

    const startX = Math.min(region.start.x, region.end.x);
    const endX = Math.max(region.start.x, region.end.x);
    const startY = Math.min(region.start.y, region.end.y);
    const endY = Math.max(region.start.y, region.end.y);
    const corners = [
      this.sourceToScreen(startX, startY),
      this.sourceToScreen(endX, startY),
      this.sourceToScreen(endX, endY),
      this.sourceToScreen(startX, endY)
    ];
    this.context.beginPath();
    this.context.moveTo(corners[0].x, corners[0].y);
    for (const corner of corners.slice(1)) {
      this.context.lineTo(corner.x, corner.y);
    }
    this.context.closePath();
    this.context.stroke();
  }

  drawHistogram() {
    if (!this.statistics || this.sample.length === 0) {
      return;
    }
    this.syncCanvasSize(this.histogramCanvas, this.histogramContext);
    const width = this.histogramCanvas.width;
    const height = this.histogramCanvas.height;
    const context = this.histogramContext;
    const colors = getComputedStyle(document.documentElement);
    const bins = new Uint32Array(60);
    const range = this.statistics.maximum - this.statistics.minimum;

    for (const value of this.sample) {
      const index = clamp(Math.floor(((value - this.statistics.minimum) / range) * bins.length), 0, bins.length - 1);
      bins[index] += 1;
    }
    const maxBin = Math.max(...bins, 1);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.getPropertyValue("--histogram-fill").trim();
    const barWidth = width / bins.length;
    bins.forEach((count, index) => {
      const barHeight = (count / maxBin) * (height - 4);
      context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
    });

    context.strokeStyle = colors.getPropertyValue("--histogram-level").trim();
    context.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    for (const level of [this.state.black, this.state.white]) {
      const x = clamp((level - this.statistics.minimum) / range, 0, 1) * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  emitProbe(source) {
    if (!this.image) {
      this.onProbe?.(null);
      return;
    }
    const pixelX = Math.floor(source.x);
    const pixelY = Math.floor(source.y);
    if (pixelX < 0 || pixelX >= this.image.width || pixelY < 0 || pixelY >= this.image.height) {
      this.onProbe?.(null);
      return;
    }
    const value = finiteNumber(this.image.values[pixelY * this.image.width + pixelX]);
    const fits = this.sourceToFits(pixelX + 0.5, pixelY + 0.5);
    this.onProbe?.({
      x: fits.x,
      y: fits.y,
      value,
      world: this.worldCoordinate(pixelX, pixelY)
    });
  }

  worldCoordinate(x, y) {
    return this.worldCoordinateAt(x + 0.5, y + 0.5);
  }

  sourceToFits(x, y) {
    return { x: x * this.state.binning + 0.5, y: y * this.state.binning + 0.5 };
  }

  worldCoordinateAt(x, y) {
    const header = this.image?.header;
    if (!header) {
      return null;
    }
    const values = ["CRPIX1", "CRPIX2", "CRVAL1", "CRVAL2"].map((key) => finiteNumber(header.get(key)));
    if (values.some((value) => value === null)) {
      return null;
    }
    const [crpix1, crpix2, crval1, crval2] = values;
    const cd11 = finiteNumber(header.get("CD1_1")) ?? finiteNumber(header.get("CDELT1"));
    const cd22 = finiteNumber(header.get("CD2_2")) ?? finiteNumber(header.get("CDELT2"));
    const cd12 = finiteNumber(header.get("CD1_2")) ?? 0;
    const cd21 = finiteNumber(header.get("CD2_1")) ?? 0;
    if (cd11 === null || cd22 === null) {
      return null;
    }
    const fits = this.sourceToFits(x, y);
    const deltaX = fits.x - crpix1;
    const deltaY = fits.y - crpix2;
    return {
      ra: crval1 + cd11 * deltaX + cd12 * deltaY,
      dec: crval2 + cd21 * deltaX + cd22 * deltaY
    };
  }

  emitState() {
    this.onStateChange?.(this.getState());
  }
}

export { formatNumber };
