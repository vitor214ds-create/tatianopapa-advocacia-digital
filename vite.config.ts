// @lovable.dev/vite-tanstack-config includes TanStack Start, React,
// Tailwind, tsconfig paths, env injection and Nitro support.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID
);

export default defineConfig({
  ...(isRailway ? { nitro: { preset: "node-server" } } : {}),
});
