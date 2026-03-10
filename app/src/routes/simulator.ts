import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { resolveProfileId } from "../lib/profile.js";
import {
  createRoomProject,
  deleteRoomProject,
  getRoomProject,
  listRoomProjects,
  updateRoomProject
} from "../lib/project-store.js";
import { getRoomById, saveRoom, updateRoomVisualRefs } from "../lib/room-store.js";
import { analyzeRoomScanFrames } from "../services/llm.js";
import { resolveSimulatorProductMeta } from "../services/simulator-product.js";
import type {
  DetectedExistingItem,
  ProductDimensionsCm,
  RoomDimensions,
  RoomProjectRecord,
  RoomRecord,
  RoomShellData,
  RoomShellOpening,
  RoomTheme,
  SceneObject
} from "../types/simulator.js";

const router = Router();

const wallSchema = z.enum(["north", "east", "south", "west"]);

const roomOpeningSchema = z.object({
  type: z.literal("door"),
  wall: wallSchema,
  offset_cm: z.number().min(0).max(100_000),
  width_cm: z.number().min(40).max(300),
  height_cm: z.number().min(160).max(320).optional()
});

const roomObstacleSchema = z.object({
  type: z.literal("box"),
  label: z.string().max(120).optional(),
  x_cm: z.number().min(0).max(100_000),
  z_cm: z.number().min(0).max(100_000),
  width_cm: z.number().min(1).max(20_000),
  depth_cm: z.number().min(1).max(20_000),
  height_cm: z.number().min(1).max(1_000).optional()
});

const roomVisualRefSchema = z.object({
  type: z.literal("image"),
  url: z.string().min(1).max(4_500_000)
});

const roomCreateSchema = z.object({
  shape: z.literal("rect"),
  width_cm: z.number().min(120).max(20_000),
  length_cm: z.number().min(120).max(20_000),
  height_cm: z.number().min(180).max(1_000).optional(),
  openings: z.array(roomOpeningSchema).max(20).default([]),
  obstacles: z.array(roomObstacleSchema).max(80).default([]),
  visual_refs: z.array(roomVisualRefSchema).max(20).default([])
});

const uploadSchema = z.object({
  roomId: z.string().min(1),
  refs: z.array(roomVisualRefSchema).max(20)
});

const dimensionsSchema = z.object({
  width_cm: z.number().min(120).max(20_000),
  length_cm: z.number().min(120).max(20_000),
  height_cm: z.number().min(180).max(1_000)
});

const roomThemeSchema = z.object({
  style_id: z.string().trim().min(1).max(60),
  wall_color: z.string().trim().min(3).max(20),
  floor_material: z.string().trim().min(1).max(60),
  floor_tone: z.string().trim().min(1).max(60)
});

const roomShellOpeningSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(["door", "window"]),
  wall: wallSchema,
  offset_cm: z.number().min(0).max(20_000),
  width_cm: z.number().min(20).max(800),
  height_cm: z.number().min(20).max(400),
  sill_cm: z.number().min(0).max(200).optional()
});

const roomFixedElementSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(["radiator", "column", "niche", "other"]),
  label: z.string().trim().max(160).optional(),
  wall: wallSchema.optional(),
  dims_cm: z.object({
    w: z.number().min(10).max(1500),
    d: z.number().min(5).max(1500),
    h: z.number().min(5).max(1000)
  }),
  pose: z.object({
    x_cm: z.number().min(0).max(20_000),
    z_cm: z.number().min(0).max(20_000),
    rotation_deg: z.number().min(-720).max(720)
  })
});

const roomShellPatchSchema = z.object({
  dimensions: dimensionsSchema.optional(),
  openings: z.array(roomShellOpeningSchema).max(120).optional(),
  fixed_elements: z.array(roomFixedElementSchema).max(120).optional(),
  theme: roomThemeSchema.optional()
});

const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  room_type: z.enum(["indoor", "outdoor"]).optional(),
  dimensions: dimensionsSchema.optional()
});

const scanFrameSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(120),
  url: z
    .string()
    .min(64)
    .max(4_500_000)
    .refine((value) => value.startsWith("data:image/"), "Frame must be a data image URL"),
  heading_deg: z.number().min(-360).max(360).optional(),
  pitch_tag: z.enum(["horizon", "up", "down"]).optional()
});

const detectedItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(20),
  est_width_cm: z.number().min(10).max(800),
  est_depth_cm: z.number().min(10).max(800),
  est_height_cm: z.number().min(5).max(500),
  confidence: z.number().min(0).max(1),
  keep: z.boolean().optional(),
  width_cm: z.number().min(10).max(800).optional(),
  depth_cm: z.number().min(10).max(800).optional(),
  height_cm: z.number().min(5).max(500).optional()
});

const sceneObjectSchema = z.object({
  id: z.string().trim().min(1).max(160),
  source: z.enum(["existing", "cart"]),
  source_key: z.string().trim().max(160).optional(),
  title: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(100),
  sku: z.string().trim().max(120).optional(),
  dims_cm: z.object({
    w: z.number().min(10).max(800),
    d: z.number().min(10).max(800),
    h: z.number().min(2).max(500)
  }),
  pose: z.object({
    x_cm: z.number().min(0).max(20_000),
    z_cm: z.number().min(0).max(20_000),
    rotation_deg: z.number().min(-720).max(720),
    elevation_cm: z.number().min(0).max(500).optional()
  }),
  attach: z
    .object({
      wall: wallSchema.optional(),
      snap: z.enum(["none", "wall", "corner"]).optional()
    })
    .optional(),
  clearance_cm: z.number().min(0).max(500).optional(),
  locked: z.boolean().optional(),
  movable: z.boolean(),
  deletable: z.boolean(),
  color: z.string().max(20).optional()
});

const projectPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dimensions: dimensionsSchema.optional(),
  room_shell: roomShellPatchSchema.optional(),
  analysis: z
    .object({
      summary: z.string().max(3_000).optional(),
      analysis_status: z.enum(["idle", "ready"]).optional(),
      detected_items: z.array(detectedItemSchema).max(120).optional()
    })
    .optional(),
  scene: z
    .object({
      objects: z.array(sceneObjectSchema).max(800),
      last_saved_at: z.string().max(64).optional(),
      camera_state: z
        .object({
          orbitTarget: z.array(z.number()).length(3),
          orbitDistance: z.number().min(0.1).max(100),
          orbitPolar: z.number(),
          orbitAzimuth: z.number()
        })
        .optional()
    })
    .optional()
});

const scanAnalyzeSchema = z.object({
  dimensions: dimensionsSchema,
  frames: z.array(scanFrameSchema).min(6).max(20)
});

const sceneBuildSchema = z.object({
  confirmed_items: z.array(detectedItemSchema).max(120)
});

const cartLineSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(220),
  qty: z.number().int().min(1).max(20),
  price: z.number().min(0).max(100_000).optional(),
  url: z.string().max(800).optional(),
  image: z.string().max(2_000).optional()
});

const importCartSchema = z.object({
  cartLines: z.array(cartLineSchema).max(400)
});

const importProductsSchema = z.object({
  lines: z.array(z.object({
    sku: z.string().trim().min(1).max(120),
    qty: z.number().int().min(1).max(20).default(1)
  })).max(400)
});

const LEGACY_ROOM_MIGRATION_NOTE =
  "See tuba imporditi vanast roomId flow'st. Kontrolli enne salvestust mõõte ja olemasolevaid esemeid.";

const OBJECT_TYPE_DEFAULT_DIMS: Record<string, ProductDimensionsCm> = {
  diivan: { w: 220, d: 95, h: 85 },
  voodi: { w: 180, d: 210, h: 95 },
  laud: { w: 160, d: 90, h: 75 },
  tool: { w: 55, d: 55, h: 90 },
  kapp: { w: 110, d: 50, h: 180 },
  riiul: { w: 100, d: 35, h: 200 },
  valgusti: { w: 45, d: 45, h: 150 },
  vaip: { w: 240, d: 160, h: 2 },
  peegel: { w: 70, d: 8, h: 180 },
  dekor: { w: 45, d: 45, h: 45 },
  cart: { w: 100, d: 60, h: 90 }
};

