// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, tsconfig paths, env injection and Nitro support.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID
);

export default defineConfig({
  // Use TanStack Start's default server entry. The previous custom entry
  // intercepted streamed HTML responses and production could receive an
  // incomplete hydration bootstrap, leaving the UI visible but non-interactive.
  ...(isRailway ? { nitro: { preset: "node-server" } } : {}),
});
