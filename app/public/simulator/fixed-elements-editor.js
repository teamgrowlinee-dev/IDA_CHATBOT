import { clamp } from "./shared.js";

const TYPES = ["radiator", "column", "niche", "other"];

const newFixed = () => ({
  id: `fixed_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
  type: "radiator",
  label: "",
  wall: "north",
  dims_cm: { w: 120, d: 25, h: 60 },
  pose: { x_cm: 140, z_cm: 20, rotation_deg: 0 }
});

export const createFixedElementsEditor = ({ listEl, addBtn, getDimensions, onChange }) => {
  const state = {
    items: []
  };

  const toItem = (raw) => {
    const dims = getDimensions();
    const x = clamp(Number(raw?.pose?.x_cm ?? 140), 0, dims.width_cm);
    const z = clamp(Number(raw?.pose?.z_cm ?? 20), 0, dims.length_cm);

    return {
      id: String(raw.id || newFixed().id),
      type: TYPES.includes(raw.type) ? raw.type : "other",
      label: String(raw.label ?? "").slice(0, 120),
      wall: ["north", "east", "south", "west"].includes(raw.wall) ? raw.wall : undefined,
      dims_cm: {
        w: clamp(Number(raw?.dims_cm?.w ?? 120), 10, 1500),
        d: clamp(Number(raw?.dims_cm?.d ?? 10), 5, 1500),
        h: clamp(Number(raw?.dims_cm?.h ?? 60), 5, 1000)
      },
      pose: {
        x_cm: x,
        z_cm: z,
        rotation_deg: clamp(Number(raw?.pose?.rotation_deg ?? 0), -360, 360)
      }
    };
  };

  const commit = () => {
    state.items = state.items.map(toItem);
    if (typeof onChange === "function") onChange(getValue());
    render();
  };

  const bindInputs = () => {
    listEl.querySelectorAll(".fixed-row").forEach((row, index) => {
      const get = (field) => row.querySelector(`[data-field="${field}"]`);

      const sync = () => {
        state.items[index] = toItem({
          ...state.items[index],
          type: get("type")?.value,
          label: get("label")?.value,
          wall: get("wall")?.value || undefined,
          dims_cm: {
            w: Number(get("w")?.value),
            d: Number(get("d")?.value),
            h: Number(get("h")?.value)
          },
          pose: {
            x_cm: Number(get("x")?.value),
            z_cm: Number(get("z")?.value),
            rotation_deg: Number(get("rotation")?.value)
          }
        });
        if (typeof onChange === "function") onChange(getValue());
      };

      row.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", sync));
      row.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
        state.items = state.items.filter((_, itemIndex) => itemIndex !== index);
        commit();
      });
    });
  };

  const render = () => {
    if (!state.items.length) {
      listEl.innerHTML = '<div class="hint">Fixed elemente pole lisatud.</div>';
      return;
    }

    listEl.innerHTML = "";

    for (const item of state.items) {
      const row = document.createElement("div");
      row.className = "detected-row fixed-row";
      row.innerHTML = `
        <div class="row three">
          <div>
            <label>Tüüp</label>
            <select data-field="type">
              ${TYPES.map((type) => `<option value="${type}" ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Nimi</label>
            <input data-field="label" value="${item.label}" />
          </div>
          <div>
            <label>Sein (optional)</label>
            <select data-field="wall">
              <option value="">-</option>
              ${["north", "east", "south", "west"].map((wall) => `<option value="${wall}" ${item.wall === wall ? "selected" : ""}>${wall}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="row three">
          <div>
            <label>x (cm)</label>
            <input data-field="x" type="number" min="0" value="${item.pose.x_cm}" />
          </div>
          <div>
            <label>z (cm)</label>
            <input data-field="z" type="number" min="0" value="${item.pose.z_cm}" />
          </div>
          <div>
            <label>Pööre (deg)</label>
            <input data-field="rotation" type="number" value="${item.pose.rotation_deg}" />
          </div>
        </div>
        <div class="row three">
          <div>
            <label>Laius (cm)</label>
            <input data-field="w" type="number" min="10" value="${item.dims_cm.w}" />
          </div>
          <div>
            <label>Sügavus (cm)</label>
            <input data-field="d" type="number" min="5" value="${item.dims_cm.d}" />
          </div>
          <div>
            <label>Kõrgus (cm)</label>
            <input data-field="h" type="number" min="5" value="${item.dims_cm.h}" />
          </div>
        </div>
        <div class="toolbar"><button class="btn ghost sm danger" data-action="remove" type="button">Eemalda</button></div>
      `;
      listEl.appendChild(row);
    }

    bindInputs();
  };

  const setValue = (items) => {
    state.items = Array.isArray(items) ? items.map(toItem) : [];
    render();
  };

  const getValue = () => state.items.map((item) => ({ ...item, dims_cm: { ...item.dims_cm }, pose: { ...item.pose } }));

  addBtn.addEventListener("click", () => {
    state.items.push(newFixed());
    commit();
  });

  return {
    setValue,
    getValue,
    normalize: commit
  };
};
