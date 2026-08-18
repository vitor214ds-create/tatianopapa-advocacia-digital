export interface Post {
  slug: string;
  titulo: string;
  categoria: string;
  resumo: string;
  /** Parágrafos e listas do artigo */
  blocos: Array<{ tipo: "p" | "h2" | "lista"; texto?: string; itens?: string[] }>;
}

export const categorias = [
  "Auxílio-Acidente",
  "INSS",
  "Benefícios por incapacidade",
  "Sequelas de acidentes",
  "Perícia do INSS",
  "Benefícios previdenciários",
  "Direitos do segurado",
];

const avisoFinal = {
  tipo: "p" as const,
  texto:
    "As informações deste artigo são de caráter informativo. A existência do direito depende da análise individual do caso e dos requisitos legais aplicáveis.",
};

export const posts: Post[] = [
  {
    slug: "auxilio-acidente",
    titulo: "Auxílio-Acidente: o que é e quando pode ser devido",
    categoria: "Auxílio-Acidente",
    resumo:
      "Entenda a natureza indenizatória do Auxílio-Acidente e por que ele pode ser compatível com o trabalho.",
    blocos: [
      {
        tipo: "p",
        texto:
          "O Auxílio-Acidente é um benefício previdenciário de natureza indenizatória destinado, nos casos previstos em lei, ao segurado que, após a consolidação das lesões decorrentes de um acidente, permaneça com sequela definitiva que implique redução da capacidade para o trabalho que habitualmente exercia.",
      },
      { tipo: "h2", texto: "Trabalhar e receber é possível?" },
      {
        tipo: "p",
        texto:
          "Diferentemente de benefícios relacionados à incapacidade total para o trabalho, o Auxílio-Acidente pode ser recebido juntamente com o salário, observados os requisitos legais.",
      },
      { tipo: "h2", texto: "Pontos analisados em cada caso" },
      {
        tipo: "lista",
        itens: [
          "Qualidade de segurado e categoria previdenciária",
          "Comprovação da ocorrência do acidente",
          "Documentação médica e consolidação das lesões",
          "Repercussão da sequela sobre a atividade habitual",
        ],
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-acidente-de-moto",
    titulo: "Auxílio-Acidente após acidente de moto",
    categoria: "Sequelas de acidentes",
    resumo:
      "Acidentes de moto frequentemente deixam sequelas em joelho, tornozelo, ombro e mãos. Veja o que pode ser analisado.",
    blocos: [
      {
        tipo: "p",
        texto:
          "Acidentes de motocicleta estão entre as situações que mais deixam sequelas ortopédicas permanentes. Dependendo da condição previdenciária do segurado e das sequelas decorrentes do acidente, o caso pode preencher os requisitos legais do Auxílio-Acidente.",
      },
      { tipo: "h2", texto: "Sequelas comuns" },
      {
        tipo: "lista",
        itens: [
          "Fraturas consolidadas com limitação funcional",
          "Lesões ligamentares no joelho e no tornozelo",
          "Redução de força e mobilidade em ombro e braço",
          "Alteração de sensibilidade em mãos e dedos",
        ],
      },
      {
        tipo: "p",
        texto:
          "O acidente não precisa ter ocorrido no trabalho. O ponto central é verificar se a sequela reduziu de forma permanente a capacidade para o trabalho habitual.",
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-acidente-de-trabalho",
    titulo: "Auxílio-Acidente após acidente de trabalho",
    categoria: "Auxílio-Acidente",
    resumo: "Qual o papel da CAT e o que analisar quando a sequela persiste após o retorno ao trabalho.",
    blocos: [
      {
        tipo: "p",
        texto:
          "Nos acidentes ocorridos durante a atividade profissional, documentos como a CAT (Comunicação de Acidente de Trabalho), prontuários e laudos médicos costumam ter relevância para a análise do caso.",
      },
      {
        tipo: "p",
        texto:
          "A inexistência da CAT não encerra, por si só, a possibilidade de análise: outros elementos podem demonstrar a ocorrência do acidente e suas consequências.",
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-acidente-domestico",
    titulo: "Auxílio-Acidente após acidente doméstico",
    categoria: "Auxílio-Acidente",
    resumo: "Quedas em casa e acidentes fora do ambiente de trabalho também podem ser analisados.",
    blocos: [
      {
        tipo: "p",
        texto:
          "Muitas pessoas acreditam que apenas acidentes de trabalho podem gerar benefícios previdenciários. Dependendo do caso e da categoria do segurado, acidentes de outras naturezas — inclusive domésticos — também podem gerar direito ao benefício.",
      },
      {
        tipo: "p",
        texto:
          "A análise considera a documentação médica, o histórico previdenciário e a repercussão da sequela sobre a atividade habitualmente exercida.",
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-por-fratura",
    titulo: "Auxílio-Acidente por fratura",
    categoria: "Sequelas de acidentes",
    resumo: "A fratura, isoladamente, não garante o benefício. O que importa é a sequela remanescente.",
    blocos: [
      {
        tipo: "p",
        texto:
          "A fratura, isoladamente, não garante o benefício. O ponto relevante é verificar se, depois da consolidação da lesão, permaneceu sequela que reduza a capacidade para o trabalho habitual.",
      },
      { tipo: "h2", texto: "O que pode ser avaliado" },
      {
        tipo: "lista",
        itens: [
          "Presença de material de síntese (placas, pinos, hastes)",
          "Encurtamento, deformidade ou consolidação viciosa",
          "Limitação de amplitude de movimento",
          "Dor e perda de força relatadas em laudos",
        ],
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-lesao-no-joelho",
    titulo: "Auxílio-Acidente por lesão no joelho",
    categoria: "Sequelas de acidentes",
    resumo: "Ligamentos, menisco e perda de mobilidade: o que pode ser relevante na análise.",
    blocos: [
      {
        tipo: "p",
        texto:
          "Lesões de ligamento cruzado, lesões de menisco e instabilidade articular podem deixar sequelas permanentes com repercussão sobre determinadas atividades profissionais.",
      },
      {
        tipo: "p",
        texto:
          "Pode existir discussão sobre o benefício quando a lesão deixa sequela permanente capaz de reduzir a capacidade para a atividade habitualmente exercida.",
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-lesao-no-ombro",
    titulo: "Auxílio-Acidente por lesão no ombro",
    categoria: "Sequelas de acidentes",
    resumo: "Limitação de movimentos e perda de força podem impactar diretamente o trabalho habitual.",
    blocos: [
      {
        tipo: "p",
        texto:
          "Sequelas no ombro e no braço frequentemente resultam em limitação de movimentos, redução de força e dificuldade para levantar peso — aspectos que podem ter relevância para atividades profissionais que exigem esforço físico ou movimentos repetitivos.",
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-lesao-na-mao",
    titulo: "Auxílio-Acidente por lesão na mão",
    categoria: "Sequelas de acidentes",
    resumo: "Perda de força, alteração de sensibilidade e amputações na análise previdenciária.",
    blocos: [
      {
        tipo: "p",
        texto:
          "Lesões em mãos e dedos podem gerar perda de força, limitação de movimentos, alteração de sensibilidade e, em situações mais graves, amputações. Cada uma dessas condições pode repercutir de forma diferente conforme a atividade exercida.",
      },
      avisoFinal,
    ],
  },
  {
    slug: "auxilio-acidente-apos-alta-do-inss",
    titulo: "Auxílio-Acidente após alta do INSS",
    categoria: "INSS",
    resumo: "Recebeu auxílio-doença, voltou ao trabalho e ficou com sequela? Essa situação merece atenção.",
    blocos: [
      {
        tipo: "p",
        texto:
          "O benefício por incapacidade temporária é destinado ao período em que, preenchidos os requisitos legais, o segurado encontra-se temporariamente incapaz para o trabalho. Já o Auxílio-Acidente possui outra finalidade: indenizar, nas hipóteses previstas em lei, a redução permanente da capacidade para o trabalho habitual decorrente de sequela de acidente.",
      },
      {
        tipo: "p",
        texto:
          "Por isso, o retorno ao trabalho não significa, por si só, que não possa existir direito ao Auxílio-Acidente.",
      },
      avisoFinal,
    ],
  },
];

export function getPost(slug: string) {
  return posts.find((p) => p.slug === slug);
}
