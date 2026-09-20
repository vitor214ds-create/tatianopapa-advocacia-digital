import { createFileRoute } from "@tanstack/react-router";
import { hasGatewayConfig } from "../lib/gateway/evolution";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => Response.json({
        ok: true,
        service: "zapflow",
        gatewayConfigured: hasGatewayConfig(),
      }),
    },
  },
});
