/**
 * DADOS EDITÁVEIS DO SITE
 * -----------------------------------------------------------
 * Altere apenas este arquivo para atualizar as informações
 * profissionais em todo o site. Campos com "" (vazio) ainda
 * não foram fornecidos e são ocultados automaticamente na
 * interface, ou exibidos como "A informar".
 */

interface SiteConfig {
  nome: string;
  cargo: string;
  oab: string;
  especialidade: string;
  atendimento: string;
  whatsapp: string;
  whatsappExibicao: string;
  email: string;
  endereco: string;
  instagram: string;
  formacao: string[];
  posGraduacoes: string[];
  cursos: string[];
  posicionamento: string;
  aviso: string;
}

export const site: SiteConfig = {
  nome: "Tatiano Papa",
  cargo: "Advogado",
  oab: "OAB/SP 394.579",
  especialidade: "Auxílio-Acidente e benefícios por incapacidade",
  atendimento: "Presencial e on-line",

  // ====== PREENCHER QUANDO FORNECIDO ======
  /** Somente dígitos, com DDI. Ex: "5511999999999" */
  whatsapp: "",
  /** Exibido na interface. Ex: "(11) 99999-9999" */
  whatsappExibicao: "",
  email: "",
  endereco: "",
  instagram: "",
  /** Ex: ["Bacharel em Direito - Universidade X"] */
  formacao: [],
  posGraduacoes: [],
  cursos: [],
  // ========================================

  posicionamento:
    "Atuação jurídica em demandas previdenciárias, com foco na análise de casos de Auxílio-Acidente e benefícios relacionados à incapacidade laboral.",

  aviso:
    "As informações apresentadas são de caráter informativo. A existência do direito depende da análise individual do caso e dos requisitos legais aplicáveis.",
};

export const whatsappMensagens = {
  padrao:
    "Olá, Tatiano. Encontrei seu site e gostaria de entender se meu caso pode ter relação com Auxílio-Acidente.",
  sequelas:
    "Olá, Tatiano. Sofri um acidente e fiquei com uma sequela. Gostaria de entender se meu caso pode merecer uma análise.",
  negado:
    "Olá, Tatiano. Meu Auxílio-Acidente foi negado pelo INSS e gostaria de entender quais possibilidades existem para o meu caso.",
  alta:
    "Olá, Tatiano. Recebi alta do INSS, voltei a trabalhar e fiquei com sequela. Gostaria de entender se meu caso pode merecer uma análise.",
  documentos:
    "Olá, Tatiano. Gostaria de saber quais documentos preciso reunir para a análise do meu caso.",
  quiz:
    "Olá, Tatiano. Respondi ao questionário do site e gostaria de uma análise do meu caso.",
} as const;

/** Monta o link do WhatsApp. Sem número configurado, retorna null. */
export function whatsappLink(mensagem: string = whatsappMensagens.padrao) {
  if (!site.whatsapp) return null;
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

export const navegacao = [
  { label: "Início", to: "/" },
  { label: "Auxílio-Acidente", to: "/auxilio-acidente" },
  { label: "Sequelas", to: "/sequelas" },
  { label: "Documentos", to: "/documentos" },
  { label: "Dúvidas Frequentes", to: "/perguntas-frequentes" },
  { label: "Sobre", to: "/sobre" },
  { label: "Contato", to: "/contato" },
] as const;
