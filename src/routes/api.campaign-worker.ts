import { createFileRoute } from "@tanstack/react-router";
import { runQueueWorker } from "../lib/campaign-queue-server";

function authorized(request: Request) {
  const secret = process.env.CAMPAIGN_WORKER_SECRET;
  if (!secret) throw new Error("CAMPAIGN_WORKER_SECRET não configurado");
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : request.headers.get("x-worker-secret");
  return supplied === secret;
}

async function execute(request: Request) {
  try {
    if (!authorized(request)) return Response.json({ error: "Worker não autorizado" }, { status: 401 });
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") || "20");
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(Math.floor(requested), 100)) : 20;
    const workerId = `zapflow-${crypto.randomUUID()}`;
    const result = await runQueueWorker(workerId, limit);
    return Response.json({ ok: true, workerId, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado no worker" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/campaign-worker")({ server: { handlers: { GET: ({ request }) => execute(request), POST: ({ request }) => execute(request) } } });
