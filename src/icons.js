import {
  BarChart3,
  Circle,
  Crosshair,
  Download,
  FlipHorizontal,
  FlipVertical,
  Grid2X2,
  Maximize2,
  Moon,
  Move,
  Palette,
  RefreshCw,
  RotateCw,
  Square,
  Sun,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  createElement
} from "lucide";

const icons = {
  "bar-chart": BarChart3,
  circle: Circle,
  crosshair: Crosshair,
  download: Download,
  "flip-horizontal": FlipHorizontal,
  "flip-vertical": FlipVertical,
  grid: Grid2X2,
  fit: Maximize2,
  moon: Moon,
  move: Move,
  palette: Palette,
  reset: RefreshCw,
  rotate: RotateCw,
  square: Square,
  sun: Sun,
  trash: Trash2,
  upload: Upload,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut
};

export function icon(name, attributes = {}) {
  const iconNode = icons[name];
  if (!iconNode) {
    throw new Error(`Unknown icon: ${name}`);
  }

  return createElement(iconNode, {
    class: "icon",
    width: 17,
    height: 17,
    "stroke-width": 1.85,
    "aria-hidden": "true",
    ...attributes
  });
}

export function decorateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    element.replaceChildren(icon(element.dataset.icon));
  });
}