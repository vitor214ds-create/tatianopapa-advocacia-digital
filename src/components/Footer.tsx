import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Phone, Instagram } from "lucide-react";
import { site, whatsappLink } from "@/config/site";

const linksRodape = [
  { label: "Início", to: "/" },
  { label: "Auxílio-Acidente", to: "/auxilio-acidente" },
  { label: "Benefícios por Incapacidade", to: "/beneficios-por-incapacidade" },
  { label: "Sequelas", to: "/sequelas" },
  { label: "Documentos", to: "/documentos" },
  { label: "Perguntas Frequentes", to: "/perguntas-frequentes" },
  { label: "Blog", to: "/blog" },
  { label: "Contato", to: "/contato" },
] as const;

export function Footer() {
  const wa = whatsappLink();
  const ano = new Date().getFullYear();

  return (
    <footer className="surface-navy mt-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:py-20">
        <div>
          <p className="font-display text-2xl font-semibold">{site.nome}</p>
          <p className="mt-1 text-sm text-primary-foreground/70">
            {site.cargo} — {site.oab}
          </p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-primary-foreground/80">
            Atuação jurídica em demandas previdenciárias, com foco na análise de Auxílio-Acidente e benefícios
            relacionados à incapacidade laboral.
          </p>
        </div>

        <nav aria-label="Links do rodapé">
          <p className="eyebrow text-primary-foreground/60">Navegação</p>
          <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {linksRodape.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="text-sm text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="eyebrow text-primary-foreground/60">Contato</p>
          <ul className="mt-5 space-y-3 text-sm text-primary-foreground/80">
            <li className="flex items-start gap-3">
              <Phone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-primary-foreground">
                  {site.whatsappExibicao || "WhatsApp"}
                </a>
              ) : (
                <span className="text-primary-foreground/55">WhatsApp: a informar</span>
              )}
            </li>
            <li className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {site.email ? (
                <a href={`mailto:${site.email}`} className="hover:text-primary-foreground">
                  {site.email}
                </a>
              ) : (
                <span className="text-primary-foreground/55">E-mail: a informar</span>
              )}
            </li>
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className={site.endereco ? "" : "text-primary-foreground/55"}>
                {site.endereco || "Endereço: a informar"}
              </span>
            </li>
            {site.instagram && (
              <li className="flex items-start gap-3">
                <Instagram className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <a
                  href={`https://instagram.com/${site.instagram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary-foreground"
                >
                  {site.instagram}
                </a>
              </li>
            )}
            <li className="pt-1 text-primary-foreground/70">Atendimento {site.atendimento.toLowerCase()}.</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-primary-foreground/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-xs text-primary-foreground/60 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            © {ano} {site.nome} — {site.oab}. Todos os direitos reservados.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/politica-de-privacidade" className="hover:text-primary-foreground">
              Política de Privacidade
            </Link>
            <Link to="/termos-de-uso" className="hover:text-primary-foreground">
              Termos de Uso
            </Link>
            <Link to="/politica-de-privacidade" hash="lgpd" className="hover:text-primary-foreground">
              LGPD
            </Link>
          </div>
        </div>
        <p className="mx-auto max-w-7xl px-4 pb-8 text-[11px] leading-relaxed text-primary-foreground/45 sm:px-6">
          Conteúdo de caráter meramente informativo, em conformidade com o Código de Ética e Disciplina da OAB. Não há
          oferta de serviços, capitação de clientela ou promessa de resultado. A existência de direito depende da
          análise individual do caso e dos requisitos legais aplicáveis.
        </p>
      </div>
    </footer>
  );
}
