import {
  ACTIVE_PROJECT_STORAGE_KEY,
  API_BASE,
  clamp,
  computeDimensions,
  fetchJson,
  readLocalCartLines
} from "./shared.js";
import { createCatalogPanel } from "./catalog-panel.js";
import { createHistoryStore } from "./history-store.js";
import { createInspectorPanel } from "./inspector-panel.js";
import { createScene2DEditor } from "./scene-editor-2d.js";
import { createScene3DEditor } from "./scene-editor-3d.js";

const query = new URLSearchParams(window.location.search);
const initialSku = String(query.get("sku") ?? "").trim();

const roomMetaEl = document.getElementById("room-meta");
const statusChipEl = document.getElementById("status-chip");
const warningBoxEl = document.getElementById("warning-box");
const selectionInfoEl = document.getElementById("selection-info");

const projectsListEl = document.getElementById("projects-list");
const objectsListEl = document.getElementById("objects-list");
const inspectorEl = document.getElementById("inspector-content");

const newRoomBtn = document.getElementById("new-room-btn");
const importCartBtn = document.getElementById("import-cart-btn");
const saveSceneBtn = document.getElementById("save-scene-btn");
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const modeEditBtn = document.getElementById("mode-edit-room");
const modeFurnishBtn = document.getElementById("mode-furnish");

const viewSplitBtn = document.getElementById("view-split");
const view2dBtn = document.getElementById("view-2d");
const view3dBtn = document.getElementById("view-3d");

const splitWrap = document.getElementById("view-split-wrap");
const canvasEl = document.getElementById("floor-canvas");
const scene3dHost = document.getElementById("scene-3d");

const catalogSearchEl = document.getElementById("catalog-search");
const catalogCategoryEl = document.getElementById("catalog-category");
const catalogSortEl = document.getElementById("catalog-sort");
const catalogPerPageEl = document.getElementById("catalog-per-page");
const catalogItemsEl = document.getElementById("catalog-items");
const catalogPrevEl = document.getElementById("catalog-prev");
const catalogNextEl = document.getElementById("catalog-next");
const catalogPageEl = document.getElementById("catalog-page");

const state = {
  projects: [],
  activeProjectId: "",
  activeProject: null,
  roomShell: null,
  objects: [],
  selectedId: "",
  mode: "furnish",
  view: "split"
};

const history = createHistoryStore(100);

const setChip = (text, kind = "default") => {
  statusChipEl.textContent = text;
  statusChipEl.className = "tag";
  if (kind === "ok") statusChipEl.classList.add("ok");
  if (kind === "warn") statusChipEl.classList.add("warn");
  if (kind === "err") statusChipEl.classList.add("err");
};

const setWarning = (message, kind = "info") => {
  warningBoxEl.textContent = message;
  warningBoxEl.className = "status-box";
  if (kind === "ok") warningBoxEl.classList.add("ok");
  if (kind === "warn") warningBoxEl.classList.add("warn");
  if (kind === "err") warningBoxEl.classList.add("err");
};

const currentSelected = () => state.objects.find((item) => item.id === state.selectedId) ?? null;

const updateSelectionText = () => {
  const selected = currentSelected();
  if (!selected) {
    selectionInfoEl.textContent = state.mode === "edit-room" ? "Edit room mode aktiivne" : "Vali objekt 2D või 3D vaates.";
    return;
  }
  selectionInfoEl.textContent = `${selected.title} · ${selected.dims_cm.w}×${selected.dims_cm.d}×${selected.dims_cm.h} cm · ${Math.round(selected.pose.rotation_deg)}°`;
};