const THEME_PRESETS: RoomTheme[] = [
  { style_id: "ida-clean", wall_color: "#f5f3ef", floor_material: "oak", floor_tone: "natural" },
  { style_id: "ida-charcoal", wall_color: "#e9e6e1", floor_material: "walnut", floor_tone: "dark" },
  { style_id: "ida-minimal", wall_color: "#f8f8f6", floor_material: "ash", floor_tone: "light" }
];

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inferItemType = (label: string): string => {
  const normalized = normalizeForMatch(label);
  if (/diivan|sohva/.test(normalized)) return "diivan";
  if (/voodi|voodipeats/.test(normalized)) return "voodi";
  if (/laud|soogilaud|kirjutuslaud/.test(normalized)) return "laud";
  if (/tool|tugitool|kontoritool|soogitool/.test(normalized)) return "tool";
  if (/kapp|kummut|ookapp|riidekapp|tvkapp/.test(normalized)) return "kapp";
  if (/riiul/.test(normalized)) return "riiul";
  if (/lamp|valgusti/.test(normalized)) return "valgusti";
  if (/vaip/.test(normalized)) return "vaip";
  if (/peegel/.test(normalized)) return "peegel";
  return "dekor";
};

const dimsByType = (type: string): ProductDimensionsCm =>
  OBJECT_TYPE_DEFAULT_DIMS[type] ?? OBJECT_TYPE_DEFAULT_DIMS.dekor;

const buildDimensions = (input: z.infer<typeof dimensionsSchema> | undefined): RoomDimensions => {
  const width = input?.width_cm ?? 420;
  const length = input?.length_cm ?? 560;
  const height = input?.height_cm ?? 260;
  const area = Number(((width * length) / 10_000).toFixed(2));
  const volume = Number(((area * height) / 100).toFixed(2));
  return {
    width_cm: width,
    length_cm: length,
    height_cm: height,
    area_m2: area,
    volume_m3: volume
  };
};

const buildWalls = (dimensions: RoomDimensions): RoomShellData["walls"] => [
  { id: "north", length_cm: dimensions.width_cm },
  { id: "east", length_cm: dimensions.length_cm },
  { id: "south", length_cm: dimensions.width_cm },
  { id: "west", length_cm: dimensions.length_cm }
];

const defaultTheme = (): RoomTheme => ({ ...THEME_PRESETS[0] });

const createDefaultRoomShell = (dimensions: RoomDimensions): RoomShellData => ({
  shape: "rect",
  walls: buildWalls(dimensions),
  dimensions,
  openings: [],
  fixed_elements: [],
  theme: defaultTheme()
});

const clampOpeningToWall = (
  opening: RoomShellOpening,
  dimensions: RoomDimensions
): RoomShellOpening => {
  const wallLen = opening.wall === "north" || opening.wall === "south" ? dimensions.width_cm : dimensions.length_cm;
  const width = Math.min(Math.max(opening.width_cm, 20), wallLen);
  const maxOffset = Math.max(0, wallLen - width);
  return {
    ...opening,
    width_cm: width,
    offset_cm: Math.min(Math.max(opening.offset_cm, 0), maxOffset)
  };
};

const mergeRoomShell = (current: RoomShellData, patch: z.infer<typeof roomShellPatchSchema>): RoomShellData => {
  const dimensions = patch.dimensions ? buildDimensions(patch.dimensions) : current.dimensions;
  const openings = patch.openings
    ? patch.openings.map((opening) => clampOpeningToWall(opening, dimensions))
    : current.openings;

  return {
    shape: "rect",
    walls: buildWalls(dimensions),
    dimensions,
    openings,
    fixed_elements: patch.fixed_elements ?? current.fixed_elements,
    theme: patch.theme
      ? {
          style_id: patch.theme.style_id,
          wall_color: patch.theme.wall_color,
          floor_material: patch.theme.floor_material,
          floor_tone: patch.theme.floor_tone
        }
      : current.theme
  };
};

const createObjectId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

