const PRESETS = [
  {
    style_id: "ida-clean",
    label: "IDA Clean",
    wall_color: "#f5f3ef",
    floor_material: "oak",
    floor_tone: "natural"
  },
  {
    style_id: "ida-charcoal",
    label: "IDA Charcoal",
    wall_color: "#ebe8e2",
    floor_material: "walnut",
    floor_tone: "dark"
  },
  {
    style_id: "ida-minimal",
    label: "IDA Minimal",
    wall_color: "#f9f8f6",
    floor_material: "ash",
    floor_tone: "light"
  }
];

export const createRoomThemeEditor = ({ hostEl, onChange }) => {
  const state = {
    theme: { ...PRESETS[0] }
  };

  const render = () => {
    hostEl.innerHTML = `
      <div class="detected-row">
        <div class="row three">
          <div>
            <label>Style preset</label>
            <select data-field="style_id">
              ${PRESETS.map((preset) => `<option value="${preset.style_id}" ${preset.style_id === state.theme.style_id ? "selected" : ""}>${preset.label}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Seina toon</label>
            <input data-field="wall_color" type="color" value="${state.theme.wall_color}" />
          </div>
          <div>
            <label>Põranda toon</label>
            <input data-field="floor_tone" value="${state.theme.floor_tone}" />
          </div>
        </div>
        <div class="row three">
          <div>
            <label>Põrandamaterjal</label>
            <input data-field="floor_material" value="${state.theme.floor_material}" />
          </div>
          <div></div>
          <div></div>
        </div>
      </div>
    `;

    const get = (field) => hostEl.querySelector(`[data-field="${field}"]`);

    const sync = () => {
      const styleId = String(get("style_id")?.value ?? "ida-clean");
      const preset = PRESETS.find((entry) => entry.style_id === styleId);
      state.theme = {
        style_id: styleId,
        wall_color: String(get("wall_color")?.value || preset?.wall_color || "#f5f3ef"),
        floor_material: String(get("floor_material")?.value || preset?.floor_material || "oak"),
        floor_tone: String(get("floor_tone")?.value || preset?.floor_tone || "natural")
      };

      if (typeof onChange === "function") {
        onChange(getValue());
      }
    };

    hostEl.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", sync));
  };

  const setValue = (theme) => {
    if (!theme || typeof theme !== "object") {
      state.theme = { ...PRESETS[0] };
    } else {
      state.theme = {
        style_id: String(theme.style_id || PRESETS[0].style_id),
        wall_color: String(theme.wall_color || PRESETS[0].wall_color),
        floor_material: String(theme.floor_material || PRESETS[0].floor_material),
        floor_tone: String(theme.floor_tone || PRESETS[0].floor_tone)
      };
    }
    render();
  };

  const getValue = () => ({ ...state.theme });

  render();

  return {
    setValue,
    getValue,
    presets: PRESETS
  };
};
