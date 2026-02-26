import React from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import cssText from "./styles/widget.css?inline";

declare global {
  interface Window {
    IdaChatWidgetInit?: (
      config?: Partial<{ apiBase: string; brandName: string; storeOrigin: string }>
    ) => void;
    __idastuudioWidgetConfig?: Partial<{ apiBase: string; brandName: string; storeOrigin: string }>;
    __idaChatWidgetWatchdogInstalled?: boolean;
  }
}

console.log("[IDA] Script loaded");

const HOST_ID = "idastuudio-chat-host";
const STYLE_ID = "idastuudio-chat-styles";

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const styleEl = document.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = cssText;
  document.head.appendChild(styleEl);
};

const mount = (config?: Partial<{ apiBase: string; brandName: string; storeOrigin: string }>) => {
  console.log("[IDA] mount() called", config);

  if (config) {
    window.__idastuudioWidgetConfig = {
      ...(window.__idastuudioWidgetConfig ?? {}),
      ...config
    };
  }

  const resolvedConfig = window.__idastuudioWidgetConfig ?? config ?? {};

  const existingHost = document.getElementById(HOST_ID);
  if (existingHost) {
    existingHost.remove();
  }
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.body.appendChild(host);

  ensureStyle();

  const root = createRoot(host);
  root.render(
    <ChatWidget
      apiBase={resolvedConfig.apiBase ?? window.location.origin}
      brandName={resolvedConfig.brandName ?? "IDA SISUSTUSPOOD & STUUDIO"}
      storeOrigin={resolvedConfig.storeOrigin ?? window.location.origin}
    />
  );
  console.log("[IDA] React rendered");
};

window.IdaChatWidgetInit = mount;

const ensureMounted = () => {
  if (!document.body) return;
  if (!document.getElementById(HOST_ID)) {
    mount(window.__idastuudioWidgetConfig);
    return;
  }
  ensureStyle();
};

const installWatchdog = () => {
  if (window.__idaChatWidgetWatchdogInstalled) return;
  window.__idaChatWidgetWatchdogInstalled = true;

  const observer = new MutationObserver(() => {
    ensureMounted();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      ensureMounted();
    }
  });
  window.addEventListener("pageshow", ensureMounted);
  window.setInterval(ensureMounted, 2500);
};

setTimeout(() => {
  console.log("[IDA] Auto-mount check");
  installWatchdog();
  if (!document.getElementById(HOST_ID)) {
    console.log("[IDA] Auto-mounting with config:", window.__idastuudioWidgetConfig);
    mount(window.__idastuudioWidgetConfig);
    return;
  }
  ensureStyle();
}, 500);
