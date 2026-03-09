import {
  ACTIVE_PROJECT_STORAGE_KEY,
  API_BASE,
  computeDimensions,
  fetchJson
} from "./shared.js";
import { createFixedElementsEditor } from "./fixed-elements-editor.js";
import { createOpeningsEditor } from "./openings-editor.js";
import { createRoomShellEditor } from "./room-shell-editor.js";
import { createRoomThemeEditor } from "./room-theme-editor.js";

const $ = (selector) => document.querySelector(selector);

const query = new URLSearchParams(window.location.search);
const initialNextSku = String(query.get("nextSku") ?? "").trim();

const projectsListEl = $("#projects-list");
const createProjectBtn = $("#create-project-btn");
const statusBox = $("#status-box");
const stepsIndicator = $("#steps-indicator");
const backBtn = $("#step-back-btn");
const nextBtn = $("#step-next-btn");

const widthInput = $("#width-cm");
const lengthInput = $("#length-cm");
const heightInput = $("#height-cm");
const areaValueEl = $("#room-area-value");
const volumeValueEl = $("#room-volume-value");

const roomNameInput = $("#room-name");
const saveRoomBtn = $("#save-room-btn");
const openSimulatorBtn = $("#open-simulator-btn");
const openSimulatorTopBtn = $("#open-simulator-top");

const state = {
  projects: [],
  activeProjectId: "",
  activeProject: null,
  step: 1,
  shellDirty: false,
  openingsDirty: false,
  fixedDirty: false,
  themeDirty: false
};

const setStatus = (text, variant = "info") => {
  statusBox.textContent = text;
  statusBox.className = "status-box";
  if (variant === "ok") statusBox.classList.add("ok");
  if (variant === "warn") statusBox.classList.add("warn");
  if (variant === "err") statusBox.classList.add("err");
};

const setMetrics = (dimensions) => {
  areaValueEl.textContent = `${Number(dimensions.area_m2).toFixed(2)} m²`;
  volumeValueEl.textContent = `${Number(dimensions.volume_m3).toFixed(2)} m³`;
};

const shellEditor = createRoomShellEditor({
  canvas: $("#room-shell-canvas"),
  widthInput,
  lengthInput,
  heightInput,
  onChange: (dimensions) => {
    setMetrics(dimensions);
    state.shellDirty = true;
  }
});

const openingsEditor = createOpeningsEditor({
  listEl: $("#openings-list"),
  addBtn: $("#add-opening-btn"),
  getDimensions: () => shellEditor.getDimensions(),
  onChange: () => {
    state.openingsDirty = true;
  }
});

const fixedEditor = createFixedElementsEditor({
  listEl: $("#fixed-list"),
  addBtn: $("#add-fixed-btn"),
  getDimensions: () => shellEditor.getDimensions(),
  onChange: () => {
    state.fixedDirty = true;
  }
});

const themeEditor = createRoomThemeEditor({
  hostEl: $("#theme-editor"),
  onChange: () => {
    state.themeDirty = true;
  }
});

const renderStepPills = () => {
  const pills = stepsIndicator.querySelectorAll(".step-pill");
  for (const pill of pills) {
    const step = Number(pill.getAttribute("data-step-pill"));
    pill.classList.toggle("active", step === state.step);
    pill.classList.toggle("done", step < state.step);
  }
};

const showStep = (step) => {
  state.step = Math.max(1, Math.min(5, step));
  document.querySelectorAll(".wizard-step").forEach((section) => {
    section.classList.toggle("active", Number(section.getAttribute("data-step")) === state.step);
  });

  backBtn.disabled = state.step <= 1;
  nextBtn.style.display = state.step >= 5 ? "none" : "inline-flex";

  if (state.step === 1) nextBtn.textContent = "Edasi: avad";
  if (state.step === 2) nextBtn.textContent = "Edasi: fixed elemendid";
  if (state.step === 3) nextBtn.textContent = "Edasi: stiil";
  if (state.step === 4) nextBtn.textContent = "Edasi: salvesta";

  renderStepPills();
};

const projectById = (projectId) => state.projects.find((project) => project.id === projectId) ?? null;

