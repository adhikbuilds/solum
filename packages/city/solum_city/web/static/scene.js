/**
 * The 3D scene: geometry, materials, light, camera.
 *
 * Everything that puts something on the canvas. It reads `district` and `mode`, and
 * knows nothing about panels, legends or the API -- which is the split that lets the
 * lighting be tuned without touching a single line of interface code.
 */

let scene, camera, renderer, raycaster, pointer, district, manifest, FACADE = null;

let builtGroup, permittedGroup, schemeGroup = null, byPlot = {};

let sunLight = null, ORBIT = null, EXTENT = 1600;

let mode = 'site', picked = null, meshes = [];

function partShape(part) {
  const s = new THREE.Shape();
  part[0].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
  for (let i = 1; i < part.length; i++) {
    const h = new THREE.Path();
    part[i].forEach(([x, y], j) => j ? h.lineTo(x, y) : h.moveTo(x, y));
    s.holes.push(h);
  }
  return s;
}

function facadeTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 8, 64);
  g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, 61, 8, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // Extrude's world UV generator measures walls in scene metres, so one repeat per 3.2 m of
  // height puts exactly one line per storey.
  t.repeat.set(1 / 3.2, 1 / 3.2);
  return t;
}

function build() {
  permittedGroup = new THREE.Group();
  builtGroup = new THREE.Group();
  meshes = [];

  // --- layer 1: the permitted envelope, massed from DDA entitlement ---------------------------
  district.parcels.forEach(p => {
    byPlot[p.id] = p;
    const solid = p.render === 'solid' && p.height_m > 0;

    p.footprint.forEach(part => {
      const shape = partShape(part);
      if (solid) {
        const g = new THREE.ExtrudeGeometry(shape, {depth: p.height_m, bevelEnabled: false});
        // Rings are baked in plan (east, north). This single rotation is the whole Y-up step, and
        // it is the same one solum_massing -> Scene.tsx makes, so both sit in one frame.
        g.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(g, permittedMaterials(p));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {parcel: p, layer: 'permitted'};
        permittedGroup.add(mesh);
        meshes.push(mesh);
        mesh.userData.edges = new THREE.LineSegments(new THREE.EdgesGeometry(g),
          new THREE.LineBasicMaterial({color: 0x2A1C12, transparent: true, opacity: .12}));
        permittedGroup.add(mesh.userData.edges);
      } else {
        // The honest-absence case: a real plot with no derivable building, drawn flat and still
        // pickable, so "why is nothing here" has an answer rather than being a hole in the model.
        const g = new THREE.ShapeGeometry(shape);
        g.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
          color: colourOf(p), transparent: true, opacity: .20, side: THREE.DoubleSide, depthWrite: false}));
        mesh.position.y = 0.10;
        mesh.userData = {parcel: p, layer: 'permitted'};
        permittedGroup.add(mesh);
        meshes.push(mesh);
      }
    });

    // Every parcel keeps its cadastral boundary on the ground in every mode. The plot is the
    // fact; whatever is massed on it is inference.
    p.plot.forEach(part => part.forEach(ring => {
      const pts = ring.map(([x, y]) => new THREE.Vector3(x, 0.16, -y));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({color: 0xFFFFFF, transparent: true, opacity: .30})));
    }));
  });

  // --- layer 2: what is standing, surveyed by OSM ---------------------------------------------
  (district.buildings || []).forEach(b => {
    b.footprint.forEach(part => {
      const shape = partShape(part);
      // A footprint whose height nobody has recorded is drawn as a pad, not extruded to a guess.
      // The shape is surveyed; the height is not, and the render says which is which.
      const depth = b.height_m || 0.6;
      const g = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false});
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, builtMaterials(b));
      mesh.castShadow = !!b.height_m;
      mesh.receiveShadow = true;
      mesh.userData = {building: b, parcel: byPlot[b.plot_id] || null, layer: 'built'};
      builtGroup.add(mesh);
      meshes.push(mesh);
      if (b.height_m) {
        builtGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(g),
          new THREE.LineBasicMaterial({color: 0x2A1C12, transparent: true, opacity: .16})));
      }
    });
  });

  scene.add(permittedGroup);
  scene.add(builtGroup);
  applyMode();
}

