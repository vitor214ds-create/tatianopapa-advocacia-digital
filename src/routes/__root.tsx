import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f4] px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#def6e5] text-2xl font-bold text-[#16803e]">Z</div>
        <h1 className="text-5xl font-bold text-[#1e2f24]">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-[#1e2f24]">Página não encontrada</h2>
        <p className="mt-2 text-sm text-[#718078]">A página que você tentou acessar não existe no ZapFlow.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-[#159447] px-4 py-2 text-sm font-semibold text-white hover:bg-[#117e3c]">Voltar ao dashboard</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f4] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-[#1e2f24]">Não foi possível carregar esta área</h1>
        <p className="mt-2 text-sm text-[#718078]">O ZapFlow encontrou um erro inesperado. Tente novamente ou volte ao dashboard.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex items-center justify-center rounded-xl bg-[#159447] px-4 py-2 text-sm font-semibold text-white hover:bg-[#117e3c]">Tentar novamente</button>
          <a href="/" className="inline-flex items-center justify-center rounded-xl border border-[#dfe6e0] bg-white px-4 py-2 text-sm font-semibold text-[#34533f]">Voltar ao dashboard</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ZapFlow — WhatsApp Operations" },
      { name: "description", content: "Plataforma SaaS para operações, contatos, campanhas e atendimento pelo WhatsApp Business." },
      { name: "author", content: "ZapFlow" },
      { property: "og:title", content: "ZapFlow — WhatsApp Operations" },
      { property: "og:description", content: "Centralize campanhas, contatos, templates e conversas do WhatsApp Business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <QueryClientProvider client={queryClient}><Outlet /></QueryClientProvider>;
}