const createDefaultProject = (
  _profileId: string,
  input: { name?: string; room_type?: string; dimensions?: z.infer<typeof dimensionsSchema>; legacyRoomId?: string }
): Omit<RoomProjectRecord, "id" | "created_at" | "updated_at" | "profile_id"> => {
  const dimensions = buildDimensions(input.dimensions);
  return {
    legacy_room_id: input.legacyRoomId,
    name: (input.name?.trim() || "Minu tuba").slice(0, 120),
    room_type: (input.room_type === "outdoor" ? "outdoor" : "indoor") as "indoor" | "outdoor",
    shape: "rect",
    dimensions,
    room_shell: createDefaultRoomShell(dimensions),
    scan: {
      frames: [],
      coverage_status: "pending"
    },
    analysis: {
      analysis_status: "idle",
      summary: "",
      detected_items: []
    },
    scene: {
      objects: []
    }
  };
};

const itemRect = (object: Pick<SceneObject, "dims_cm" | "pose">) => {
  const halfW = object.dims_cm.w / 2;
  const halfD = object.dims_cm.d / 2;
  return {
    minX: object.pose.x_cm - halfW,
    maxX: object.pose.x_cm + halfW,
    minZ: object.pose.z_cm - halfD,
    maxZ: object.pose.z_cm + halfD
  };
};

const intersects = (a: ReturnType<typeof itemRect>, b: ReturnType<typeof itemRect>): boolean =>
  !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);

const fitsInRoom = (object: Pick<SceneObject, "dims_cm" | "pose">, dimensions: RoomDimensions): boolean => {
  const rect = itemRect(object);
  return (
    rect.minX >= 10 &&
    rect.maxX <= dimensions.width_cm - 10 &&
    rect.minZ >= 10 &&
    rect.maxZ <= dimensions.length_cm - 10
  );
};

const findFreePose = (
  placed: SceneObject[],
  dims: ProductDimensionsCm,
  dimensions: RoomDimensions
): SceneObject["pose"] => {
  const probe: SceneObject = {
    id: "probe",
    source: "existing",
    title: "probe",
    type: "probe",
    dims_cm: dims,
    pose: { x_cm: dimensions.width_cm / 2, z_cm: dimensions.length_cm / 2, rotation_deg: 0 },
    movable: true,
    deletable: true
  };

  const minX = 12 + dims.w / 2;
  const maxX = dimensions.width_cm - 12 - dims.w / 2;
  const minZ = 12 + dims.d / 2;
  const maxZ = dimensions.length_cm - 12 - dims.d / 2;

  for (let z = minZ; z <= maxZ; z += 32) {
    for (let x = minX; x <= maxX; x += 32) {
      probe.pose = { x_cm: x, z_cm: z, rotation_deg: 0 };
      if (!fitsInRoom(probe, dimensions)) continue;
      const blocked = placed.some((item) => intersects(itemRect(item), itemRect(probe)));
      if (!blocked) {
        return probe.pose;
      }
    }
  }

  return {
    x_cm: Math.max(minX, Math.min(maxX, dimensions.width_cm / 2)),
    z_cm: Math.max(minZ, Math.min(maxZ, dimensions.length_cm / 2)),
    rotation_deg: 0
  };
};

const toDetectedItems = (labels: string[]): DetectedExistingItem[] => {
  const grouped = new Map<string, DetectedExistingItem>();

  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label) continue;
    const normalized = normalizeForMatch(label);
    if (!normalized) continue;
    const type = inferItemType(label);
    const key = `${type}:${normalized}`;
    const found = grouped.get(key);
    if (found) {
      found.quantity += 1;
      found.confidence = Number(Math.min(0.98, found.confidence + 0.03).toFixed(2));
      continue;
    }

    const dims = dimsByType(type);
    grouped.set(key, {
      id: createObjectId("det"),
      label,
      type,
      quantity: 1,
      est_width_cm: dims.w,
      est_depth_cm: dims.d,
      est_height_cm: dims.h,
      confidence: 0.72,
      keep: true,
      width_cm: dims.w,
      depth_cm: dims.d,
      height_cm: dims.h
    });
  }

  if (grouped.size === 0) {
    return [
      {
        id: createObjectId("det"),
        label: "Mööbliese",
        type: "dekor",
        quantity: 1,
        est_width_cm: 100,
        est_depth_cm: 60,
        est_height_cm: 90,
        confidence: 0.45,
        keep: true,
        width_cm: 100,
        depth_cm: 60,
        height_cm: 90
      }
    ];
  }

  return [...grouped.values()];
};

