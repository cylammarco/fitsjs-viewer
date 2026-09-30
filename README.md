# FITS Viewer

[Open FITS Viewer](https://cylammarco.github.io/fitsjs-viewer/)

Browser-native FITS image and table application for GitHub Pages, built on [FITS.js](https://github.com/cylammarco/fitsjs). FITS.js is an explicit runtime dependency; the viewer does not carry a private parser copy.

## Features

- Drag/drop or choose local FITS files with multi-HDU navigation and raw header cards.
- Image/cube viewer with pan, zoom, frame selection, rotation, flips, crosshair pixel/WCS probe, circle regions, PNG export, ten colour maps, linear/log/sqrt/asinh stretches, percentile levels, histogram, configurable binning, Gaussian/median filtering, and basic circular-aperture photometry with a median sky annulus. Exposure time and magnitude zeropoint are read from common FITS header keywords and remain editable.
- Multi-circle catalogue with pixel/WCS centres, per-circle or batch intensity-weighted centroiding, and a right-click action menu.
- Binary and ASCII table viewer with progressive chunk loading or warned full-table loading, plus progressively expandable Plotly samples for scatter plots, 1D histograms, 2D histograms, linear/log/symlog axes, and optional scatter coloring.
- Responsive desktop, tablet, and mobile layouts, including top-positioned HDU navigation on narrow screens.
- One-click viewer refresh restores default analysis and display settings while retaining the loaded FITS file.
- Light/dark theme toggle; visual language follows the FITS.js inspector teal/coral palette.

## Dependency

FITS Viewer imports `FitsFile` from the `fitsjs` package. Its dependency is pinned to a FITS.js GitHub source revision until the current ESM release is published to npm. Install normally with `npm install`; no sibling checkout or SSH configuration is required.

## Local Development

```sh
npm install
npm run dev
```

Build the static site:

```sh
npm run build
```

## GitHub Pages

This repository is initialized locally at `~/git/fitsjs-viewer`. Create an empty GitHub repository, add it as `origin`, commit, and push `main`:

```sh
git remote add origin https://github.com/<owner>/fitsjs-viewer.git
git add .
git commit -m "Initial FITS Viewer"
git push -u origin main
```

In GitHub repository settings, enable **Pages** with **GitHub Actions** as the source. The workflow in `.github/workflows/deploy-pages.yml` installs dependencies, builds Vite with relative asset paths, and deploys `dist`.

## Limits

- The FITS parser supports standard images, cubes, binary tables, and ASCII tables. Compressed images and gzip-wrapped FITS files are not decoded in this build.
- Table plotting samples at most 25,000 rows to keep browser interaction responsive.
- Plotly loads only when a table HDU is opened.
