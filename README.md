# Fouly Triathlon

Static website for the Fouly Triathlon (Champex-Lac → La Fouly, Valais) — a
white, minimal page whose hero is an interactive 3D scene (drag to rotate,
+/− to zoom): the real course over the real surrounding mountain terrain,
with a compact summary of each leg overlaid on the left. Clicking a leg
opens a modal with its real GPX track drawn over a real OpenStreetMap
background, plus full stats. QR codes / links to join the WhatsApp groups
are below.

No build step, no bundler, no ES modules: plain classic `<script>` tags so
the site also works by just double-clicking `index.html` (see "Why classic
scripts" below).

## Preview

Just open `index.html` in a browser — no server needed. (A local server also
works if you prefer: `python3 -m http.server 8000`.)

## Edit event details / WhatsApp links

Everything content-related lives in [js/config.js](js/config.js):

- `eventConfig.date` — `"DD.MM.YYYY"` or an ISO date string.
- `whatsappGroups[].link` / `.qr` — the WhatsApp invite link and QR image for
  each role: bénévoles, solo, relai-nage, relai-vélo, relai-course.

## Course data

The three legs are defined in `legs` in [js/config.js](js/config.js) (`id`
must match a key in `js/course-data.js`). The GPX source files live in
[gpx/](gpx/):

- `Natation-champex.gpx` — swim, Lac de Champex
- `35km-champex--_-Fouly.gpx` — bike, Champex-Lac → La Fouly
- `Fouly-6km.gpx` — run, La Fouly loop

[js/course-data.js](js/course-data.js) is a **generated** file (distance,
elevation gain/loss, altitude range, and the raw lat/lon/ele points for the
3D view — all precomputed, no runtime fetch/parsing). If you replace a GPX
file, regenerate it:

```bash
node scripts/generate-course-data.mjs
```

## QR codes

[assets/qr/](assets/qr/) holds the QR code square cropped out of each
WhatsApp share screenshot in [whatsapp_links/](whatsapp_links/) (the
originals are kept there for reference). If a link changes, regenerate its
QR screenshot and re-crop, or just drop in a new square QR image at the same
path.

## Terrain (real mountains)

[js/terrain-data.js](js/terrain-data.js) is a **generated** file: a lat/lon
elevation grid for the region around the course, downloaded from AWS's
public "Terrarium" tiles (SRTM-derived, public domain — see
[registry.opendata.aws/terrain-tiles](https://registry.opendata.aws/terrain-tiles/)).
It's baked in ahead of time for the same reason as the course data — no
runtime fetch, so it also works via `file://`. Regenerate it with:

```bash
cd scripts && npm install   # one-time, installs pngjs (PNG decoding only)
cd .. && node scripts/generate-terrain-data.mjs
```

Edit `MARGIN_DEG` / `GRID_W` at the top of
[scripts/generate-terrain-data.mjs](scripts/generate-terrain-data.mjs) to
change how much surrounding terrain is captured or the mesh resolution.

## Leg detail modal (real map background)

Clicking a leg row opens a modal showing its GPX track drawn over a real
static map image, plus the full stats (distance, D+, D-, altitude). The map
images ([assets/maps/](assets/maps/)) are **generated**: real OpenStreetMap
tiles, one crop per leg fit tightly to that leg's own bounding box (so the
swim loop is zoomed in on the lake, the 36km bike leg is zoomed out over the
whole valley, etc.), downloaded and cropped by
[scripts/generate-leg-maps.mjs](scripts/generate-leg-maps.mjs). It also
writes [js/leg-maps.js](js/leg-maps.js), which records the exact zoom level
and pixel origin used for each crop — `buildLegMap()` in
[js/main.js](js/main.js) reprojects the GPX points with the same Web
Mercator math (`lonLatToWebMercatorPixel` in [js/geo.js](js/geo.js)) so the
drawn path lines up pixel-for-pixel with the roads/lake in the image.
Regenerate after changing a GPX file:

```bash
cd scripts && npm install   # one-time, installs pngjs (also used by the terrain script)
cd .. && node scripts/generate-leg-maps.mjs
```

Map tiles are © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
(ODbL) — each modal credits and links to them, which the license requires;
keep that attribution if you regenerate or restyle this section.

## 3D visualization

[js/viz3d.js](js/viz3d.js) renders the terrain as a shaded mesh (elevation
color ramp from valley green through rock to snow, with the shading baked
directly into the vertex colors — see the comment in `_buildTerrain` for why)
and each leg as a colored tube following the real elevation profile, sitting
on a translucent ribbon that fades to white at the ground. All three legs
and the terrain share one geographic origin (the swim start) so everything
lines up exactly like the real point-to-point course. The camera frames
itself tightly on the *course* (not the terrain) so the route stays the
clear focal point, with the mountains as backdrop. It auto-rotates slowly
and responds to mouse drag; it deliberately ignores touch and the scroll
wheel so it never fights normal page scrolling.

### Why classic scripts (no ES modules)

Chrome refuses to load `<script type="module">` at all when a page is opened
via `file://` ("blocked by CORS policy"), and refuses `fetch()` there too.
Since the ask was for a site that works by just double-clicking `index.html`
with no server, everything here is a classic script (`js/geo.js`,
`js/course-data.js`, `js/terrain-data.js`, `js/leg-maps.js`, `js/config.js`,
`js/viz3d.js`, `js/main.js`, loaded in that order) and the course, terrain,
and leg-map data are all embedded ahead of time rather than fetched (the map
*images* are ordinary `<img>` loads, which work the same via `file://` as
any other image). Three.js is loaded the same way,
from its classic/UMD CDN build — which also means the OrbitControls/fat-line
add-ons (ES-module only in modern Three.js) aren't available; `viz3d.js`
uses a small hand-rolled drag-to-rotate controller and core `TubeGeometry`
instead.

## Deploy to GitHub Pages

1. Create a GitHub repo and push this folder to it (e.g. `main` branch).
2. In the repo, go to **Settings → Pages**, set **Source** to "Deploy from a
   branch", branch `main`, folder `/ (root)`.
3. Your site will be live at `https://<username>.github.io/<repo>/`.