const buildExistingSceneObjects = (
  items: DetectedExistingItem[],
  dimensions: RoomDimensions
): SceneObject[] => {
  const next: SceneObject[] = [];

  for (const item of items) {
    if (item.keep === false) continue;
    const quantity = Math.max(1, item.quantity);
    for (let index = 0; index < quantity; index += 1) {
      const dims: ProductDimensionsCm = {
        w: item.width_cm ?? item.est_width_cm,
        d: item.depth_cm ?? item.est_depth_cm,
        h: item.height_cm ?? item.est_height_cm
      };
      const pose = findFreePose(next, dims, dimensions);
      next.push({
        id: createObjectId("obj"),
        source: "existing",
        source_key: `${item.id}:${index + 1}`,
        title: quantity > 1 ? `${item.label} ${index + 1}` : item.label,
        type: item.type,
        dims_cm: dims,
        pose,
        attach: { snap: "none" },
        clearance_cm: 8,
        locked: false,
        movable: true,
        deletable: true,
        color: "#d9d9d9"
      });
    }
  }

  return next;
};

const inferCartDims = (title: string): ProductDimensionsCm => dimsByType(inferItemType(title || ""));

const importLinesIntoScene = async (
  project: RoomProjectRecord,
  lines: Array<{ sku: string; title?: string; qty: number }>,
  options: { dedupeAcrossScene?: boolean } = {}
): Promise<SceneObject[]> => {
  const dedupeAcrossScene = options.dedupeAcrossScene ?? true;
  const existing = [...project.scene.objects];
  const existingKeys = new Set<string>();
  const nextIndexBySku = new Map<string, number>();

  for (const item of existing) {
    if (item.source !== "cart" || !item.source_key) continue;
    existingKeys.add(item.source_key);
    const match = String(item.source_key).match(/^(.+):(\d+)$/);
    if (!match) continue;
    const [, sku, indexRaw] = match;
    const index = Number(indexRaw);
    if (!Number.isFinite(index)) continue;
    const knownMax = nextIndexBySku.get(sku) ?? 0;
    nextIndexBySku.set(sku, Math.max(knownMax, index));
  }
  const added: SceneObject[] = [];

  for (const line of lines) {
    const quantity = Math.max(1, line.qty);
    const meta =
      (await resolveSimulatorProductMeta(line.sku)) ??
      (line.title ? await resolveSimulatorProductMeta(line.title).catch(() => null) : null);
    if (!meta) {
      continue;
    }

    const skuKey = String(line.sku).trim();
    const baseIndex = nextIndexBySku.get(skuKey) ?? 0;
    let createdForLine = 0;

    for (let i = 0; i < quantity; i += 1) {
      const nextIndex = dedupeAcrossScene ? i + 1 : baseIndex + createdForLine + 1;
      const sourceKey = `${skuKey}:${nextIndex}`;
      if (dedupeAcrossScene && existingKeys.has(sourceKey)) continue;
      existingKeys.add(sourceKey);
      createdForLine += 1;
      nextIndexBySku.set(skuKey, Math.max(nextIndexBySku.get(skuKey) ?? 0, nextIndex));

      const dims = meta.dimensions_cm;
      const pose = findFreePose([...existing, ...added], dims, project.room_shell.dimensions);
      added.push({
        id: createObjectId("cart"),
        source: "cart",
        source_key: sourceKey,
        title:
          quantity > 1 ? `${meta.name} ${nextIndex}` : meta.name,
        type: meta.category,
        sku: skuKey,
        dims_cm: dims,
        pose,
        attach: { snap: "none" },
        clearance_cm: 8,
        locked: false,
        movable: true,
        deletable: true,
        color: "#c89a5b"
      });
    }
  }

  return added;
};

