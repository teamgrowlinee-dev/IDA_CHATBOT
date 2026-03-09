const esc = (str) => String(str ?? "").replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c]));
const fmt = (p) => (typeof p === "number" && p > 0 ? `${p.toFixed(2)}€` : "");

export const createDetailsPanel = ({ containerEl, onAddToScene, onAddToCart, storeOrigin }) => {
  const renderEmpty = () => {
    containerEl.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Toote detailid</span>
        <button
          type="button"
          class="panel-close-btn"
          data-side="right"
          aria-label="Sulge paneel"
          title="Sulge paneel"
        >
          ✕
        </button>
      </div>
      <div class="details-empty">Vali kataloogist toode, et näha detaile.</div>
    `;
  };

  const show = (product) => {
    if (!product) { renderEmpty(); return; }
    const dims = product.dimensions_cm;
    const dimsText = dims
      ? `${dims.w ?? "–"} × ${dims.d ?? "–"} × ${dims.h ?? "–"} cm`
      : "";

    containerEl.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Toote detailid</span>
        <button
          type="button"
          class="panel-close-btn"
          data-side="right"
          aria-label="Sulge paneel"
          title="Sulge paneel"
        >
          ✕
        </button>
      </div>
      ${product.image ? `<img class="details-img" src="${esc(product.image)}" alt="${esc(product.title)}" />` : ""}
      <div class="details-name">${esc(product.title)}</div>
      ${product.price ? `<div class="details-price">${esc(String(product.price))}</div>` : ""}
      ${dimsText ? `<div class="details-dims">Mõõdud: ${esc(dimsText)}</div>` : ""}
      <div class="details-actions">
        <button class="btn-panel primary" id="det-scene">Lisa ruumi</button>
        <button class="btn-panel" id="det-cart">Lisa ostukorvi</button>
        ${product.url ? `<a class="btn-panel ghost" href="${esc(product.url)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none;">Ava tooteleht ↗</a>` : ""}
      </div>
    `;

    containerEl.querySelector("#det-scene")?.addEventListener("click", () => onAddToScene?.(product));
    containerEl.querySelector("#det-cart")?.addEventListener("click", () => onAddToCart?.(product));
  };

  renderEmpty();

  return { show, hide: renderEmpty };
};