const renderProjectsList = () => {
  if (!state.projects.length) {
    projectsListEl.innerHTML = '<div class="hint">Toad puuduvad.</div>';
    return;
  }

  projectsListEl.innerHTML = "";
  for (const project of state.projects) {
    const row = document.createElement("div");
    row.className = `project-row${project.id === state.activeProjectId ? " active" : ""}`;
    row.innerHTML = `
      <button type="button" class="project-open">${project.name || "Minu tuba"}</button>
      <div class="project-meta">${project.room_shell?.dimensions?.width_cm ?? project.dimensions.width_cm}×${project.room_shell?.dimensions?.length_cm ?? project.dimensions.length_cm} cm</div>
      <div class="project-actions">
        <button type="button" class="btn ghost sm" data-action="rename">Nimeta</button>
        <button type="button" class="btn ghost sm danger" data-action="delete">Kustuta</button>
      </div>
    `;

    row.querySelector(".project-open")?.addEventListener("click", () => {
      void selectProject(project.id);
    });

    row.querySelector('[data-action="rename"]')?.addEventListener("click", async () => {
      const nextName = window.prompt("Uus nimi:", project.name || "Minu tuba");
      if (!nextName) return;
      try {
        await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(project.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName.trim().slice(0, 120) })
        });
        await loadProjects();
        await selectProject(project.id);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Nime muutmine ebaõnnestus", "err");
      }
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      const ok = window.confirm(`Kustutan toa "${project.name}"?`);
      if (!ok) return;
      try {
        await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(project.id)}`, {
          method: "DELETE"
        });
        if (project.id === state.activeProjectId) {
          state.activeProjectId = "";
          state.activeProject = null;
        }
        await loadProjects();
        if (state.projects[0]) await selectProject(state.projects[0].id);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Kustutamine ebaõnnestus", "err");
      }
    });

    projectsListEl.appendChild(row);
  }
};

const loadProjects = async () => {
  const payload = await fetchJson(`${API_BASE}/room-projects`);
  state.projects = Array.isArray(payload.projects) ? payload.projects : [];
  renderProjectsList();
};

const roomShellPayload = () => ({
  dimensions: {
    width_cm: shellEditor.getDimensions().width_cm,
    length_cm: shellEditor.getDimensions().length_cm,
    height_cm: shellEditor.getDimensions().height_cm
  },
  openings: openingsEditor.getValue(),
  fixed_elements: fixedEditor.getValue(),
  theme: themeEditor.getValue()
});

const applyProjectToUI = (project) => {
  state.activeProject = project;
  state.activeProjectId = project.id;
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id);

  const shell = project.room_shell || {
    dimensions: project.dimensions,
    openings: [],
    fixed_elements: [],
    theme: null
  };

  shellEditor.setDimensions(shell.dimensions || project.dimensions);
  openingsEditor.setValue(shell.openings || []);
  fixedEditor.setValue(shell.fixed_elements || []);
  themeEditor.setValue(shell.theme || null);

  roomNameInput.value = project.name || "";

  state.shellDirty = false;
  state.openingsDirty = false;
  state.fixedDirty = false;
  state.themeDirty = false;

  setMetrics(shellEditor.getDimensions());
  renderProjectsList();
};

const selectProject = async (projectId) => {
  const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(projectId)}`);
  applyProjectToUI(payload.project);
};

const createProject = async () => {
  const payload = await fetchJson(`${API_BASE}/room-projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Minu tuba ${state.projects.length + 1}` })
  });
  await loadProjects();
  await selectProject(payload.project.id);
  showStep(1);
  setStatus("Uus tuba loodud. Alusta mõõtudest.", "ok");
};

const saveRoomShell = async () => {
  if (!state.activeProjectId) throw new Error("Aktiivne tuba puudub");

  const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}/room-shell`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(roomShellPayload())
  });

  state.activeProject = payload.project;
  state.activeProjectId = payload.project.id;

  state.shellDirty = false;
  state.openingsDirty = false;
  state.fixedDirty = false;
  state.themeDirty = false;

  await loadProjects();
  renderProjectsList();
};

const saveRoom = async () => {
  if (!state.activeProjectId) throw new Error("Aktiivne tuba puudub");
  const name = String(roomNameInput.value ?? "").trim();
  if (!name) throw new Error("Sisesta toa nimi");

  await saveRoomShell();

  const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  applyProjectToUI(payload.project);
  setStatus(`Tuba "${name}" salvestatud.`, "ok");
};

const openSimulator = () => {
  if (!state.activeProjectId) {
    setStatus("Vali või loo tuba enne simulaatori avamist", "warn");
    return;
  }

  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, state.activeProjectId);
  const url = new URL("/simulator", window.location.origin);
  url.searchParams.set("projectId", state.activeProjectId);
  if (initialNextSku) {
    url.searchParams.set("sku", initialNextSku);
  }
  window.location.href = url.toString();
};

const handleNextStep = async () => {
  try {
    if (state.step <= 4 && (state.shellDirty || state.openingsDirty || state.fixedDirty || state.themeDirty)) {
      setStatus("Salvestan sammude muudatused...", "warn");
      await saveRoomShell();
    }

    if (state.step < 5) {
      showStep(state.step + 1);
      setStatus("Samm salvestatud.", "ok");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Sammu salvestamine ebaõnnestus", "err");
  }
};

const bootstrap = async () => {
  createProjectBtn.addEventListener("click", () => {
    void createProject();
  });

  nextBtn.addEventListener("click", () => {
    void handleNextStep();
  });

  backBtn.addEventListener("click", () => {
    showStep(state.step - 1);
  });

  saveRoomBtn.addEventListener("click", () => {
    void saveRoom();
  });

  openSimulatorBtn.addEventListener("click", openSimulator);
  openSimulatorTopBtn.addEventListener("click", openSimulator);

  showStep(1);

  try {
    setStatus("Laen planneri...", "warn");
    const config = await fetchJson(`${API_BASE}/planner/config`);
    if (!config.plannerEnabled || !config.manualRoomEnabled) {
      throw new Error("Manual planner ei ole hetkel aktiivne.");
    }

    await fetchJson(`${API_BASE}/profile`);
    await loadProjects();

    const queryProjectId = query.get("projectId")?.trim() ?? "";
    const storedProjectId = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)?.trim() ?? "";

    const preferredId = queryProjectId || storedProjectId;
    const preferredExists = preferredId ? projectById(preferredId) : null;

    if (preferredExists) {
      await selectProject(preferredId);
    } else if (state.projects.length) {
      await selectProject(state.projects[0].id);
    } else {
      await createProject();
    }

    setStatus("Valmis. Seadista tuba sammude kaupa.", "ok");
  } catch (error) {
    console.error("[room] bootstrap error:", error);
    setStatus(error instanceof Error ? error.message : "Planneri avamine ebaõnnestus", "err");
  }
};

void bootstrap();