const scene2d = createScene2DEditor({
  canvas: canvasEl,
  getMode: () => state.mode,
  getRoomShell: () => state.roomShell,
  setRoomShellDimensions: (dims) => {
    state.roomShell.dimensions = computeDimensions(dims.width_cm, dims.length_cm, dims.height_cm);
    state.roomShell.walls = [
      { id: "north", length_cm: state.roomShell.dimensions.width_cm },
      { id: "east", length_cm: state.roomShell.dimensions.length_cm },
      { id: "south", length_cm: state.roomShell.dimensions.width_cm },
      { id: "west", length_cm: state.roomShell.dimensions.length_cm }
    ];

    roomMetaEl.textContent = `${state.activeProject?.name || "Minu tuba"} · ${state.roomShell.dimensions.width_cm}×${state.roomShell.dimensions.length_cm}×${state.roomShell.dimensions.height_cm} cm`;
    renderAll();
  },
  getObjects: () => state.objects,
  setObjects: (nextObjects, trackHistory = true) => {
    if (trackHistory) history.push(state.objects);
    state.objects = nextObjects;
    renderAll();
  },
  onSelect: (objectId) => {
    state.selectedId = objectId;
    renderAll();
  },
  onWarning: setWarning
});

const scene3d = createScene3DEditor({
  hostEl: scene3dHost,
  getRoomShell: () => state.roomShell,
  getRoomDimensions: () => state.roomShell?.dimensions,
  getObjects: () => state.objects,
  onSelect: (objectId) => {
    state.selectedId = objectId;
    renderAll();
  }
});

const inspector = createInspectorPanel({
  hostEl: inspectorEl,
  getSelected: currentSelected,
  onUpdate: (objectId, patch) => {
    history.push(state.objects);
    state.objects = state.objects.map((item) => {
      if (item.id !== objectId) return item;
      return {
        ...item,
        title: patch.title,
        sku: patch.sku,
        dims_cm: { ...patch.dims_cm },
        pose: { ...patch.pose },
        attach: { ...(item.attach || {}), ...(patch.attach || {}) },
        clearance_cm: patch.clearance_cm,
        locked: patch.locked
      };
    });
    renderAll();
    setWarning("Objekti muudatused rakendatud.", "ok");
  },
  onDuplicate: (objectId) => {
    const source = state.objects.find((item) => item.id === objectId);
    if (!source) return;
    if (source.locked) {
      setWarning("Lukustatud objekti ei saa duplikeerida enne lukustuse eemaldamist.", "warn");
      return;
    }

    history.push(state.objects);
    const clone = {
      ...source,
      id: `obj_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      source_key: source.source_key ? `${source.source_key}:dup` : undefined,
      title: `${source.title} (copy)`,
      pose: {
        ...source.pose,
        x_cm: clamp(source.pose.x_cm + 25, 0, state.roomShell.dimensions.width_cm),
        z_cm: clamp(source.pose.z_cm + 25, 0, state.roomShell.dimensions.length_cm)
      }
    };
    state.objects = [...state.objects, clone];
    state.selectedId = clone.id;
    renderAll();
    setWarning("Objekt duplikeeritud.", "ok");
  },
  onDelete: (objectId) => {
    const source = state.objects.find((item) => item.id === objectId);
    if (source?.locked) {
      setWarning("Lukustatud objekti ei saa eemaldada enne lukustuse eemaldamist.", "warn");
      return;
    }

    history.push(state.objects);
    state.objects = state.objects.filter((item) => item.id !== objectId);
    if (state.selectedId === objectId) {
      state.selectedId = state.objects[0]?.id || "";
    }
    renderAll();
    setWarning("Objekt eemaldatud.", "warn");
  },
  onSwap: (objectId, replacementCard) => {
    history.push(state.objects);
    state.objects = state.objects.map((item) => {
      if (item.id !== objectId) return item;
      return {
        ...item,
        title: replacementCard.title,
        sku: replacementCard.id,
        type: "cart",
        source: "cart",
        source_key: `${replacementCard.id}:1`
      };
    });
    renderAll();
    setWarning("Objekt asendatud sarnase tootega.", "ok");
  },
  onWarn: setWarning
});

const catalog = createCatalogPanel({
  searchEl: catalogSearchEl,
  categoryEl: catalogCategoryEl,
  sortEl: catalogSortEl,
  perPageEl: catalogPerPageEl,
  itemsEl: catalogItemsEl,
  prevBtn: catalogPrevEl,
  nextBtn: catalogNextEl,
  pageEl: catalogPageEl,
  onAdd: async (card) => {
    if (!state.activeProjectId) return;
    try {
      history.push(state.objects);
      const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}/scene/import-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: String(card.id), qty: 1 }] })
      });

      state.activeProject = payload.project;
      state.objects = Array.isArray(payload.project.scene?.objects)
        ? payload.project.scene.objects.map((item) => ({ ...item }))
        : [];
      state.selectedId = state.objects[state.objects.length - 1]?.id || state.selectedId;
      renderAll();
      setWarning("Toode lisati scene'i.", "ok");
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Toote lisamine ebaõnnestus", "err");
    }
  },
  setWarning
});

const renderObjectsList = () => {
  if (!state.objects.length) {
    objectsListEl.innerHTML = '<div class="hint">Objekte pole lisatud.</div>';
    return;
  }

  objectsListEl.innerHTML = "";
  for (const item of state.objects) {
    const row = document.createElement("div");
    row.className = `product-row${state.selectedId === item.id ? " active" : ""}`;
    row.innerHTML = `
      <button type="button" class="project-open">${item.title}</button>
      <div class="project-meta">${item.source === "cart" ? "Ostukorv" : "Olemasolev"} · ${Math.round(item.pose.x_cm)}cm, ${Math.round(item.pose.z_cm)}cm</div>
      <div class="project-actions">
        <button type="button" class="btn ghost sm" data-action="select">Vali</button>
        <button type="button" class="btn ghost sm danger" data-action="remove">X</button>
      </div>
    `;

    row.querySelector(".project-open")?.addEventListener("click", () => {
      state.selectedId = item.id;
      renderAll();
    });

    row.querySelector('[data-action="select"]')?.addEventListener("click", () => {
      state.selectedId = item.id;
      renderAll();
    });

    row.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      if (item.locked) {
        setWarning("Lukustatud objekti ei saa eemaldada enne lukustuse eemaldamist.", "warn");
        return;
      }
      history.push(state.objects);
      state.objects = state.objects.filter((entry) => entry.id !== item.id);
      if (state.selectedId === item.id) {
        state.selectedId = state.objects[0]?.id || "";
      }
      renderAll();
      setWarning("Objekt eemaldatud.", "warn");
    });

    objectsListEl.appendChild(row);
  }
};

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
        setWarning(error instanceof Error ? error.message : "Nime muutmine ebaõnnestus", "err");
      }
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      const ok = window.confirm(`Kustutan toa \"${project.name}\"?`);
      if (!ok) return;
      try {
        await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
        await loadProjects();
        if (state.projects.length) {
          await selectProject(state.projects[0].id);
        } else {
          state.activeProject = null;
          state.activeProjectId = "";
          state.roomShell = null;
          state.objects = [];
          state.selectedId = "";
          renderAll();
        }
      } catch (error) {
        setWarning(error instanceof Error ? error.message : "Kustutamine ebaõnnestus", "err");
      }
    });

    projectsListEl.appendChild(row);
  }
};

