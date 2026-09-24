import {
  createStartHandler,
  defaultRenderHandler,
  defineHandlerCallback,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

// Railway was receiving the streamed TanStack bootstrap incompletely.
// Use the framework's non-streaming renderer so the full HTML document,
// router manifest and executable client scripts are complete before the
// response is sent. Server routes (/api/*) continue through the same handler.
const render = defineHandlerCallback((ctx) => defaultRenderHandler(ctx));
const fetch = createStartHandler(render);

export default createServerEntry({
  fetch: async (...args: Parameters<typeof fetch>) => {
    const response = await fetch(...args);
    // Apply on the actual response: the Lovable preset does not forward
    // arbitrary Nitro routeRules. Never cache HTML manifests or account APIs.
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    return response;
  },
});
