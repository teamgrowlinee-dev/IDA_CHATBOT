/**
 * Drawer Manager — controls left/right panel drawer open/close.
 * Each side has one panel that can show one tab at a time.
 */
export const createDrawerManager = ({ leftPanel, rightPanel }) => {
  const state = {
    left: null,   // active panel id or null
    right: null
  };

  const getEl = (side, panelId) => {
    const container = side === "left" ? leftPanel : rightPanel;
    return container?.querySelector(`#panel-${panelId}`);
  };

  const getAllEls = (side) => {
    const container = side === "left" ? leftPanel : rightPanel;
    return container ? [...container.querySelectorAll(".panel-content")] : [];
  };

  const updateRailBtns = (side) => {
    const activeId = side === "left" ? state.left : state.right;
    document
      .querySelectorAll(`.rail-btn[data-side="${side}"]`)
      .forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.panel === activeId);
      });
  };

  const open = (side, panelId) => {
    const container = side === "left" ? leftPanel : rightPanel;
    if (!container) return;

    // hide all content tabs on this side
    getAllEls(side).forEach((el) => (el.hidden = true));

    const target = getEl(side, panelId);
    if (target) target.hidden = false;

    container.classList.add("drawer--open");
    if (side === "left") state.left = panelId;
    else state.right = panelId;

    updateRailBtns(side);
  };

  const close = (side) => {
    const container = side === "left" ? leftPanel : rightPanel;
    if (!container) return;
    container.classList.remove("drawer--open");
    getAllEls(side).forEach((el) => (el.hidden = true));
    if (side === "left") state.left = null;
    else state.right = null;
    updateRailBtns(side);
  };

  const toggle = (side, panelId) => {
    const current = side === "left" ? state.left : state.right;
    if (current === panelId) {
      close(side);
    } else {
      open(side, panelId);
    }
  };

  const getActive = (side) => (side === "left" ? state.left : state.right);

  return { open, close, toggle, getActive };
};