const setMode = (mode) => {
  state.mode = mode;
  modeEditBtn.classList.toggle("primary", mode === "edit-room");
  modeEditBtn.classList.toggle("ghost", mode !== "edit-room");
  modeFurnishBtn.classList.toggle("primary", mode === "furnish");
  modeFurnishBtn.classList.toggle("ghost", mode !== "furnish");
  updateSelectionText();
  renderAll();
};

const setView = (view) => {
  state.view = view;
  viewSplitBtn.classList.toggle("primary", view === "split");
  view2dBtn.classList.toggle("primary", view === "2d");
  view3dBtn.classList.toggle("primary", view === "3d");

  const stage2d = splitWrap.children[0];
  const stage3d = splitWrap.children[1];

  if (view === "split") {
    splitWrap.classList.remove("single-view");
    stage2d.style.display = "block";
    stage3d.style.display = "block";
  } else if (view === "2d") {
    splitWrap.classList.add("single-view");
    stage2d.style.display = "block";
    stage3d.style.display = "none";
  } else {
    splitWrap.classList.add("single-view");
    stage2d.style.display = "none";
    stage3d.style.display = "block";
  }

  scene2d.resize();
  scene3d.resize();
};

const renderAll = () => {
  if (!state.roomShell) return;

  roomMetaEl.textContent = `${state.activeProject?.name || "Minu tuba"} · ${state.roomShell.dimensions.width_cm}×${state.roomShell.dimensions.length_cm}×${state.roomShell.dimensions.height_cm} cm`;

  scene2d.render(state.selectedId);
  scene3d.renderRoom();
  scene3d.renderObjects();
  scene3d.highlight(state.selectedId);

  inspector.render();
  renderProjectsList();
  renderObjectsList();
  updateSelectionText();

  undoBtn.disabled = !history.canUndo();
  redoBtn.disabled = !history.canRedo();
};

