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
  fetch,
});
