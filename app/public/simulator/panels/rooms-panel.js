import { API_BASE, fetchJson, ACTIVE_PROJECT_STORAGE_KEY } from "../shared.js";

const saveActiveId = (id) => {
  try { localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id); } catch {}
};

export const createRoomsPanel = ({ containerEl, onOpen, onStatusChange }) => {
  let projects = [];
  let activeId = "";

  const status = (msg, kind = "default") => {
    if (typeof onStatusChange === "function") onStatusChange(msg, kind);
  };

  const render = () => {
    containerEl.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "panel-header";
    header.innerHTML = `
      <span class="panel-title">Projektid</span>
      <div class="panel-header-actions">
        <button class="btn-panel primary" id="new-project-btn" style="font-size:11px;padding:4px 10px;">+ Uus tuba</button>
        <button
          type="button"
          class="panel-close-btn"
          data-side="left"
          aria-label="Sulge paneel"
          title="Sulge paneel"
        >
          ✕
        </button>
      </div>
    `;
    containerEl.appendChild(header);

    header.querySelector("#new-project-btn").addEventListener("click", createProject);

    const list = document.createElement("div");
    list.className = "project-list";

    if (!projects.length) {
      list.innerHTML = '<div class="hint">Ühtegi projekti ei leitud. Loo uus tuba.</div>';
    } else {
      for (const p of projects) {
        const row = document.createElement("div");
        row.className = "project-row" + (p.id === activeId ? " active" : "");
        row.dataset.id = p.id;
        const dims = p.dimensions;
        const meta = dims
          ? `${dims.width_cm}×${dims.length_cm} cm · ${dims.area_m2 ?? "–"} m²`
          : "Mõõdud puuduvad";

        row.innerHTML = `
          <div class="project-row-info">
            <div class="project-row-name">${esc(p.name)}</div>
            <div class="project-row-meta">${meta}</div>
          </div>
          <div class="project-row-actions">
            <button title="Muuda nime" data-action="rename">✏</button>
            <button title="Kustuta" data-action="delete">🗑</button>
          </div>
        `;

        row.addEventListener("click", (e) => {
          if (e.target.closest("[data-action]")) return;
          setActive(p.id);
        });

        row.querySelector("[data-action='rename']").addEventListener("click", (e) => {
          e.stopPropagation();
          renameProject(p);
        });

        row.querySelector("[data-action='delete']").addEventListener("click", (e) => {
          e.stopPropagation();
          deleteProject(p);
        });

        list.appendChild(row);
      }
    }

    containerEl.appendChild(list);
  };

  const setActive = (id) => {
    activeId = id;
    saveActiveId(id);
    render();
    const project = projects.find((p) => p.id === id);
    if (project && typeof onOpen === "function") onOpen(project);
  };

  const load = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/room-projects`);
      projects = Array.isArray(data.projects) ? data.projects : [];
      render();
    } catch (err) {
      status(err instanceof Error ? err.message : "Projektide laadimine ebaõnnestus", "err");
    }
  };

  const createProject = async () => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = `
      <div style="background:#1e1e1e;border-radius:10px;padding:28px 28px 20px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eee;font-family:sans-serif;">
        <div style="font-size:15px;font-weight:600;margin-bottom:18px;">Uus projekt</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">
          <button id="np-type-indoor" style="padding:8px;border-radius:7px;border:2px solid #e6097a;background:#2a1020;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">🏠 Tuba</button>
          <button id="np-type-outdoor" style="padding:8px;border-radius:7px;border:2px solid #444;background:#1e1e1e;color:#aaa;cursor:pointer;font-size:12px;font-weight:600;">🌿 Terrass</button>
        </div>
        <label style="font-size:12px;color:#aaa;">Projekti nimi</label>
        <input id="np-name" value="Uus tuba" style="width:100%;box-sizing:border-box;margin:4px 0 12px;padding:7px 10px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#eee;font-size:13px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;color:#aaa;">Laius (cm)</label>
            <input id="np-w" type="number" value="400" min="100" max="2000" style="width:100%;box-sizing:border-box;margin-top:4px;padding:7px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#eee;font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px;color:#aaa;">Pikkus (cm)</label>
            <input id="np-l" type="number" value="500" min="100" max="2000" style="width:100%;box-sizing:border-box;margin-top:4px;padding:7px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#eee;font-size:13px;">
          </div>
          <div id="np-h-wrap">
            <label style="font-size:11px;color:#aaa;">Kõrgus (cm)</label>
            <input id="np-h" type="number" value="250" min="200" max="500" style="width:100%;box-sizing:border-box;margin-top:4px;padding:7px 8px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#eee;font-size:13px;">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="np-cancel" style="padding:7px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer;font-size:13px;">Tühista</button>
          <button id="np-ok" style="padding:7px 18px;border-radius:6px;border:none;background:#e6097a;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Loo tuba</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("#np-name").focus();
    // Type toggle buttons
    const btnIndoor = overlay.querySelector("#np-type-indoor");
    const btnOutdoor = overlay.querySelector("#np-type-outdoor");
    const setType = (type) => {
      btnIndoor.dataset.selected = type === "indoor" ? "1" : "0";
      btnOutdoor.dataset.selected = type === "outdoor" ? "1" : "0";
      btnIndoor.style.borderColor = type === "indoor" ? "#e6097a" : "#444";
      btnIndoor.style.background = type === "indoor" ? "#2a1020" : "#1e1e1e";
      btnIndoor.style.color = type === "indoor" ? "#fff" : "#aaa";
      btnOutdoor.style.borderColor = type === "outdoor" ? "#2d8a4e" : "#444";
      btnOutdoor.style.background = type === "outdoor" ? "#0f2a1a" : "#1e1e1e";
      btnOutdoor.style.color = type === "outdoor" ? "#fff" : "#aaa";
      overlay.querySelector("#np-h-wrap").style.display = type === "outdoor" ? "none" : "";
    };
    setType("indoor");
    btnIndoor.onclick = () => setType("indoor");
    btnOutdoor.onclick = () => setType("outdoor");

    await new Promise((resolve) => {
      overlay.querySelector("#np-cancel").onclick = () => { document.body.removeChild(overlay); resolve(null); };
      overlay.querySelector("#np-ok").onclick = () => resolve("ok");
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter") resolve("ok");
        if (e.key === "Escape") { document.body.removeChild(overlay); resolve(null); }
      });
    }).then(async (result) => {
      if (!result) return;
      const roomType = overlay.querySelector("#np-type-outdoor").dataset.selected === "1" ? "outdoor" : "indoor";
      const name = overlay.querySelector("#np-name").value.trim() || (roomType === "outdoor" ? "Uus terrass" : "Uus tuba");
      const w = Math.max(100, Math.min(2000, Number(overlay.querySelector("#np-w").value) || 400));
      const l = Math.max(100, Math.min(2000, Number(overlay.querySelector("#np-l").value) || 500));
      const h = Math.max(200, Math.min(500, Number(overlay.querySelector("#np-h").value) || 250));
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      try {
        const data = await fetchJson(`${API_BASE}/room-projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, room_type: roomType, dimensions: { width_cm: w, length_cm: l, height_cm: h } })
        });
        projects = [data.project, ...projects];
        render();
        setActive(data.project.id);
      } catch (err) {
        status(err instanceof Error ? err.message : "Projekti loomine ebaõnnestus", "err");
      }
    });
  };

  const renameProject = async (project) => {
    const name = prompt("Uus nimi:", project.name);
    if (name === null || !name.trim()) return;
    try {
      const data = await fetchJson(`${API_BASE}/room-projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      projects = projects.map((p) => (p.id === project.id ? data.project : p));
      render();
    } catch (err) {
      status(err instanceof Error ? err.message : "Ümbernimetamine ebaõnnestus", "err");
    }
  };

  const deleteProject = async (project) => {
    if (!confirm(`Kustuta projekt "${project.name}"? Seda ei saa tagasi võtta.`)) return;
    try {
      await fetchJson(`${API_BASE}/room-projects/${project.id}`, { method: "DELETE" });
      projects = projects.filter((p) => p.id !== project.id);
      if (activeId === project.id) {
        activeId = projects[0]?.id ?? "";
        if (activeId) setActive(activeId);
      }
      render();
    } catch (err) {
      status(err instanceof Error ? err.message : "Kustutamine ebaõnnestus", "err");
    }
  };

  const esc = (str) => String(str ?? "").replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c]));

  return {
    load,
    setProjects(list, currentId) {
      projects = list;
      activeId = currentId;
      render();
    },
    getProjects: () => projects
  };
};
