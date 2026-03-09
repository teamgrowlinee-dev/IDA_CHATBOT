import { ACTIVE_PROJECT_STORAGE_KEY, API_BASE, fetchJson } from "./shared.js";

const query = new URLSearchParams(window.location.search);
const projectsEl = document.getElementById("planner-projects");
const statusEl = document.getElementById("planner-status");
const newRoomBtn = document.getElementById("planner-new-room");
const continueBtn = document.getElementById("planner-continue");
const openManualBtn = document.getElementById("planner-open-manual");
const scanCardEl = document.getElementById("scan-card");
const scanBadgeEl = document.getElementById("scan-badge");
const initialNextSku = String(query.get("nextSku") ?? "").trim();

const state = {
  config: null,
  projects: []
};

const setStatus = (text, kind = "default") => {
  statusEl.textContent = text;
  statusEl.className = "tag";
  if (kind === "ok") statusEl.classList.add("ok");
  if (kind === "warn") statusEl.classList.add("warn");
  if (kind === "err") statusEl.classList.add("err");
};

const projectUrl = (path, projectId) => {
  const url = new URL(path, window.location.origin);
  if (projectId) url.searchParams.set("projectId", projectId);
  if (initialNextSku) {
    if (path === "/simulator") {
      url.searchParams.set("sku", initialNextSku);
    } else {
      url.searchParams.set("nextSku", initialNextSku);
    }
  }
  return url.toString();
};

const openRoom = (projectId) => {
  if (projectId) {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
  }
  window.location.href = projectUrl("/room", projectId);
};

const openSimulator = (projectId) => {
  if (projectId) {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
  }
  window.location.href = projectUrl("/simulator", projectId);
};

const renderProjects = () => {
  if (!state.projects.length) {
    projectsEl.innerHTML = '<div class="hint">Ühtegi tuba pole veel loodud.</div>';
    return;
  }

  projectsEl.innerHTML = "";

  for (const project of state.projects) {
    const row = document.createElement("div");
    row.className = "project-row";

    row.innerHTML = `
      <button type="button" class="project-open">${project.name || "Minu tuba"}</button>
      <div class="project-meta">${project.room_shell?.dimensions?.width_cm ?? project.dimensions.width_cm} × ${project.room_shell?.dimensions?.length_cm ?? project.dimensions.length_cm} cm</div>
      <div class="project-actions">
        <button type="button" class="btn ghost sm" data-action="edit">Ava planner</button>
        <button type="button" class="btn ghost sm" data-action="sim">Ava simulator</button>
        <button type="button" class="btn ghost sm" data-action="rename">Nimeta</button>
        <button type="button" class="btn ghost sm danger" data-action="delete">Kustuta</button>
      </div>
    `;

    row.querySelector(".project-open")?.addEventListener("click", () => openRoom(project.id));
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => openRoom(project.id));
    row.querySelector('[data-action="sim"]')?.addEventListener("click", () => openSimulator(project.id));

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
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Nime muutmine ebaõnnestus", "err");
      }
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      const ok = window.confirm(`Kustutan toa "${project.name}"?`);
      if (!ok) return;
      try {
        await fetchJson(`${API_BASE}/room-projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
        await loadProjects();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Kustutamine ebaõnnestus", "err");
      }
    });

    projectsEl.appendChild(row);
  }
};

const loadProjects = async () => {
  const payload = await fetchJson(`${API_BASE}/room-projects`);
  state.projects = Array.isArray(payload.projects) ? payload.projects : [];
  renderProjects();
};

const createProject = async () => {
  const payload = await fetchJson(`${API_BASE}/room-projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Minu tuba ${state.projects.length + 1}` })
  });
  const projectId = payload?.project?.id;
  if (!projectId) throw new Error("Toa loomine ebaõnnestus");
  openRoom(projectId);
};

const openContinue = () => {
  const stored = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)?.trim();
  const project = (stored && state.projects.find((entry) => entry.id === stored)) || state.projects[0];
  if (!project) {
    void createProject();
    return;
  }
  openRoom(project.id);
};

const bootstrap = async () => {
  try {
    setStatus("Laen...", "warn");
    const config = await fetchJson(`${API_BASE}/planner/config`);
    state.config = config;

    if (!config?.plannerEnabled) {
      setStatus("Planner suletud", "err");
      projectsEl.innerHTML = '<div class="hint">Planner ei ole hetkel aktiivne.</div>';
      return;
    }

    if (!config.manualRoomEnabled) {
      setStatus("Manual planner väljas", "warn");
      openManualBtn.disabled = true;
      newRoomBtn.disabled = true;
      continueBtn.disabled = true;
      projectsEl.innerHTML = '<div class="hint">Manual planner on hetkel feature-flagiga välja lülitatud.</div>';
      return;
    }

    if (scanCardEl && scanBadgeEl) {
      scanCardEl.classList.toggle("disabled", !config.scanRoomEnabled);
      scanBadgeEl.textContent = config.scanRoomEnabled ? "Aktiivne" : "Varsti saadaval";
    }

    await fetchJson(`${API_BASE}/profile`);
    await loadProjects();
    setStatus("Valmis", "ok");

    newRoomBtn.addEventListener("click", () => {
      void createProject();
    });

    continueBtn.addEventListener("click", openContinue);
    openManualBtn.addEventListener("click", openContinue);
  } catch (error) {
    console.error("[planner] bootstrap error:", error);
    setStatus("Viga", "err");
    projectsEl.innerHTML = `<div class="hint">${error instanceof Error ? error.message : "Planneri laadimine ebaõnnestus."}</div>`;
  }
};

void bootstrap();
