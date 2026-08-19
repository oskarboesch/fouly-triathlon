// Downloads real elevation data (SRTM-derived "Terrarium" tiles, public
// domain, hosted by AWS Open Data) for the region around the course and
// bakes it into js/terrain-data.js as a plain lat/lon elevation grid.
//
// This is a generation step, not something the site does at runtime — the
// site can't fetch anything at runtime anyway when opened via file://.
// Re-run after changing MARGIN_DEG / GRID_W below, or if a GPX file moves
// the course meaningfully.
//
// Usage: node scripts/generate-terrain-data.mjs

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MARGIN_DEG = 0.09; // ~9-10km of surrounding terrain beyond the course bbox
const ZOOM = 12; // ~30m/px at this latitude — plenty for a background mesh
const GRID_W = 220; // output grid resolution (kept moderate for mesh size)

function parseGpx(text) {
  return [...text.matchAll(/<rtept lat="([-0-9.]+)" lon="([-0-9.]+)">/g)].map((m) => ({
    lat: parseFloat(m[1]),
    lon: parseFloat(m[2]),
  }));
}

function courseBounds() {
  const files = ["gpx/Natation-champex.gpx", "gpx/35km-champex--_-Fouly.gpx", "gpx/Fouly-6km.gpx"];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const f of files) {
    for (const p of parseGpx(fs.readFileSync(path.join(root, f), "utf-8"))) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`${url} -> HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function terrariumElevation(png, px, py) {
  px = Math.min(Math.max(px, 0), png.width - 1);
  py = Math.min(Math.max(py, 0), png.height - 1);
  const idx = (py * png.width + px) * 4;
  const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
  return r * 256 + g + b / 256 - 32768;
}

async function main() {
  const bounds = courseBounds();
  const minLat = bounds.minLat - MARGIN_DEG;
  const maxLat = bounds.maxLat + MARGIN_DEG;
  const minLon = bounds.minLon - MARGIN_DEG * 1.6; // a bit more east/west margin (wide valley view)
  const maxLon = bounds.maxLon + MARGIN_DEG * 1.6;
  console.log("terrain bbox:", { minLat, maxLat, minLon, maxLon });

  const tl = lonLatToTile(minLon, maxLat, ZOOM); // top-left (max lat = smaller y)
  const br = lonLatToTile(maxLon, minLat, ZOOM);
  const xMin = Math.floor(tl.x), xMax = Math.floor(br.x);
  const yMin = Math.floor(tl.y), yMax = Math.floor(br.y);
  console.log(`fetching tiles z${ZOOM} x[${xMin}-${xMax}] y[${yMin}-${yMax}] (${(xMax - xMin + 1) * (yMax - yMin + 1)} tiles)`);

  const tiles = new Map();
  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
      const buf = await fetchBuffer(url);
      tiles.set(`${tx},${ty}`, PNG.sync.read(buf));
      process.stdout.write(".");
    }
  }
  console.log(" done");

  function sampleElevation(lon, lat) {
    const { x, y } = lonLatToTile(lon, lat, ZOOM);
    const tx = Math.floor(x), ty = Math.floor(y);
    const png = tiles.get(`${tx},${ty}`);
    if (!png) return 0;
    const px = (x - tx) * 256;
    const py = (y - ty) * 256;
    // Bilinear interpolation between the 4 nearest pixels.
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const fx = px - x0, fy = py - y0;
    const e00 = terrariumElevation(png, x0, y0);
    const e10 = terrariumElevation(png, x0 + 1, y0);
    const e01 = terrariumElevation(png, x0, y0 + 1);
    const e11 = terrariumElevation(png, x0 + 1, y0 + 1);
    return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;
  }

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const gridW = GRID_W;
  const gridH = Math.round(GRID_W * (latSpan / lonSpan));

  const elevations = new Array(gridW * gridH);
  for (let j = 0; j < gridH; j++) {
    const lat = maxLat - (j / (gridH - 1)) * latSpan; // row 0 = north edge
    for (let i = 0; i < gridW; i++) {
      const lon = minLon + (i / (gridW - 1)) * lonSpan;
      elevations[j * gridW + i] = Math.round(sampleElevation(lon, lat));
    }
  }

  const out = `// AUTO-GENERATED by scripts/generate-terrain-data.mjs — do not edit by hand.
// Source: AWS Open Data "Terrarium" elevation tiles (SRTM-derived, public domain).
window.terrainData = ${JSON.stringify({ minLat, maxLat, minLon, maxLon, gridW, gridH, elevations })};
`;
  fs.writeFileSync(path.join(root, "js/terrain-data.js"), out);
  console.log(`Wrote js/terrain-data.js: ${gridW}x${gridH} grid`);
  console.log("elevation range:", Math.min(...elevations), "-", Math.max(...elevations));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
