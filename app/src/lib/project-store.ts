import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RoomProjectRecord, RoomShellData, RoomTheme } from "../types/simulator.js";

interface ProfileProjectsFile {
  profile_id: string;
  projects: RoomProjectRecord[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data/room-projects");

const safeProfileId = (profileId: string): string => profileId.replace(/[^a-zA-Z0-9_-]/g, "");

const profileFilePath = (profileId: string): string => path.join(DATA_DIR, `${safeProfileId(profileId)}.json`);

const ensureDataDir = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

const defaultTheme: RoomTheme = {
  style_id: "ida-clean",
  wall_color: "#f5f3ef",
  floor_material: "oak",
  floor_tone: "natural"
};

const toNumber = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const ensureRoomShell = (project: RoomProjectRecord): RoomShellData => {
  const width = toNumber(project?.dimensions?.width_cm, 420);
  const length = toNumber(project?.dimensions?.length_cm, 560);
  const height = toNumber(project?.dimensions?.height_cm, 260);
  const area = Number(((width * length) / 10_000).toFixed(2));
  const volume = Number(((area * height) / 100).toFixed(2));
  const walls = [
    { id: "north", length_cm: width },
    { id: "east", length_cm: length },
    { id: "south", length_cm: width },
    { id: "west", length_cm: length }
  ] as RoomShellData["walls"];

  return {
    shape: "rect",
    walls,
    dimensions: {
      width_cm: width,
      length_cm: length,
      height_cm: height,
      area_m2: area,
      volume_m3: volume
    },
    openings: Array.isArray(project?.room_shell?.openings) ? project.room_shell.openings : [],
    fixed_elements: Array.isArray(project?.room_shell?.fixed_elements) ? project.room_shell.fixed_elements : [],
    theme: project?.room_shell?.theme
      ? {
          style_id: String(project.room_shell.theme.style_id || defaultTheme.style_id),
          wall_color: String(project.room_shell.theme.wall_color || defaultTheme.wall_color),
          floor_material: String(project.room_shell.theme.floor_material || defaultTheme.floor_material),
          floor_tone: String(project.room_shell.theme.floor_tone || defaultTheme.floor_tone)
        }
      : defaultTheme
  };
};

const normalizeProjectRecord = (project: RoomProjectRecord): RoomProjectRecord => ({
  ...project,
  room_shell: ensureRoomShell(project),
  scene: {
    objects: (project.scene?.objects ?? []).map((item) => ({
      ...item,
      attach: item.attach ?? { snap: "none" },
      clearance_cm: Number.isFinite(item.clearance_cm) ? Number(item.clearance_cm) : undefined,
      locked: Boolean(item.locked)
    })),
    last_saved_at: project.scene?.last_saved_at
  }
});

const readProfileFile = async (profileId: string): Promise<ProfileProjectsFile> => {
  await ensureDataDir();
  const filePath = profileFilePath(profileId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ProfileProjectsFile;
    if (!Array.isArray(parsed?.projects)) {
      return { profile_id: profileId, projects: [] };
    }
    return {
      profile_id: profileId,
      projects: parsed.projects.map(normalizeProjectRecord)
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { profile_id: profileId, projects: [] };
    }
    throw error;
  }
};

const writeProfileFile = async (profileId: string, data: ProfileProjectsFile): Promise<void> => {
  await ensureDataDir();
  const filePath = profileFilePath(profileId);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, filePath);
};

const sortProjects = (projects: RoomProjectRecord[]): RoomProjectRecord[] =>
  [...projects].sort((left, right) => right.updated_at.localeCompare(left.updated_at));

const createProjectId = (): string => `proj_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

export const listRoomProjects = async (profileId: string): Promise<RoomProjectRecord[]> => {
  const file = await readProfileFile(profileId);
  return sortProjects(file.projects);
};

export const getRoomProject = async (
  profileId: string,
  projectId: string
): Promise<RoomProjectRecord | null> => {
  const file = await readProfileFile(profileId);
  return file.projects.find((project) => project.id === projectId) ?? null;
};

export const createRoomProject = async (
  profileId: string,
  project: Omit<RoomProjectRecord, "id" | "profile_id" | "created_at" | "updated_at">
): Promise<RoomProjectRecord> => {
  const now = new Date().toISOString();
  const file = await readProfileFile(profileId);
  const record: RoomProjectRecord = {
    ...project,
    id: createProjectId(),
    profile_id: profileId,
    created_at: now,
    updated_at: now
  };
  file.projects.push(record);
  await writeProfileFile(profileId, { profile_id: profileId, projects: sortProjects(file.projects) });
  return record;
};

export const replaceRoomProject = async (
  profileId: string,
  projectId: string,
  replacement: RoomProjectRecord
): Promise<RoomProjectRecord | null> => {
  const file = await readProfileFile(profileId);
  const index = file.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return null;
  const next: RoomProjectRecord = {
    ...replacement,
    id: projectId,
    profile_id: profileId,
    created_at: file.projects[index].created_at,
    updated_at: new Date().toISOString()
  };
  file.projects[index] = next;
  await writeProfileFile(profileId, { profile_id: profileId, projects: sortProjects(file.projects) });
  return next;
};

export const updateRoomProject = async (
  profileId: string,
  projectId: string,
  updater: (project: RoomProjectRecord) => RoomProjectRecord
): Promise<RoomProjectRecord | null> => {
  const file = await readProfileFile(profileId);
  const index = file.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return null;
  const updated = updater(file.projects[index]);
  file.projects[index] = {
    ...updated,
    id: projectId,
    profile_id: profileId,
    created_at: file.projects[index].created_at,
    updated_at: new Date().toISOString()
  };
  await writeProfileFile(profileId, { profile_id: profileId, projects: sortProjects(file.projects) });
  return file.projects[index];
};

export const deleteRoomProject = async (profileId: string, projectId: string): Promise<boolean> => {
  const file = await readProfileFile(profileId);
  const before = file.projects.length;
  file.projects = file.projects.filter((project) => project.id !== projectId);
  if (file.projects.length === before) return false;
  await writeProfileFile(profileId, { profile_id: profileId, projects: sortProjects(file.projects) });
  return true;
};
