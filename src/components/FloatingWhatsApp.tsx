import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { whatsappLink, whatsappMensagens } from "@/config/site";

/** Botão de WhatsApp fixo, visível em todas as páginas. */
export function FloatingWhatsApp() {
  const href = whatsappLink(whatsappMensagens.padrao);

  const inner = (
    <>
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-accent/40 [animation-duration:2.6s]" />
      <MessageCircle className="size-6" aria-hidden="true" />
      <span className="hidden text-sm font-semibold sm:inline">Falar no WhatsApp</span>
    </>
  );

  const classes =
    "fixed bottom-5 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-4 text-accent-foreground shadow-[var(--shadow-elegant)] transition-transform duration-200 hover:scale-105 sm:bottom-8 sm:right-8 sm:px-6";

  if (!href) {
    return (
      <Link to="/contato" className={classes} aria-label="Ir para a página de contato">
        {inner}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      aria-label="Falar com Tatiano Papa no WhatsApp"
    >
      {inner}
    </a>
  );
}