function permittedMaterials(p) {
  FACADE = FACADE || facadeTexture();
  const ghost = mode === 'site';          // in site mode entitlement is context, not the subject
  const h = p.height_m || 0;
  let wall, roof, rough = .82, metal = 0;

  if (ghost) {
    wall = roof = '#E7DFD3'; rough = .95;
  } else if (mode === 'value') {
    wall = roof = valueColour(p); rough = .92;
  } else {
    wall = roof = colourOf(p); rough = .92;
  }

  const shared = {roughness: rough, metalness: metal,
                  transparent: ghost, opacity: ghost ? .16 : 1, depthWrite: !ghost};
  const mats = [new THREE.MeshStandardMaterial({color: roof, ...shared}),
                new THREE.MeshStandardMaterial({color: wall, ...shared})];
  if (picked && picked.parcel === p) mats.forEach(m => {
    m.emissive = new THREE.Color('#FF6B19'); m.emissiveIntensity = .5;
  });
  return mats;
}

function builtMaterials(b) {
  FACADE = FACADE || facadeTexture();
  const h = b.height_m || 0;
  const unknown = !b.height_m;
  const ceiling = b.height_source === 'dda:permitted';
  let wall, roof, rough = .84, metal = 0;

  if (unknown)        { wall = '#B9AFA2'; roof = '#A99F93'; rough = .95; }
  else if (h >= 60)   { wall = '#9AA6AF'; roof = '#77828A'; rough = .34; metal = .28; }
  else if (h >= 22)   { wall = '#C0B2A0'; roof = '#8F8474'; rough = .72; }
  else                { wall = '#CBBCA6'; roof = '#9A8E7C'; rough = .86; }

  const shared = {roughness: rough, metalness: metal,
                  transparent: ceiling, opacity: ceiling ? .82 : 1};
  const mats = [
    new THREE.MeshStandardMaterial({color: roof, ...shared}),
    new THREE.MeshStandardMaterial({color: wall, map: unknown ? null : FACADE, ...shared}),
  ];
  if (picked && picked.building === b) mats.forEach(m => {
    m.emissive = new THREE.Color('#FF6B19'); m.emissiveIntensity = .5;
  });
  return mats;
}

function applyMode() {
  const site = mode === 'site';
  builtGroup.visible = site;
  permittedGroup.visible = true;

  const withBuilding = new Set((district.buildings || []).map(b => b.plot_id).filter(Boolean));
  permittedGroup.children.forEach(o => {
    const p = o.userData && o.userData.parcel;
    if (!p) return;
    o.visible = !site || !withBuilding.has(p.id);
    if (o.userData.edges) o.userData.edges.visible = o.visible && !site;
  });
  // Edge line sets carry no parcel of their own; hide them wholesale in site mode.
  permittedGroup.children.forEach(o => {
    if (o.type === 'LineSegments' && !o.userData.parcel) o.visible = !site;
  });
}

function imagery() {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  // Nearest tiles first, so a capped render still covers the middle of the district rather than
  // one arbitrary corner of it.
  const all = district.imagery.tiles.slice().sort((a, b) => {
    const d = t => Math.hypot(t.corners[0][0], t.corners[0][1]);
    return d(a) - d(b);
  }).slice(0, IMAGERY_CAP === Infinity ? undefined : IMAGERY_CAP);
  const total = all.length;
  if (!total) { document.getElementById('loading').style.opacity = 0; return; }
  let done = 0;
  const tick = () => {
    document.getElementById('loading').textContent = `imagery ${++done}/${total}`;
    if (done >= total) setTimeout(() => document.getElementById('loading').style.opacity = 0, 400);
  };

  all.forEach(t => {
    const [nw, ne, se, sw] = t.corners;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      nw[0], 0, -nw[1], sw[0], 0, -sw[1], se[0], 0, -se[1],
      nw[0], 0, -nw[1], se[0], 0, -se[1], ne[0], 0, -ne[1]]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0,1, 0,0, 1,0, 0,1, 1,0, 1,1]), 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
      0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0]), 3));

    const mat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      transparent: true, opacity: 0});
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    scene.add(mesh);

    loader.load(t.url, tex => {
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      mat.map = tex; mat.opacity = 1; mat.needsUpdate = true;
      tick();
    }, undefined, tick);
  });
}

function sky(extent) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {top: {value: new THREE.Color('#8FB0CC')}, bottom: {value: new THREE.Color('#EFE3D2')}},
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; ' +
      'gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; ' +
      'void main(){ gl_FragColor = vec4(mix(bottom, top, clamp(pow(max(h,0.0),0.5),0.0,1.0)), 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(extent * 6, 32, 16), mat));
}

