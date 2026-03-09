/**
 * Floating object toolbar — a DOM overlay that appears above selected objects.
 * Positioning uses the 3D editor's getObjectScreenPos(id) projection.
 */
export const createFloatingToolbar = ({
  hostEl,       // canvas wrapper div (position: relative)
  toolbarEl,    // the #floating-toolbar div
  onMove,
  onRotate,
  onElevate,
  onDuplicate,
  onDelete,
  onSwap,
  onLock
}) => {
  let currentObjectId = null;
  let getScreenPosFn = null;  // set by workspace to call scene3d.getObjectScreenPos

  const build = () => {
    toolbarEl.innerHTML = `
      <button class="ftb-btn" id="ftb-move" title="Siirda (kliki põrandale)">
        <span class="ftb-icon">✥</span>
        <span class="ftb-label">Siirda</span>
      </button>
      <button class="ftb-btn" id="ftb-rotate" title="Lohista kursori vasakule/paremale et pöörata">
        <span class="ftb-icon">↻</span>
        <span class="ftb-label">Pööra</span>
      </button>
      <button class="ftb-btn" id="ftb-elevate" title="Lohista üles/alla et muuta kõrgust">
        <span class="ftb-icon">↕</span>
        <span class="ftb-label">Kõrgus</span>
      </button>
      <div class="ftb-sep"></div>
      <button class="ftb-btn" id="ftb-duplicate" title="Dubleeri">
        <span class="ftb-icon">⧉</span>
        <span class="ftb-label">Koopia</span>
      </button>
      <button class="ftb-btn" id="ftb-lock" title="Lukusta / ava">
        <span class="ftb-icon" id="ftb-lock-icon">🔓</span>
        <span class="ftb-label">Lukk</span>
      </button>
      <div class="ftb-sep"></div>
      <button class="ftb-btn danger" id="ftb-delete" title="Kustuta">
        <span class="ftb-icon">🗑</span>
        <span class="ftb-label">Kustuta</span>
      </button>
    `;

    toolbarEl.querySelector("#ftb-move").addEventListener("click", () => {
      toolbarEl.querySelector("#ftb-move").classList.toggle("active");
      onMove?.();
    });
    toolbarEl.querySelector("#ftb-rotate").addEventListener("click", () => {
      onRotate?.();
    });
    toolbarEl.querySelector("#ftb-elevate").addEventListener("click", () => {
      onElevate?.();
    });
    toolbarEl.querySelector("#ftb-duplicate").addEventListener("click", () => onDuplicate?.());
    toolbarEl.querySelector("#ftb-lock").addEventListener("click", () => onLock?.());
    toolbarEl.querySelector("#ftb-delete").addEventListener("click", () => onDelete?.());
  };

  const position = (screenX, screenY) => {
    const wrapRect = hostEl.getBoundingClientRect();
    const localX = screenX - wrapRect.left;
    const localY = screenY - wrapRect.top;
    toolbarEl.style.left = `${localX}px`;
    toolbarEl.style.top = `${localY - 90}px`; // 90px gap above object center
  };

  const show = (objectId, locked) => {
    // Only rebuild HTML when the selected object changes — preserves active classes during drag
    if (objectId !== currentObjectId) {
      currentObjectId = objectId;
      build();
    } else {
      currentObjectId = objectId;
    }

    // Update lock icon
    const lockIcon = toolbarEl.querySelector("#ftb-lock-icon");
    if (lockIcon) lockIcon.textContent = locked ? "🔒" : "🔓";

    if (getScreenPosFn) {
      const pos = getScreenPosFn(objectId);
      if (pos) position(pos.x, pos.y);
    }

    toolbarEl.hidden = false;
  };

  const hide = () => {
    toolbarEl.hidden = true;
    currentObjectId = null;
    toolbarEl.querySelector("#ftb-move")?.classList.remove("active");
    toolbarEl.querySelector("#ftb-rotate")?.classList.remove("active");
    toolbarEl.querySelector("#ftb-elevate")?.classList.remove("active");
  };

  const setGetScreenPos = (fn) => { getScreenPosFn = fn; };

  const updatePosition = () => {
    if (!currentObjectId || toolbarEl.hidden) return;
    if (getScreenPosFn) {
      const pos = getScreenPosFn(currentObjectId);
      if (pos) position(pos.x, pos.y);
    }
  };

  build();

  return { show, hide, setGetScreenPos, updatePosition };
};
