// Sol Bay: the whole city, built from a seeded RNG. One call builds the
// ground, roads, buildings, beach, water, sky, lights and props, and hands
// back the road graph, building colliders and spawn points the other
// systems drive from. Uses the global THREE (three.js 0.186.1, classic
// script) — never imported. No network, no external assets.
import { CONFIG, citySize, cityHalf } from './config.js';
import { range, pick, chance, int } from './rng.js';

const PITCH = CONFIG.city.blockSize + CONFIG.city.roadWidth; // 52 m
const HALF = cityHalf(); // 240 m
const ROAD_CENTRES = [];
for (let i = 0; i <= CONFIG.city.blocks; i++) {
  ROAD_CENTRES.push(-HALF + CONFIG.city.roadWidth / 2 + i * PITCH);
}
const BLOCK_CENTRES = [];
for (let i = 0; i < CONFIG.city.blocks; i++) {
  BLOCK_CENTRES.push(-HALF + CONFIG.city.roadWidth + CONFIG.city.blockSize / 2 + i * PITCH);
}

function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// Facade texture: painted wall with a grid of lit and dark windows.
// One texture per palette colour, shared by every building of that colour.
function makeFacadeTexture(baseHex, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexCss(baseHex);
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.32;
      ctx.fillStyle = hexCss(lit ? CONFIG.palette.windowLit : CONFIG.palette.windowDark);
      ctx.fillRect(c * cw + 4, r * ch + 5, cw - 8, ch - 10);
      if (lit) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(c * cw + 4, r * ch + 5, cw - 8, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Billboard texture: flat colour, big invented Sol Bay wording.
function makeSignTexture(lines, bgHex, fgHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexCss(bgHex);
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = hexCss(fgHex);
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = hexCss(fgHex);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 64px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, 256, 256 / (lines.length + 1) * (i + 1));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Warm late-afternoon sky dome: vertex-colour gradient, horizon glow low.
function buildSky(scene) {
  const geo = new THREE.SphereGeometry(1100, 24, 16);
  const top = new THREE.Color(0x6ea3d4);
  const horizon = new THREE.Color(0xffb36b);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 1100));
    tmp.copy(horizon).lerp(top, Math.pow(t, 0.6));
    colours[i * 3] = tmp.r;
    colours[i * 3 + 1] = tmp.g;
    colours[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe6c9a8, 320, 1050);
  scene.background = new THREE.Color(CONFIG.palette.sky);
}

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  group.name = 'sol-bay-city';
  scene.add(group);
  buildSky(scene);

  // ---- lights: low warm sun with shadows + soft sky bounce ----
  const sun = new THREE.DirectionalLight(CONFIG.palette.sun, 2.4);
  sun.position.set(-260, 190, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0xbfd9ee, 0x8a7a5f, 0.85));

  // ---- ground: one asphalt slab for the whole street grid ----
  const size = citySize();
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ color: CONFIG.palette.asphalt })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // ---- sidewalks: one instanced slab per block ----
  const walkGeo = new THREE.PlaneGeometry(
    CONFIG.city.blockSize + CONFIG.city.sidewalkWidth * 2,
    CONFIG.city.blockSize + CONFIG.city.sidewalkWidth * 2
  );
  walkGeo.rotateX(-Math.PI / 2);
  const walkMat = new THREE.MeshLambertMaterial({ color: CONFIG.palette.sidewalk });
  const walks = new THREE.InstancedMesh(
    walkGeo, walkMat, CONFIG.city.blocks * CONFIG.city.blocks
  );
  const m4 = new THREE.Matrix4();
  let wi = 0;
  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      m4.makeTranslation(bx, 0.03, bz);
      walks.setMatrixAt(wi++, m4);
    }
  }
  walks.receiveShadow = true;
  group.add(walks);

  // ---- centre dashes: one instanced mesh for every road ----
  const dashGeo = new THREE.PlaneGeometry(3.4, 0.35);
  dashGeo.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const dashCount = (CONFIG.city.blocks + 1) * 2 * Math.floor(size / 8);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  let di = 0;
  for (const rc of ROAD_CENTRES) {
    for (let d = -HALF + 6; d < HALF - 4; d += 8) {
      q.setFromAxisAngle(up, 0);
      pos.set(d, 0.06, rc);
      m4.compose(pos, q, one);
      dashes.setMatrixAt(di++, m4);
      q.setFromAxisAngle(up, Math.PI / 2);
      pos.set(rc, 0.06, d);
      m4.compose(pos, q, one);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  group.add(dashes);

  // ---- crosswalks: zebra stripes at every intersection ----
  const stripeGeo = new THREE.PlaneGeometry(0.7, 3.2);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe8e6df });
  const nX = CONFIG.city.blocks + 1;
  const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, nX * nX * 4 * 5);
  let si = 0;
  const stripeOffsets = [-4.4, -2.2, 0, 2.2, 4.4];
  for (const rx of ROAD_CENTRES) {
    for (const rz of ROAD_CENTRES) {
      for (const [dx, dz, rot] of [
        [0, -4.5, 0], [0, 4.5, 0], [-4.5, 0, Math.PI / 2], [4.5, 0, Math.PI / 2],
      ]) {
        for (const off of stripeOffsets) {
          q.setFromAxisAngle(up, rot);
          if (rot === 0) pos.set(rx + off, 0.06, rz + dz);
          else pos.set(rx + dx, 0.06, rz + off);
          m4.compose(pos, q, one);
          stripes.setMatrixAt(si++, m4);
        }
      }
    }
  }
  stripes.count = si;
  group.add(stripes);

  // ---- buildings: 1-4 per block, taller toward downtown ----
  const colliders = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b655e });
  const sideMats = CONFIG.palette.building.map((hex) => new THREE.MeshLambertMaterial({
    map: makeFacadeTexture(hex, rng),
  }));
  const acGeo = new THREE.BoxGeometry(1.6, 0.9, 1.6);
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  const acSpots = [];
  const maxDist = Math.hypot(HALF, HALF);

  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const centreT = 1 - Math.hypot(bx, bz) / maxDist; // 1 downtown, 0 edge
      const count = int(rng, 1, 4);
      const plots = count === 1
        ? [{ x: bx, z: bz, w: 30, d: 30 }]
        : count === 2
          ? [{ x: bx - 10, z: bz, w: 17, d: 30 }, { x: bx + 10, z: bz, w: 17, d: 30 }]
          : [
              { x: bx - 10, z: bz - 10, w: 17, d: 17 },
              { x: bx + 10, z: bz - 10, w: 17, d: 17 },
              { x: bx - 10, z: bz + 10, w: 17, d: 17 },
              { x: bx + 10, z: bz + 10, w: 17, d: 17 },
            ];
      const use = plots.slice(0, count);
      for (const p of use) {
        const tall = chance(rng, 0.12 + centreT * 0.25);
        const h = tall
          ? range(rng, 38, 60)
          : range(rng, 8, 14 + centreT * 26);
        const w = p.w * range(rng, 0.85, 1);
        const d = p.d * range(rng, 0.85, 1);
        const side = pick(rng, sideMats);
        const mesh = new THREE.Mesh(boxGeo, [side, side, roofMat, roofMat, side, side]);
        mesh.scale.set(w, h, d);
        mesh.position.set(p.x, h / 2 + 0.03, p.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({
          minX: p.x - w / 2, maxX: p.x + w / 2,
          minZ: p.z - d / 2, maxZ: p.z + d / 2,
        });
        const nAc = int(rng, 1, 3);
        for (let i = 0; i < nAc; i++) {
          acSpots.push({
            x: p.x + range(rng, -w / 4, w / 4),
            y: h + 0.48,
            z: p.z + range(rng, -d / 4, d / 4),
          });
        }
      }
    }
  }
  const acMesh = new THREE.InstancedMesh(acGeo, acMat, Math.max(1, acSpots.length));
  acSpots.forEach((s, i) => {
    m4.makeTranslation(s.x, s.y, s.z);
    acMesh.setMatrixAt(i, m4);
  });
  group.add(acMesh);

  // ---- beach strip + water on the south edge (+Z), and the marina pier ----
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 120, CONFIG.city.beachWidth),
    new THREE.MeshLambertMaterial({ color: CONFIG.palette.sand })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, HALF + CONFIG.city.beachWidth / 2);
  beach.receiveShadow = true;
  group.add(beach);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 120, CONFIG.city.waterWidth),
    new THREE.MeshPhongMaterial({
      color: CONFIG.palette.water, shininess: 90, transparent: true, opacity: 0.94,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, HALF + CONFIG.city.beachWidth + CONFIG.city.waterWidth / 2);
  group.add(water);

  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 46), pierMat);
  pier.position.set(-190, 0.4, HALF + CONFIG.city.beachWidth + 8);
  pier.castShadow = true;
  group.add(pier);
  const pierPostGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6);
  for (const dz of [-18, 0, 18]) {
    for (const dx of [-4, 4]) {
      const post = new THREE.Mesh(pierPostGeo, pierMat);
      post.position.set(-190 + dx, -0.6, HALF + CONFIG.city.beachWidth + 8 + dz);
      group.add(post);
    }
  }

  // ---- palms: trunk + squashed canopy, instanced, beach + sidewalks ----
  const palmSpots = [];
  for (let x = -HALF - 40; x <= HALF + 40; x += 26) {
    palmSpots.push({ x: x + range(rng, -4, 4), z: HALF + range(rng, 12, 48) });
  }
  for (let i = 0; i < 26; i++) {
    palmSpots.push({
      x: pick(rng, BLOCK_CENTRES) + range(rng, -20, 20),
      z: pick(rng, BLOCK_CENTRES) + range(rng, -20, 20),
    });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const canopyGeo = new THREE.SphereGeometry(2.6, 8, 6);
  canopyGeo.scale(1, 0.55, 1);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f7a33 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach((s, i) => {
    q.setFromAxisAngle(up, range(rng, -0.08, 0.08));
    pos.set(s.x, 3, s.z);
    m4.compose(pos, q, one);
    trunks.setMatrixAt(i, m4);
    pos.set(s.x, 6.4, s.z);
    m4.compose(pos, q, one);
    canopies.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  canopies.castShadow = true;
  group.add(trunks);
  group.add(canopies);

  // ---- streetlights: pole + warm lamp head, instanced along the avenues ----
  const lightSpots = [];
  for (const rc of ROAD_CENTRES) {
    for (let d = -HALF + 26; d < HALF; d += 52) {
      lightSpots.push({ x: rc + 5.4, z: d });
      lightSpots.push({ x: d, z: rc - 5.4 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightSpots.length);
  lightSpots.forEach((s, i) => {
    m4.makeTranslation(s.x, 3.5, s.z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(s.x, 7.1, s.z);
    lamps.setMatrixAt(i, m4);
  });
  group.add(poles);
  group.add(lamps);

  // ---- billboards with invented Sol Bay wording, plus small props ----
  const billboards = [
    { x: -120, z: HALF - 8, ry: 0, lines: ['SOL BAY'], bg: 0x274b63, fg: 0xffd27a },
    { x: 60, z: -HALF + 8, ry: Math.PI, lines: ['PALM DRIVE'], bg: 0x7a3b2e, fg: 0xffe9c9 },
    { x: HALF - 8, z: 120, ry: -Math.PI / 2, lines: ['MARINA', 'FEST'], bg: 0x2e5d43, fg: 0xffffff },
  ];
  const postGeo = new THREE.CylinderGeometry(0.25, 0.25, 9, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
  for (const b of billboards) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 8),
      new THREE.MeshLambertMaterial({ map: makeSignTexture(b.lines, b.bg, b.fg) })
    );
    panel.position.set(b.x, 9, b.z);
    panel.rotation.y = b.ry;
    panel.castShadow = true;
    group.add(panel);
    for (const off of [-5, 5]) {
      const post = new THREE.Mesh(postGeo, postMat);
      const px = b.x + Math.cos(b.ry) * off;
      const pz = b.z - Math.sin(b.ry) * off;
      post.position.set(px, 4.5, pz);
      group.add(post);
    }
  }

  // Benches (seat + back) and hydrants, a handful, shared geometry.
  const benchSeatGeo = new THREE.BoxGeometry(2.2, 0.15, 0.6);
  const benchBackGeo = new THREE.BoxGeometry(2.2, 0.7, 0.12);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const hydrantGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8);
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xb03a2e });
  for (let i = 0; i < 12; i++) {
    const bx = pick(rng, BLOCK_CENTRES) + range(rng, -21, 21);
    const bz = pick(rng, BLOCK_CENTRES) + range(rng, -21, 21);
    const seat = new THREE.Mesh(benchSeatGeo, benchMat);
    seat.position.set(bx, 0.5, bz);
    seat.rotation.y = pick(rng, [0, Math.PI / 2]);
    seat.castShadow = true;
    group.add(seat);
    const back = new THREE.Mesh(benchBackGeo, benchMat);
    back.position.set(bx, 0.9, bz - 0.28);
    back.rotation.y = seat.rotation.y;
    group.add(back);
  }
  for (let i = 0; i < 10; i++) {
    const hydrant = new THREE.Mesh(hydrantGeo, hydrantMat);
    hydrant.position.set(
      pick(rng, ROAD_CENTRES) + range(rng, -5, 5),
      0.45,
      pick(rng, ROAD_CENTRES) + range(rng, -5, 5)
    );
    hydrant.castShadow = true;
    group.add(hydrant);
  }

  // Beach umbrellas: a cone on a pole, six of them along the sand.
  const umbrellaGeo = new THREE.ConeGeometry(2.2, 1.2, 8);
  const umbrellaMats = [0xe2583e, 0x2e7f9e, 0xf2c200].map(
    (c) => new THREE.MeshLambertMaterial({ color: c })
  );
  const umbrellaPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
  for (let i = 0; i < 6; i++) {
    const ux = -180 + i * 68 + range(rng, -8, 8);
    const uz = HALF + range(rng, 22, 44);
    const pole = new THREE.Mesh(umbrellaPoleGeo, postMat);
    pole.position.set(ux, 1.2, uz);
    group.add(pole);
    const top = new THREE.Mesh(umbrellaGeo, pick(rng, umbrellaMats));
    top.position.set(ux, 2.9, uz);
    top.castShadow = true;
    group.add(top);
  }

  // ---- road graph: a node at every intersection, edges along roads ----
  const nodes = new Map();
  for (let ix = 0; ix < ROAD_CENTRES.length; ix++) {
    for (let iz = 0; iz < ROAD_CENTRES.length; iz++) {
      nodes.set(`${ix}_${iz}`, { x: ROAD_CENTRES[ix], z: ROAD_CENTRES[iz] });
    }
  }
  const edges = [];
  for (let ix = 0; ix < ROAD_CENTRES.length; ix++) {
    for (let iz = 0; iz < ROAD_CENTRES.length; iz++) {
      if (ix + 1 < ROAD_CENTRES.length) {
        edges.push({
          a: `${ix}_${iz}`, b: `${ix + 1}_${iz}`,
          ax: ROAD_CENTRES[ix], az: ROAD_CENTRES[iz],
          bx: ROAD_CENTRES[ix + 1], bz: ROAD_CENTRES[iz],
        });
      }
      if (iz + 1 < ROAD_CENTRES.length) {
        edges.push({
          a: `${ix}_${iz}`, b: `${ix}_${iz + 1}`,
          ax: ROAD_CENTRES[ix], az: ROAD_CENTRES[iz],
          bx: ROAD_CENTRES[ix], bz: ROAD_CENTRES[iz + 1],
        });
      }
    }
  }
  const roadGraph = { nodes, edges };

  // ---- spawn points ----
  const carTypes = ['sedan', 'taxi', 'sports', 'van', 'sedan', 'taxi', 'sports', 'van', 'sedan', 'truck'];
  const carSpots = [
    [-182, 182, 0], [-130, 182, Math.PI / 2], [-78, 130, 0], [-26, 78, Math.PI],
    [26, 26, -Math.PI / 2], [78, -26, 0], [130, -78, Math.PI / 2], [182, -130, 0],
    [-182, -26, Math.PI], [78, 182, -Math.PI / 2],
  ];
  const spawnPoints = {
    player: { x: -190, z: 214, heading: 0 },
    cars: carSpots.map(([x, z, heading], i) => ({ x, z, heading, type: carTypes[i] })),
    missions: {
      m1: { x: -190, z: 205 },
      m2: { x: 208, z: 182 },
      m3: { x: -190, z: 238 },
      // m4 used to sit at (-208,-208) — the middle of a building (its
      // collider spans x -222.8..-193.2, z -222.3..-193.7), so the player
      // could never get within the 7 m start radius and the mission could
      // never begin. Moved onto the north-south road at x=-182, same
      // corner of the city, reachable on foot and by car.
      m4: { x: -182, z: -208 },
      m5: { x: 26, z: -26 },
      // m6: the beachfront sprint starts at the west end of the coast road
      // (z=182, a real road — z=154 is the middle of a block).
      m6: { x: -182, z: 182 },
      // m7: Delia's downtown hideout, on the x=50 / z=-78 crossroads.
      m7: { x: 50, z: -78 },
      // m8: back to Pier 9, where m3 was — the finale takes the pier back.
      m8: { x: -190, z: 238 },
    },
    police: [
      { x: 26, z: 26 }, { x: -26, z: 78 }, { x: 78, z: -26 }, { x: -78, z: -78 },
    ],
  };
  const bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

  return { group, roadGraph, colliders, spawnPoints, bounds };
}

/** Push a circle out of building AABBs. Returns {x, z, hit}. */export function collideCircle(x, z, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    let dx = x - cx;
    let dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * radius;
      z = cz + (dz / d) * radius;
    } else {
      // Centre is inside the box: shove out along the smallest penetration.
      const pl = x - c.minX;
      const pr = c.maxX - x;
      const pt = z - c.minZ;
      const pb = c.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - radius;
      else if (m === pr) x = c.maxX + radius;
      else if (m === pt) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z, hit };
}

