// The Lovable preset supplies TanStack Start, React, Tailwind and Nitro.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isRailway = Boolean(
  process.env["RAILWAY_ENVIRONMENT"] ||
  process.env["RAILWAY_PROJECT_ID"] ||
  process.env["RAILWAY_SERVICE_ID"]
);

export default defineConfig({
  ...(isRailway ? { nitro: { preset: "node-server" } } : {}),
});
