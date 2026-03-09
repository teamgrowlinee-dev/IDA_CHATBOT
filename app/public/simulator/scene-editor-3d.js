import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CM_TO_M = 0.01;

const floorColorByTone = (tone) => {
  if (tone === "dark") return 0x6f5848;
  if (tone === "light") return 0xd6ccbb;
  return 0xb89d78;
};

const parseHexColor = (value, fallback) => {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return Number.parseInt(raw.slice(1), 16);
  }
  return fallback;
};

// Detect product type from title keywords (fallback when item.type is not set)
const detectType = (title) => {
  const t = String(title ?? "").toLowerCase();
  if (t.includes("päevitus") || t.includes("paevitus")) return "sunlounger";
  if (t.includes("tugitool")) return "armchair";
  if (t.includes("diivanilaud") || t.includes("kohvilaud") || t.includes("sohvalaud")) return "coffeetable";
  if (t.includes("konsoollaud") || t.includes("konsool")) return "consoletable";
  if (t.includes("abilaud") || t.includes("kõrvallaud") || t.includes("abielaud")) return "sidetable";
  if (t.includes("nurgadiivan") || t.includes("nurga-diivan") || t.includes("nurk-diivan") || t.includes("l-diivan")) return "cornersofa";
  if (t.includes("diivanvoodi") || t.includes("diivan-voodi")) return "sofabed";
  if (t.includes("lamamistool") || t.includes("lamamis")) return "chaiselongue";
  if (t.includes("diivan") || t.includes("diivanid")) return "sofa";
  if (t.includes("baaritool") || t.includes("baartool")) return "barstool";
  if (t.includes("kirjutuslaud") || t.includes("töölaud") || t.includes("arvutilaud")) return "desk";
  if (t.includes("serveerimislaud") || t.includes("puhvet")) return "sideboard";
  if (t.includes("riietumislaud")) return "vanity";
  if (t.includes("soogilaud")) return "table";
  if ((t.includes("ø") || t.includes("ümmargune")) && t.includes("laud")) return "roundtable";
  if (t.includes("laud")) return "table";
  if (t.includes("nagi") || t.includes("nagiriiuli") || t.includes("riidekonks") || t.includes("riidepuu")) return "coatrack";
  if (t.includes("ripptool") || t.includes("ripptugi") || t.includes("kiiktool")) return "hangingchair";
  if (t.includes("kontoritool")) return "officechair";
  if (t.includes("taburet")) return "taburet";
  if (t.includes("tool")) return "chair";
  if (t.includes("voodi") || t.includes("voodid")) return "bed";
  if (t.includes("kummut")) return "dresser";
  if (t.includes("tv kapp") || t.includes("tvkapp") || t.includes("telerialus")) return "tvunit";
  if (t.includes("garderoob") || t.includes("riidekapp")) return "wardrobe";
  if (t.includes("jalatsiriiul") || t.includes("kingseriiul")) return "shoerack";
  if (t.includes("redelriiul")) return "laddershelf";
  if (t.includes("seinariiul")) return "wallshelf";
  if (t.includes("vitriinkapp") || t.includes("vitriin")) return "vitrinecabinet";
  if (t.includes("riiul")) return "shelf";
  if (t.includes("kapp")) return "cabinet";
  if (t.includes("tumba") || t.includes("puf") || t.includes("istepadi")) return "ottoman";
  if (t.includes("pingike") || (t.includes("pink") && !t.includes("pinku"))) return "bench";
  if (t.includes("rippvalgusti") || t.includes("laevalgusti") || t.includes("lühter") || t.includes("luhter")) return "pendantlamp";
  if (t.includes("lauavalgusti") || t.includes("laualamp") || t.includes("laualamb")) return "tablelamp";
  if (t.includes("lamp") || t.includes("valgusti")) return "lamp";
  if (t.includes("vaip")) return "rug";
  if (t.includes("peegel")) return "mirror";
  if (t.includes("öökapike") || t.includes("öökapp")) return "nightstand";
  if (t.includes("vaas") || t.includes("dekor") || t.includes("aksessuaar") || t.includes("küünlajalg") || t.includes("skulptuur")) return "decor";
  if (t.includes("kaarlamp") || t.includes("kaar-lamp") || t.includes("kaarelamp")) return "arclamp";
  if (t.includes("baarikäru") || t.includes("baarikaru") || t.includes("serveerimiskäru") || t.includes("serveerimiskaru")) return "barcart";
  if (t.includes("veiniriiul") || t.includes("veinirest") || t.includes("veinihoidja")) return "winerack";
  return "box";
};

const makeMat = (hex, roughness = 0.78, metalness = 0.04) =>
  new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, envMapIntensity: 0.6 });

