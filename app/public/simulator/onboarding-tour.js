const ONBOARDING_STORAGE_KEY = "ida_planner_onboarding_v1_done";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const readDone = () => {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const writeDone = () => {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // ignore storage failures
  }
};

export const createPlannerOnboarding = ({
  onOpenPanel,
  onEnsureCatalogReady,
  onStatusChange
}) => {
  const status = (text, kind = "default") => {
    if (typeof onStatusChange === "function") onStatusChange(text, kind);
  };

  const state = {
    active: false,
    finished: readDone(),
    stepIndex: -1,
    raf: null,
    currentTarget: null
  };

  const steps = [
    {
      id: "open-rooms",
      title: "Ava ruumide paneel",
      description:
        "Alustame siit. Vasakul on ruumide haldus, kus saad tube avada, ümber nimetada ja lisada.",
      instruction: "Kliki vasakul railil ikooni „Ruumid“.",
      selector: 'button.rail-btn[data-side="left"][data-panel="rooms"]',
      expectedEvent: "drawer:rooms"
    },
    {
      id: "open-catalog",
      title: "Ava tootekataloog",
      description:
        "Kataloogist lisad tooted kas ostukorvi või otse ruumi. See on sisustamise peamine koht.",
      instruction: "Kliki vasakul railil ikooni „Kataloog“.",
      selector: 'button.rail-btn[data-side="left"][data-panel="catalog"]',
      expectedEvent: "drawer:catalog"
    },
    {
      id: "add-to-cart",
      title: "Lisa toode ostukorvi",
      description:
        "Lisa vähemalt üks toode ostukorvi. Planner kasutab sama lokaalset korvi ka chatboti vooga.",
      instruction: "Vajuta toote real nuppu „Lisa korvi“.",
      selector: "#panel-catalog .btn-cart",
      expectedEvent: "catalog:add-to-cart",
      beforeEnter: async () => {
        onOpenPanel?.("left", "catalog");
        await onEnsureCatalogReady?.();
      }
    },
    {
      id: "open-cart",
      title: "Ava ostukorv",
      description:
        "Paremal on ostukorvi drawer. Sealt saad valida, millised korvi tooted lähevad 3D ruumi.",
      instruction: "Kliki ülal paremal ostukorvi pilli või parema raili ikooni.",
      selector: "#cart-pill",
      expectedEvent: "drawer:cart"
    },
    {
      id: "import-from-cart",
      title: "Lisa ostukorvist ruumi",
      description:
        "Nüüd impordi toode ruumi, et seda 3D vaates paigutada ja liigutada.",
      instruction: "Vajuta ostukorvi real „Lisa ruumi“ (või „Lisa kõik ruumi“).",
      selector: "#panel-cart .btn-add-scene, #panel-cart #cart-all-btn",
      expectedEvent: "cart:add-to-scene",
      beforeEnter: () => {
        onOpenPanel?.("right", "cart");
      }
    },
    {
      id: "select-object",
      title: "Vali ese 3D vaates",
      description:
        "Kliki 3D ruumis lisatud esemel. See avab kiire tööriistariba (siirda, pööra, koopia, lukk, kustuta).",
      instruction: "Kliki 3D vaates esemel.",
      selector: "#scene-3d",
      expectedEvent: "scene:select-object"
    },
    {
      id: "save-scene",
      title: "Salvesta muudatused",
      description:
        "Viimane oluline samm: salvesta stseen, et paigutused ja kaamera seis jääksid alles.",
      instruction: "Vajuta üleval nuppu „Salvesta“.",
      selector: "#save-btn",
      expectedEvent: "scene:saved"
    },
    {
      id: "done",
      title: "Juhendus tehtud",
      description:
        "Suurepärane. Oled läbinud põhilise töövoo: paneelid, korv, 3D valik ja salvestus.",
      instruction: "Vajuta „Alusta planeerimist“.",
      selector: "#scene-3d",
      expectedEvent: null,
      completion: true
    }
  ];

  const root = document.createElement("div");
  root.className = "ws-tour";
  root.hidden = true;
  root.innerHTML = `
    <div class="ws-tour-mask ws-tour-mask-top"></div>
    <div class="ws-tour-mask ws-tour-mask-left"></div>
    <div class="ws-tour-mask ws-tour-mask-right"></div>
    <div class="ws-tour-mask ws-tour-mask-bottom"></div>
    <div class="ws-tour-highlight"></div>
    <div class="ws-tour-tooltip">
      <div class="ws-tour-progress"></div>
      <h3 class="ws-tour-title"></h3>
      <p class="ws-tour-description"></p>
      <p class="ws-tour-instruction"></p>
      <div class="ws-tour-actions">
        <button type="button" class="ws-tour-btn ws-tour-btn-primary" data-action="finish" hidden>Alusta planeerimist</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const topMask = root.querySelector(".ws-tour-mask-top");
  const leftMask = root.querySelector(".ws-tour-mask-left");
  const rightMask = root.querySelector(".ws-tour-mask-right");
  const bottomMask = root.querySelector(".ws-tour-mask-bottom");
  const highlight = root.querySelector(".ws-tour-highlight");
  const tooltip = root.querySelector(".ws-tour-tooltip");
  const progressEl = root.querySelector(".ws-tour-progress");
  const titleEl = root.querySelector(".ws-tour-title");
  const descriptionEl = root.querySelector(".ws-tour-description");
  const instructionEl = root.querySelector(".ws-tour-instruction");
  const finishBtn = root.querySelector('[data-action="finish"]');

  finishBtn.addEventListener("click", () => complete());

  const getCurrentStep = () => {
    if (state.stepIndex < 0 || state.stepIndex >= steps.length) return null;
    return steps[state.stepIndex];
  };

  const resolveTarget = (step) => {
    if (!step?.selector) return null;
    return document.querySelector(step.selector);
  };

  const applySpotlight = (target) => {
    const rectRaw = target.getBoundingClientRect();
    const pad = 8;
    const rect = {
      top: clamp(rectRaw.top - pad, 0, window.innerHeight),
      left: clamp(rectRaw.left - pad, 0, window.innerWidth),
      right: clamp(rectRaw.right + pad, 0, window.innerWidth),
      bottom: clamp(rectRaw.bottom + pad, 0, window.innerHeight)
    };
    rect.width = Math.max(0, rect.right - rect.left);
    rect.height = Math.max(0, rect.bottom - rect.top);

    topMask.style.top = "0px";
    topMask.style.left = "0px";
    topMask.style.width = "100vw";
    topMask.style.height = `${rect.top}px`;

    leftMask.style.top = `${rect.top}px`;
    leftMask.style.left = "0px";
    leftMask.style.width = `${rect.left}px`;
    leftMask.style.height = `${rect.height}px`;

    rightMask.style.top = `${rect.top}px`;
    rightMask.style.left = `${rect.right}px`;
    rightMask.style.width = `${Math.max(0, window.innerWidth - rect.right)}px`;
    rightMask.style.height = `${rect.height}px`;

    bottomMask.style.top = `${rect.bottom}px`;
    bottomMask.style.left = "0px";
    bottomMask.style.width = "100vw";
    bottomMask.style.height = `${Math.max(0, window.innerHeight - rect.bottom)}px`;

    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    const tooltipRect = tooltip.getBoundingClientRect();
    const placeBelow = rect.bottom + tooltipRect.height + 14 < window.innerHeight;
    const top = placeBelow ? rect.bottom + 10 : Math.max(10, rect.top - tooltipRect.height - 10);
    const centeredLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
    const left = clamp(centeredLeft, 12, window.innerWidth - tooltipRect.width - 12);

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  };

  const maskFullScreen = () => {
    topMask.style.top = "0px";
    topMask.style.left = "0px";
    topMask.style.width = "100vw";
    topMask.style.height = "100vh";

    leftMask.style.top = "0px";
    leftMask.style.left = "0px";
    leftMask.style.width = "0px";
    leftMask.style.height = "0px";

    rightMask.style.top = "0px";
    rightMask.style.left = "0px";
    rightMask.style.width = "0px";
    rightMask.style.height = "0px";

    bottomMask.style.top = "0px";
    bottomMask.style.left = "0px";
    bottomMask.style.width = "0px";
    bottomMask.style.height = "0px";

    highlight.style.width = "0px";
    highlight.style.height = "0px";

    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.top = `${Math.max(12, window.innerHeight / 2 - tooltipRect.height / 2)}px`;
    tooltip.style.left = `${Math.max(12, window.innerWidth / 2 - tooltipRect.width / 2)}px`;
  };

  const repaint = () => {
    if (!state.active) return;
    const step = getCurrentStep();
    if (!step) return;
    const target = resolveTarget(step);
    if (!target) {
      state.currentTarget = null;
      maskFullScreen();
      return;
    }
    state.currentTarget = target;
    applySpotlight(target);
  };

  const tick = () => {
    repaint();
    if (state.active) state.raf = requestAnimationFrame(tick);
  };

  const renderStep = async (index) => {
    state.stepIndex = index;
    const step = getCurrentStep();
    if (!step) return;

    if (typeof step.beforeEnter === "function") {
      try {
        await step.beforeEnter();
      } catch (error) {
        status(error instanceof Error ? error.message : "Juhenduse sammu ettevalmistus ebaõnnestus", "warn");
      }
    }

    progressEl.textContent = `Samm ${index + 1} / ${steps.length}`;
    titleEl.textContent = step.title;
    descriptionEl.textContent = step.description;
    instructionEl.textContent = step.instruction;
    finishBtn.hidden = !step.completion;

    state.currentTarget = resolveTarget(step);
    repaint();
  };

  const nextStep = async () => {
    const nextIndex = state.stepIndex + 1;
    if (nextIndex >= steps.length) {
      complete();
      return;
    }
    await renderStep(nextIndex);
  };

  const start = async () => {
    if (state.active || state.finished) return;
    state.active = true;
    root.hidden = false;
    document.body.classList.add("ws-tour-active");
    status("Läbime kiire juhenduse. Jälgi esile tõstetud samme.", "default");

    await renderStep(0);
    state.raf = requestAnimationFrame(tick);
  };

  const complete = () => {
    if (!state.active) return;
    state.active = false;
    state.finished = true;
    writeDone();
    root.hidden = true;
    document.body.classList.remove("ws-tour-active");
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    status("Juhendus läbitud. Planner on valmis kasutamiseks.", "ok");
  };

  const maybeStart = async () => {
    if (state.finished || state.active) return;
    await start();
  };

  const notify = (eventName) => {
    if (!state.active) return;
    const step = getCurrentStep();
    if (!step || !step.expectedEvent) return;
    if (step.expectedEvent !== eventName) return;
    void nextStep();
  };

  window.addEventListener("resize", repaint);

  return {
    maybeStart,
    notify,
    isActive: () => state.active
  };
};
