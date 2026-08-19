// Renders the course as a background scene: each leg is a colored tube
// following the real elevation profile, sitting on a translucent "ribbon"
// that fades to white at the ground, so the relief reads clearly in 3D.
// All legs share one geographic origin so they line up exactly like the
// real point-to-point course (swim -> bike -> run).
//
// No external controls/lines addon: those only ship as ES modules in modern
// Three.js, and ES modules are blocked entirely by Chrome when the page is
// opened via file:// (double-clicking index.html). Everything here is a
// classic script using core THREE only, plus a small hand-rolled
// drag-to-rotate controller (mouse only, so it never hijacks page scroll
// or touch scrolling).

class CourseViz {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 200000);

    this.legGroups = new Map();
    this.width = 800;
    this.height = 600;

    this.target = new THREE.Vector3();
    this.radius = 1000;
    this.theta = (40 * Math.PI) / 180; // azimuth
    this.phi = (60 * Math.PI) / 180; // polar angle from +Y (smaller = higher up)
    this.autoRotateSpeed = 0.06; // radians/sec
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this._onResize = this._onResize.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._animate = this._animate.bind(this);

    window.addEventListener("resize", this._onResize);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    canvas.style.touchAction = "pan-y";

    this._onResize();
  }

  _onResize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  _onPointerDown(e) {
    if (e.pointerType !== "mouse") return; // let touch scroll the page normally
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  _onPointerMove(e) {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.theta -= dx * 0.006;
    this.phi = Math.min(Math.max(this.phi - dy * 0.006, 0.25), 1.4);
  }

  _onPointerUp() {
    this.dragging = false;
  }

  addLeg(id, points, color) {
    this.legGroups.set(id, { points, color, group: null });
  }

  setTerrain(terrainData) {
    this.terrainData = terrainData;
  }

  _buildTerrain(baseElevation, exaggeration) {
    const t = this.terrainData;
    if (!t) return;
    const { minLat, maxLat, minLon, maxLon, gridW, gridH, elevations } = t;

    // Elevation -> color ramp: valley green, mid-mountain rock, snow near
    // the summits — subdued so the route colors stay the clear focal point.
    const valleyColor = new THREE.Color(0xd7ddc9);
    const rockColor = new THREE.Color(0xcdc7bc);
    const snowColor = new THREE.Color(0xf4f5f7);
    const tmpColor = new THREE.Color();
    function elevationColor(ele) {
      if (ele < 1900) {
        const f = Math.min(Math.max((ele - 900) / (1900 - 900), 0), 1);
        return tmpColor.copy(valleyColor).lerp(rockColor, f).clone();
      }
      const f = Math.min(Math.max((ele - 1900) / (2900 - 1900), 0), 1);
      return tmpColor.copy(rockColor).lerp(snowColor, f).clone();
    }

    const positions = new Float32Array(gridW * gridH * 3);
    const elevationColors = new Array(gridW * gridH);
    for (let j = 0; j < gridH; j++) {
      const lat = maxLat - (j / (gridH - 1)) * (maxLat - minLat);
      for (let i = 0; i < gridW; i++) {
        const lon = minLon + (i / (gridW - 1)) * (maxLon - minLon);
        const ele = elevations[j * gridW + i];
        const { x, z } = projectLatLon(lat, lon, this.originLat, this.originLon);
        const y = (ele - baseElevation) * exaggeration;
        const idx = j * gridW + i;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        elevationColors[idx] = elevationColor(ele);
      }
    }

    const indices = [];
    for (let j = 0; j < gridH - 1; j++) {
      for (let i = 0; i < gridW - 1; i++) {
        const a = j * gridW + i;
        const b = a + 1;
        const c = a + gridW;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Shading is baked directly into the vertex colors (a fixed "sun"
    // direction dotted with each vertex normal) and rendered with an unlit
    // material — same approach as the route tubes/ribbons — so the result
    // is fully predictable instead of depending on the renderer's runtime
    // lighting/tone-mapping pipeline.
    const normalAttr = geo.getAttribute("normal");
    const lightDir = new THREE.Vector3(-1, 1.1, 0.6).normalize();
    const normal = new THREE.Vector3();
    const colors = new Float32Array(gridW * gridH * 3);
    for (let idx = 0; idx < gridW * gridH; idx++) {
      normal.set(normalAttr.getX(idx), normalAttr.getY(idx), normalAttr.getZ(idx));
      const diffuse = Math.max(normal.dot(lightDir), 0);
      const shade = 0.62 + 0.5 * diffuse;
      const base = elevationColors[idx];
      colors[idx * 3] = base.r * shade;
      colors[idx * 3 + 1] = base.g * shade;
      colors[idx * 3 + 2] = base.b * shade;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
  }

  _buildLeg(id, baseElevation, exaggeration) {
    const data = this.legGroups.get(id);
    const group = new THREE.Group();
    const colorObj = new THREE.Color(data.color);

    // Lifted a fixed amount above its "natural" height: the GPX elevation
    // and the terrain DEM elevation don't perfectly agree at every point, so
    // without this the path would clip in and out of the terrain surface in
    // spots. A constant lift (rather than scaling with exaggeration) keeps
    // it clear of that noise without visibly floating.
    const LIFT = 35;
    const verts = data.points.map((p) => {
      const { x, z } = projectLatLon(p.lat, p.lon, this.originLat, this.originLon);
      const y = (p.ele - baseElevation) * exaggeration + LIFT;
      return new THREE.Vector3(x, y, z);
    });

    // Ribbon: a vertical strip from the path down to the ground, fading
    // from the leg color at the top to near-white at the base so it blends
    // into the page background and reads as "height above ground".
    const white = new THREE.Color(0xffffff);
    const bottomColor = colorObj.clone().lerp(white, 0.85);
    const ribbonPos = [];
    const ribbonCol = [];
    for (const v of verts) {
      ribbonPos.push(v.x, v.y, v.z, colorObj.r, colorObj.g, colorObj.b);
      ribbonPos.push(v.x, 0, v.z, bottomColor.r, bottomColor.g, bottomColor.b);
    }
    const posArr = new Float32Array((ribbonPos.length / 6) * 3);
    const colArr = new Float32Array((ribbonPos.length / 6) * 3);
    for (let i = 0, pi = 0, ci = 0; i < ribbonPos.length; i += 6) {
      posArr[pi++] = ribbonPos[i];
      posArr[pi++] = ribbonPos[i + 1];
      posArr[pi++] = ribbonPos[i + 2];
      colArr[ci++] = ribbonPos[i + 3];
      colArr[ci++] = ribbonPos[i + 4];
      colArr[ci++] = ribbonPos[i + 5];
    }
    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    ribbonGeo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    const indices = [];
    for (let i = 0; i < verts.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    ribbonGeo.setIndex(indices);
    const ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(ribbonGeo, ribbonMat));

    // Tube along the path — real geometric thickness (unlike a plain
    // THREE.Line, which WebGL renders at 1px regardless of linewidth).
    const curve = new THREE.CatmullRomCurve3(verts);
    const tubularSegments = Math.min(Math.max(verts.length, 8), 700);
    const radius = Math.max(this._sceneScale * 0.0038, 6);
    const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: colorObj.getHex() });
    group.add(new THREE.Mesh(tubeGeo, tubeMat));

    this.scene.add(group);
    data.group = group;
    data.verts = verts;
  }

  finalizeSceneSetup(originLat, originLon, exaggeration) {
    this.originLat = originLat;
    this.originLon = originLon;

    let minEle = Infinity;
    for (const data of this.legGroups.values()) {
      for (const p of data.points) minEle = Math.min(minEle, p.ele);
    }
    const baseElevation = isFinite(minEle) ? minEle : 0;

    // Rough scale estimate (for tube radius) from projected extents.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const data of this.legGroups.values()) {
      for (const p of data.points) {
        const { x, z } = projectLatLon(p.lat, p.lon, originLat, originLon);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    this._sceneScale = Math.max(maxX - minX, maxZ - minZ, 500);

    this._buildTerrain(baseElevation, exaggeration);
    for (const id of this.legGroups.keys()) this._buildLeg(id, baseElevation, exaggeration);

    this.scene.fog = new THREE.Fog(0xffffff, this._sceneScale * 1.1, this._sceneScale * 3.4);

    this._frameAll();
  }

  _frameAll() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const data of this.legGroups.values()) {
      for (const v of data.verts) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minZ = Math.min(minZ, v.z);
        maxZ = Math.max(maxZ, v.z);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const cy = maxY * 0.35;
    this.target.set(cx, cy, cz);

    // Fit distance from the bounding sphere so an elongated, diagonally
    // oriented route (like this point-to-point course) isn't cropped.
    const dx = (maxX - minX) / 2;
    const dz = (maxZ - minZ) / 2;
    const dy = Math.max(maxY - cy, cy - minY);
    const boundRadius = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 250);
    const aspect = this.width / this.height;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const limitingFov = Math.min(vFov, hFov);
    this.radius = (boundRadius / Math.sin(limitingFov / 2)) * 0.66;
    this._minRadius = this.radius * 0.32;
    this._maxRadius = this.radius * 2.6;
  }

  zoomIn() {
    this.radius = Math.max(this.radius * 0.82, this._minRadius);
  }

  zoomOut() {
    this.radius = Math.min(this.radius / 0.82, this._maxRadius);
  }

  _updateCamera() {
    const sinPhi = Math.sin(this.phi);
    const x = this.target.x + this.radius * sinPhi * Math.sin(this.theta);
    const y = this.target.y + this.radius * Math.cos(this.phi);
    const z = this.target.z + this.radius * sinPhi * Math.cos(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  start() {
    this._lastTime = performance.now();
    this._animate();
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    if (!this.dragging) this.theta += this.autoRotateSpeed * dt;
    this._updateCamera();
    this.renderer.render(this.scene, this.camera);
  }
}