// Legacy room endpoints kept for compatibility.
router.post("/rooms", (req, res) => {
  const parsed = roomCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room payload", issues: parsed.error.issues });
    return;
  }

  const room = saveRoom({
    ...parsed.data,
    openings: parsed.data.openings ?? [],
    obstacles: parsed.data.obstacles ?? [],
    visual_refs: parsed.data.visual_refs ?? []
  });

  res.status(201).json({ roomId: room.id, room });
});

router.get("/rooms/:id", (req, res) => {
  const roomId = String(req.params.id ?? "").trim();
  const room = getRoomById(roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(room);
});

router.post("/uploads", (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid upload payload", issues: parsed.error.issues });
    return;
  }

  const room = getRoomById(parsed.data.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const deduped: RoomRecord["visual_refs"] = [];
  const seen = new Set<string>();
  for (const ref of [...room.visual_refs, ...parsed.data.refs]) {
    if (seen.has(ref.url)) continue;
    seen.add(ref.url);
    deduped.push(ref);
  }

  const updated = updateRoomVisualRefs(room.id, deduped);
  res.json({ ok: true, roomId: room.id, visual_refs: updated?.visual_refs ?? deduped });
});

router.get("/planner/config", (_req, res) => {
  res.json({
    ok: true,
    plannerEnabled: env.PLANNER_V3_ENABLED,
    manualRoomEnabled: env.PLANNER_MANUAL_ENABLED,
    scanRoomEnabled: env.PLANNER_SCAN_ENABLED,
    entryMode: env.PLANNER_ENTRY_MODE,
    uiVersion: "v4",
    workspaceMode: "single-workspace",
    twoDEnabled: false,
    inspectorEnabled: false,
    themePresets: THEME_PRESETS
  });
});

router.get("/profile", (req, res) => {
  const profileId = resolveProfileId(req, res);
  res.json({ ok: true, profileId });
});

router.get("/room-projects", async (req, res) => {
  try {
    const profileId = resolveProfileId(req, res);
    const projects = await listRoomProjects(profileId);
    res.json({ ok: true, profileId, projects });
  } catch (error) {
    console.error("[room-projects/list] error:", error);
    res.status(500).json({ error: "Room projects lookup failed" });
  }
});

router.post("/room-projects", async (req, res) => {
  const parsed = projectCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room project payload", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const project = await createRoomProject(profileId, createDefaultProject(profileId, { ...parsed.data, room_type: parsed.data.room_type }));
    res.status(201).json({ ok: true, profileId, project });
  } catch (error) {
    console.error("[room-projects/create] error:", error);
    res.status(500).json({ error: "Room project creation failed" });
  }
});

router.get("/room-projects/:id", async (req, res) => {
  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const project = await getRoomProject(profileId, projectId);
    if (!project) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }
    res.json({ ok: true, profileId, project });
  } catch (error) {
    console.error("[room-projects/get] error:", error);
    res.status(500).json({ error: "Room project lookup failed" });
  }
});

router.patch("/room-projects/:id", async (req, res) => {
  const parsed = projectPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room project patch", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const updated = await updateRoomProject(profileId, projectId, (project) => {
      const next = { ...project };

      if (parsed.data.name) next.name = parsed.data.name;
      if (parsed.data.dimensions) {
        const nextDimensions = buildDimensions(parsed.data.dimensions);
        next.dimensions = nextDimensions;
        next.room_shell = mergeRoomShell(next.room_shell, { dimensions: parsed.data.dimensions });
      }
      if (parsed.data.room_shell) {
        next.room_shell = mergeRoomShell(next.room_shell, parsed.data.room_shell);
        next.dimensions = next.room_shell.dimensions;
      }
      if (parsed.data.analysis) {
        next.analysis = {
          ...next.analysis,
          ...parsed.data.analysis,
          detected_items: parsed.data.analysis.detected_items ?? next.analysis.detected_items
        };
      }
      if (parsed.data.scene) {
        const cameraState = parsed.data.scene.camera_state
          ? {
              orbitTarget: [...parsed.data.scene.camera_state.orbitTarget] as [number, number, number],
              orbitDistance: parsed.data.scene.camera_state.orbitDistance,
              orbitPolar: parsed.data.scene.camera_state.orbitPolar,
              orbitAzimuth: parsed.data.scene.camera_state.orbitAzimuth
            }
          : undefined;
        next.scene = {
          objects: parsed.data.scene.objects,
          last_saved_at: parsed.data.scene.last_saved_at ?? new Date().toISOString(),
          camera_state: cameraState
        };
      }

      return next;
    });

    if (!updated) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    res.json({ ok: true, profileId, project: updated });
  } catch (error) {
    console.error("[room-projects/patch] error:", error);
    res.status(500).json({ error: "Room project update failed" });
  }
});

