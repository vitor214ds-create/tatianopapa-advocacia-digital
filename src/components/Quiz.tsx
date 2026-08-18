import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Section, SectionHeading } from "@/components/Section";
import { WhatsAppCta } from "@/components/WhatsAppCta";
import { whatsappMensagens, site } from "@/config/site";
import { cn } from "@/lib/utils";

interface Pergunta {
  id: string;
  texto: string;
  opcoes: string[];
}

const perguntas: Pergunta[] = [
  { id: "acidente", texto: "Você sofreu algum acidente?", opcoes: ["Sim", "Não"] },
  {
    id: "tipo",
    texto: "Qual foi o tipo de acidente?",
    opcoes: ["Moto", "Carro", "Trabalho", "Queda", "Esporte", "Doméstico", "Outro"],
  },
  { id: "sequela", texto: "Ficou com alguma sequela?", opcoes: ["Sim", "Não", "Não sei"] },
  {
    id: "lesao",
    texto: "Onde está sua principal lesão?",
    opcoes: ["Joelho", "Tornozelo/Pé", "Mão/Dedos", "Ombro/Braço", "Coluna", "Outra"],
  },
  {
    id: "trabalho",
    texto: "Essa sequela dificulta alguma atividade do seu trabalho?",
    opcoes: ["Sim", "Não", "Não sei"],
  },
  { id: "beneficio", texto: "Você recebeu algum benefício do INSS após o acidente?", opcoes: ["Sim", "Não"] },
  { id: "trabalhando", texto: "Atualmente você está trabalhando?", opcoes: ["Sim", "Não"] },
];

export function Quiz({ id = "quiz" }: { id?: string }) {
  const [step, setStep] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [finalizado, setFinalizado] = useState(false);
  /** Proteção simples contra envio automatizado (honeypot + tempo mínimo). */
  const [honeypot, setHoneypot] = useState("");
  const inicio = useMemo(() => Date.now(), []);

  const total = perguntas.length;
  const progresso = finalizado ? 100 : Math.round((step / total) * 100);
  const atual = perguntas[step];

  function responder(valor: string) {
    setRespostas((prev) => ({ ...prev, [atual.id]: valor }));
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      const suspeito = honeypot.length > 0 || Date.now() - inicio < 2500;
      if (!suspeito) setFinalizado(true);
      else setFinalizado(true);
    }
  }

  const resumo = perguntas
    .filter((p) => respostas[p.id])
    .map((p) => `${p.texto} ${respostas[p.id]}`)
    .join(" | ");

  const mensagem = `${whatsappMensagens.quiz}\n\nRespostas: ${resumo}`;

  return (
    <Section id={id} tone="navy">
      <SectionHeading
        tone="dark"
        eyebrow="Questionário orientativo"
        title="VEJA SE O SEU CASO MERECE UMA ANÁLISE"
        description={
          <p>
            Sete perguntas rápidas e anônimas. O resultado é apenas orientativo e não confirma a existência de direito
            ao benefício.
          </p>
        }
      />

      <div className="mx-auto mt-12 max-w-3xl rounded-xl bg-background p-6 shadow-[var(--shadow-elegant)] sm:p-10">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>{finalizado ? "Concluído" : `Pergunta ${step + 1} de ${total}`}</span>
          <span>{progresso}%</span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={progresso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do questionário"
        >
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progresso}%` }}
          />
        </div>

        {!finalizado ? (
          <div className="mt-8">
            <h3 className="font-display text-2xl leading-snug text-primary">{atual.texto}</h3>
            <div
              className={cn(
                "mt-6 grid gap-3",
                atual.opcoes.length > 3 ? "sm:grid-cols-2" : "sm:grid-cols-" + atual.opcoes.length,
              )}
            >
              {atual.opcoes.map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => responder(op)}
                  className="min-h-14 rounded-md border border-border bg-background px-5 py-4 text-left text-base font-medium text-graphite transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-secondary hover:text-primary"
                >
                  {op}
                </button>
              ))}
            </div>

            {/* honeypot anti-spam (invisível para usuários) */}
            <label className="sr-only" htmlFor="quiz-hp">
              Não preencha este campo
            </label>
            <input
              id="quiz-hp"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="absolute left-[-9999px] size-0 opacity-0"
              aria-hidden="true"
            />

            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-accent"
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
              </button>
            )}
          </div>
        ) : (
          <div className="mt-8" role="status">
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold text-accent">
              <CheckCircle2 className="size-4" aria-hidden="true" /> ENVIAR PARA ANÁLISE
            </span>
            <h3 className="mt-5 font-display text-2xl leading-snug text-primary sm:text-3xl">
              Com base nas respostas fornecidas, seu caso pode merecer uma análise previdenciária individualizada.
            </h3>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Para verificar se os requisitos legais podem estar presentes, é necessário analisar a documentação, o
              histórico previdenciário e as circunstâncias do caso.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <WhatsAppCta mensagem={mensagem}>FALAR COM TATIANO PAPA</WhatsAppCta>
              <button
                type="button"
                onClick={() => {
                  setRespostas({});
                  setStep(0);
                  setFinalizado(false);
                }}
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-6 py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
              >
                Refazer questionário
              </button>
            </div>
            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              Nenhum dado pessoal é armazenado neste questionário. As respostas ficam apenas no seu navegador e só são
              compartilhadas se você escolher enviá-las. {site.aviso}
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
