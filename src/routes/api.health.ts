import { createFileRoute } from "@tanstack/react-router";
import { hasGatewayConfig } from "../lib/gateway/evolution";
import { runtimeEnv } from "../lib/runtime-env";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => Response.json({
        ok: true,
        service: "zapflow",
        gatewayConfigured: hasGatewayConfig(),
        release: runtimeEnv("RAILWAY_GIT_COMMIT_SHA")?.slice(0, 12) || null,
      }),
    },
  },
});