/** Clamp a point inside bounds, keeping `margin` metres clear of the edge. */
export function clampToBounds(x, z, bounds, margin = 0) {
  return {
    x: Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, x)),
    z: Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, z)),
  };
}

// ---- districts and streets (for the minimap readout) ----------------------
// Sol Bay's own neighbourhoods. The pier corner is Pier 9; the east edge
// is the docks; the south strip is the beachfront; the north is Uptown;
// the middle is Downtown; the west edge is Palm Drive; the rest is Old Town.
export function districtAt(x, z) {
  if (x < -150 && z > 150) return 'Pier 9';
  if (x > 150) return 'The Docks';
  if (z > 150) return 'Beachfront';
  if (z < -150) return 'Uptown';
  if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'Downtown';
  if (x < -150) return 'Palm Drive';
  return 'Old Town';
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

/** The nearest named road: the four named avenues, else Nth Ave / Nth St. */
export function streetAt(x, z) {
  let bestX = ROAD_CENTRES[0];
  let bestZ = ROAD_CENTRES[0];
  for (const rc of ROAD_CENTRES) {
    if (Math.abs(x - rc) < Math.abs(x - bestX)) bestX = rc;
    if (Math.abs(z - rc) < Math.abs(z - bestZ)) bestZ = rc;
  }
  const dx = Math.abs(x - bestX);
  const dz = Math.abs(z - bestZ);
  if (dx <= dz) {
    // Nearest road runs north-south (an avenue, named by its x).
    if (bestX === 182) return 'Dockside Rd';
    if (bestX === -182) return 'Marina Blvd';
    const i = ROAD_CENTRES.indexOf(bestX);
    return (ORDINALS[i] || (i + 1) + 'th') + ' Ave';
  }
  if (bestZ === 182) return 'Bayfront Ave';
  if (bestZ === -182) return 'Uptown Ave';
  const i = ROAD_CENTRES.indexOf(bestZ);
  return (ORDINALS[i] || (i + 1) + 'th') + ' St';
}