router.patch("/room-projects/:id/room-shell", async (req, res) => {
  const parsed = roomShellPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room shell payload", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const updated = await updateRoomProject(profileId, projectId, (project) => {
      const nextRoomShell = mergeRoomShell(project.room_shell, parsed.data);
      return {
        ...project,
        room_shell: nextRoomShell,
        dimensions: nextRoomShell.dimensions
      };
    });

    if (!updated) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    res.json({ ok: true, profileId, project: updated, room_shell: updated.room_shell });
  } catch (error) {
    console.error("[room-projects/room-shell] error:", error);
    res.status(500).json({ error: "Room shell update failed" });
  }
});

router.delete("/room-projects/:id", async (req, res) => {
  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const deleted = await deleteRoomProject(profileId, projectId);
    if (!deleted) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }
    res.json({ ok: true, profileId, deleted: true });
  } catch (error) {
    console.error("[room-projects/delete] error:", error);
    res.status(500).json({ error: "Room project delete failed" });
  }
});

router.post("/room-projects/from-room/:roomId", async (req, res) => {
  try {
    const profileId = resolveProfileId(req, res);
    const roomId = String(req.params.roomId ?? "").trim();
    const legacyRoom = getRoomById(roomId);
    if (!legacyRoom) {
      res.status(404).json({ error: "Legacy room not found" });
      return;
    }

    const projects = await listRoomProjects(profileId);
    const existing = projects.find((project) => project.legacy_room_id === roomId);
    if (existing) {
      res.json({ ok: true, profileId, project: existing, migrated: false });
      return;
    }

    const created = await createRoomProject(profileId, {
      ...createDefaultProject(profileId, {
        name: "Imporditud tuba",
        dimensions: {
          width_cm: legacyRoom.width_cm,
          length_cm: legacyRoom.length_cm,
          height_cm: legacyRoom.height_cm ?? 260
        },
        legacyRoomId: roomId
      }),
      scan: {
        frames: (legacyRoom.visual_refs ?? []).map((ref, index) => ({
          id: createObjectId("scan"),
          label: `Legacy pilt ${index + 1}`,
          url: ref.url,
          pitch_tag: "horizon",
          captured_at: new Date().toISOString()
        })),
        coverage_status: (legacyRoom.visual_refs ?? []).length > 0 ? "complete" : "pending",
        captured_at: (legacyRoom.visual_refs ?? []).length > 0 ? new Date().toISOString() : undefined
      },
      analysis: {
        analysis_status: "idle",
        summary: LEGACY_ROOM_MIGRATION_NOTE,
        detected_items: []
      }
    });

    res.status(201).json({ ok: true, profileId, project: created, migrated: true });
  } catch (error) {
    console.error("[room-projects/from-room] error:", error);
    res.status(500).json({ error: "Legacy room migration failed" });
  }
});

router.post("/room-projects/:id/scan/analyze", async (req, res) => {
  const parsed = scanAnalyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid room scan payload", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const project = await getRoomProject(profileId, projectId);
    if (!project) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    const dimensions = buildDimensions(parsed.data.dimensions);
    const frames = parsed.data.frames.map((frame) => ({
      id: frame.id?.trim() || createObjectId("scan"),
      label: frame.label,
      url: frame.url,
      heading_deg: frame.heading_deg,
      pitch_tag: frame.pitch_tag,
      captured_at: new Date().toISOString()
    }));

    const ai = await analyzeRoomScanFrames({
      frames: frames.map((frame) => ({ label: frame.label, url: frame.url })),
      roomMeta: {
        width_cm: dimensions.width_cm,
        length_cm: dimensions.length_cm,
        height_cm: dimensions.height_cm
      }
    });

    const detectedItems = toDetectedItems(ai.detectedItems?.length ? ai.detectedItems : ai.keywords ?? []);

    const updated = await updateRoomProject(profileId, projectId, (current) => ({
      ...current,
      dimensions,
      room_shell: mergeRoomShell(current.room_shell, { dimensions: parsed.data.dimensions }),
      scan: {
        frames,
        coverage_status: "complete",
        captured_at: new Date().toISOString()
      },
      analysis: {
        analysis_status: "ready",
        summary: ai.summary || "AI analüüs valmis.",
        detected_items: detectedItems
      }
    }));

    if (!updated) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    res.json({ ok: true, profileId, project: updated, analysis: updated.analysis });
  } catch (error) {
    console.error("[room-projects/scan/analyze] error:", error);
    res.status(500).json({ error: "Room scan analysis failed" });
  }
});

