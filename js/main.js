function formatDate(raw) {
  if (!raw) return null;
  // Accept "DD.MM.YYYY" as well as ISO strings.
  const dm = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const d = dm ? new Date(+dm[3], +dm[2] - 1, +dm[1]) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-CH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function renderHeroMeta() {
  const el = document.getElementById("hero-meta");
  const dateLabel = formatDate(eventConfig.date) || eventConfig.dateLabel;
  el.innerHTML = `
    <span class="meta-pill">\u{1F4C5} ${dateLabel}</span>
    <span class="meta-pill">\u{1F4CD} ${eventConfig.location}</span>
  `;
}

function renderJoinGrid() {
  const grid = document.getElementById("join-grid");
  grid.innerHTML = whatsappGroups
    .map(
      (g) => `
    <a class="join-card" href="${g.link}" target="_blank" rel="noopener">
      <img class="join-qr" src="${g.qr}" alt="Code QR ${g.label}" width="120" height="120" loading="lazy" />
      <div class="join-body">
        <span class="join-icon">${g.icon}</span>
        <span class="join-label">${g.label}</span>
        <span class="join-desc">${g.description}</span>
        <span class="join-cta">Rejoindre →</span>
      </div>
    </a>
  `
    )
    .join("");
}

function renderLegCards() {
  const container = document.getElementById("leg-cards");
  container.innerHTML = legs
    .map((leg) => {
      const s = courseData[leg.id].stats;
      return `
      <div class="leg-card" style="--leg-color:${leg.color}" data-leg="${leg.id}" role="button" tabindex="0">
        <span class="leg-icon">${leg.icon}</span>
        <span class="leg-label">${leg.label}</span>
        <span class="leg-distance">${s.distanceKm.toFixed(2)} km</span>
        <span class="leg-sub">D+ ${Math.round(s.gain)} m · ${Math.round(s.minEle)}–${Math.round(s.maxEle)} m</span>
      </div>
    `;
    })
    .join("");

  container.querySelectorAll(".leg-card").forEach((card) => {
    card.addEventListener("click", () => openLegModal(card.dataset.leg));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLegModal(card.dataset.leg);
      }
    });
  });
}

// The route drawn over its real static OpenStreetMap image (see
// scripts/generate-leg-maps.mjs). The SVG viewBox matches the image's pixel
// dimensions exactly, and each point is projected with the same Web
// Mercator math used to generate that image, so the path lines up precisely
// with the roads/lake beneath it.
function buildLegMap(points, color, legId) {
  const map = legMaps[legId];
  const { zoom, pxX0, pxY0, width, height, src } = map;

  const toSvg = (p) => {
    const px = lonLatToWebMercatorPixel(p.lon, p.lat, zoom);
    return [px.x - pxX0, px.y - pxY0];
  };

  const d = points
    .map((p, i) => {
      const [x, y] = toSvg(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const [sx0, sy0] = toSvg(points[0]);
  const [sx1, sy1] = toSvg(points[points.length - 1]);

  return `
    <div class="leg-modal-map" style="aspect-ratio:${width}/${height}">
      <img src="${src}" width="${width}" height="${height}" alt="Carte du parcours" loading="lazy" />
      <svg viewBox="0 0 ${width} ${height}" class="leg-path-svg" role="img" aria-label="Tracé du parcours">
        <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${sx0}" cy="${sy0}" r="4.5" fill="#1f2937" />
        <circle cx="${sx1}" cy="${sy1}" r="4.5" fill="${color}" />
      </svg>
    </div>
    <p class="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</p>
  `;
}

function openLegModal(legId) {
  const leg = legs.find((l) => l.id === legId);
  const s = courseData[legId].stats;
  const modal = document.getElementById("leg-modal");
  document.getElementById("leg-modal-content").innerHTML = `
    <div class="leg-modal-head">
      <span class="leg-modal-icon">${leg.icon}</span>
      <h3 id="leg-modal-title">${leg.label}</h3>
    </div>
    <p class="leg-modal-desc">${leg.description}</p>
    ${buildLegMap(courseData[legId].points, leg.color, legId)}
    <dl class="leg-modal-stats">
      <div><dt>Distance</dt><dd>${s.distanceKm.toFixed(2)} km</dd></div>
      <div><dt>D+</dt><dd>${Math.round(s.gain)} m</dd></div>
      <div><dt>D-</dt><dd>${Math.round(s.loss)} m</dd></div>
      <div><dt>Altitude</dt><dd>${Math.round(s.minEle)}–${Math.round(s.maxEle)} m</dd></div>
    </dl>
  `;
  modal.hidden = false;
  document.getElementById("leg-modal-close").focus();
}

function closeLegModal() {
  document.getElementById("leg-modal").hidden = true;
}

function initLegModal() {
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeLegModal);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("leg-modal").hidden) closeLegModal();
  });
}

function initViz() {
  const canvas = document.getElementById("viz-canvas");
  const viz = new CourseViz(canvas);
  legs.forEach((leg) => viz.addLeg(leg.id, courseData[leg.id].points, leg.color));
  viz.setTerrain(terrainData);
  const origin = courseData[legs[0].id].points[0];
  viz.finalizeSceneSetup(origin.lat, origin.lon, 3);
  viz.start();

  document.getElementById("zoom-in").addEventListener("click", () => viz.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => viz.zoomOut());
}

function init() {
  document.title = eventConfig.name;
  renderHeroMeta();
  renderLegCards();
  renderJoinGrid();
  initViz();
  initLegModal();
}

init();
