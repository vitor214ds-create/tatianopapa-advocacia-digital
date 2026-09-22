import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setRuntimeEnv } from "./lib/runtime-env";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function mutationOriginError(request: Request) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  if (url.pathname === "/api/gateway-webhook" || url.pathname === "/api/campaign-worker") {
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  if (origin !== url.origin) {
    return Response.json({ error: "Origem não autorizada" }, { status: 403 });
  }

  return null;
}

function hardenResponse(request: Request, response: Response) {
  // Keep the original Response object. TanStack Start streams SSR HTML and
  // wrapping response.body in a second Response can detach/truncate that stream
  // before the hydration scripts are flushed.
  try {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "same-origin");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");

    if (new URL(request.url).pathname.startsWith("/api/")) {
      response.headers.set("Cache-Control", "no-store, max-age=0");
      response.headers.set("Pragma", "no-cache");
    }
  } catch (error) {
    // Security headers must never break the streamed application response.
    console.error("Could not apply response hardening headers", error);
  }

  return response;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      setRuntimeEnv(env);

      const originError = mutationOriginError(request);
      if (originError) return hardenResponse(request, originError);

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return hardenResponse(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return hardenResponse(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
