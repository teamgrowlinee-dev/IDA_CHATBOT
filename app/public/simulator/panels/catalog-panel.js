import { API_BASE, fetchJson } from "../shared.js";

// GLB index cache — only products with real 3D models are shown
let _glbIndex = null;
const loadGlbIndex = async () => {
  if (_glbIndex !== null) return _glbIndex;
  try {
    const res = await fetch("/simulator-assets/models/index.json");
    _glbIndex = await res.json();
  } catch {
    _glbIndex = {};
  }
  return _glbIndex;
};

const titleToHandle = (title) =>
  String(title ?? "").toLowerCase()
    .replace(/[äÄ]/g, "a").replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u").replace(/[õÕ]/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const hasGlb = (item, index) => {
  if (!index) return false;
  const sku = String(item.sku ?? item.handle ?? "").trim();
  if (sku && index[sku]) return true;
  const handle = titleToHandle(item.title);
  if (index[handle]) return true;
  const prefix = handle.split("-").slice(0, 2).join("-");
  return Object.keys(index).some((k) => k.startsWith(prefix));
};

const debounce = (fn, ms = 280) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const esc = (str) => String(str ?? "").replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" }[c]));

// IDA website menu order — tabs shown in this order
const IDA_MENU = [
  { slug: "diivanid",            label: "Diivanid" },
  { slug: "toolid",              label: "Toolid" },
  { slug: "lauad",               label: "Lauad" },
  { slug: "kapid",               label: "Kapid" },
  { slug: "riiulid",             label: "Riiulid" },
  { slug: "voodid-voodipeatsid", label: "Voodid" },
  { slug: "valgustid",           label: "Valgustid" },
  { slug: "vaibad",              label: "Vaibad" },
  { slug: "peeglid",             label: "Peeglid" },
  { slug: "nagid-redelid",       label: "Nagid" },
  { slug: "kook",                label: "Köök" },
  { slug: "lastetuba",           label: "Lastetuba" },
  { slug: "vannituba",           label: "Vannituba" },
  { slug: "kodu-aksessuaarid",   label: "Aksessuaarid" },
  { slug: "aed-terrass",         label: "Aed" },
];