const loadProjects = async () => {
  const payload = await fetchJson(`${API_BASE}/room-projects`);
  state.projects = Array.isArray(payload.projects) ? payload.projects : [];
  renderProjectsList();
};

const applyProject = (project) => {
  state.activeProject = project;
  state.activeProjectId = project.id;
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id);

  state.roomShell = project.room_shell || {
    shape: "rect",
    walls: [
      { id: "north", length_cm: project.dimensions.width_cm },
      { id: "east", length_cm: project.dimensions.length_cm },
      { id: "south", length_cm: project.dimensions.width_cm },
      { id: "west", length_cm: project.dimensions.length_cm }
    ],
    dimensions: { ...project.dimensions },
    openings: [],
    fixed_elements: [],
    theme: {
      style_id: "ida-clean",
      wall_color: "#f5f3ef",
      floor_material: "oak",
      floor_tone: "natural"
    }
  };

  state.objects = Array.isArray(project.scene?.objects)
    ? project.scene.objects.map((item) => ({ ...item }))
    : [];

  state.selectedId = state.objects[0]?.id || "";
  history.reset();
  renderAll();
};

const selectProject = async (projectId) => {
  const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(projectId)}`);
  applyProject(payload.project);
};

const saveAll = async () => {
  if (!state.activeProjectId || !state.roomShell) {
    setWarning("Aktiivne tuba puudub", "err");
    return;
  }

  try {
    setChip("Salvestan...", "warn");

    await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}/room-shell`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dimensions: {
          width_cm: state.roomShell.dimensions.width_cm,
          length_cm: state.roomShell.dimensions.length_cm,
          height_cm: state.roomShell.dimensions.height_cm
        },
        openings: state.roomShell.openings,
        fixed_elements: state.roomShell.fixed_elements,
        theme: state.roomShell.theme
      })
    });

    const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene: {
          objects: state.objects
        }
      })
    });

    state.activeProject = payload.project;
    await loadProjects();
    renderProjectsList();

    setChip("Salvestatud", "ok");
    setWarning("Planneri seis salvestatud.", "ok");
  } catch (error) {
    setChip("Viga", "err");
    setWarning(error instanceof Error ? error.message : "Salvestamine ebaõnnestus", "err");
  }
};

const importCart = async () => {
  if (!state.activeProjectId) {
    setWarning("Aktiivne tuba puudub", "err");
    return;
  }

  const cartLines = readLocalCartLines();
  if (!cartLines.length) {
    setWarning("Lokaalne ostukorv on tühi (ida_local_cart_v1)", "warn");
    return;
  }

  try {
    history.push(state.objects);
    setChip("Impordin...", "warn");
    const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}/scene/import-cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartLines })
    });

    state.activeProject = payload.project;
    state.objects = Array.isArray(payload.project.scene?.objects)
      ? payload.project.scene.objects.map((item) => ({ ...item }))
      : [];

    state.selectedId = state.objects[state.objects.length - 1]?.id || state.selectedId;

    renderAll();
    await loadProjects();
    setChip("Valmis", "ok");
    setWarning(`${payload.addedCount ?? 0} objekti imporditi ostukorvist.`, "ok");
  } catch (error) {
    setChip("Viga", "err");
    setWarning(error instanceof Error ? error.message : "Ostukorvi import ebaõnnestus", "err");
  }
};