function rebuildMaterials() {
  meshes.forEach(m => {
    const u = m.userData;
    if (Array.isArray(m.material)) {
      m.material.forEach(x => x.dispose());
      m.material = u.layer === 'built' ? builtMaterials(u.building) : permittedMaterials(u.parcel);
    } else {
      const selected = picked && picked.parcel === u.parcel;
      m.material.color.set(selected ? '#FF6B19' : colourOf(u.parcel));
      m.material.opacity = selected ? .45 : (mode === 'site' ? .10 : .20);
    }
  });
  applyMode();
  legend();
}

function centroidOf(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (!a) return [ring[0][0], ring[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}

function drawScheme(p, geometry) {
  if (schemeGroup) { scene.remove(schemeGroup); schemeGroup = null; }
  if (!geometry || !geometry.levels || !geometry.levels.length) return;
  const [cx, cy] = centroidOf(p.plot[0][0]);
  schemeGroup = new THREE.Group();

  geometry.levels.forEach(lv => {
    (lv.rings || []).forEach(ring => {
      const shape = new THREE.Shape();
      ring.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
      const g = new THREE.ExtrudeGeometry(shape, {depth: Math.max(lv.height_m * 0.9, 0.4), bevelEnabled: false});
      g.rotateX(-Math.PI / 2);
      const below = lv.kind === 'basement';
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: below ? '#8A7F74' : (lv.kind === 'podium' ? '#C4763A' : '#FF6B19'),
        roughness: .7, transparent: true, opacity: below ? .22 : .55, depthWrite: false}));
      mesh.position.set(cx, lv.base_m, -cy);
      schemeGroup.add(mesh);
    });
  });

  (geometry.envelope_rings || []).forEach(ring => {
    const pts = ring.map(([x, y]) => new THREE.Vector3(x + cx, 0.3, -(y + cy)));
    schemeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color: 0xFF6B19, transparent: true, opacity: .8})));
  });

  scene.add(schemeGroup);
}

function solarPosition(lat, lon, dateISO, hourLocal, utcOffset) {
  const [Y, M, D] = dateISO.split('-').map(Number);
  const utcHour = hourLocal - utcOffset;
  const ms = Date.UTC(Y, M - 1, D, 0, 0, 0) + utcHour * 3600e3;
  const jd = ms / 86400e3 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const rad = Math.PI / 180, deg = 180 / Math.PI;

  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M0 = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = M0 * rad;
  const eq = Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
           + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
  const trueLong = L0 + eq;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * rad);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * t) * rad);
  const decl = Math.asin(Math.sin(obliq * rad) * Math.sin(appLong * rad)) * deg;

  const y = Math.pow(Math.tan(obliq / 2 * rad), 2);
  const eqTime = 4 * deg * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(m)
    + 4 * e * y * Math.sin(m) * Math.cos(2 * L0 * rad)
    - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * m));

  const minutes = ((utcHour % 24) + 24) % 24 * 60;
  const trueSolar = (minutes + eqTime + 4 * lon) % 1440;
  const ha = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180;
  const latR = lat * rad, declR = decl * rad, haR = ha * rad;
  const zenith = Math.acos(Math.sin(latR) * Math.sin(declR)
    + Math.cos(latR) * Math.cos(declR) * Math.cos(haR));
  const elevation = 90 - zenith * deg;

  const denom = Math.cos(latR) * Math.sin(zenith);
  let azimuth = 180;
  if (Math.abs(denom) > 1e-9) {
    const cosAz = (Math.sin(latR) * Math.cos(zenith) - Math.sin(declR)) / denom;
    const a = Math.acos(Math.max(-1, Math.min(1, cosAz))) * deg;
    azimuth = ha > 0 ? (180 + a) % 360 : (540 - a) % 360;
  }
  return {azimuth, elevation};
}

function setHour(hourLocal) {
  const sd = district.sun;
  const {azimuth, elevation} = solarPosition(sd.lat, sd.lon, sd.date, hourLocal, sd.utc_offset_hours);
  const az = azimuth * Math.PI / 180, el = Math.max(elevation, -2) * Math.PI / 180;
  const e = Math.cos(el) * Math.sin(az), n = Math.cos(el) * Math.cos(az), u = Math.sin(el);
  sunLight.position.set(e * EXTENT, Math.max(u, 0.02) * EXTENT, -n * EXTENT);

  const up = Math.max(0, Math.sin(el));
  sunLight.intensity = 0.18 + 1.0 * Math.pow(up, 0.55);
  sunLight.color.setHSL(0.09 - 0.035 * (1 - up), 0.55 - 0.30 * up, 0.5 + 0.22 * up);
  scene.fog.color.setHSL(0.09 - 0.02 * (1 - up), 0.22 - 0.10 * up, 0.55 + 0.28 * up);

  const hh = Math.floor(hourLocal), mm = Math.round((hourLocal - hh) * 60);
  document.getElementById('hourOut').textContent =
    `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${Math.round(elevation)}°`;
}

