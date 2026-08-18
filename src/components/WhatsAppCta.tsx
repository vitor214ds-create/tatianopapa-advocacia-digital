import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { whatsappLink, whatsappMensagens } from "@/config/site";

type Variant = "accent" | "navy" | "outline" | "light";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md px-6 py-3.5 text-sm font-semibold tracking-wide transition-all duration-200 min-h-12 text-center focus-visible:outline-2";

const variants: Record<Variant, string> = {
  accent: "bg-accent text-accent-foreground hover:brightness-110 shadow-[var(--shadow-card)] hover:-translate-y-0.5",
  navy: "bg-primary text-primary-foreground hover:bg-navy-soft hover:-translate-y-0.5",
  outline: "border border-primary/25 text-primary hover:bg-secondary",
  light: "border border-primary-foreground/35 text-primary-foreground hover:bg-primary-foreground/10",
};

interface Props {
  children: React.ReactNode;
  mensagem?: string;
  variant?: Variant;
  className?: string;
  icon?: boolean;
}

/**
 * CTA de WhatsApp. Enquanto o número não estiver configurado em
 * src/config/site.ts, o botão direciona para a página de contato.
 */
export function WhatsAppCta({
  children,
  mensagem = whatsappMensagens.padrao,
  variant = "accent",
  className,
  icon = true,
}: Props) {
  const href = whatsappLink(mensagem);
  const classes = cn(base, variants[variant], className);
  const content = (
    <>
      {icon && <MessageCircle className="size-4 shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </>
  );

  if (!href) {
    return (
      <Link to="/contato" className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {content}
    </a>
  );
}
