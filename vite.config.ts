// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, tsconfig paths, env injection and Nitro support.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Lovable keeps its own sandbox target. Railway needs a long-running Node server.
  ...(isRailway ? { nitro: { preset: "node-server" } } : {}),
});
