import { createFileRoute } from "@tanstack/react-router";
import { runtimeEnv, supabasePublicConfig } from "../lib/runtime-env";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const release = runtimeEnv("RAILWAY_GIT_COMMIT_SHA")?.slice(0, 12) || null;
        const ready = new URL(request.url).searchParams.get("ready") === "1";
        if (!ready) {
          return Response.json(
            { ok: true, service: "zapflow", release, check: "liveness" },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        let database = "unavailable";
        try {
          const config = supabasePublicConfig();
          const response = await fetch(config.url + "/rest/v1/organizations?select=id&limit=0", {
            headers: { apikey: config.key },
            signal: AbortSignal.timeout(4000),
          });
          database = response.ok ? "operational" : "unavailable";
        } catch {
          database = "unavailable";
        }
        const ok = database === "operational";
        return Response.json(
          { ok, service: "zapflow", release, check: "readiness", database },
          { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