router.post("/room-projects/:id/scene/build", async (req, res) => {
  const parsed = sceneBuildSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid scene build payload", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const project = await getRoomProject(profileId, projectId);
    if (!project) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    const sceneObjects = buildExistingSceneObjects(parsed.data.confirmed_items, project.room_shell.dimensions);

    const updated = await updateRoomProject(profileId, projectId, (current) => ({
      ...current,
      analysis: {
        analysis_status: "ready",
        summary: current.analysis.summary,
        detected_items: parsed.data.confirmed_items
      },
      scene: {
        objects: sceneObjects,
        last_saved_at: new Date().toISOString()
      }
    }));

    if (!updated) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    res.json({ ok: true, profileId, project: updated, scene: updated.scene });
  } catch (error) {
    console.error("[room-projects/scene/build] error:", error);
    res.status(500).json({ error: "Scene build failed" });
  }
});

router.post("/room-projects/:id/scene/import-products", async (req, res) => {
  const parsed = importProductsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid import products payload", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const project = await getRoomProject(profileId, projectId);
    if (!project) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    const added = await importLinesIntoScene(
      project,
      parsed.data.lines.map((line) => ({ sku: line.sku, qty: line.qty })),
      { dedupeAcrossScene: false }
    );

    const updated = await updateRoomProject(profileId, projectId, (current) => ({
      ...current,
      scene: {
        objects: [...current.scene.objects, ...added],
        last_saved_at: new Date().toISOString()
      }
    }));

    if (!updated) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    res.json({
      ok: true,
      profileId,
      addedCount: added.length,
      project: updated,
      scene: updated.scene
    });
  } catch (error) {
    console.error("[room-projects/scene/import-products] error:", error);
    res.status(500).json({ error: "Products import failed" });
  }
});

router.post("/room-projects/:id/scene/import-cart", async (req, res) => {
  const parsed = importCartSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid import cart payload", issues: parsed.error.issues });
    return;
  }

  try {
    const profileId = resolveProfileId(req, res);
    const projectId = String(req.params.id ?? "").trim();
    const project = await getRoomProject(profileId, projectId);
    if (!project) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    const added = await importLinesIntoScene(
      project,
      parsed.data.cartLines.map((line) => ({
        sku: line.id,
        title: line.title,
        qty: Math.max(1, line.qty)
      })),
      { dedupeAcrossScene: true }
    );

    const updated = await updateRoomProject(profileId, projectId, (current) => ({
      ...current,
      scene: {
        objects: [...current.scene.objects, ...added],
        last_saved_at: new Date().toISOString()
      }
    }));

    if (!updated) {
      res.status(404).json({ error: "Room project not found" });
      return;
    }

    res.json({
      ok: true,
      profileId,
      addedCount: added.length,
      project: updated,
      scene: updated.scene
    });
  } catch (error) {
    console.error("[room-projects/scene/import-cart] error:", error);
    res.status(500).json({ error: "Cart import failed" });
  }
});

router.get("/products/:sku", async (req, res) => {
  try {
    const sku = String(req.params.sku ?? "").trim();
    if (!sku) {
      res.status(400).json({ error: "sku is required" });
      return;
    }

    const product = await resolveSimulatorProductMeta(sku);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error("[simulator/products] error:", error);
    res.status(500).json({ error: "Product meta lookup failed" });
  }
});

export default router;