const maybeImportInitialSku = async () => {
  if (!initialSku || !state.activeProjectId) return;

  const clearSkuFromUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("sku");
    window.history.replaceState({}, "", url.toString());
  };

  const alreadyInScene = state.objects.some((item) => String(item.sku ?? "").trim() === initialSku);
  if (alreadyInScene) {
    clearSkuFromUrl();
    return;
  }

  try {
    history.push(state.objects);
    const payload = await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(state.activeProjectId)}/scene/import-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [{ sku: initialSku, qty: 1 }] })
    });

    state.activeProject = payload.project;
    state.objects = Array.isArray(payload.project.scene?.objects)
      ? payload.project.scene.objects.map((item) => ({ ...item }))
      : [];
    state.selectedId = state.objects[state.objects.length - 1]?.id || state.selectedId;
    renderAll();
    setWarning("Chatbotist valitud toode lisati ruumi.", "ok");
  } catch (error) {
    setWarning(error instanceof Error ? error.message : "Valitud toote import ebaõnnestus", "warn");
  } finally {
    clearSkuFromUrl();
  }
};

const undo = () => {
  const snapshot = history.undo(state.objects);
  if (!snapshot) return;
  state.objects = snapshot;
  if (state.selectedId && !state.objects.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.objects[0]?.id || "";
  }
  renderAll();
};

const redo = () => {
  const snapshot = history.redo(state.objects);
  if (!snapshot) return;
  state.objects = snapshot;
  if (state.selectedId && !state.objects.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.objects[0]?.id || "";
  }
  renderAll();
};

const resolveInitialProject = async () => {
  const queryProjectId = query.get("projectId")?.trim() ?? "";
  const queryLegacyRoomId = query.get("roomId")?.trim() ?? "";

  if (queryLegacyRoomId && !queryProjectId) {
    const migrated = await fetchJson(`${API_BASE}/room-projects/from-room/${encodeURIComponent(queryLegacyRoomId)}`, {
      method: "POST"
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("roomId");
    url.searchParams.set("projectId", migrated.project.id);
    window.history.replaceState({}, "", url.toString());
    return migrated.project.id;
  }

  if (queryProjectId) return queryProjectId;
  const stored = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)?.trim() ?? "";
  if (stored) return stored;
  return state.projects[0]?.id ?? "";
};

const bootstrap = async () => {
  setChip("Laen...", "warn");

  modeEditBtn.addEventListener("click", () => setMode("edit-room"));
  modeFurnishBtn.addEventListener("click", () => setMode("furnish"));

  viewSplitBtn.addEventListener("click", () => setView("split"));
  view2dBtn.addEventListener("click", () => setView("2d"));
  view3dBtn.addEventListener("click", () => setView("3d"));

  importCartBtn.addEventListener("click", () => {
    void importCart();
  });

  saveSceneBtn.addEventListener("click", () => {
    void saveAll();
  });

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  newRoomBtn.addEventListener("click", () => {
    window.location.href = "/room";
  });

  window.addEventListener("resize", () => {
    scene2d.resize();
    scene3d.resize();
  });

  try {
    await fetchJson(`${API_BASE}/planner/config`);
    await fetchJson(`${API_BASE}/profile`);
    await loadProjects();

    const preferredId = await resolveInitialProject();
    if (!preferredId) {
      setChip("Puudub", "warn");
      setWarning("Toad puuduvad. Ava planner ja loo uus tuba.", "warn");
      return;
    }

    const found = state.projects.find((project) => project.id === preferredId);
    if (!found && state.projects.length > 0) {
      await selectProject(state.projects[0].id);
    } else {
      await selectProject(preferredId);
    }

    await maybeImportInitialSku();

    await catalog.init();

    setMode("furnish");
    setView("split");
    setChip("Valmis", "ok");
    setWarning("Vali toode kataloogist või impordi ostukorv.", "ok");
  } catch (error) {
    console.error("[simulator] bootstrap error:", error);
    setChip("Viga", "err");
    setWarning(error instanceof Error ? error.message : "Simulaatori avamine ebaõnnestus", "err");
  }
};

void bootstrap();
