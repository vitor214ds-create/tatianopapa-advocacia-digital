import { StartClient } from "@tanstack/react-start/client";
import { hydrateRoot } from "react-dom/client";

function boot() {
  try {
    document.documentElement.dataset.zapflowClient = "booting";
    hydrateRoot(document, <StartClient />);
    requestAnimationFrame(() => {
      document.documentElement.dataset.zapflowClient = "ready";
    });
  } catch (error) {
    document.documentElement.dataset.zapflowClient = "failed";
    console.error("ZapFlow client hydration failed", error);

    // Keep a visible diagnostic instead of leaving a dead-looking interface.
    const existing = document.getElementById("zapflow-client-fatal");
    if (!existing) {
      const banner = document.createElement("div");
      banner.id = "zapflow-client-fatal";
      banner.setAttribute("role", "alert");
      banner.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:12px 14px;border-radius:12px;background:#fff4e5;color:#7a4300;border:1px solid #f4c36a;font:600 13px/1.4 system-ui,sans-serif";
      banner.textContent =
        "O ZapFlow não conseguiu iniciar a interface. Atualize a página. Se continuar, informe este erro ao suporte.";
      document.body.appendChild(banner);
    }
  }
}

boot();
