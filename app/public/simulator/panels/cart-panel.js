import { readLocalCartLines, writeLocalCartLines } from "../shared.js";

const esc = (str) => String(str ?? "").replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c]));
const fmt = (price) => (typeof price === "number" && price > 0 ? `${price.toFixed(2)}€` : "");

export const createCartPanel = ({ containerEl, onAddToScene, onAddAllToScene, onStatusChange }) => {
  const status = (msg, kind = "default") => {
    if (typeof onStatusChange === "function") onStatusChange(msg, kind);
  };

  const render = () => {
    const lines = readLocalCartLines();
    containerEl.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "panel-header";
    header.innerHTML = `
      <span class="panel-title">Ostukorv</span>
      <button
        type="button"
        class="panel-close-btn"
        data-side="right"
        aria-label="Sulge paneel"
        title="Sulge paneel"
      >
        ✕
      </button>
    `;
    containerEl.appendChild(header);

    if (!lines.length) {
      containerEl.insertAdjacentHTML("beforeend", '<div class="cart-empty">Ostukorv on tühi.</div>');
      return;
    }

    // Bulk import
    const bulkRow = document.createElement("div");
    bulkRow.className = "cart-bulk-row";
    bulkRow.innerHTML = `<button class="btn-panel primary" id="cart-all-btn" style="width:100%;">Lisa kõik ruumi (${lines.length})</button>`;
    bulkRow.querySelector("#cart-all-btn").addEventListener("click", () => {
      onAddAllToScene?.(lines);
    });
    containerEl.appendChild(bulkRow);

    // Line list
    const list = document.createElement("div");
    list.className = "cart-lines-list";

    for (const line of lines) {
      const row = document.createElement("div");
      row.className = "cart-line-row";
      row.innerHTML = `
        <div class="cart-line-info">
          <div class="cart-line-title">${esc(line.title)}</div>
          <div class="cart-line-meta">Kogus: ${line.qty}${line.price ? " · " + fmt(line.price * line.qty) : ""}</div>
        </div>
        <div class="cart-line-actions">
          <button class="btn-add-scene">Lisa ruumi</button>
          <button class="btn-remove" title="Eemalda korvist">✕</button>
        </div>
      `;

      row.querySelector(".btn-add-scene").addEventListener("click", () => onAddToScene?.(line));
      row.querySelector(".btn-remove").addEventListener("click", () => {
        const updated = readLocalCartLines().filter((l) => l.id !== line.id);
        writeLocalCartLines(updated);
        render();
        updateCartPill();
      });

      list.appendChild(row);
    }
    containerEl.appendChild(list);
  };

  const updateCartPill = () => {
    const lines = readLocalCartLines();
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
    const countEl = document.getElementById("cart-count");
    const totalEl = document.getElementById("cart-total");
    if (countEl) countEl.textContent = count;
    if (totalEl) totalEl.textContent = total > 0 ? fmt(total) : "";
  };

  // Auto-refresh on storage changes from other tabs/windows
  window.addEventListener("storage", (e) => {
    if (e.key === "ida_local_cart_v1") { render(); updateCartPill(); }
  });

  return {
    render,
    updateCartPill,
    refresh() { render(); updateCartPill(); }
  };
};
