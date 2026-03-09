import { API_BASE, clamp, fetchJson, readLocalCartLines, writeLocalCartLines } from "./shared.js";

export const createInspectorPanel = ({
  hostEl,
  getSelected,
  onUpdate,
  onDuplicate,
  onDelete,
  onSwap,
  onWarn
}) => {
  const render = () => {
    const selected = getSelected();
    if (!selected) {
      hostEl.innerHTML = '<div class="hint">Vali objekt, et muuta selle seadeid.</div>';
      return;
    }

    hostEl.innerHTML = `
      <div class="detected-row">
        <div class="row two">
          <div>
            <label>Pealkiri</label>
            <input data-field="title" value="${selected.title}" />
          </div>
          <div>
            <label>SKU</label>
            <input data-field="sku" value="${selected.sku || ""}" />
          </div>
        </div>
        <div class="row three">
          <div>
            <label>Laius (cm)</label>
            <input data-field="w" type="number" min="10" value="${selected.dims_cm.w}" />
          </div>
          <div>
            <label>Sügavus (cm)</label>
            <input data-field="d" type="number" min="10" value="${selected.dims_cm.d}" />
          </div>
          <div>
            <label>Kõrgus (cm)</label>
            <input data-field="h" type="number" min="2" value="${selected.dims_cm.h}" />
          </div>
        </div>
        <div class="row three">
          <div>
            <label>x (cm)</label>
            <input data-field="x" type="number" min="0" value="${selected.pose.x_cm}" />
          </div>
          <div>
            <label>z (cm)</label>
            <input data-field="z" type="number" min="0" value="${selected.pose.z_cm}" />
          </div>
          <div>
            <label>Pööre</label>
            <input data-field="rotation" type="number" value="${selected.pose.rotation_deg}" />
          </div>
        </div>
        <div class="row two">
          <div>
            <label>Snap</label>
            <select data-field="snap">
              <option value="none" ${selected.attach?.snap === "none" || !selected.attach?.snap ? "selected" : ""}>none</option>
              <option value="wall" ${selected.attach?.snap === "wall" ? "selected" : ""}>wall</option>
              <option value="corner" ${selected.attach?.snap === "corner" ? "selected" : ""}>corner</option>
            </select>
          </div>
          <div>
            <label>Clearance (cm)</label>
            <input data-field="clearance" type="number" min="0" max="500" value="${selected.clearance_cm ?? 8}" />
          </div>
        </div>
        <label class="check-row">
          <input data-field="locked" type="checkbox" ${selected.locked ? "checked" : ""} /> Lukustatud
        </label>
        <div class="toolbar wrap">
          <button type="button" class="btn" data-action="apply">Rakenda muudatused</button>
          <button type="button" class="btn ghost" data-action="duplicate">Duplikeeri</button>
          <button type="button" class="btn ghost" data-action="swap">Asenda sarnasega</button>
          <button type="button" class="btn ghost" data-action="add-cart">Lisa ostukorvi</button>
          <button type="button" class="btn ghost danger" data-action="delete">Eemalda</button>
        </div>
      </div>
    `;

    const get = (field) => hostEl.querySelector(`[data-field="${field}"]`);

    hostEl.querySelector('[data-action="apply"]')?.addEventListener("click", () => {
      const patch = {
        title: String(get("title")?.value ?? selected.title).trim() || selected.title,
        sku: String(get("sku")?.value ?? selected.sku ?? "").trim() || undefined,
        dims_cm: {
          w: clamp(Number(get("w")?.value ?? selected.dims_cm.w), 10, 800),
          d: clamp(Number(get("d")?.value ?? selected.dims_cm.d), 10, 800),
          h: clamp(Number(get("h")?.value ?? selected.dims_cm.h), 2, 500)
        },
        pose: {
          x_cm: clamp(Number(get("x")?.value ?? selected.pose.x_cm), 0, 20000),
          z_cm: clamp(Number(get("z")?.value ?? selected.pose.z_cm), 0, 20000),
          rotation_deg: Number(get("rotation")?.value ?? selected.pose.rotation_deg)
        },
        attach: {
          ...(selected.attach || {}),
          snap: String(get("snap")?.value ?? "none")
        },
        clearance_cm: clamp(Number(get("clearance")?.value ?? selected.clearance_cm ?? 8), 0, 500),
        locked: Boolean(get("locked")?.checked)
      };

      onUpdate(selected.id, patch);
    });

    hostEl.querySelector('[data-action="duplicate"]')?.addEventListener("click", () => {
      onDuplicate(selected.id);
    });

    hostEl.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
      onDelete(selected.id);
    });

    hostEl.querySelector('[data-action="swap"]')?.addEventListener("click", async () => {
      try {
        const search = selected.title || selected.sku || "";
        if (!search.trim()) {
          onWarn("Asendamiseks puudub otsinguterm", "warn");
          return;
        }

        const payload = await fetchJson(`${API_BASE}/storefront/search?q=${encodeURIComponent(search)}&limit=6`);
        const cards = Array.isArray(payload.cards) ? payload.cards : [];
        const replacement = cards.find((card) => String(card.id) !== String(selected.sku || ""));
        if (!replacement) {
          onWarn("Sarnast toodet ei leitud", "warn");
          return;
        }

        onSwap(selected.id, replacement);
      } catch (error) {
        onWarn(error instanceof Error ? error.message : "Asendamine ebaõnnestus", "err");
      }
    });

    hostEl.querySelector('[data-action="add-cart"]')?.addEventListener("click", () => {
      const sku = String(get("sku")?.value ?? selected.sku ?? "").trim() || selected.id;
      const current = readLocalCartLines();
      const existing = current.find((line) => line.id === sku);
      if (existing) {
        existing.qty += 1;
      } else {
        current.push({
          id: sku,
          title: String(get("title")?.value ?? selected.title).trim() || selected.title,
          qty: 1,
          price: undefined,
          url: undefined,
          image: undefined
        });
      }
      writeLocalCartLines(current);
      onWarn("Toode lisati lokaalsesse ostukorvi", "ok");
    });
  };

  return {
    render
  };
};
