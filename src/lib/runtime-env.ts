type RuntimeEnv = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __zapflowRuntimeEnv: RuntimeEnv | undefined;
}

const viteEnv = import.meta.env as Record<string, string | undefined>;

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
  const url = runtimeEnv("SUPABASE_URL", "VITE_SUPABASE_URL")?.replace(/\/$/, "");
  const key = runtimeEnv(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
  );

  if (!url || !key) {
    throw new Error("Configuração pública do Supabase não disponível");
  }

  return { url, key };
}
