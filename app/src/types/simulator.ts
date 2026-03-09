export type RoomShape = "rect";
export type RoomWall = "north" | "east" | "south" | "west";
export type RoomWallId = RoomWall;
export type RoomOpeningType = "door" | "window";

export interface RoomOpening {
  type: "door";
  wall: RoomWall;
  offset_cm: number;
  width_cm: number;
  height_cm?: number;
}

export interface RoomObstacle {
  type: "box";
  label?: string;
  x_cm: number;
  z_cm: number;
  width_cm: number;
  depth_cm: number;
  height_cm?: number;
}

export interface RoomVisualRef {
  type: "image";
  url: string;
}

export interface RoomRecord {
  id: string;
  shape: RoomShape;
  width_cm: number;
  length_cm: number;
  height_cm?: number;
  openings: RoomOpening[];
  obstacles: RoomObstacle[];
  visual_refs: RoomVisualRef[];
  created_at: string;
}

export interface ProductDimensionsCm {
  w: number;
  d: number;
  h: number;
}

export interface SimulatorProductMeta {
  sku: string;
  name: string;
  category: string;
  dimensions_cm: ProductDimensionsCm;
  model_glb_url: string | null;
}

export interface RoomDimensions {
  width_cm: number;
  length_cm: number;
  height_cm: number;
  area_m2: number;
  volume_m3: number;
}

export interface RoomShellWall {
  id: RoomWallId;
  length_cm: number;
}

export interface RoomShellOpening {
  id: string;
  type: RoomOpeningType;
  wall: RoomWallId;
  offset_cm: number;
  width_cm: number;
  height_cm: number;
  sill_cm?: number;
}

export type RoomFixedElementType = "radiator" | "column" | "niche" | "other";

export interface RoomFixedElement {
  id: string;
  type: RoomFixedElementType;
  label?: string;
  wall?: RoomWallId;
  dims_cm: ProductDimensionsCm;
  pose: {
    x_cm: number;
    z_cm: number;
    rotation_deg: number;
  };
}

export interface RoomTheme {
  style_id: string;
  wall_color: string;
  floor_material: string;
  floor_tone: string;
}

export interface RoomShellData {
  shape: RoomShape;
  walls: RoomShellWall[];
  dimensions: RoomDimensions;
  openings: RoomShellOpening[];
  fixed_elements: RoomFixedElement[];
  theme: RoomTheme;
}

export interface RoomScanFrame {
  id: string;
  label: string;
  url: string;
  heading_deg?: number;
  pitch_tag?: "horizon" | "up" | "down";
  captured_at: string;
}

export interface RoomScanData {
  frames: RoomScanFrame[];
  coverage_status: "pending" | "complete";
  captured_at?: string;
}

export interface DetectedExistingItem {
  id: string;
  label: string;
  type: string;
  quantity: number;
  est_width_cm: number;
  est_depth_cm: number;
  est_height_cm: number;
  confidence: number;
  keep?: boolean;
  width_cm?: number;
  depth_cm?: number;
  height_cm?: number;
}

export interface RoomAnalysisData {
  analysis_status: "idle" | "ready";
  summary: string;
  detected_items: DetectedExistingItem[];
}

export interface SceneObject {
  id: string;
  source: "existing" | "cart";
  source_key?: string;
  title: string;
  type: string;
  sku?: string;
  dims_cm: ProductDimensionsCm;
  pose: {
    x_cm: number;
    z_cm: number;
    rotation_deg: number;
  };
  attach?: {
    wall?: RoomWallId;
    snap?: "none" | "wall" | "corner";
  };
  clearance_cm?: number;
  locked?: boolean;
  movable: boolean;
  deletable: boolean;
  color?: string;
}

export interface CameraState {
  orbitTarget: [number, number, number];
  orbitDistance: number;
  orbitPolar: number;
  orbitAzimuth: number;
}

export interface RoomSceneData {
  objects: SceneObject[];
  last_saved_at?: string;
  camera_state?: CameraState;
}

export type RoomType = "indoor" | "outdoor";

export interface RoomProjectRecord {
  id: string;
  profile_id: string;
  legacy_room_id?: string;
  name: string;
  room_type?: RoomType;
  shape: RoomShape;
  dimensions: RoomDimensions;
  room_shell: RoomShellData;
  scan: RoomScanData;
  analysis: RoomAnalysisData;
  scene: RoomSceneData;
  created_at: string;
  updated_at: string;
}
