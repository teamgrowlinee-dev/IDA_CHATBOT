import { API_BASE, fetchJson, computeDimensions, clamp } from "../shared.js";
import { createOpeningsEditor } from "../openings-editor.js";
import { createFixedElementsEditor } from "../fixed-elements-editor.js";
import { createRoomThemeEditor } from "../room-theme-editor.js";

export const createRoomEditPanel = ({ containerEl, onSaved, onStatusChange }) => {
  let projectId = "";
  let currentShell = null;

  const status = (msg, kind = "default") => {
    if (typeof onStatusChange === "function") onStatusChange(msg, kind);
  };

  const setButtonLoading = (button, loading, loadingText = "Salvestan...") => {
    if (!button) return;
    const originalText = button.dataset.originalText || button.textContent || "";
    if (!button.dataset.originalText) {
      button.dataset.originalText = originalText;
    }

    if (loading) {
      button.disabled = true;
      button.classList.add("is-loading");
      button.innerHTML = `<span class="btn-inline-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;
      return;
    }

    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = button.dataset.originalText || originalText;
  };

  // Build the static HTML structure once
  containerEl.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">Toa seaded</span>
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

    <!-- A: Dimensions -->
    <div class="panel-section">
      <div class="panel-section-title">Mõõdud</div>
      <div class="field-row">
        <label>Laius (cm)</label>
        <input type="number" id="re-width" min="120" max="2000" step="10" value="400" />
      </div>
      <div class="field-row">
        <label>Pikkus (cm)</label>
        <input type="number" id="re-length" min="120" max="2000" step="10" value="500" />
      </div>
      <div class="field-row" id="re-height-wrap">
        <label>Kõrgus (cm)</label>
        <input type="number" id="re-height" min="180" max="600" step="5" value="250" />
      </div>
    </div>

    <!-- B: Openings -->
    <div class="panel-section">
      <div class="panel-section-title">Uksed ja aknad</div>
      <div id="re-openings-list"></div>
      <button class="btn-panel ghost" id="re-add-opening" style="width:100%;margin-top:4px;">+ Lisa uks/aken</button>
    </div>

    <!-- C: Fixed elements -->
    <div class="panel-section">
      <div class="panel-section-title">Fikseeritud elemendid</div>
      <div id="re-fixed-list"></div>
      <button class="btn-panel ghost" id="re-add-fixed" style="width:100%;margin-top:4px;">+ Lisa element</button>
    </div>

    <!-- D: Theme -->
    <div class="panel-section">
      <div class="panel-section-title">Kujundus</div>
      <div id="re-theme-host"></div>
    </div>

    <!-- Save -->
    <div class="room-edit-save-row">
      <button class="btn-panel primary" id="re-save-btn" style="width:100%;">Salvesta muudatused</button>
    </div>
  `;

  const getDimensions = () => {
    const w = clamp(Number(containerEl.querySelector("#re-width").value), 120, 20000);
    const l = clamp(Number(containerEl.querySelector("#re-length").value), 120, 20000);
    const h = clamp(Number(containerEl.querySelector("#re-height").value), 180, 1000);
    return computeDimensions(w, l, h);
  };

  let openingsState = [];
  let fixedState = [];
  let themeState = null;

  const openingsEditor = createOpeningsEditor({
    listEl: containerEl.querySelector("#re-openings-list"),
    addBtn: containerEl.querySelector("#re-add-opening"),
    getDimensions,
    onChange: (val) => { openingsState = val; }
  });

  const fixedEditor = createFixedElementsEditor({
    listEl: containerEl.querySelector("#re-fixed-list"),
    addBtn: containerEl.querySelector("#re-add-fixed"),
    getDimensions,
    onChange: (val) => { fixedState = val; }
  });

  const themeEditor = createRoomThemeEditor({
    hostEl: containerEl.querySelector("#re-theme-host"),
    onChange: (val) => { themeState = val; }
  });

  containerEl.querySelector("#re-save-btn").addEventListener("click", save);

  async function save() {
    if (!projectId) { status("Projekt pole valitud", "warn"); return; }

    const dims = getDimensions();
    const shell = {
      dimensions: { width_cm: dims.width_cm, length_cm: dims.length_cm, height_cm: dims.height_cm },
      openings: openingsState,
      fixed_elements: fixedState,
      theme: themeState
    };

    status("Salvestan...", "default");
    const saveBtn = containerEl.querySelector("#re-save-btn");
    setButtonLoading(saveBtn, true, "Salvestan...");

    try {
      const data = await fetchJson(`${API_BASE}/room-projects/${projectId}/room-shell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shell)
      });
      currentShell = data.project?.room_shell ?? null;
      status("Toa seaded salvestatud", "ok");
      if (typeof onSaved === "function") onSaved(data.project);
    } catch (err) {
      status(err instanceof Error ? err.message : "Salvestamine ebaõnnestus", "err");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  const populate = (project) => {
    projectId = project.id;
    const shell = project.room_shell;
    const dims = shell?.dimensions ?? project.dimensions ?? {};

    // Populate dimension inputs
    containerEl.querySelector("#re-width").value = dims.width_cm ?? 400;
    containerEl.querySelector("#re-length").value = dims.length_cm ?? 500;
    containerEl.querySelector("#re-height").value = dims.height_cm ?? 250;
    containerEl.querySelector("#re-height-wrap").style.display = project.room_type === "outdoor" ? "none" : "";

    // Populate openings
    openingsEditor.setValue(shell?.openings ?? []);
    openingsState = openingsEditor.getValue();

    // Populate fixed elements
    fixedEditor.setValue(shell?.fixed_elements ?? []);
    fixedState = fixedEditor.getValue();

    // Populate theme
    if (shell?.theme) themeEditor.setValue(shell.theme);
    themeState = themeEditor.getValue();
  };

  return { populate };
};