function init() {
  const stage = document.getElementById('stage');
  const [w, d] = district.aoi.extent_m;
  const extent = EXTENT = Math.max(w, d);

  scene = new THREE.Scene();
  // Haze, not a backdrop colour. Exponential fog is what puts air between the near block and the
  // far one; without it a flat-lit city reads as a tabletop model.
  scene.fog = new THREE.FogExp2(0xE6DCCC, 0.00040);

  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 2, extent * 12);
  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  sky(extent);

  // The sun is where the pipeline computed it: NOAA solar position for this AOI's own latitude
  // and longitude at a stated moment, carried in as an east/north/up vector. Shadows fall the way
  // Dubai's do at 15:00 on the equinox rather than the way a dragged light looks nice, and the
  // azimuth is in the manifest so the render is checkable.
  const [ex, ny, uz] = district.sun.direction_enu;
  const sun = sunLight = new THREE.DirectionalLight(0xFFEBCE, 0.95);
  sun.position.set(ex * extent, uz * extent, -ny * extent);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -extent * .8; cam.right = extent * .8;
  cam.top = extent * .8; cam.bottom = -extent * .8;
  cam.near = 1; cam.far = extent * 4;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);

  // Sky fill: cool from above, warm bounce off the ground, which is what a desert city sits in.
  scene.add(new THREE.HemisphereLight(0x9FBBD8, 0xB39C7E, 0.30));

  // A ground plane under the imagery, so the district still reads before the tiles arrive and
  // beyond the edge of the AOI once they have.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 9, extent * 9),
    new THREE.MeshStandardMaterial({color: 0xCFC2AC, roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  ground.receiveShadow = true;
  scene.add(ground);

  imagery();
  build();
  orbit();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => {
    if (window.__dragged) return;
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(meshes.filter(m => m.visible && m.parent.visible), false)[0];
    select(hit ? hit.object.userData : null);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  (function loop() {
    requestAnimationFrame(loop);
    if (ORBIT) ORBIT.tick();
    renderer.render(scene, camera);
  })();
}

// Minimal orbit, same as massing/viewer.html -- one CDN dependency, not two.

function orbit() {
  const target = new THREE.Vector3(0, 0, 0);
  let want = null;
  let r = 1050, theta = -0.95, phi = 0.96, dragging = 0, px = 0, py = 0;
  const pan = new THREE.Vector3();
  function apply() {
    phi = Math.max(0.10, Math.min(1.50, phi));
    camera.position.set(
      target.x + pan.x + r * Math.sin(phi) * Math.cos(theta),
      target.y + pan.y + r * Math.cos(phi),
      target.z + pan.z + r * Math.sin(phi) * Math.sin(theta));
    camera.lookAt(target.x + pan.x, target.y + pan.y, target.z + pan.z);
  }
  const dom = renderer.domElement;
  dom.addEventListener('mousedown', e => { dragging = e.button === 2 ? 2 : 1; px = e.clientX; py = e.clientY; window.__dragged = false; });
  addEventListener('mouseup', () => { dragging = 0; setTimeout(() => window.__dragged = false, 0); });
  addEventListener('mousemove', e => {
    if (!dragging) return;
    window.__dragged = true;
    const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY;
    if (dragging === 1) { theta += dx * .006; phi -= dy * .006; }
    else { pan.x -= dx * 1.2 * Math.cos(theta); pan.z -= dx * 1.2 * Math.sin(theta); pan.y += dy * 1.2; }
    apply();
  });
  dom.addEventListener('contextmenu', e => e.preventDefault());
  dom.addEventListener('wheel', e => {
    e.preventDefault();
    r = Math.max(90, Math.min(4200, r * (1 + Math.sign(e.deltaY) * .09)));
    apply();
  }, {passive: false});
  apply();

  // Fly to a plot rather than snapping: a jump cut across a district loses the viewer, and the
  // ease is what makes a search result feel like the camera went somewhere.
  ORBIT = {
    flyTo(x, z, radius) { want = {x, z, r: radius, t: 0}; },
    tick() {
      if (!want) return;
      want.t = Math.min(1, want.t + 0.045);
      const k = 1 - Math.pow(1 - want.t, 3);
      target.x += (want.x - target.x) * k * 0.35;
      target.z += (want.z - target.z) * k * 0.35;
      r += (want.r - r) * k * 0.12;
      apply();
      if (want.t >= 1) want = null;
    },
  };
}