export const createCatalogPanelV4 = ({ containerEl, onAddToScene, onAddToCart, onShowDetails, onStatusChange }) => {
  const status = (msg, kind = "default") => {
    if (typeof onStatusChange === "function") onStatusChange(msg, kind);
  };

  containerEl.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">Kataloog</span>
      <button type="button" class="panel-close-btn" data-side="left" aria-label="Sulge paneel" title="Sulge paneel">✕</button>
    </div>
    <div class="cat-search-row">
      <input type="search" id="cat-search" placeholder="Otsi toodet..." autocomplete="off" />
    </div>
    <div id="cat-tabs" class="cat-tabs" role="tablist">
      <button class="cat-tab active" data-slug="" role="tab">Kõik</button>
    </div>
    <div id="cat-items" class="catalog-grid"></div>
    <div class="catalog-pager">
      <button id="cat-prev" disabled>← Eelmine</button>
      <span id="cat-page" class="catalog-page-info">1 / 1</span>
      <button id="cat-next" disabled>Järgmine →</button>
    </div>
  `;

  const searchEl  = containerEl.querySelector("#cat-search");
  const tabsEl    = containerEl.querySelector("#cat-tabs");
  const itemsEl   = containerEl.querySelector("#cat-items");
  const prevBtn   = containerEl.querySelector("#cat-prev");
  const nextBtn   = containerEl.querySelector("#cat-next");
  const pageEl    = containerEl.querySelector("#cat-page");

  const state = { page: 1, perPage: 16, total: 0, pages: 1, items: [], loading: false, error: "", activeSlug: "" };

  // ── Tabs ────────────────────────────────────────────────────
  const buildTabs = (apiCats) => {
    // Build ordered list: IDA menu order first, then any extra from API
    const apiSlugs = new Set(apiCats.map((c) => c.slug));
    const ordered = IDA_MENU.filter((c) => apiSlugs.has(c.slug));
    const extra = apiCats.filter((c) => !IDA_MENU.some((m) => m.slug === c.slug));

    for (const cat of ordered) {
      const btn = document.createElement("button");
      btn.className = "cat-tab";
      btn.dataset.slug = cat.slug;
      btn.role = "tab";
      btn.textContent = cat.label;
      tabsEl.appendChild(btn);
    }
    for (const cat of extra) {
      const btn = document.createElement("button");
      btn.className = "cat-tab";
      btn.dataset.slug = cat.slug;
      btn.role = "tab";
      btn.textContent = cat.name;
      tabsEl.appendChild(btn);
    }

    tabsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cat-tab");
      if (!btn) return;
      tabsEl.querySelectorAll(".cat-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeSlug = btn.dataset.slug;
      state.page = 1;
      void load();
    });
  };

  // ── Render items ────────────────────────────────────────────
  const renderItems = () => {
    if (state.loading) {
      itemsEl.innerHTML = '<div class="cat-loading"><span class="cat-spinner"></span>Laen tooteid...</div>';
      return;
    }
    if (state.error) {
      itemsEl.innerHTML = `<div class="hint">${esc(state.error)} <button id="cat-retry" style="margin-left:6px">Proovi uuesti</button></div>`;
      itemsEl.querySelector("#cat-retry")?.addEventListener("click", load);
      return;
    }
    if (!state.items.length) {
      itemsEl.innerHTML = '<div class="hint">Tooteid ei leitud.</div>';
      return;
    }

    itemsEl.innerHTML = "";
    for (const item of state.items) {
      const card = document.createElement("div");
      card.className = "product-card-v5";

      const imgSrc = item.image ? esc(item.image) : "";
      const imgEl = imgSrc
        ? `<img class="product-card-img" src="${imgSrc}" loading="lazy" alt="${esc(item.title)}" />`
        : `<div class="product-card-img product-card-img--placeholder">🪑</div>`;

      card.innerHTML = `
        ${imgEl}
        <div class="product-card-info">
          <div class="product-card-name">${esc(item.title)}</div>
          <div class="product-card-price">${esc(item.price ?? "")}</div>
          <div class="product-card-actions">
            <button class="btn-scene" title="Lisa ruumi">Lisa ruumi</button>
            <button class="btn-cart" title="Lisa korvi">🛒</button>
          </div>
        </div>
      `;

      card.querySelector(".btn-scene").addEventListener("click", () => onAddToScene?.(item));
      card.querySelector(".btn-cart").addEventListener("click", () => onAddToCart?.(item));
      card.addEventListener("click", (e) => {
        if (!e.target.closest("button")) onShowDetails?.(item);
      });

      itemsEl.appendChild(card);
    }
  };

  const updatePager = () => {
    pageEl.textContent = `${state.page} / ${state.pages}`;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.pages;
  };

  // ── Load products ────────────────────────────────────────────
  const load = async () => {
    state.loading = true;
    state.error = "";
    renderItems();

    try {
      const q = new URLSearchParams();
      const search = String(searchEl.value ?? "").trim();
      if (search) q.set("q", search);
      if (state.activeSlug) q.set("category", state.activeSlug);
      // Fetch all products at once so client-side GLB filter doesn't miss pages
      q.set("page", "1");
      q.set("perPage", "500");

      const [data, glbIndex] = await Promise.all([
        fetchJson(`${API_BASE}/storefront/catalog?${q}`),
        loadGlbIndex()
      ]);
      const all = Array.isArray(data.items) ? data.items : [];
      const filtered = all.filter((item) => hasGlb(item, glbIndex));
      // Apply client-side pagination after filtering
      const start = (state.page - 1) * state.perPage;
      state.items = filtered.slice(start, start + state.perPage);
      state.total = filtered.length;
      state.pages = Math.max(1, Math.ceil(state.total / state.perPage));
      if (state.page > state.pages) state.page = state.pages;

      status(`${state.total} toodet kataloogis`, "ok");
    } catch (err) {
      state.items = [];
      state.error = err instanceof Error ? err.message : "Kataloogi laadimine ebaõnnestus";
      status(state.error, "err");
    } finally {
      state.loading = false;
      renderItems();
      updatePager();
    }
  };

  const loadCategories = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/storefront/categories`);
      const cats = Array.isArray(data.categories) ? data.categories : [];
      buildTabs(cats);
    } catch {}
  };

  const queuedLoad = debounce(() => { state.page = 1; void load(); });
  searchEl.addEventListener("input", queuedLoad);
  prevBtn.addEventListener("click", () => { if (state.page > 1) { state.page--; void load(); } });
  nextBtn.addEventListener("click", () => { if (state.page < state.pages) { state.page++; void load(); } });

  return {
    async init() {
      await loadCategories();
      await load();
    },
    search(query) {
      searchEl.value = query;
      state.page = 1;
      void load();
    }
  };
};
