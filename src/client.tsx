import { StartClient } from "@tanstack/react-start/client";
import { hydrateRoot } from "react-dom/client";

function reportFatal(error: unknown) {
  document.documentElement.dataset["zapflowClient"] = "failed";
  console.error("ZapFlow client hydration failed", error);
  if (!document.body || document.getElementById("zapflow-client-fatal")) return;
  const banner = document.createElement("div");
  banner.id = "zapflow-client-fatal";
  banner.setAttribute("role", "alert");
  banner.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:12px 14px;border-radius:12px;background:#fff4e5;color:#7a4300;border:1px solid #f4c36a;font:600 13px/1.4 system-ui,sans-serif";
  banner.append("Não foi possível iniciar a interface. ");
  const reload = document.createElement("a");
  reload.href = window.location.href;
  reload.textContent = "Recarregar página";
  reload.style.textDecoration = "underline";
  banner.appendChild(reload);
  document.body.appendChild(banner);
}

try {
  document.documentElement.dataset["zapflowClient"] = "booting";
  hydrateRoot(document, <StartClient />, { onUncaughtError: reportFatal });
} catch (error) {
  reportFatal(error);
}
