import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, Scale } from "lucide-react";
import { navegacao, site } from "@/config/site";
import { WhatsAppCta } from "@/components/WhatsAppCta";
import { cn } from "@/lib/utils";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "bg-background/95 shadow-[var(--shadow-card)] backdrop-blur" : "bg-background/80 backdrop-blur",
      )}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6 lg:py-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid size-10 shrink-0 place-items-center rounded-md surface-navy">
            <Scale className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-semibold leading-tight text-primary sm:text-xl">
              {site.nome}
            </span>
            <span className="block truncate text-[11px] tracking-wide text-muted-foreground sm:text-xs">
              {site.cargo} | {site.oab}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Navegação principal">
          {navegacao.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-graphite/80 transition-colors hover:bg-secondary hover:text-primary"
              activeProps={{ className: "text-accent bg-secondary" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
          <WhatsAppCta className="ml-2 px-5 py-2.5 text-xs" icon={false}>
            ANALISAR MEU CASO
          </WhatsAppCta>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid size-11 place-items-center rounded-md border border-border text-primary xl:hidden"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background xl:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4" aria-label="Navegação mobile">
            {navegacao.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-base font-medium text-graphite transition-colors hover:bg-secondary"
                activeProps={{ className: "text-accent bg-secondary" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
            <WhatsAppCta className="mt-2 w-full">ANALISAR MEU CASO</WhatsAppCta>
          </nav>
        </div>
      )}
    </header>
  );
}