// Canvas-generated paint/plaster wall texture (subtle noise)
const buildWallTex = (hex, size = 256) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  // Subtle noise grain
  for (let i = 0; i < size * size * 0.4; i++) {
    const x = Math.random() * size | 0, y = Math.random() * size | 0;
    const v = (Math.random() - 0.5) * 12 | 0;
    ctx.fillStyle = `rgba(${Math.max(0,r+v)},${Math.max(0,g+v)},${Math.max(0,b+v)},0.18)`;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

// Canvas-generated wood plank floor texture — clear parquet boards
const buildWoodTex = (baseHex, _darkHex, size = 512) => {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");

  const r0 = (baseHex >> 16) & 0xff;
  const g0 = (baseHex >> 8) & 0xff;
  const b0 = baseHex & 0xff;

  const plankH = Math.round(size / 7);   // ~7 planks tall
  const plankW = Math.round(size / 2.2); // ~2 planks wide
  const numRows = Math.ceil(size / plankH) + 1;

  for (let row = 0; row < numRows; row++) {
    const offsetX = (row % 2) * (plankW * 0.55); // stagger every other row
    const numCols = Math.ceil((size + plankW) / plankW) + 1;
    for (let col = -1; col < numCols; col++) {
      const x = col * plankW - offsetX;
      const y = row * plankH;
      // Each plank gets a slightly different tone
      const v = (Math.random() - 0.5) * 28;
      const pr = Math.min(255, Math.max(0, r0 + v));
      const pg = Math.min(255, Math.max(0, g0 + v * 0.8));
      const pb = Math.min(255, Math.max(0, b0 + v * 0.6));
      ctx.fillStyle = `rgb(${pr|0},${pg|0},${pb|0})`;
      ctx.fillRect(x, y, plankW - 1, plankH - 1);

      // Wood grain lines inside each plank
      ctx.strokeStyle = `rgba(${(r0*0.7)|0},${(g0*0.65)|0},${(b0*0.5)|0},0.18)`;
      const numGrains = 5 + (Math.random() * 4 | 0);
      for (let g = 0; g < numGrains; g++) {
        const gy = y + (plankH / numGrains) * g + Math.random() * 3;
        ctx.lineWidth = 0.5 + Math.random();
        ctx.globalAlpha = 0.12 + Math.random() * 0.18;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x + plankW, gy + (Math.random() - 0.5) * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Dark gap between rows
    ctx.fillStyle = `rgba(0,0,0,0.22)`;
    ctx.fillRect(0, (row + 1) * plankH - 1, size, 1);
  }

  // Dark gaps between columns (draw over everything)
  for (let row = 0; row < numRows; row++) {
    const offsetX = (row % 2) * (plankW * 0.55);
    const numCols = Math.ceil((size + plankW) / plankW) + 1;
    for (let col = 0; col < numCols; col++) {
      const x = col * plankW - offsetX;
      ctx.fillStyle = `rgba(0,0,0,0.20)`;
      ctx.fillRect(x - 1, row * plankH, 1, plankH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

// Canvas-generated fabric/linen weave texture
const buildFabricTex = (hex, size = 128) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `#${Math.max(0, hex).toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.07;
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? "#ffffff" : "#000000";
    ctx.fillRect(x, 0, 2, size);
  }
  for (let y = 0; y < size; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(0, y, size, 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

// Wood material factory — for tabletops, shelves, cabinet bodies
const makeWoodMat = (hex) => {
  const dark = Math.max(0, hex - 0x151008);
  const tex = buildWoodTex(hex, dark);
  tex.repeat.set(2.5, 2.5);
  return new THREE.MeshStandardMaterial({ map: tex, color: hex, roughness: 0.72, metalness: 0.02, envMapIntensity: 0.5 });
};

// Fabric material factory — for sofa/chair seats, cushions
const makeFabricMat = (hex) => {
  const tex = buildFabricTex(hex);
  tex.repeat.set(4, 4);
  return new THREE.MeshStandardMaterial({ map: tex, color: hex, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.15 });
};

// --- GLB model loading ---
let _glbIndex = null;
const _glbCache = new Map();
const _glbLoader = new GLTFLoader();

const loadGlbIndex = async () => {
  if (_glbIndex !== null) return _glbIndex;
  try {
    const res = await fetch("/simulator-assets/models/index.json");
    _glbIndex = await res.json();
  } catch {
    _glbIndex = {};
  }
  return _glbIndex;
};

const _titleToHandle = (title) =>
  String(title ?? "").toLowerCase()
    .replace(/[äÄ]/g, "a").replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u").replace(/[õÕ]/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const findGlbForItem = (item, index) => {
  if (!index) return null;
  const sku = String(item.sku ?? "").trim();
  if (sku && index[sku]) return index[sku];
  const handle = _titleToHandle(item.title);
  if (index[handle]) return index[handle];
  // Try prefix match (first 2 words of handle)
  const prefix = handle.split("-").slice(0, 2).join("-");
  for (const key of Object.keys(index)) {
    if (key.startsWith(prefix)) return index[key];
  }
  return null;
};

const loadGlbModel = (filename) => {
  if (_glbCache.has(filename)) return Promise.resolve(_glbCache.get(filename));
  return new Promise((resolve, reject) => {
    _glbLoader.load(
      `/simulator-assets/models/${encodeURIComponent(filename)}`,
      (gltf) => { _glbCache.set(filename, gltf.scene); resolve(gltf.scene); },
      undefined,
      reject
    );
  });
};

const fitGlbToItem = (glbScene, W, H, D) => {
  const clone = glbScene.clone(true);
  clone.updateMatrixWorld(true);

  // Collect all vertex positions once — reused to compute rightness per candidate
  const vx = [], vy = [], vz = [];
  clone.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position) {
      child.updateMatrixWorld(true);
      const pos = child.geometry.attributes.position;
      const mat = child.matrixWorld;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mat);
        vx.push(v.x); vy.push(v.y); vz.push(v.z);
      }
    }
  });

  const box0 = new THREE.Box3().setFromObject(clone);
  const s = box0.getSize(new THREE.Vector3());

  // Aspect ratio score: how well do (sx,sy,sz) match expected W:H:D?
  // Allow X↔Z swap — model may face a different direction than catalog assumes.
  const aspectScore = (sx, sy, sz) => {
    if (sy <= 0) return Infinity;
    const rW = W / H, rD = D / H, rX = sx / sy, rZ = sz / sy;
    return Math.min(
      Math.abs(rX - rW) + Math.abs(rZ - rD),
      Math.abs(rZ - rW) + Math.abs(rX - rD)
    );
  };

  // "Rightness" = avg_rotatedY − bbox_center_Y.
  // Positive → more vertex mass above center → right-side up (thin legs below, body above).
  // Negated for opposite-direction candidates.
  const rightness = (arr) => {
    if (!arr.length) return 0;
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of arr) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    return sum / arr.length - (min + max) / 2;
  };
  const ry = rightness(vy), rzr = rightness(vz), rxr = rightness(vx);

  // 6 candidates: all axis-aligned "up" directions including 180° flip
  const candidates = [
    { rx: 0,          rz: 0,          sx: s.x, sy: s.y, sz: s.z, r: ry   },
    { rx: -Math.PI/2, rz: 0,          sx: s.x, sy: s.z, sz: s.y, r: rzr  },
    { rx:  Math.PI/2, rz: 0,          sx: s.x, sy: s.z, sz: s.y, r: -rzr },
    { rx: 0,          rz:  Math.PI/2, sx: s.y, sy: s.x, sz: s.z, r: rxr  },
    { rx: 0,          rz: -Math.PI/2, sx: s.y, sy: s.x, sz: s.z, r: -rxr },
    { rx: Math.PI,    rz: 0,          sx: s.x, sy: s.y, sz: s.z, r: -ry  },
  ];

  // Primary: lowest aspect score. Tiebreaker: highest rightness (right-side up).
  let best = candidates[0], bestAsp = aspectScore(s.x, s.y, s.z);
  for (const c of candidates) {
    const asp = aspectScore(c.sx, c.sy, c.sz);
    if (asp < bestAsp - 1e-9 || (Math.abs(asp - bestAsp) < 1e-9 && c.r > best.r)) {
      best = c; bestAsp = asp;
    }
  }

  // Wrap in container so we never override the model's own root transforms
  const container = new THREE.Group();
  if (best.rx !== 0 || best.rz !== 0) {
    const pivot = new THREE.Group();
    pivot.rotation.set(best.rx, 0, best.rz);
    pivot.add(clone);
    container.add(pivot);
  } else {
    container.add(clone);
  }

  const box = new THREE.Box3().setFromObject(container);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > 0 && size.y > 0 && size.z > 0) {
    const scale = Math.min(W / size.x, H / size.y, D / size.z);
    container.scale.setScalar(scale);
    const box2 = new THREE.Box3().setFromObject(container);
    const c2 = new THREE.Vector3();
    box2.getCenter(c2);
    container.position.set(-c2.x, -box2.min.y, -c2.z);
  }

  container.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material = child.material.clone();
    }
  });
  return container;
};

const addBox = (group, w, h, d, x, y, z, mat) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
};

const addCylinder = (group, radiusTop, radiusBottom, height, x, y, z, mat, segs = 16) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segs), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
};

const clampM = (val, minM, maxM) => Math.min(maxM, Math.max(minM, val));

const buildProductMesh = (item) => {
  const W = item.dims_cm.w * CM_TO_M;
  const H = item.dims_cm.h * CM_TO_M;
  const D = item.dims_cm.d * CM_TO_M;
  // Use backend-resolved type if available, fall back to title keyword detection
  const type = (item.type && item.type !== "cart" && item.type !== "generic" && item.type !== "existing")
    ? item.type
    : detectType(item.title);
  const group = new THREE.Group();
  group.userData.objectId = item.id;

  if (type === "sofa") {
    const mat = makeFabricMat(0xc8b090);
    const cushMat = makeFabricMat(0xd8c8a8);
    const legMat = makeMat(0x7a5c3a, 0.65, 0.0);
    const legH = clampM(H * 0.10, 0.06, 0.12);
    const seatH = H * 0.35;
    const seatD = D * 0.62;
    const backH = H * 0.50;
    const armW = W * 0.08;
    const armH = H * 0.72;
    const armD = D * 0.65;
    // Legs
    const lx2 = W / 2 - 0.06, lz2 = D / 2 - 0.05;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.04, legH, 0.04, sx * lx2, legH / 2, sz * lz2, legMat);
    }
    // Seat
    addBox(group, W, seatH, seatD, 0, legH + seatH / 2, (D - seatD) / 2, mat);
    // Backrest
    addBox(group, W, backH, D * 0.18, 0, legH + seatH + backH / 2, -D / 2 + D * 0.09, mat);
    // Armrests
    addBox(group, armW, armH, armD, -W / 2 + armW / 2, legH + armH / 2, (D - armD) / 2, mat);
    addBox(group, armW, armH, armD,  W / 2 - armW / 2, legH + armH / 2, (D - armD) / 2, mat);
    // Seat cushions (3 for wide sofa, 2 for narrow)
    const numCush = W > 1.6 ? 3 : 2;
    const cW = (W - armW * 2) / numCush - 0.02;
    for (let i = 0; i < numCush; i++) {
      const cx = -W / 2 + armW + cW / 2 + i * (cW + 0.02) + 0.01;
      // Seat cushion
      addBox(group, cW, seatH * 0.35, seatD * 0.90, cx, legH + seatH + seatH * 0.175, (D - seatD) / 2 + 0.01, cushMat);
      // Back cushion (vertical, against backrest)
      addBox(group, cW, backH * 0.75, 0.10, cx, legH + seatH + backH * 0.375, -D / 2 + D * 0.18, cushMat);
    }

  } else if (type === "cornersofa") {
    // L-shaped corner sofa (nurgadiivan) — main section + chaise extension on right side
    const mat = makeFabricMat(0xc0a888);
    const cushMat = makeFabricMat(0xd0b898);
    const legMat = makeMat(0x222222, 0.4, 0.6); // dark metal legs
    const legH = clampM(H * 0.07, 0.04, 0.09);
    const seatH = H * 0.28;
    const backH = H * 0.58;
    const backD = 0.20;
    const armW = 0.13;
    const armH = H * 0.65;
    // Main section (back part, full width, ~52% of total depth)
    const mainD = D * 0.52;
    const mainZ = D / 2 - mainD / 2;      // pushed to back
    // Chaise section (right side, front, ~45% width × ~50% depth)
    const chaseW = W * 0.45;
    const chaseD = D * 0.50;
    const chaseX = W / 2 - chaseW / 2;
    const chaseZ = -D / 2 + chaseD / 2;   // pushed to front
    // --- Legs ---
    addBox(group, 0.05, legH, 0.05, -W/2+0.08,          legH/2, D/2-0.08,   legMat); // back-left
    addBox(group, 0.05, legH, 0.05,  W/2-0.08,          legH/2, D/2-0.08,   legMat); // back-right
    addBox(group, 0.05, legH, 0.05, -W/2+0.08,          legH/2, mainZ-mainD/2+0.08, legMat); // front-left of main
    addBox(group, 0.05, legH, 0.05,  W/2-0.08,          legH/2, -D/2+0.08,  legMat); // front-right of chaise
    addBox(group, 0.05, legH, 0.05,  chaseX-chaseW/2+0.08, legH/2, -D/2+0.08, legMat); // inner-front of chaise
    // --- Seat boxes ---
    addBox(group, W,      seatH, mainD,  0,      legH + seatH/2, mainZ,  mat); // main seat
    addBox(group, chaseW, seatH, chaseD, chaseX, legH + seatH/2, chaseZ, mat); // chaise seat
    // --- Backrests ---
    addBox(group, W, backH, backD, 0, legH + seatH + backH/2, D/2 - backD/2, mat); // main back (full width)
    // Inner return wall (left side of chaise, low partial back)
    addBox(group, backD, backH * 0.40, chaseD, chaseX - chaseW/2 + backD/2, legH + seatH + backH * 0.20, chaseZ, mat);
    // --- Armrests ---
    addBox(group, armW, armH, mainD, -W/2 + armW/2, legH + armH/2, mainZ, mat); // left arm
    addBox(group, armW, seatH * 1.5, chaseD, W/2 - armW/2, legH + seatH * 0.75, chaseZ, mat); // right chaise end (low)
    // --- Seat cushions on main section ---
    const numCush = W > 2.2 ? 4 : W > 1.6 ? 3 : 2;
    const cW2 = (W - armW * 2) / numCush - 0.025;
    for (let i = 0; i < numCush; i++) {
      const cx = -W/2 + armW + cW2/2 + i*(cW2 + 0.025);
      addBox(group, cW2, seatH * 0.38, mainD * 0.86, cx, legH+seatH+seatH*0.19, mainZ, cushMat); // seat pad
      addBox(group, cW2, backH * 0.68, 0.13, cx, legH+seatH+backH*0.34, D/2-backD-0.065, cushMat); // back cushion
    }
    // Chaise lounging pad
    addBox(group, chaseW * 0.84, seatH * 0.26, chaseD * 0.86, chaseX, legH+seatH+seatH*0.13, chaseZ, cushMat);

  } else if (type === "sofabed") {
    // Sofa bed (diivanvoodi) — wider seat, lower back, clear fold-line at seat front
    const mat = makeFabricMat(0xb8a888);
    const cushMat = makeFabricMat(0xc8b898);
    const legMat = makeMat(0x5a4028, 0.65, 0.0);
    const legH = clampM(H * 0.08, 0.05, 0.10);
    const seatH = H * 0.26;
    const seatD = D * 0.72;   // wider seat than regular sofa (fold-out bed area)
    const backH = H * 0.52;
    const backD = 0.18;
    const armW = 0.10;
    const armH = H * 0.60;
    const armD = D * 0.60;
    const lx = W/2 - 0.06, lz = D/2 - 0.06;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.04, legH, 0.04, sx*lx, legH/2, sz*lz, legMat);
    }
    // Wide seat
    addBox(group, W, seatH, seatD, 0, legH + seatH/2, (D - seatD)/2, mat);
    // Backrest
    addBox(group, W, backH, backD, 0, legH + seatH + backH/2, -D/2 + backD/2, mat);
    // Armrests
    addBox(group, armW, armH, armD, -W/2 + armW/2, legH + armH/2, (D - armD)/2, mat);
    addBox(group, armW, armH, armD,  W/2 - armW/2, legH + armH/2, (D - armD)/2, mat);
    // Subtle fold-out seam line visible at front of seat
    addBox(group, W * 0.97, 0.012, 0.012, 0, legH + seatH * 0.55, D/2 - (D - seatD) - 0.04, makeMat(0x9a8878));
    // Seat cushions
    const numCush = W > 1.8 ? 3 : 2;
    const cW = (W - armW*2) / numCush - 0.02;
    for (let i = 0; i < numCush; i++) {
      const cx = -W/2 + armW + cW/2 + i*(cW + 0.02) + 0.01;
      addBox(group, cW, seatH * 0.36, seatD * 0.86, cx, legH+seatH+seatH*0.18, (D-seatD)/2 + 0.01, cushMat);
      addBox(group, cW, backH * 0.68, 0.12, cx, legH+seatH+backH*0.34, -D/2+backD+0.06, cushMat);
    }

  } else if (type === "chaiselongue") {
    // Chaise longue / lamamistool — long lounger, high back+side on one end, open other end
    const mat = makeFabricMat(0xc8b090);
    const cushMat = makeFabricMat(0xd8c8a8);
    const legMat = makeMat(0x7a5c3a, 0.65, 0.0);
    const legH = clampM(H * 0.10, 0.06, 0.12);
    const seatH = H * 0.30;
    const backH = H * 0.62;
    const backD = 0.20;
    const endW = 0.14;   // the high head-end side wall
    // 4 legs (low, slim)
    const lx = W/2 - 0.06, lz = D/2 - 0.06;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.04, legH, 0.04, sx*lx, legH/2, sz*lz, legMat);
    }
    // Main seat (full length)
    addBox(group, W, seatH, D, 0, legH + seatH/2, 0, mat);
    // Backrest along the full length (back side)
    addBox(group, W, backH, backD, 0, legH + seatH + backH/2, -D/2 + backD/2, mat);
    // High head-end side wall (left side)
    addBox(group, endW, backH, D, -W/2 + endW/2, legH + seatH + backH/2, 0, mat);
    // Low foot-end (right side, just a thin rest)
    addBox(group, endW, seatH * 0.80, D * 0.55, W/2 - endW/2, legH + seatH * 0.40, D * 0.22, mat);
    // Seat cushion (full length lounging pad)
    addBox(group, W * 0.84, seatH * 0.32, D * 0.90, 0, legH+seatH+seatH*0.16, 0, cushMat);
    // Back cushions (3 cushions along backrest)
    const numBack = Math.round(clampM(W / 0.45, 2, 4));
    const bcW = (W - endW * 2) / numBack - 0.02;
    for (let i = 0; i < numBack; i++) {
      const bx = -W/2 + endW + bcW/2 + i*(bcW + 0.02);
      addBox(group, bcW, backH * 0.65, 0.12, bx, legH+seatH+backH*0.32, -D/2+backD+0.06, cushMat);
    }
    // Head pillow at left end
    addBox(group, W * 0.22, seatH * 0.40, D * 0.20, -W/2 + W*0.11, legH+seatH+seatH*0.50, -D*0.35, makeMat(0xe8e0d0));

  } else if (type === "armchair") {
    const mat = makeFabricMat(0xc8b090);
    const cushMat = makeFabricMat(0xd8c8a8);
    const legMat = makeMat(0x7a5c3a, 0.65, 0.0);
    const legH = clampM(H * 0.10, 0.06, 0.12);
    const seatH = H * 0.35;
    const seatD = D * 0.62;
    const backH = H * 0.52;
    const armW = W * 0.12;
    const armH = H * 0.72;
    const armD = D * 0.65;
    // Legs
    const lx2 = W / 2 - 0.05, lz2 = D / 2 - 0.05;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.04, legH, 0.04, sx * lx2, legH / 2, sz * lz2, legMat);
    }
    // Seat
    addBox(group, W, seatH, seatD, 0, legH + seatH / 2, (D - seatD) / 2, mat);
    // Backrest
    addBox(group, W, backH, D * 0.18, 0, legH + seatH + backH / 2, -D / 2 + D * 0.09, mat);
    // Armrests
    addBox(group, armW, armH, armD, -W / 2 + armW / 2, legH + armH / 2, (D - armD) / 2, mat);
    addBox(group, armW, armH, armD,  W / 2 - armW / 2, legH + armH / 2, (D - armD) / 2, mat);
    // Single seat cushion + back cushion
    const cW = W - armW * 2 - 0.02;
    addBox(group, cW, seatH * 0.35, seatD * 0.90, 0, legH + seatH + seatH * 0.175, (D - seatD) / 2 + 0.01, cushMat);
    addBox(group, cW, backH * 0.72, 0.10, 0, legH + seatH + backH * 0.36, -D / 2 + D * 0.18, cushMat);

  } else if (type === "sunlounger") {
    const mat = makeMat(0xc8b090);
    const mattMat = makeMat(0xe0d4b8);
    const legH = clampM(H * 0.20, 0.10, 0.18);
    const legS = 0.025;
    const frameH = 0.04;
    // Frame / base
    addBox(group, W, frameH, D, 0, legH + frameH / 2, 0, mat);
    // Cushion (front 78% of length)
    const mattD = D * 0.78;
    const mattH = clampM(H * 0.14, 0.06, 0.10);
    addBox(group, W * 0.92, mattH, mattD, 0, legH + frameH + mattH / 2, D * 0.11, mattMat);
    // Raised headrest at rear
    const headH = clampM(H * 0.55, 0.20, 0.38);
    const headD = D * 0.22;
    addBox(group, W * 0.88, headH, headD, 0, legH + frameH + headH / 2, -(D / 2 - headD / 2), mat);
    // 4 legs
    const lx = W / 2 - legS;
    const lz = D / 2 - legS * 2;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, mat);
    }

  } else if (type === "desk") {
    const mat = makeWoodMat(0xe8e2d5);
    const darkMat = makeMat(0xc8c0b0, 0.70, 0.02);
    const topH = clampM(H * 0.05, 0.025, 0.04);
    const legH = H - topH;
    const panelW = clampM(W * 0.025, 0.02, 0.035);
    const panelD = D * 0.88;
    // Tabletop
    addBox(group, W, topH, D, 0, legH + topH / 2, 0, mat);
    // Left and right side panels (panel-leg style)
    addBox(group, panelW, legH, panelD, -W / 2 + panelW / 2, legH / 2, 0, mat);
    addBox(group, panelW, legH, panelD,  W / 2 - panelW / 2, legH / 2, 0, mat);
    // Back stretcher rail at ~50% height
    addBox(group, W * 0.90, 0.04, 0.03, 0, legH * 0.50, -D / 2 + 0.015, darkMat);

  } else if (type === "table") {
    const mat = makeWoodMat(0xb08050);
    const darkMat = makeMat(0x8a6035, 0.68, 0.02);
    const topH = clampM(H * 0.07, 0.03, 0.06);
    const apronH = clampM(H * 0.12, 0.06, 0.10);
    const legH = H - topH - apronH;
    const legS = clampM(Math.min(W, D) * 0.055, 0.035, 0.06);
    const insetX = clampM(W * 0.09, 0.06, 0.12);
    const insetZ = clampM(D * 0.09, 0.06, 0.12);
    // Tabletop
    addBox(group, W, topH, D, 0, legH + apronH + topH / 2, 0, mat);
    // Apron rails (frame under top)
    addBox(group, W - insetX * 2, apronH, legS * 0.8, 0, legH + apronH / 2, D / 2 - insetZ, darkMat);
    addBox(group, W - insetX * 2, apronH, legS * 0.8, 0, legH + apronH / 2, -(D / 2 - insetZ), darkMat);
    addBox(group, legS * 0.8, apronH, D - insetZ * 2, W / 2 - insetX, legH + apronH / 2, 0, darkMat);
    addBox(group, legS * 0.8, apronH, D - insetZ * 2, -(W / 2 - insetX), legH + apronH / 2, 0, darkMat);
    // Legs
    const lx = W / 2 - insetX;
    const lz = D / 2 - insetZ;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, darkMat);
    }

  } else if (type === "coffeetable") {
    const mat = makeWoodMat(0x7a5c3a);
    const shelfMat = makeWoodMat(0x5e4428);
    const topH = clampM(H * 0.10, 0.04, 0.06);
    const legH = H - topH;
    const legS = clampM(W * 0.05, 0.03, 0.05);
    const inset = clampM(W * 0.09, 0.06, 0.12);
    const lx = W / 2 - inset;
    const lz = D / 2 - inset;
    // Tabletop
    addBox(group, W, topH, D, 0, legH + topH / 2, 0, mat);
    // Legs
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, mat);
    }
    // Lower shelf at 45% leg height
    addBox(group, W * 0.82, 0.015, D * 0.82, 0, legH * 0.45, 0, shelfMat);

  } else if (type === "chair") {
    const mat = makeMat(0xa09080);
    const cushMat = makeFabricMat(0xb8a898);
    const legMat = makeMat(0x7a5c3a, 0.65, 0.0);
    const legH = H * 0.50;
    const seatH = clampM(H * 0.07, 0.025, 0.045);
    const backH = H * 0.48;
    const legS = clampM(W * 0.07, 0.025, 0.04);
    const slat = legS * 0.55;
    const backZ = -D / 2 + legS * 0.6;
    // Legs
    const lx = W / 2 - legS;
    const lz = D / 2 - legS;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, legMat);
    }
    // Seat slab
    addBox(group, W, seatH, D, 0, legH + seatH / 2, 0, mat);
    // Seat cushion pad
    addBox(group, W * 0.88, seatH * 0.9, D * 0.88, 0, legH + seatH + seatH * 0.45, 0, cushMat);
    // Backrest: top rail + 3 vertical spindles
    addBox(group, W, seatH * 0.9, slat, 0, legH + seatH + backH - seatH * 0.45, backZ, mat);
    for (const sx of [-W / 3, 0, W / 3]) {
      addBox(group, slat, backH, slat, sx, legH + seatH + backH / 2, backZ, mat);
    }

  } else if (type === "bed") {
    const mat = makeMat(0xe0d8cc);
    const mattMat = makeMat(0xf0ece4);
    const pillowMat = makeMat(0xfaf8f4);
    const frameH = clampM(H * 0.25, 0.14, 0.22);
    const mattH = clampM(H * 0.22, 0.12, 0.20);
    const headH = H * 0.60;
    const headD = 0.09;
    const footH = H * 0.28;
    // Frame
    addBox(group, W, frameH, D, 0, frameH / 2, 0, mat);
    // Mattress
    addBox(group, W * 0.94, mattH, D * 0.86, 0, frameH + mattH / 2, 0, mattMat);
    // Headboard at back
    addBox(group, W, headH, headD, 0, headH / 2, -D / 2 - headD / 2, mat);
    // Footboard at front
    addBox(group, W, footH, headD, 0, footH / 2, D / 2 + headD / 2, mat);
    // 2 Pillows near headboard
    const pillowW = W * 0.36, pillowD = D * 0.11;
    for (const sx of [-1, 1]) {
      addBox(group, pillowW, 0.06, pillowD, sx * W * 0.22, frameH + mattH + 0.03, -D * 0.86 / 2 + pillowD, pillowMat);
    }

  } else if (type === "shelf") {
    const mat = makeWoodMat(0xc0a870);
    const darkMat = makeWoodMat(0xa08858);
    const thick = 0.018;
    // Back panel
    addBox(group, W, H, thick, 0, H / 2, -D / 2 + thick / 2, darkMat);
    // Left and right sides
    addBox(group, thick, H, D, -W / 2 + thick / 2, H / 2, 0, mat);
    addBox(group, thick, H, D,  W / 2 - thick / 2, H / 2, 0, mat);
    // Bottom and top
    addBox(group, W, thick, D, 0, thick / 2, 0, mat);
    addBox(group, W, thick, D, 0, H - thick / 2, 0, mat);
    // 4 internal shelves at even spacing
    for (const frac of [0.20, 0.40, 0.60, 0.80]) {
      addBox(group, W - thick * 2, thick, D - thick, 0, H * frac, thick / 2, mat);
    }

  } else if (type === "cabinet") {
    const mat = makeWoodMat(0xc0a870);
    const darkMat = makeMat(0x8a7050, 0.65, 0.02);
    const handleMat = makeMat(0x888888, 0.35, 0.7);
    const footH = 0.04;
    const bodyH = H - footH;
    const thick = 0.018;
    // Feet
    const fx = W / 2 - 0.05, fz = D / 2 - 0.05;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.04, footH, 0.04, sx * fx, footH / 2, sz * fz, darkMat);
    }
    // Body
    addBox(group, W, bodyH, D, 0, footH + bodyH / 2, 0, mat);
    // Left door outline: top, bottom, right-edge strips
    const doorW = W / 2 - thick / 2;
    const doorX = [-W / 4, W / 4]; // left and right door centers
    for (const dx of doorX) {
      // Top rail
      addBox(group, doorW * 0.92, thick, thick, dx, footH + bodyH * 0.94, D / 2, darkMat);
      // Bottom rail
      addBox(group, doorW * 0.92, thick, thick, dx, footH + bodyH * 0.08, D / 2, darkMat);
      // Inner vertical stile
      addBox(group, thick, bodyH * 0.88, thick, dx + (dx < 0 ? doorW * 0.46 : -doorW * 0.46), footH + bodyH / 2, D / 2, darkMat);
      // Handle
      addBox(group, 0.02, 0.06, 0.015, dx + (dx < 0 ? doorW * 0.30 : -doorW * 0.30), footH + bodyH * 0.52, D / 2 + 0.008, handleMat);
    }

  } else if (type === "dresser") {
    const mat = makeWoodMat(0xc8b898);
    const darkMat = makeMat(0x8a7050, 0.65, 0.02);
    const faceMat = makeWoodMat(0xd0c0a0);
    const handleMat = makeMat(0x888888, 0.35, 0.7);
    const numDrawers = 4;
    const drawerH = H / numDrawers;
    // Body
    addBox(group, W, H, D, 0, H / 2, 0, mat);
    // Drawer rows
    for (let i = 0; i < numDrawers; i++) {
      const y = i * drawerH + drawerH / 2;
      // Divider line between drawers
      if (i > 0) addBox(group, W * 0.98, 0.012, D * 0.018, 0, i * drawerH, D / 2, darkMat);
      // Drawer face panel (slight color contrast)
      addBox(group, W * 0.95, drawerH * 0.80, 0.006, 0, y, D / 2 + 0.001, faceMat);
      // Centered bar handle
      addBox(group, W * 0.28, 0.022, 0.022, 0, y, D / 2 + 0.012, handleMat);
    }

  } else if (type === "tvunit") {
    const woodMat = makeWoodMat(0x6b4f30);
    const metalMat = makeMat(0x3a3a3a, 0.35, 0.75);
    const innerMat = makeWoodMat(0x4a3520);
    const legH = clampM(H * 0.28, 0.12, 0.18);
    const bodyH = H - legH;
    const legS = 0.035;
    const panelT = 0.018;
    // Metal legs
    const lx = W / 2 - legS * 2;
    const lz = D / 2 - legS * 2;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, metalMat);
    }
    // Open-front construction: back, bottom, top, left side, right side
    addBox(group, W, panelT, D, 0, legH + panelT / 2, 0, woodMat);            // bottom
    addBox(group, W, panelT, D, 0, legH + bodyH - panelT / 2, 0, woodMat);    // top
    addBox(group, W, bodyH, panelT, 0, legH + bodyH / 2, -D / 2 + panelT / 2, woodMat); // back
    addBox(group, panelT, bodyH, D, -W / 2 + panelT / 2, legH + bodyH / 2, 0, woodMat); // left
    addBox(group, panelT, bodyH, D,  W / 2 - panelT / 2, legH + bodyH / 2, 0, woodMat); // right
    // 2 interior dividers
    for (const sx of [-W / 3, W / 3]) {
      addBox(group, panelT, bodyH * 0.88, D * 0.88, sx, legH + bodyH / 2, 0, innerMat);
    }

  } else if (type === "wardrobe") {
    const mat = makeMat(0xf0ede8);
    const darkMat = makeMat(0xc0b8b0);
    const handleMat = makeMat(0x888888);
    // Body
    addBox(group, W, H, D, 0, H / 2, 0, mat);
    // Door count based on actual width
    const numDoors = W > 1.8 ? 3 : 2;
    const doorW = W / numDoors;
    // Door gap lines + handles
    for (let i = 0; i < numDoors; i++) {
      const doorCenterX = -W / 2 + doorW * i + doorW / 2;
      // Gap line between doors
      if (i > 0) addBox(group, 0.012, H * 0.93, 0.012, -W / 2 + doorW * i, H / 2, D / 2, darkMat);
      // Handle: near inner edge of each door
      const handleX = doorCenterX + (i < numDoors - 1 ? -doorW * 0.28 : doorW * 0.28) * (i === 0 ? -1 : 1);
      addBox(group, 0.012, 0.10, 0.012, doorCenterX + doorW * 0.28 * (i === 0 ? 1 : -1), H * 0.55, D / 2 + 0.006, handleMat);
    }
    // Base board
    addBox(group, W, 0.08, D * 0.18, 0, 0.04, D / 2 - D * 0.09, darkMat);

  } else if (type === "ottoman") {
    const mat = makeFabricMat(0xb8a078);
    const topMat = makeFabricMat(0xc8b890);
    const legMat = makeMat(0x7a5c3a, 0.65, 0.0);
    const btnMat = makeMat(0x6a4828, 0.5, 0.0);
    const legH = clampM(H * 0.25, 0.07, 0.12);
    const legS = 0.04;
    const bodyH = H - legH;
    // Legs
    const lx = W / 2 - 0.06, lz = D / 2 - 0.06;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, legMat);
    }
    // Cushion body
    addBox(group, W, bodyH, D, 0, legH + bodyH / 2, 0, mat);
    // Top pad (slightly proud)
    addBox(group, W * 0.92, 0.04, D * 0.92, 0, legH + bodyH + 0.02, 0, topMat);
    // Center button
    addBox(group, 0.03, 0.025, 0.03, 0, legH + bodyH + 0.04, 0, btnMat);

  } else if (type === "bench") {
    const mat = makeWoodMat(0x9b8060);
    const darkMat = makeMat(0x7a5c3a, 0.65, 0.0);
    const legH = clampM(H * 0.75, 0.28, 0.40);
    const seatH = H - legH;
    const legS = clampM(W * 0.05, 0.03, 0.05);
    const lx = W / 2 - legS * 1.5;
    const lz = D / 2 - legS * 1.5;
    // Seat
    addBox(group, W, seatH, D, 0, legH + seatH / 2, 0, mat);
    // 4 Legs
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, darkMat);
    }
    // Stretcher bars front and rear at mid-leg height
    addBox(group, W * 0.82, legS * 0.7, legS * 0.7, 0, legH * 0.45, lz, darkMat);
    addBox(group, W * 0.82, legS * 0.7, legS * 0.7, 0, legH * 0.45, -lz, darkMat);

  } else if (type === "lamp") {
    const metalMat = makeMat(0x888888);
    const shadeMat = makeMat(0xd8d0b8);
    const baseW = clampM(W, 0.25, 0.40);
    const baseD = clampM(D, 0.25, 0.40);
    const poleH = clampM(H * 0.82, 1.20, 1.80);
    // Base (slightly raised disc)
    addBox(group, baseW, 0.05, baseD, 0, 0.025, 0, metalMat);
    // Pole
    addBox(group, 0.03, poleH, 0.03, 0, poleH / 2, 0, metalMat);
    // Neck connector
    addBox(group, 0.05, 0.06, 0.05, 0, poleH + 0.03, 0, metalMat);
    // Drum shade (wider, shorter — like a real drum lampshade)
    addBox(group, 0.34, 0.24, 0.34, 0, poleH + 0.15, 0, shadeMat);

  } else if (type === "rug") {
    const color = item.color || "#c0b090";
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.0 });
    addBox(group, W, 0.02, D, 0, 0.01, 0, mat);

  } else if (type === "mirror") {
    const frameMat = makeMat(0xc0a870);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8c0, roughness: 0.05, metalness: 0.55 });
    const frameD = clampM(D, 0.04, 0.08);
    // Frame body
    addBox(group, W, H, frameD, 0, H / 2, 0, frameMat);
    // Glass inset
    addBox(group, W * 0.84, H * 0.88, 0.015, 0, H / 2, frameD / 2 + 0.005, glassMat);

  } else if (type === "nightstand") {
    const mat = makeMat(0xc8b898);
    const darkMat = makeMat(0x8a7050);
    const legH = clampM(H * 0.12, 0.05, 0.10);
    const bodyH = H - legH;
    const legS = 0.03;
    const lx = W / 2 - legS * 1.5;
    const lz = D / 2 - legS * 1.5;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, mat);
    }
    addBox(group, W, bodyH, D, 0, legH + bodyH / 2, 0, mat);
    // Mid shelf
    addBox(group, W * 0.96, 0.015, D * 0.96, 0, legH + bodyH * 0.50, 0, darkMat);
    // Drawer pull
    addBox(group, 0.04, 0.02, 0.02, 0, legH + bodyH * 0.25, D / 2 + 0.01, darkMat);

  } else if (type === "barstool") {
    // Bar stool: tall legs, round seat at ~70% height, no backrest, footrest ring
    const mat = makeMat(0xa09080);
    const cushMat = makeMat(0xb8a898);
    const metalMat = makeMat(0x888888);
    const seatY = clampM(H * 0.72, 0.60, 0.82);
    const legS = 0.025;
    const footY = seatY * 0.38;
    // 4 legs from floor to seat
    const lx = W / 2 - legS * 2, lz = D / 2 - legS * 2;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, seatY, legS, sx * lx, seatY / 2, sz * lz, metalMat);
    }
    // Footrest ring: front and rear bars at ~38% height
    addBox(group, W * 0.75, legS, legS, 0, footY, lz, metalMat);
    addBox(group, W * 0.75, legS, legS, 0, footY, -lz, metalMat);
    // Seat slab
    addBox(group, W, legS * 1.5, D, 0, seatY + legS * 0.75, 0, mat);
    // Seat cushion pad
    addBox(group, W * 0.88, legS * 2, D * 0.88, 0, seatY + legS * 1.8, 0, cushMat);

  } else if (type === "coatrack") {
    // Coat rack: heavy base + central pole + angled hooks radiating near top
    const poleMat = makeMat(0x5a5050);
    const baseMat = makeMat(0x3a3030);
    const poleH = clampM(H * 0.92, 1.50, 1.85);
    const poleW = 0.04;
    // Tripod base feet (3 arms radiating outward)
    const baseR = clampM(W * 0.45, 0.20, 0.35);
    for (const angle of [0, 120, 240]) {
      const rad = angle * Math.PI / 180;
      addBox(group, baseR, 0.025, 0.04, Math.sin(rad) * baseR / 2, 0.012, Math.cos(rad) * baseR / 2, baseMat);
    }
    // Central pole
    addBox(group, poleW, poleH, poleW, 0, poleH / 2, 0, poleMat);
    // 4 hooks near top, pointing outward at slight upward angle
    const hookY = poleH * 0.82;
    const hookLen = 0.14;
    const hookH = 0.04;
    for (const [hx, hz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      addBox(group, Math.abs(hx) ? hookLen : poleW, hookH, Math.abs(hz) ? hookLen : poleW,
        hx * (poleW / 2 + hookLen / 2), hookY + hookH / 2, hz * (poleW / 2 + hookLen / 2), poleMat);
    }
    // Small knobs at hook tips
    for (const [hx, hz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      addBox(group, 0.04, 0.04, 0.04,
        hx * (poleW / 2 + hookLen), hookY + hookH, hz * (poleW / 2 + hookLen), baseMat);
    }

  } else if (type === "sidetable") {
    // Side/accent table: small round-ish top, single slim pedestal or 3 slim legs
    const mat = makeMat(0xb08050);
    const darkMat = makeMat(0x7a5c3a);
    const topH = clampM(H * 0.07, 0.025, 0.04);
    const legH = H - topH;
    const legS = clampM(Math.min(W, D) * 0.08, 0.025, 0.045);
    // Tabletop (slightly rounded feel with thin top)
    addBox(group, W, topH, D, 0, legH + topH / 2, 0, mat);
    // 3 slim legs arranged in triangle (more elegant than 4)
    const r = Math.min(W, D) / 2 - legS;
    for (const angle of [90, 210, 330]) {
      const rad = angle * Math.PI / 180;
      addBox(group, legS, legH, legS, Math.cos(rad) * r, legH / 2, Math.sin(rad) * r, darkMat);
    }

  } else if (type === "consoletable") {
    // Console table: narrow deep-front table with shelf, placed against wall
    const mat = makeMat(0xc8b090);
    const darkMat = makeMat(0x8a6840);
    const topH = clampM(H * 0.05, 0.025, 0.04);
    const legH = H - topH;
    const legS = clampM(D * 0.07, 0.025, 0.04);
    const insetX = clampM(W * 0.06, 0.04, 0.08);
    const insetZ = clampM(D * 0.10, 0.04, 0.07);
    // Tabletop
    addBox(group, W, topH, D, 0, legH + topH / 2, 0, mat);
    // 4 slim legs
    const lx = W / 2 - insetX, lz = D / 2 - insetZ;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, darkMat);
    }
    // Lower shelf at 35% height (console tables almost always have one)
    addBox(group, W * 0.88, 0.015, D * 0.80, 0, legH * 0.35, 0, darkMat);
    // Apron rail at front only (decorative)
    addBox(group, W - insetX * 2, clampM(H * 0.08, 0.04, 0.08), 0.02, 0, legH * 0.92, D / 2 - insetZ, darkMat);

  } else if (type === "pendantlamp") {
    // Pendant / ceiling lamp: cord/chain from top, shade hanging below ceiling
    const cordMat = makeMat(0x444444);
    const shadeMat = makeMat(0xd8d0b8);
    const metalMat = makeMat(0x888888);
    const shadeH = clampM(H * 0.28, 0.18, 0.32);
    const shadeW = clampM(W, 0.24, 0.50);
    const shadeD = clampM(D, 0.24, 0.50);
    const cordH = clampM(H * 0.60, 0.80, 1.60);
    const ceilingH = clampM(H, 1.20, 2.20);
    // Ceiling canopy (small disc at top)
    addBox(group, 0.10, 0.04, 0.10, 0, ceilingH - 0.02, 0, metalMat);
    // Cord / thin cable
    addBox(group, 0.015, cordH, 0.015, 0, ceilingH - 0.04 - cordH / 2, 0, cordMat);
    // Shade (wide cone-ish drum shape — wider at bottom)
    addBox(group, shadeW, shadeH * 0.65, shadeD, 0, ceilingH - 0.04 - cordH - shadeH * 0.40, 0, shadeMat);
    // Bottom disc (darker, like the inside of shade)
    addBox(group, shadeW * 0.88, 0.02, shadeD * 0.88, 0, ceilingH - 0.04 - cordH - shadeH * 0.72, 0, metalMat);

  } else if (type === "tablelamp") {
    // Table lamp: decorative base + short pole + drum shade
    const baseMat = makeMat(0xc8b090);
    const shadeMat = makeMat(0xe8e0cc);
    const metalMat = makeMat(0x888880);
    const baseH = clampM(H * 0.30, 0.10, 0.18);
    const poleH = clampM(H * 0.25, 0.08, 0.15);
    const shadeH = clampM(H * 0.32, 0.12, 0.20);
    const shadeW = clampM(W * 1.10, 0.20, 0.40);
    const shadeD = clampM(D * 1.10, 0.20, 0.40);
    // Decorative base (wider at bottom, taper faked by 2 boxes)
    addBox(group, clampM(W * 0.70, 0.10, 0.22), baseH * 0.55, clampM(D * 0.70, 0.10, 0.22), 0, baseH * 0.275, 0, baseMat);
    addBox(group, clampM(W * 0.45, 0.06, 0.14), baseH * 0.50, clampM(D * 0.45, 0.06, 0.14), 0, baseH * 0.75, 0, baseMat);
    // Short neck pole
    addBox(group, 0.025, poleH, 0.025, 0, baseH + poleH / 2, 0, metalMat);
    // Drum shade
    addBox(group, shadeW, shadeH, shadeD, 0, baseH + poleH + shadeH / 2, 0, shadeMat);
    // Shade inner (bottom dark ring)
    addBox(group, shadeW * 0.90, 0.015, shadeD * 0.90, 0, baseH + poleH + 0.01, 0, metalMat);

  } else if (type === "laddershelf") {
    // Ladder shelf: 2 vertical angled rails + 4-5 horizontal planks, no back panel
    const railMat = makeMat(0x8a6a40, 0.65, 0.02);
    const plankMat = makeWoodMat(0xc0a070);
    const railW = 0.035;
    const railD = 0.035;
    const numShelves = Math.round(clampM(H / 0.38, 3, 5));
    // 2 vertical rails (slight lean: top is narrower than bottom to mimic ladder lean)
    addBox(group, railW, H, railD, -W / 2 + railW / 2, H / 2, 0, railMat);
    addBox(group, railW, H, railD,  W / 2 - railW / 2, H / 2, 0, railMat);
    // Horizontal shelf planks at even spacing
    const gapFrac = 1 / (numShelves + 1);
    for (let i = 1; i <= numShelves; i++) {
      const y = H * gapFrac * i;
      addBox(group, W - railW * 2, 0.022, D, 0, y, 0, plankMat);
    }

  } else if (type === "wallshelf") {
    // Wall shelf: flat horizontal plank + 2 bracket arms underneath (very shallow)
    const plankMat = makeMat(0xc0a070);
    const bracketMat = makeMat(0x8a6a40);
    const plankH = 0.022;
    const plankD = clampM(D, 0.18, 0.30);
    const bracketH = clampM(plankD * 0.85, 0.14, 0.25);
    const bracketT = 0.015;
    const mountH = clampM(H, 0.80, 1.60); // shelf surface height from floor
    // Shelf plank
    addBox(group, W, plankH, plankD, 0, mountH, 0, plankMat);
    // 2 bracket arms (L-shaped faked: 1 vertical + 1 horizontal diagonal arm)
    for (const bx of [-W / 2 + 0.06, W / 2 - 0.06]) {
      // Vertical part (wall side)
      addBox(group, bracketT, bracketH, bracketT, bx, mountH - bracketH / 2, -plankD / 2 + bracketT / 2, bracketMat);
      // Horizontal arm under plank
      addBox(group, bracketT, bracketT, plankD * 0.80, bx, mountH - bracketT / 2, 0, bracketMat);
    }

  } else if (type === "vitrinecabinet") {
    // Vitrine / display cabinet: frame body + glass front panels + internal shelves
    const mat = makeWoodMat(0xd0c8b8);
    const darkMat = makeMat(0x8a7050, 0.65, 0.02);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8d0, roughness: 0.04, metalness: 0.60, transparent: true, opacity: 0.55, envMapIntensity: 1.0 });
    const handleMat = makeMat(0x888888, 0.35, 0.7);
    const thick = 0.018;
    const footH = 0.04;
    const bodyH = H - footH;
    // Feet
    const fx = W / 2 - 0.05, fz = D / 2 - 0.05;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.04, footH, 0.04, sx * fx, footH / 2, sz * fz, darkMat);
    }
    // Body (sides, back, top, bottom) — open front
    addBox(group, W, bodyH, thick, 0, footH + bodyH / 2, -D / 2 + thick / 2, mat);  // back
    addBox(group, W, thick, D, 0, footH + thick / 2, 0, mat);                         // bottom
    addBox(group, W, thick, D, 0, footH + bodyH - thick / 2, 0, mat);                 // top
    addBox(group, thick, bodyH, D, -W / 2 + thick / 2, footH + bodyH / 2, 0, mat);   // left
    addBox(group, thick, bodyH, D,  W / 2 - thick / 2, footH + bodyH / 2, 0, mat);   // right
    // Internal glass shelves (2)
    for (const frac of [0.35, 0.65]) {
      const shelfMesh = new THREE.Mesh(
        new THREE.BoxGeometry(W - thick * 2, 0.008, D - thick),
        new THREE.MeshStandardMaterial({ color: 0xa8c8d0, roughness: 0.04, metalness: 0.30, transparent: true, opacity: 0.50 })
      );
      shelfMesh.position.set(0, footH + bodyH * frac, 0);
      shelfMesh.castShadow = true;
      group.add(shelfMesh);
    }
    // Glass front doors (2 panels)
    const doorW = W / 2;
    for (const dx of [-W / 4, W / 4]) {
      const glassDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW - thick, bodyH * 0.94, 0.006), glassMat);
      glassDoor.position.set(dx, footH + bodyH / 2, D / 2 - 0.003);
      group.add(glassDoor);
    }
    // Door gap line
    addBox(group, 0.010, bodyH * 0.94, 0.010, 0, footH + bodyH / 2, D / 2, darkMat);
    // Door handles
    for (const dx of [-W * 0.10, W * 0.10]) {
      addBox(group, 0.012, 0.08, 0.015, dx, footH + bodyH * 0.52, D / 2 + 0.008, handleMat);
    }

  } else if (type === "taburet") {
    // Taburet: simple backless stool — 4 legs + flat seat, no backrest
    const mat = makeMat(0xa09080);
    const legMat = makeMat(0x7a5c3a);
    const seatH = clampM(H * 0.10, 0.03, 0.06);
    const legH = H - seatH;
    const legS = clampM(Math.min(W, D) * 0.10, 0.025, 0.045);
    const lx = W / 2 - legS * 1.5;
    const lz = D / 2 - legS * 1.5;
    // 4 legs
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, legMat);
    }
    // Seat slab
    addBox(group, W, seatH, D, 0, legH + seatH / 2, 0, mat);
    // Stretcher bars connecting legs at mid height
    addBox(group, W * 0.78, legS * 0.7, legS * 0.7, 0, legH * 0.45, lz, legMat);
    addBox(group, W * 0.78, legS * 0.7, legS * 0.7, 0, legH * 0.45, -lz, legMat);
    addBox(group, legS * 0.7, legS * 0.7, D * 0.78, lx, legH * 0.45, 0, legMat);
    addBox(group, legS * 0.7, legS * 0.7, D * 0.78, -lx, legH * 0.45, 0, legMat);

  } else if (type === "sideboard") {
    // Sideboard / buffet / puhvet: wide low cabinet, 2 door sections + top drawer row
    const mat = makeWoodMat(0xc8b898);
    const darkMat = makeMat(0x8a7050, 0.65, 0.02);
    const handleMat = makeMat(0x888888, 0.35, 0.7);
    const thick = 0.018;
    const legH = clampM(H * 0.10, 0.06, 0.12);
    const bodyH = H - legH;
    const legS = 0.035;
    // 4 short legs
    const lx = W / 2 - legS * 2, lz = D / 2 - legS * 2;
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, darkMat);
    }
    // Body
    addBox(group, W, bodyH, D, 0, legH + bodyH / 2, 0, mat);
    // Top drawer row (upper ~25% of body height)
    const drawerRowH = bodyH * 0.25;
    addBox(group, W * 0.98, thick, D * 0.02, 0, legH + drawerRowH, D / 2, darkMat);
    // 3 drawer pulls in top row
    for (const fx of [-W / 3, 0, W / 3]) {
      addBox(group, 0.08, 0.018, 0.018, fx, legH + drawerRowH / 2, D / 2 + 0.01, handleMat);
    }
    // 2 door sections (lower ~75% of body)
    const doorBodyH = bodyH * 0.72;
    const doorY = legH + drawerRowH + doorBodyH / 2 + thick / 2;
    // Center divider line
    addBox(group, thick, doorBodyH, thick, 0, doorY, D / 2, darkMat);
    // Door outlines: left and right
    for (const dx of [-W / 4, W / 4]) {
      addBox(group, W / 2 * 0.90, thick, thick, dx, doorY + doorBodyH * 0.46, D / 2, darkMat);
      addBox(group, W / 2 * 0.90, thick, thick, dx, doorY - doorBodyH * 0.46, D / 2, darkMat);
      // Door handle
      addBox(group, 0.02, 0.06, 0.016, dx + (dx < 0 ? W / 8 : -W / 8), doorY, D / 2 + 0.008, handleMat);
    }

  } else if (type === "shoerack") {
    // Shoe rack: open frame with 3 angled shelf rows for shoes
    const frameMat = makeMat(0x8a7050);
    const shelfMat = makeMat(0xb09060);
    const thick = 0.022;
    const legH = H;
    // Left and right side frames
    addBox(group, thick, legH, D, -W / 2 + thick / 2, legH / 2, 0, frameMat);
    addBox(group, thick, legH, D,  W / 2 - thick / 2, legH / 2, 0, frameMat);
    // Back rail top and bottom
    addBox(group, W, thick, thick, 0, thick / 2, -D / 2 + thick / 2, frameMat);
    addBox(group, W, thick, thick, 0, H - thick / 2, -D / 2 + thick / 2, frameMat);
    // 3 angled shelf rails (shoes rest on pairs of rails at a slight angle)
    const numRows = 3;
    for (let i = 0; i < numRows; i++) {
      const y = H * (0.20 + i * 0.28);
      // Front rail (higher) + rear rail (lower) — gives the angled look
      addBox(group, W - thick * 2, thick, thick, 0, y + 0.035, D / 2 - 0.04, shelfMat);
      addBox(group, W - thick * 2, thick, thick, 0, y - 0.025, -D / 2 + 0.04, shelfMat);
    }

  } else if (type === "vanity") {
    // Vanity / riietumislaud: desk-like table + tall mirror on top
    const mat = makeMat(0xf0ede8);
    const darkMat = makeMat(0xc0b0a0);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8c0, roughness: 0.05, metalness: 0.55 });
    const topH = clampM(H * 0.05, 0.025, 0.04);
    const tableH = clampM(H * 0.45, 0.65, 0.78);
    const legH = tableH - topH;
    const legS = 0.03;
    const mirrorH = clampM(H * 0.50, 0.40, 0.65);
    const mirrorW = clampM(W * 0.55, 0.30, 0.55);
    const mirrorD = 0.06;
    const lx = W / 2 - legS * 2, lz = D / 2 - legS * 2;
    // 4 slim legs
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, legH / 2, sz * lz, mat);
    }
    // Tabletop
    addBox(group, W, topH, D, 0, tableH - topH / 2, 0, mat);
    // 1 drawer
    addBox(group, W * 0.50, clampM(H * 0.08, 0.05, 0.10), 0.016, 0, tableH - clampM(H * 0.08, 0.05, 0.10) / 2 - topH, D / 2, darkMat);
    // Mirror frame on top, centered at back
    addBox(group, mirrorW, mirrorH, mirrorD, 0, tableH + mirrorH / 2, -D / 2 + mirrorD / 2, mat);
    // Glass inset
    addBox(group, mirrorW * 0.84, mirrorH * 0.88, 0.012, 0, tableH + mirrorH / 2, -D / 2 + mirrorD + 0.005, glassMat);

  } else if (type === "decor") {
    // Decorative object — vase silhouette faked with 4 stacked tapered boxes
    const mat = makeMat(parseHexColor(item.color, 0xb8a888));
    const baseW = clampM(W, 0.06, 0.22);
    const baseD = clampM(D, 0.06, 0.22);
    const totalH = clampM(H, 0.12, 0.50);
    // Base disc (wide, flat)
    addBox(group, baseW, totalH * 0.08, baseD, 0, totalH * 0.04, 0, mat);
    // Lower body (widest part)
    addBox(group, baseW * 0.85, totalH * 0.38, baseD * 0.85, 0, totalH * 0.08 + totalH * 0.19, 0, mat);
    // Waist (narrowest)
    addBox(group, baseW * 0.50, totalH * 0.22, baseD * 0.50, 0, totalH * 0.08 + totalH * 0.38 + totalH * 0.11, 0, mat);
    // Neck / rim (slightly flared)
    addBox(group, baseW * 0.62, totalH * 0.32, baseD * 0.62, 0, totalH * 0.08 + totalH * 0.38 + totalH * 0.22 + totalH * 0.16, 0, mat);

  } else if (type === "roundtable") {
    // Round table: circular top + 4 legs or pedestal base
    const mat = makeWoodMat(0xb08050);
    const darkMat = makeMat(0x8a6035, 0.68, 0.02);
    const radius = Math.min(W, D) / 2;
    const topH = clampM(H * 0.06, 0.025, 0.05);
    const legH = H - topH;
    // Circular top
    addCylinder(group, radius, radius, topH, 0, legH + topH / 2, 0, mat, 32);
    // Pedestal (single column) for small tables, 4 legs for large
    if (radius < 0.55) {
      // Pedestal: wide at base, narrows at top
      addCylinder(group, 0.04, 0.10, legH, 0, legH / 2, 0, darkMat, 12);
      addCylinder(group, clampM(radius * 0.55, 0.12, 0.25), clampM(radius * 0.55, 0.12, 0.25), 0.025, 0, 0.012, 0, darkMat, 12);
    } else {
      // 4 legs inset under circular top
      const lOffset = radius * 0.65;
      const legS = clampM(radius * 0.08, 0.03, 0.055);
      for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        addBox(group, legS, legH, legS, sx * lOffset * 0.70, legH / 2, sz * lOffset * 0.70, darkMat);
      }
    }

  } else if (type === "officechair") {
    // Office chair: 5-star base + pneumatic column + padded seat + tall backrest + armrests
    const seatMat = makeMat(0x1a1a2e);
    const cushMat = makeMat(0x2a2a44);
    const metalMat = makeMat(0x888888);
    const wheelMat = makeMat(0x333333);
    // 5-star base arms
    const baseY = 0.035;
    const armLen = clampM(W * 0.46, 0.18, 0.28);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const cx = Math.cos(angle) * armLen / 2;
      const cz = Math.sin(angle) * armLen / 2;
      addBox(group, armLen, 0.022, 0.03, cx, baseY, cz, metalMat);
      // Wheel at tip
      addBox(group, 0.04, 0.035, 0.04, Math.cos(angle) * armLen, baseY - 0.008, Math.sin(angle) * armLen, wheelMat);
    }
    // Pneumatic column (cylinder)
    const colH = clampM(H * 0.36, 0.26, 0.44);
    addCylinder(group, 0.024, 0.034, colH, 0, baseY + colH / 2, 0, metalMat, 12);
    // Seat
    const seatH = 0.065;
    const seatY = baseY + colH;
    addBox(group, W * 0.86, seatH, D * 0.86, 0, seatY + seatH / 2, 0, seatMat);
    // Seat cushion pad
    addBox(group, W * 0.80, seatH * 0.55, D * 0.80, 0, seatY + seatH + seatH * 0.275, 0, cushMat);
    // Tall padded backrest
    const backH = clampM(H * 0.54, 0.38, 0.58);
    addBox(group, W * 0.72, backH, 0.09, 0, seatY + seatH + backH / 2, -D / 2 + 0.045, seatMat);
    // Lumbar curve detail (lighter strip at lower back)
    addBox(group, W * 0.65, backH * 0.28, 0.015, 0, seatY + seatH + backH * 0.18, -D / 2 + 0.055, cushMat);
    // Armrests
    const armW = W * 0.50;
    const armY = seatY + seatH + backH * 0.28;
    addBox(group, 0.052, 0.022, D * 0.48, armW, armY, 0, seatMat);
    addBox(group, 0.052, 0.022, D * 0.48, -armW, armY, 0, seatMat);
    // Armrest posts
    addBox(group, 0.025, backH * 0.26, 0.025, armW, seatY + seatH + backH * 0.13, -D * 0.20, metalMat);
    addBox(group, 0.025, backH * 0.26, 0.025, -armW, seatY + seatH + backH * 0.13, -D * 0.20, metalMat);

  } else if (type === "arclamp") {
    // Arc floor lamp: heavy base + vertical rear pole + horizontal arc arm + hanging shade
    const baseMat = makeMat(0x3a3a3a);
    const poleMat = makeMat(0x888888);
    const shadeMat = makeMat(0xe8e0c8);
    const baseW = clampM(W * 0.52, 0.28, 0.48);
    const baseD = clampM(D * 0.48, 0.24, 0.40);
    // Heavy rectangular counterweight base
    addBox(group, baseW, 0.07, baseD, 0, 0.035, 0, baseMat);
    // Vertical pole at rear-left of base going up ~85% of height
    const poleH = clampM(H * 0.86, 1.50, 2.05);
    const poleX = -baseW / 2 + 0.04;
    addBox(group, 0.024, poleH, 0.024, poleX, poleH / 2, 0, poleMat);
    // Horizontal arc arm extending forward from pole top
    const armLen = clampM(W * 0.88, 0.55, 1.05);
    addBox(group, armLen, 0.018, 0.018, poleX + armLen / 2, poleH - 0.025, 0, poleMat);
    // Short drop cord at arm tip
    const dropH = 0.10;
    const armTipX = poleX + armLen;
    addBox(group, 0.014, dropH, 0.014, armTipX, poleH - dropH / 2, 0, poleMat);
    // Drum shade
    const shadeW = clampM(W * 0.42, 0.26, 0.46);
    const shadeH = clampM(H * 0.17, 0.16, 0.28);
    addBox(group, shadeW, shadeH, shadeW, armTipX, poleH - dropH - shadeH / 2, 0, shadeMat);
    // Shade inner bottom ring
    addBox(group, shadeW * 0.88, 0.018, shadeW * 0.88, armTipX, poleH - dropH - shadeH + 0.012, 0, baseMat);

  } else if (type === "barcart") {
    // Bar / serving cart: 4 wheeled legs + 2 wooden shelves + metal frame + handle
    const frameMat = makeMat(0x9a9a9a);
    const woodMat = makeMat(0xb08050);
    const wheelMat = makeMat(0x2a2a2a);
    const legH = clampM(H * 0.70, 0.52, 0.78);
    const wheelR = 0.028;
    const legS = 0.022;
    const lx = W / 2 - W * 0.08;
    const lz = D / 2 - D * 0.10;
    // 4 legs with wheels at base
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, legS, legH, legS, sx * lx, wheelR * 2 + legH / 2, sz * lz, frameMat);
      addBox(group, wheelR * 2, wheelR * 2.2, wheelR * 2, sx * lx, wheelR, sz * lz, wheelMat);
    }
    // Top shelf
    const topY = wheelR * 2 + legH;
    addBox(group, W * 0.90, 0.022, D * 0.90, 0, topY, 0, woodMat);
    // Bottom shelf at 38% height
    const botY = wheelR * 2 + legH * 0.38;
    addBox(group, W * 0.88, 0.018, D * 0.88, 0, botY, 0, woodMat);
    // Side frame rails
    addBox(group, legS, legS, D - D * 0.20, lx, topY - 0.04, 0, frameMat);
    addBox(group, legS, legS, D - D * 0.20, -lx, topY - 0.04, 0, frameMat);
    // Handle bar at front
    addBox(group, W - W * 0.16, 0.024, 0.024, 0, topY + 0.06, lz, frameMat);

  } else if (type === "winerack") {
    // Wine rack: outer box frame + grid of cell dividers
    const frameMat = makeMat(0x5a4028);
    const thick = 0.022;
    const numCols = Math.round(clampM(W / 0.15, 2, 6));
    const numRows = Math.round(clampM(H / 0.14, 2, 5));
    // Outer frame: bottom, top, left, right, back
    addBox(group, W, thick, D, 0, thick / 2, 0, frameMat);
    addBox(group, W, thick, D, 0, H - thick / 2, 0, frameMat);
    addBox(group, thick, H, D, -W / 2 + thick / 2, H / 2, 0, frameMat);
    addBox(group, thick, H, D,  W / 2 - thick / 2, H / 2, 0, frameMat);
    addBox(group, W, H, thick, 0, H / 2, -D / 2 + thick / 2, frameMat);
    // Horizontal dividers between rows
    for (let r = 1; r < numRows; r++) {
      addBox(group, W - thick * 2, thick, D, 0, H * r / numRows, 0, frameMat);
    }
    // Vertical dividers between columns
    for (let c = 1; c < numCols; c++) {
      addBox(group, thick, H - thick * 2, D, W * (c / numCols - 0.5), H / 2, 0, frameMat);
    }

  } else if (type === "hangingchair") {
    // Hanging / swing chair: tall arc stand + hanging ropes + egg-shaped seat + cushion
    const frameMat = makeMat(0x888888, 0.35, 0.75);
    const seatMat = makeFabricMat(0xc8a870);
    const cushMat = makeFabricMat(0xd8c0a0);
    const standH = clampM(H * 0.92, 1.40, 2.10);
    const legW = 0.028;
    // 2 vertical side posts
    addBox(group, legW, standH, legW, -W / 2 + legW, standH / 2, 0, frameMat);
    addBox(group, legW, standH, legW,  W / 2 - legW, standH / 2, 0, frameMat);
    // Top crossbar
    addBox(group, W, legW, legW, 0, standH, 0, frameMat);
    // Base foot bar
    addBox(group, W * 0.88, legW, legW, 0, legW / 2, 0, frameMat);
    // Seat dimensions
    const seatW = clampM(W * 0.65, 0.48, 0.80);
    const seatH = clampM(H * 0.36, 0.30, 0.55);
    const seatD = clampM(D * 0.65, 0.48, 0.80);
    const ropeH = clampM(standH * 0.22, 0.18, 0.38);
    const seatTopY = standH - ropeH;
    // 4 hanging ropes/chains from crossbar to seat corners
    for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      addBox(group, 0.012, ropeH, 0.012, sx * seatW * 0.38, seatTopY + ropeH / 2, sz * seatD * 0.38, frameMat);
    }
    // Egg/bowl seat body (wider at middle, narrower at top/bottom via 3-layer faked taper)
    addBox(group, seatW * 0.70, seatH * 0.18, seatD * 0.70, 0, seatTopY - seatH * 0.09, 0, seatMat);
    addBox(group, seatW, seatH * 0.64, seatD, 0, seatTopY - seatH * 0.18 - seatH * 0.32, 0, seatMat);
    addBox(group, seatW * 0.78, seatH * 0.22, seatD * 0.78, 0, seatTopY - seatH * 0.82 - seatH * 0.11, 0, seatMat);
    // Seat cushion pad inside
    addBox(group, seatW * 0.80, seatH * 0.28, seatD * 0.80, 0, seatTopY - seatH * 0.50, 0, cushMat);
    // Back cushion (against rear of seat)
    addBox(group, seatW * 0.72, seatH * 0.48, 0.10, 0, seatTopY - seatH * 0.35, -seatD / 2 + 0.05, cushMat);

  } else {
    // Default box
    const color = item.color || (item.source === "cart" ? "#c89a5b" : "#b3bac2");
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.06 });
    addBox(group, W, H, D, 0, H / 2, 0, mat);
  }

  return group;
};

export const createScene3DEditor = ({ hostEl, getRoomShell, getRoomDimensions, getRoomType, getObjects, onSelect }) => {
  const state = {
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    roomGroup: null,
    objectGroup: null,
    raf: null,
    meshById: new Map(),
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    floorPlane: null,
    moveMode: false,
    onFloorClickCb: null,
    dragState: { active: false, pending: false, objectId: null, startX: 0, startY: 0 },
    selectedId: null,
    onDragCb: null,
    onDragEndCb: null,
    onHoverCb: null,
    hoveredId: null,
    overrideRoomType: null
  };

  const ensure = () => {
    if (state.renderer) return;

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 0.88;
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xf0ede8);

    // Indoor environment map — realistic reflections, no external file needed
    const pmrem = new THREE.PMREMGenerator(state.renderer);
    const roomEnv = new RoomEnvironment();
    state.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    pmrem.dispose(); roomEnv.dispose();

    state.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 200);
    state.camera.position.set(3, 2.8, 3.2);

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    state.controls.minDistance = 1.2;
    state.controls.maxDistance = 16;
    state.controls.autoRotate = false;
    state.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    // Hemisphere light — warm floor bounce + cool sky fill
    const hemi = new THREE.HemisphereLight(0xcce0f5, 0x8a7060, 0.50);
    // Warm key light with high-quality shadows
    const key = new THREE.DirectionalLight(0xfff3e0, 0.90);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0004;
    // Cool fill — simulates bounced light from opposite side
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.22);
    fill.position.set(-4, 3, -3);

    state.roomGroup = new THREE.Group();
    state.objectGroup = new THREE.Group();

    state.scene.add(hemi, key, fill, state.roomGroup, state.objectGroup);

    hostEl.innerHTML = "";
    hostEl.appendChild(state.renderer.domElement);

    const animate = () => {
      state.controls.update();
      state.renderer.render(state.scene, state.camera);
      state.raf = requestAnimationFrame(animate);
    };

    animate();

    // ── Pointer down ────────────────────────────────────────────
    // Use capture phase on the canvas so we run BEFORE OrbitControls.
    // stopPropagation() on object clicks prevents OrbitControls from starting orbit.
    state.renderer.domElement.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = hostEl.getBoundingClientRect();
      state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      state.raycaster.setFromCamera(state.pointer, state.camera);

      // Existing floor-click (move mode from floating toolbar)
      if (state.moveMode && state.floorPlane) {
        const hits = state.raycaster.intersectObject(state.floorPlane, false);
        if (hits.length && typeof state.onFloorClickCb === "function") {
          state.onFloorClickCb(hits[0].point.x, hits[0].point.z);
        }
        event.stopPropagation();
        return;
      }

      // Intersect all object groups (recursive=true to hit sub-meshes)
      const intersects = state.raycaster.intersectObjects([...state.meshById.values()], true);
      const hit = intersects[0]?.object;
      let objectId = null;
      let node = hit;
      for (let i = 0; i < 6 && node; i++, node = node.parent) {
        if (node.userData?.objectId) { objectId = node.userData.objectId; break; }
      }

      if (objectId) {
        // Intercept event: prevent OrbitControls from starting orbit
        event.stopPropagation();
        // Capture pointer so pointerup/pointermove always fire on this element even off-canvas
        try { event.target.setPointerCapture(event.pointerId); } catch {}
        // Select the object immediately
        if (typeof onSelect === "function") onSelect(objectId);
        // Begin pending drag — activates after 5px movement threshold
        state.dragState = { active: false, pending: true, objectId, startX: event.clientX, startY: event.clientY };
        state.controls.enabled = false;
        hostEl.style.cursor = "grab";
        return;
      }

      // Empty space → deselect, let OrbitControls orbit normally
      if (typeof onSelect === "function") onSelect(null);
    }, { capture: true });

    // ── Pointer move ────────────────────────────────────────────
    // Use canvas element so captured pointer events (off-canvas drag) still fire
    state.renderer.domElement.addEventListener("pointermove", (event) => {
      const rect = hostEl.getBoundingClientRect();
      state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      state.raycaster.setFromCamera(state.pointer, state.camera);

      // Promote pending drag to active once the pointer moves > 5px
      if (state.dragState.pending && state.floorPlane) {
        const dist = Math.hypot(event.clientX - state.dragState.startX, event.clientY - state.dragState.startY);
        if (dist > 5) {
          state.dragState.active = true;
          state.dragState.pending = false;
          hostEl.style.cursor = "grabbing";
        }
      }

      if (state.dragState.active && state.floorPlane) {
        const hits = state.raycaster.intersectObject(state.floorPlane, false);
        if (hits.length && typeof state.onDragCb === "function") {
          const pt = hits[0].point;
          state.onDragCb(state.dragState.objectId, pt.x, pt.z);
        }
        return;
      }

      // Hover cursor on objects + fire hover callback
      if (!state.dragState.pending && !state.moveMode) {
        const hits = state.raycaster.intersectObjects([...state.meshById.values()], true);
        const hit = hits[0]?.object;
        let hovId = null;
        let hovNode = hit;
        for (let i = 0; i < 6 && hovNode; i++, hovNode = hovNode.parent) {
          if (hovNode.userData?.objectId) { hovId = hovNode.userData.objectId; break; }
        }
        hostEl.style.cursor = hovId ? "grab" : "";
        if (hovId !== state.hoveredId) {
          state.hoveredId = hovId;
          if (typeof state.onHoverCb === "function") state.onHoverCb(hovId, event.clientX, event.clientY);
        } else if (hovId && typeof state.onHoverCb === "function") {
          // Update tooltip position as mouse moves
          state.onHoverCb(hovId, event.clientX, event.clientY);
        }
      }
    });

    // ── Pointer up ──────────────────────────────────────────────
    // Listen on document only — fires once, catches off-canvas releases too
    const handlePointerUp = () => {
      const wasDragging = state.dragState.active;
      const wasPending = state.dragState.pending;
      if (wasDragging || wasPending) {
        state.dragState = { active: false, pending: false, objectId: null, startX: 0, startY: 0 };
        if (wasDragging && typeof state.onDragEndCb === "function") state.onDragEndCb();
        if (state.hoveredId) { state.hoveredId = null; if (typeof state.onHoverCb === "function") state.onHoverCb(null, 0, 0); }
      }
      // Always re-enable controls on pointer up unless move mode is active
      if (!state.moveMode && state.controls) {
        state.controls.enabled = true;
        hostEl.style.cursor = "";
      }
    };
    document.addEventListener("pointerup", handlePointerUp);

    resize();
  };

  const resize = () => {
    if (!state.renderer) return;
    const width = hostEl.clientWidth || 520;
    const height = hostEl.clientHeight || 360;
    state.renderer.setSize(width, height);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
  };

  const toPos = (xCm, zCm, room) => ({
    x: (xCm - room.width_cm / 2) * CM_TO_M,
    z: (zCm - room.length_cm / 2) * CM_TO_M
  });

  const renderOpenings = (roomShell, roomW, roomD, roomH) => {
    const openings = Array.isArray(roomShell?.openings) ? roomShell.openings : [];
    if (!openings.length) return;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf0eeea, roughness: 0.55, metalness: 0.0 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xededea, roughness: 0.6, metalness: 0.0 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xd8e8f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, envMapIntensity: 1.2 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.3, metalness: 0.6 });

    for (const opening of openings) {
      const wallDepth = 0.05;
      const oW = Math.max(0.2, opening.width_cm * CM_TO_M);
      const oH = Math.max(0.4, opening.height_cm * CM_TO_M);
      const sill = (opening.sill_cm || 0) * CM_TO_M;
      const offsetM = opening.offset_cm * CM_TO_M;
      const centerOffset = offsetM + oW / 2;
      const isNS = opening.wall === "north" || opening.wall === "south";
      const frameT = 0.06; // frame thickness

      const group = new THREE.Group();

      if (opening.type === "door") {
        // Door panel
        const door = new THREE.Mesh(new THREE.BoxGeometry(oW - frameT * 2, oH - frameT, wallDepth + 0.01), doorMat);
        door.position.y = oH / 2 + frameT / 2;
        group.add(door);
        // Recessed panel detail on door
        const panel = new THREE.Mesh(new THREE.BoxGeometry(oW - frameT * 4, oH - frameT * 4, 0.012), doorMat.clone());
        panel.material.color.setHex(0xe0deda);
        panel.position.y = oH / 2 + frameT / 2;
        panel.position.z = wallDepth / 2 + 0.012;
        group.add(panel);
        // Handle
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), handleMat);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(oW / 2 - frameT * 1.5, oH / 2, wallDepth / 2 + 0.03);
        group.add(handle);
        const handleBase = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), handleMat);
        handleBase.position.set(oW / 2 - frameT * 1.5, oH / 2, wallDepth / 2 + 0.02);
        group.add(handleBase);
      } else {
        // Window glass
        const glass = new THREE.Mesh(new THREE.BoxGeometry(oW - frameT * 2, oH - frameT * 2, 0.008), glassMat);
        glass.position.y = sill + oH / 2;
        group.add(glass);
        // Window cross bar (horizontal)
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(oW - frameT * 2, frameT * 0.5, 0.018), frameMat);
        crossH.position.y = sill + oH / 2;
        group.add(crossH);
        // Window cross bar (vertical)
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(frameT * 0.5, oH - frameT * 2, 0.018), frameMat);
        crossV.position.y = sill + oH / 2;
        group.add(crossV);
        // Window sill (aknalaud)
        const windowSill = new THREE.Mesh(new THREE.BoxGeometry(oW + frameT, frameT * 0.6, 0.14), frameMat);
        windowSill.position.y = sill + frameT * 0.3;
        windowSill.position.z = 0.055;
        group.add(windowSill);
      }

      // Frame: top, left, right (bottom only for window)
      const fTop = new THREE.Mesh(new THREE.BoxGeometry(oW + frameT * 2, frameT, wallDepth + 0.02), frameMat);
      fTop.position.y = sill + oH + frameT / 2;
      group.add(fTop);
      const fLeft = new THREE.Mesh(new THREE.BoxGeometry(frameT, oH + frameT, wallDepth + 0.02), frameMat);
      fLeft.position.set(-oW / 2 - frameT / 2, sill + oH / 2 + frameT / 2, 0);
      group.add(fLeft);
      const fRight = fLeft.clone(); fRight.position.x = oW / 2 + frameT / 2;
      group.add(fRight);
      if (opening.type === "window") {
        const fBot = new THREE.Mesh(new THREE.BoxGeometry(oW + frameT * 2, frameT, wallDepth + 0.02), frameMat);
        fBot.position.y = sill + frameT / 2;
        group.add(fBot);
      }

      // Position group on correct wall
      if (opening.wall === "north") {
        group.position.set(-roomW / 2 + centerOffset, 0, -roomD / 2);
      } else if (opening.wall === "south") {
        group.position.set(-roomW / 2 + centerOffset, 0, roomD / 2);
        group.rotation.y = Math.PI;
      } else if (opening.wall === "west") {
        group.position.set(-roomW / 2, 0, -roomD / 2 + centerOffset);
        group.rotation.y = Math.PI / 2;
      } else {
        group.position.set(roomW / 2, 0, -roomD / 2 + centerOffset);
        group.rotation.y = -Math.PI / 2;
      }

      state.roomGroup.add(group);
    }
  };

  const renderFixedElements = (roomShell, room) => {
    const fixedElements = Array.isArray(roomShell?.fixed_elements) ? roomShell.fixed_elements : [];
    for (const fixed of fixedElements) {
      const pos = toPos(fixed.pose.x_cm, fixed.pose.z_cm, room);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(0.1, fixed.dims_cm.w * CM_TO_M),
          Math.max(0.06, fixed.dims_cm.h * CM_TO_M),
          Math.max(0.06, fixed.dims_cm.d * CM_TO_M)
        ),
        new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8, metalness: 0.05 })
      );
      mesh.position.set(pos.x, (fixed.dims_cm.h * CM_TO_M) / 2, pos.z);
      mesh.rotation.y = ((fixed.pose.rotation_deg || 0) * Math.PI) / 180;
      state.roomGroup.add(mesh);
    }
  };


  // ── Outdoor / Terrace renderer ───────────────────────────────
  const renderOutdoor = (roomW, roomD, roomH, roomShell) => {
    state.scene.background = new THREE.Color(0x87ceeb);

    // Grass — random dot stipple, seamless, no stripe/brick pattern
    const buildGrassTex = (size = 512) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#4a7a30";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 5000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 0.8 + Math.random() * 2.5;
        const l = 22 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `hsl(${105 + Math.random() * 25}, 55%, ${l}%)`;
        ctx.globalAlpha = 0.25 + Math.random() * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    const deckD         = roomD * 0.75; // deck depth = 75 % of room depth
    const deckElevation = 0.22;         // 22 cm raised above ground
    const houseW        = roomW * 1.5;  // house wider than deck
    const houseH        = roomH * 1.5;
    const houseDepth    = 2.0;          // solid building depth, reads as house from any angle
    const frontZ        = -roomD / 2;   // front face of house = north edge of room
    const houseZ        = frontZ - houseDepth / 2; // centre of house box

    // Lawn
    const grassTex = buildGrassTex();
    grassTex.repeat.set(5, 5);
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW * 10, roomD * 10),
      new THREE.MeshStandardMaterial({ map: grassTex, color: 0x4a7a30, roughness: 0.98, metalness: 0.0 })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.005;
    state.roomGroup.add(lawn);

    // Wood deck surface — raised 22 cm, north-aligned
    const floorColor = floorColorByTone(roomShell?.theme?.floor_tone);
    const deckTex = buildWoodTex(floorColor, Math.max(0, floorColor - 0x0c0a08));
    deckTex.repeat.set(Math.max(1, Math.round(roomW * 1.5)), Math.max(1, Math.round(deckD * 1.5)));
    deckTex.anisotropy = state.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, deckD),
      new THREE.MeshStandardMaterial({ map: deckTex, color: floorColor, roughness: 0.82, metalness: 0.01, envMapIntensity: 0.3 })
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, deckElevation, frontZ + deckD / 2);
    deck.receiveShadow = true;
    state.roomGroup.add(deck);

    // Deck fascia boards visible above ground (south + east + west edges)
    const fasciaMat = new THREE.MeshStandardMaterial({ color: Math.max(0, floorColor - 0x151210), roughness: 0.88 });
    const fasciaS = new THREE.Mesh(new THREE.BoxGeometry(roomW, deckElevation, 0.05), fasciaMat);
    fasciaS.position.set(0, deckElevation / 2, frontZ + deckD);
    const fasciaE = new THREE.Mesh(new THREE.BoxGeometry(0.05, deckElevation, deckD), fasciaMat);
    fasciaE.position.set(roomW / 2, deckElevation / 2, frontZ + deckD / 2);
    const fasciaW = fasciaE.clone();
    fasciaW.position.x = -roomW / 2;
    state.roomGroup.add(fasciaS, fasciaE, fasciaW);

    // House — solid box so it reads as a real building from every angle
    const houseMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe3, roughness: 0.9, metalness: 0.0 });
    const houseBox = new THREE.Mesh(new THREE.BoxGeometry(houseW, houseH, houseDepth), houseMat);
    houseBox.position.set(0, houseH / 2, houseZ);
    state.roomGroup.add(houseBox);

    // Windows on front face (flanking door)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xb8d4e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.65 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ee, roughness: 0.5 });
    [[-houseW * 0.28, roomH * 0.58], [houseW * 0.28, roomH * 0.58]].forEach(([wx, wy]) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.06), glassMat);
      win.position.set(wx, wy, frontZ + 0.03);
      const frm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.04), frameMat);
      frm.position.set(wx, wy, frontZ + 0.05);
      state.roomGroup.add(win, frm);
    });

    // Sliding glass door (centred)
    const doorH = roomH * 0.85;
    const slideDoor = new THREE.Mesh(new THREE.BoxGeometry(1.6, doorH, 0.06), glassMat);
    slideDoor.position.set(0, doorH / 2, frontZ + 0.03);
    const slideDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.7, doorH + 0.1, 0.04), frameMat);
    slideDoorFrame.position.set(0, doorH / 2, frontZ + 0.05);
    state.roomGroup.add(slideDoor, slideDoorFrame);

    // Roof overhang
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xc8bfb0, roughness: 0.8 });
    const roofOverhang = new THREE.Mesh(new THREE.BoxGeometry(houseW + 0.4, 0.18, 1.4), roofMat);
    roofOverhang.position.set(0, houseH, frontZ + 0.5);
    state.roomGroup.add(roofOverhang);

    state.scene.fog = new THREE.Fog(0x87ceeb, roomW * 5, roomW * 14);
  };

  const renderRoom = () => {
    ensure();
    const roomShell = typeof getRoomShell === "function" ? getRoomShell() : null;
    const room = roomShell?.dimensions ?? getRoomDimensions?.();
    if (!room) return;

    while (state.roomGroup.children.length) {
      state.roomGroup.remove(state.roomGroup.children[0]);
    }

    const roomW = room.width_cm * CM_TO_M;
    const roomD = room.length_cm * CM_TO_M;
    const roomH = room.height_cm * CM_TO_M;

    const resolvedType = state.overrideRoomType ?? (typeof getRoomType === "function" ? getRoomType() : null);
    const isOutdoor = resolvedType === "outdoor";

    if (isOutdoor) {
      renderOutdoor(roomW, roomD, roomH, roomShell);
      state.controls.target.set(0, roomH * 0.3, 0);
      if (state.floorPlane) state.scene.remove(state.floorPlane);
      state.floorPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(roomW * 4, roomD * 4),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
      );
      state.floorPlane.rotation.x = -Math.PI / 2;
      state.floorPlane.position.y = 0.22; // match deck elevation
      state.scene.add(state.floorPlane);
      return;
    }

    // Reset scene to indoor look (undo any outdoor overrides)
    state.scene.background = new THREE.Color(0xf0ede8);
    state.scene.fog = null;

    const wallColor = parseHexColor(roomShell?.theme?.wall_color, 0xfcfcfb);
    const floorColor = floorColorByTone(roomShell?.theme?.floor_tone);

    const floorTex = buildWoodTex(floorColor, Math.max(0, floorColor - 0x0c0a08));
    floorTex.repeat.set(Math.max(1, Math.round(roomW * 1.2)), Math.max(1, Math.round(roomD * 1.2)));
    floorTex.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomD),
      new THREE.MeshStandardMaterial({ map: floorTex, color: floorColor, roughness: 0.88, metalness: 0.01, envMapIntensity: 0.3 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    const wallTex = buildWallTex(wallColor);
    wallTex.repeat.set(Math.ceil(roomW * 1.5), Math.ceil(roomH * 1.5));
    wallTex.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTex, color: wallColor, roughness: 0.92, metalness: 0.03, envMapIntensity: 0.2 });
    const north = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, 0.03), wallMaterial);
    north.position.set(0, roomH / 2, -roomD / 2);
    const south = north.clone();
    south.position.z = roomD / 2;

    const west = new THREE.Mesh(new THREE.BoxGeometry(0.03, roomH, roomD), wallMaterial);
    west.position.set(-roomW / 2, roomH / 2, 0);
    const east = west.clone();
    east.position.x = roomW / 2;

    // Ceiling
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomD),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.1 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomH;

    // Skirting boards (põrandaliistad) — 8cm tall, 2cm deep, white
    const skirtH = 0.08, skirtD = 0.02;
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xf0eeea, roughness: 0.6, metalness: 0.0 });
    const skirtN = new THREE.Mesh(new THREE.BoxGeometry(roomW, skirtH, skirtD), skirtMat);
    skirtN.position.set(0, skirtH / 2, -roomD / 2 + skirtD / 2);
    const skirtS = skirtN.clone(); skirtS.position.z = roomD / 2 - skirtD / 2;
    const skirtW = new THREE.Mesh(new THREE.BoxGeometry(skirtD, skirtH, roomD), skirtMat);
    skirtW.position.set(-roomW / 2 + skirtD / 2, skirtH / 2, 0);
    const skirtE = skirtW.clone(); skirtE.position.x = roomW / 2 - skirtD / 2;

    // Ceiling cornice (lakialused) — 6cm tall, 2cm deep, white
    const corniceH = 0.06, corniceD = 0.02;
    const corniceMat = new THREE.MeshStandardMaterial({ color: 0xf5f4f2, roughness: 0.5, metalness: 0.0 });
    const corniceN = new THREE.Mesh(new THREE.BoxGeometry(roomW, corniceH, corniceD), corniceMat);
    corniceN.position.set(0, roomH - corniceH / 2, -roomD / 2 + corniceD / 2);
    const corniceS = corniceN.clone(); corniceS.position.z = roomD / 2 - corniceD / 2;
    const corniceW = new THREE.Mesh(new THREE.BoxGeometry(corniceD, corniceH, roomD), corniceMat);
    corniceW.position.set(-roomW / 2 + corniceD / 2, roomH - corniceH / 2, 0);
    const corniceE = corniceW.clone(); corniceE.position.x = roomW / 2 - corniceD / 2;

    state.roomGroup.add(floor, ceiling, north, south, west, east,
      skirtN, skirtS, skirtW, skirtE,
      corniceN, corniceS, corniceW, corniceE);
    renderOpenings(roomShell, roomW, roomD, roomH);
    renderFixedElements(roomShell, room);

    state.controls.target.set(0, roomH * 0.3, 0);

    // Invisible floor plane for raycasting (both drag and move-mode)
    if (state.floorPlane) state.scene.remove(state.floorPlane);
    state.floorPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW * 4, roomD * 4),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    state.floorPlane.rotation.x = -Math.PI / 2;
    state.floorPlane.position.y = 0.001;
    state.scene.add(state.floorPlane);
  };

  const renderObjects = async () => {
    ensure();
    const room = getRoomDimensions();
    if (!room) return;

    while (state.objectGroup.children.length) {
      state.objectGroup.remove(state.objectGroup.children[0]);
    }
    state.meshById.clear();

    const glbIndex = await loadGlbIndex();
    const objects = getObjects();

    // For outdoor rooms, all objects sit on the deck surface (22 cm above ground)
    const isOutdoorScene = (state.overrideRoomType ?? (typeof getRoomType === "function" ? getRoomType() : null)) === "outdoor";
    const baseY = isOutdoorScene ? 0.22 : 0;

    for (const item of objects) {
      const glbFile = findGlbForItem(item, glbIndex);
      const group = new THREE.Group();
      group.userData.objectId = item.id;
      const pos = toPos(item.pose.x_cm, item.pose.z_cm, room);
      group.position.set(pos.x, baseY + (item.pose.elevation_cm ?? 0) * CM_TO_M, pos.z);
      group.rotation.y = (item.pose.rotation_deg * Math.PI) / 180;
      state.objectGroup.add(group);
      state.meshById.set(item.id, group);

      if (glbFile) {
        const W = item.dims_cm.w * CM_TO_M;
        const H = item.dims_cm.h * CM_TO_M;
        const D = item.dims_cm.d * CM_TO_M;
        loadGlbModel(glbFile).then((glbScene) => {
          const fitted = fitGlbToItem(glbScene, W, H, D);
          group.add(fitted);
          if (state.selectedId === item.id) highlight(state.selectedId);
        }).catch(() => {
          const fallback = buildProductMesh(item);
          fallback.children.slice().forEach((c) => group.add(c));
        });
      } else {
        const mesh = buildProductMesh(item);
        mesh.children.slice().forEach((c) => group.add(c));
      }
    }

    // Re-apply highlight to currently selected
    if (state.selectedId) highlight(state.selectedId);
  };

  const highlight = (objectId) => {
    for (const [id, group] of state.meshById) {
      const isActive = id === objectId;
      group.traverse((child) => {
        if (child.isMesh) {
          child.material.emissive = new THREE.Color(isActive ? "#8d1519" : "#000000");
          child.material.emissiveIntensity = isActive ? 0.18 : 0;
        }
      });
    }
  };

  const setMoveMode = (active) => {
    state.moveMode = Boolean(active);
    if (state.controls) state.controls.enabled = !state.moveMode;
    hostEl.style.cursor = state.moveMode ? "crosshair" : "";
  };

  const setRotateMode = (active) => {
    state.rotateMode = Boolean(active);
    if (state.controls) state.controls.enabled = !state.rotateMode;
    hostEl.style.cursor = state.rotateMode ? "ew-resize" : "";
  };

  const setSelectedId = (id) => {
    state.selectedId = id;
  };

  const onFloorClick = (cb) => {
    state.onFloorClickCb = cb;
  };

  const onDrag = (cb) => {
    state.onDragCb = cb;
  };

  const onDragEnd = (cb) => {
    state.onDragEndCb = cb;
  };

  const getObjectScreenPos = (objectId) => {
    if (!state.renderer || !state.camera) return null;
    const group = state.meshById.get(objectId);
    if (!group) return null;
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);
    const projected = worldPos.clone().project(state.camera);
    const rect = hostEl.getBoundingClientRect();
    return {
      x: ((projected.x + 1) / 2) * rect.width + rect.left,
      y: ((-projected.y + 1) / 2) * rect.height + rect.top
    };
  };

  const getCameraState = () => {
    if (!state.controls) return null;
    const target = state.controls.target;
    return {
      orbitTarget: [target.x, target.y, target.z],
      orbitDistance: state.camera.position.distanceTo(target),
      orbitPolar: state.controls.getPolarAngle?.() ?? 0,
      orbitAzimuth: state.controls.getAzimuthalAngle?.() ?? 0
    };
  };

  const restoreCameraState = (camState) => {
    if (!camState || !state.controls || !state.camera) return;
    const [tx, ty, tz] = camState.orbitTarget;
    state.controls.target.set(tx, ty, tz);
    const polar = camState.orbitPolar ?? Math.PI / 4;
    const azimuth = camState.orbitAzimuth ?? Math.PI / 4;
    const dist = camState.orbitDistance ?? 4;
    state.camera.position.set(
      tx + dist * Math.sin(polar) * Math.sin(azimuth),
      ty + dist * Math.cos(polar),
      tz + dist * Math.sin(polar) * Math.cos(azimuth)
    );
    state.controls.update();
  };

  return {
    renderRoom,
    renderObjects,
    highlight,
    resize,
    setRoomType(type) { state.overrideRoomType = type ?? null; },
    setMoveMode,
    setRotateMode,
    setSelectedId,
    onFloorClick,
    onDrag,
    onDragEnd,
    onHover(cb) { state.onHoverCb = cb; },
    getObjectScreenPos,
    getCameraState,
    restoreCameraState,
    dispose() {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.renderer?.dispose();
      state.renderer = null;
    }
  };
};
