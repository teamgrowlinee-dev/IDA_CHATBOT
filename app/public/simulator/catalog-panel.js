import { API_BASE, fetchJson } from "./shared.js";

const debounce = (fn, delay = 280) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const createCatalogPanel = ({
  searchEl,
  categoryEl,
  sortEl,
  perPageEl,
  itemsEl,
  prevBtn,
  nextBtn,
  pageEl,
  onAdd,
  setWarning
}) => {
  const state = {
    page: 1,
    perPage: Number(perPageEl.value || 18),
    total: 0,
    pages: 1,
    loading: false,
    items: [],
    error: ""
  };

  const renderItems = () => {
    if (state.loading) {
      itemsEl.innerHTML = '<div class="hint">Laen tooteid...</div>';
      return;
    }

    if (state.error) {
      itemsEl.innerHTML = `
        <div class="detected-row">
          <div class="hint">${state.error}</div>
          <div class="toolbar" style="margin-top:8px;">
            <button class="btn ghost sm" type="button" data-action="retry">Proovi uuesti</button>
          </div>
        </div>
      `;
      itemsEl.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
        void loadCatalog();
      });
      return;
    }

    if (!state.items.length) {
      itemsEl.innerHTML = '<div class="hint">Sobivaid tooteid ei leitud.</div>';
      return;
    }

    itemsEl.innerHTML = "";

    for (const item of state.items) {
      const row = document.createElement("div");
      row.className = "product-row";
      row.innerHTML = `
        <div>
          <div class="product-name">${item.title}</div>
          <div class="product-meta">${item.price} · ${(item.categoryNames || []).slice(0, 2).join(", ")}</div>
        </div>
        <div class="toolbar">
          <button class="btn ghost sm" type="button" data-action="add">Lisa</button>
        </div>
      `;

      row.querySelector('[data-action="add"]')?.addEventListener("click", () => {
        onAdd(item);
      });

      itemsEl.appendChild(row);
    }
  };

  const updatePager = () => {
    pageEl.textContent = `${state.page} / ${state.pages}`;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.pages;
  };

  const loadCategories = async () => {
    categoryEl.innerHTML = '<option value="">Kõik</option>';
    try {
      const payload = await fetchJson(`${API_BASE}/storefront/categories`);
      const categories = Array.isArray(payload.categories) ? payload.categories : [];
      for (const category of categories) {
        const option = document.createElement("option");
        option.value = category.slug;
        option.textContent = `${category.name} (${category.count})`;
        categoryEl.appendChild(option);
      }
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Kategooriaid ei saanud laadida", "err");
    }
  };

  const loadCatalog = async () => {
    state.loading = true;
    state.error = "";
    renderItems();

    try {
      const query = new URLSearchParams();
      const q = String(searchEl.value ?? "").trim();
      const category = String(categoryEl.value ?? "").trim();
      const sort = String(sortEl.value ?? "relevance").trim();

      if (q) query.set("q", q);
      if (category) query.set("category", category);
      query.set("sort", sort);
      query.set("page", String(state.page));
      query.set("perPage", String(state.perPage));

      const payload = await fetchJson(`${API_BASE}/storefront/catalog?${query.toString()}`);
      state.items = Array.isArray(payload.items) ? payload.items : [];
      state.total = Number(payload.pagination?.total ?? state.items.length);
      state.pages = Math.max(1, Math.ceil(state.total / state.perPage));

      if (state.page > state.pages) {
        state.page = state.pages;
      }

      setWarning(`Kataloogis ${state.total} sobivat toodet.`, "ok");
    } catch (error) {
      state.items = [];
      state.error = error instanceof Error ? error.message : "Kataloogi laadimine ebaõnnestus";
      setWarning(state.error, "err");
    } finally {
      state.loading = false;
      renderItems();
      updatePager();
    }
  };

  const queuedLoad = debounce(() => {
    state.page = 1;
    void loadCatalog();
  }, 260);

  searchEl.addEventListener("input", queuedLoad);
  categoryEl.addEventListener("change", queuedLoad);
  sortEl.addEventListener("change", queuedLoad);
  perPageEl.addEventListener("change", () => {
    state.perPage = Math.max(1, Number(perPageEl.value || 18));
    state.page = 1;
    void loadCatalog();
  });

  prevBtn.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    void loadCatalog();
  });

  nextBtn.addEventListener("click", () => {
    if (state.page >= state.pages) return;
    state.page += 1;
    void loadCatalog();
  });

  return {
    async init() {
      await loadCategories();
      await loadCatalog();
    },
    reload: loadCatalog
  };
};
