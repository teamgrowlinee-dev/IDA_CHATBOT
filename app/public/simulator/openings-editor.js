import { clamp } from "./shared.js";

const WALLS = ["north", "east", "south", "west"];

const newOpening = () => ({
  id: `open_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
  type: "door",
  wall: "north",
  offset_cm: 40,
  width_cm: 90,
  height_cm: 210,
  sill_cm: 0
});

export const createOpeningsEditor = ({ listEl, addBtn, getDimensions, onChange }) => {
  const state = {
    items: []
  };

  const toItem = (raw) => {
    const dims = getDimensions();
    const wallLength = raw.wall === "north" || raw.wall === "south" ? dims.width_cm : dims.length_cm;
    const width = clamp(Number(raw.width_cm ?? 90), 20, wallLength);
    const offset = clamp(Number(raw.offset_cm ?? 0), 0, Math.max(0, wallLength - width));

    return {
      id: String(raw.id || newOpening().id),
      type: raw.type === "window" ? "window" : "door",
      wall: WALLS.includes(raw.wall) ? raw.wall : "north",
      offset_cm: offset,
      width_cm: width,
      height_cm: clamp(Number(raw.height_cm ?? 210), 20, 400),
      sill_cm: clamp(Number(raw.sill_cm ?? 0), 0, 200)
    };
  };

  const commit = () => {
    state.items = state.items.map(toItem);
    if (typeof onChange === "function") onChange(getValue());
    render();
  };

  const bindInputs = () => {
    listEl.querySelectorAll(".opening-row").forEach((row, index) => {
      const get = (field) => row.querySelector(`[data-field="${field}"]`);

      const sync = () => {
        state.items[index] = toItem({
          ...state.items[index],
          type: get("type")?.value,
          wall: get("wall")?.value,
          offset_cm: Number(get("offset_cm")?.value),
          width_cm: Number(get("width_cm")?.value),
          height_cm: Number(get("height_cm")?.value),
          sill_cm: Number(get("sill_cm")?.value)
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
      listEl.innerHTML = '<div class="hint">Avasid pole lisatud.</div>';
      return;
    }

    listEl.innerHTML = "";

    for (const item of state.items) {
      const row = document.createElement("div");
      row.className = "detected-row opening-row";
      row.innerHTML = `
        <div class="row three">
          <div>
            <label>Tüüp</label>
            <select data-field="type">
              <option value="door" ${item.type === "door" ? "selected" : ""}>Uks</option>
              <option value="window" ${item.type === "window" ? "selected" : ""}>Aken</option>
            </select>
          </div>
          <div>
            <label>Sein</label>
            <select data-field="wall">
              ${WALLS.map((wall) => `<option value="${wall}" ${item.wall === wall ? "selected" : ""}>${wall}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Offset (cm)</label>
            <input data-field="offset_cm" type="number" min="0" value="${item.offset_cm}" />
          </div>
        </div>
        <div class="row three">
          <div>
            <label>Laius (cm)</label>
            <input data-field="width_cm" type="number" min="20" value="${item.width_cm}" />
          </div>
          <div>
            <label>Kõrgus (cm)</label>
            <input data-field="height_cm" type="number" min="20" value="${item.height_cm}" />
          </div>
          <div>
            <label>Akna sill (cm)</label>
            <input data-field="sill_cm" type="number" min="0" value="${item.sill_cm}" />
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

  const getValue = () => state.items.map((item) => ({ ...item }));

  addBtn.addEventListener("click", () => {
    state.items.push(newOpening());
    commit();
  });

  return {
    setValue,
    getValue,
    normalize: commit
  };
};
