import { createFileRoute } from "@tanstack/react-router";
import { runQueueWorker } from "../lib/campaign-queue-server";

async function execute(request: Request) {
  try {
    const supplied =
      request.headers.get("x-worker-secret") ||
      (request.headers.get("authorization")?.startsWith("Bearer ")
        ? request.headers.get("authorization")!.slice(7)
        : null);

    if (!supplied) {
      return Response.json({ error: "Worker não autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") || "20");
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(Math.floor(requested), 50))
      : 20;

    const workerId = `zapflow-${crypto.randomUUID()}`;
    const result = await runQueueWorker(workerId, limit, supplied);
    return Response.json({ ok: true, workerId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no worker";
    return Response.json(
      { error: message },
      { status: message.includes("não autorizado") ? 401 : 500 },
    );
  }
}

export const Route = createFileRoute("/api/campaign-worker")({
  server: {
    handlers: {
      GET: ({ request }) => execute(request),
      POST: ({ request }) => execute(request),
    },
  },
});
