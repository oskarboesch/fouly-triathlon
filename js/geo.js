// Equirectangular projection: lat/lon -> local flat meters {x, z} relative
// to an origin point. Good enough accuracy for a ~40km course.
const EARTH_RADIUS = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function projectLatLon(lat, lon, originLat, originLon) {
  const x = EARTH_RADIUS * toRad(lon - originLon) * Math.cos(toRad(originLat));
  const z = EARTH_RADIUS * toRad(lat - originLat);
  return { x, z };
}

// Standard Web Mercator slippy-map pixel projection, matching the tile math
// used to generate the static leg map images (see generate-leg-maps.mjs) —
// used to draw the GPX path in the exact same pixel space as those images.
function lonLatToWebMercatorPixel(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n * 256;
  const latRad = toRad(lat);
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  return { x, y };
}
