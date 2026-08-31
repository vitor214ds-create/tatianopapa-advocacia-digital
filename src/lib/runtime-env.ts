type RuntimeEnv = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __zapflowRuntimeEnv: RuntimeEnv | undefined;
}

const viteEnv = import.meta.env as Record<string, string | undefined>;

const ZAPFLOW_SUPABASE_URL = "https://alahmdlzbmmxgbkqrdux.supabase.co";
const ZAPFLOW_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_V189k3Jz2tZ01oKDXWOW6g_ngjZ1qm1";

export function setRuntimeEnv(env: unknown) {
  if (env && typeof env === "object") globalThis.__zapflowRuntimeEnv = env as RuntimeEnv;
}

export function runtimeEnv(...names: string[]) {
  for (const name of names) {
    const fromRuntime = globalThis.__zapflowRuntimeEnv?.[name];
    if (typeof fromRuntime === "string" && fromRuntime) return fromRuntime;

    const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
    if (fromProcess) return fromProcess;

    const fromVite = viteEnv[name];
    if (fromVite) return fromVite;
  }
  return undefined;
}

export function supabasePublicConfig() {
  // ZapFlow has one canonical Supabase backend. These values are public client
  // configuration, not privileged secrets. Pinning them here prevents a stale or
  // mistyped Railway variable from silently sending authentication to another project.
  return {
    url: ZAPFLOW_SUPABASE_URL,
    key: ZAPFLOW_SUPABASE_PUBLISHABLE_KEY,
  };
}
