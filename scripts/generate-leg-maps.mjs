// Downloads real OpenStreetMap tiles for each leg's own bounding box,
// stitches/crops them into one small static image per leg, and records the
// exact Web Mercator pixel origin + zoom so the client can draw the GPX
// path in the same pixel space and have it line up perfectly over the map.
//
// This mirrors the terrain-data approach: baked in at build time, so the
// site has no runtime fetch dependency for this either (only the map
// *images* are loaded like any other <img>, which works fine even via
// file://, but the alignment data is static so nothing needs live tile math
// in the browser beyond simple Web Mercator projection).
//
// Usage: node scripts/generate-leg-maps.mjs

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MAX_DIM = 640; // cap on the generated image's width/height in pixels
const MARGIN_RATIO = 0.35; // padding around the route, as a fraction of its span
const MIN_MARGIN_DEG = 0.006; // ~650m — floor for very small loops (e.g. the swim)

const legs = {
  swim: "gpx/Natation-champex.gpx",
  bike: "gpx/35km-champex--_-Fouly.gpx",
  run: "gpx/Fouly-6km.gpx",
};

function parseGpx(text) {
  return [...text.matchAll(/<rtept lat="([-0-9.]+)" lon="([-0-9.]+)">/g)].map((m) => ({
    lat: parseFloat(m[1]),
    lon: parseFloat(m[2]),
  }));
}

function lonLatToPixel(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  return { x, y };
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "FoulyTriathlonSite/1.0 (static map generation, one-time build step)" } }, (res) => {
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

async function buildLegMap(id, gpxRel) {
  const points = parseGpx(fs.readFileSync(path.join(root, gpxRel), "utf-8"));
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const latMargin = Math.max((maxLat - minLat) * MARGIN_RATIO, MIN_MARGIN_DEG);
  const lonMargin = Math.max((maxLon - minLon) * MARGIN_RATIO, MIN_MARGIN_DEG);
  minLat -= latMargin; maxLat += latMargin;
  minLon -= lonMargin; maxLon += lonMargin;

  // Pick the highest zoom whose pixel bbox still fits within MAX_DIM x MAX_DIM.
  let zoom = 18;
  let px0, py0, px1, py1;
  for (; zoom >= 8; zoom--) {
    const tl = lonLatToPixel(minLon, maxLat, zoom);
    const br = lonLatToPixel(maxLon, minLat, zoom);
    const w = br.x - tl.x;
    const h = br.y - tl.y;
    if (w <= MAX_DIM && h <= MAX_DIM) {
      px0 = tl.x; py0 = tl.y; px1 = br.x; py1 = br.y;
      break;
    }
  }

  // Clamp the aspect ratio (e.g. the bike leg's bbox is a long north-south
  // valley descent — left uncapped it'd produce a tall, narrow image that
  // blows out the modal's height). Pad the shorter side, centered.
  const MIN_ASPECT = 0.8, MAX_ASPECT = 1.5; // width / height
  let w = px1 - px0, h = py1 - py0;
  const aspect = w / h;
  if (aspect < MIN_ASPECT) {
    const targetW = h * MIN_ASPECT;
    const grow = (targetW - w) / 2;
    px0 -= grow; px1 += grow;
  } else if (aspect > MAX_ASPECT) {
    const targetH = w / MAX_ASPECT;
    const grow = (targetH - h) / 2;
    py0 -= grow; py1 += grow;
  }

  const width = Math.round(px1 - px0);
  const height = Math.round(py1 - py0);
  const tileX0 = Math.floor(px0 / 256), tileX1 = Math.floor((px1 - 1) / 256);
  const tileY0 = Math.floor(py0 / 256), tileY1 = Math.floor((py1 - 1) / 256);

  const canvasW = (tileX1 - tileX0 + 1) * 256;
  const canvasH = (tileY1 - tileY0 + 1) * 256;
  const canvas = Buffer.alloc(canvasW * canvasH * 4);

  console.log(`[${id}] zoom ${zoom}, ${width}x${height}px, ${(tileX1 - tileX0 + 1) * (tileY1 - tileY0 + 1)} tiles`);
  for (let tx = tileX0; tx <= tileX1; tx++) {
    for (let ty = tileY0; ty <= tileY1; ty++) {
      const url = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
      const buf = await fetchBuffer(url);
      const tile = PNG.sync.read(buf);
      const destX = (tx - tileX0) * 256;
      const destY = (ty - tileY0) * 256;
      for (let y = 0; y < 256; y++) {
        const srcStart = y * 256 * 4;
        const destStart = ((destY + y) * canvasW + destX) * 4;
        tile.data.copy(canvas, destStart, srcStart, srcStart + 256 * 4);
      }
      process.stdout.write(".");
    }
  }
  console.log(" done");

  // Crop the stitched canvas down to the exact bbox pixel window.
  const cropX = Math.round(px0 - tileX0 * 256);
  const cropY = Math.round(py0 - tileY0 * 256);
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const srcStart = ((cropY + y) * canvasW + cropX) * 4;
    const destStart = y * width * 4;
    canvas.copy(out.data, destStart, srcStart, srcStart + width * 4);
  }

  const outDir = path.join(root, "assets/maps");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${id}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(out));

  return { zoom, pxX0: Math.round(px0), pxY0: Math.round(py0), width, height, src: `assets/maps/${id}.png` };
}

async function main() {
  const result = {};
  for (const [id, gpxRel] of Object.entries(legs)) {
    result[id] = await buildLegMap(id, gpxRel);
  }
  const out = `// AUTO-GENERATED by scripts/generate-leg-maps.mjs — do not edit by hand.
// Map tiles © OpenStreetMap contributors (openstreetmap.org/copyright).
window.legMaps = ${JSON.stringify(result, null, 2)};
`;
  fs.writeFileSync(path.join(root, "js/leg-maps.js"), out);
  console.log("Wrote js/leg-maps.js and assets/maps/*.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
