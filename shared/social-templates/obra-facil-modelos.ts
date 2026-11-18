// Kits visuais dos produtos (Obra Fácil, FINC): lista de modelos de arte, formatos, campos e temas.
// Arquivo leve (sem imagens embutidas) para o formulário da aba "Artes" no navegador.
// O desenho de cada modelo fica em ./obra-facil.ts (só no servidor).

export const COR = { laranja: "#F57C00", grafite: "#2D2D2D", branco: "#FFFFFF", cinza: "#E6E6E6", fundoClaro: "#F7F7F7" } as const;

export type FormatoArte = "quadrado" | "retrato" | "story";
export const FORMATOS: Record<FormatoArte, { largura: number; altura: number; nome: string }> = {
  quadrado: { largura: 1080, altura: 1080, nome: "Post quadrado (1080×1080)" },
  retrato: { largura: 1080, altura: 1350, nome: "Post retrato (1080×1350)" },
  story: { largura: 1080, altura: 1920, nome: "Story / Reels (1080×1920)" },
};

export const ICONES = {
  prancheta: "Prancheta",
  clientes: "Clientes",
  lampada: "Lâmpada",
  crescimento: "Crescimento",
  ferramentas: "Ferramentas",
  orcamento: "Orçamento",
  calculadora: "Calculadora",
  calendario: "Calendário",
  seguranca: "Segurança",
  grafico: "Gráfico",
  dinheiro: "Dinheiro",
  martelo: "Martelo",
  confirmado: "Confirmado",
  relogio: "Relógio",
  estatisticas: "Estatísticas",
  maleta: "Maleta",
  casa: "Casa",
  chave: "Chave",
} as const;
export type Icone = keyof typeof ICONES;

export type Campo =
  | { id: string; rotulo: string; tipo: "texto" | "texto-longo"; padrao: string }
  | { id: string; rotulo: string; tipo: "opcoes"; opcoes: Record<string, string>; padrao: string }
  | { id: string; rotulo: string; tipo: "icone"; padrao: Icone }
  | { id: string; rotulo: string; tipo: "sim-nao"; padrao: boolean };

export type ModeloInfo = { id: ModeloId; nome: string; descricao: string; precisaFoto?: boolean; campos: Campo[] };
export type ModeloId = "marca" | "foto" | "icone" | "dicas" | "tres" | "aviso";

const fundo = (padrao: "claro" | "grafite"): Campo => ({ id: "fundo", rotulo: "Fundo", tipo: "opcoes", opcoes: { claro: "Claro", grafite: "Grafite" }, padrao });
const logo: Campo = { id: "logo", rotulo: "Mostrar logo pequeno", tipo: "sim-nao", padrao: true };
const DICA = " (use *asteriscos* para o laranja)";

export const MODELOS: ModeloInfo[] = [
  {
    id: "marca",
    nome: "Logotipo (marca)",
    descricao: "Logo grande com slogan, capacete ao fundo e faixas diagonais.",
    campos: [fundo("claro"), { id: "frase", rotulo: "Frase abaixo (opcional)", tipo: "texto", padrao: "" }],
  },
  {
    id: "foto",
    nome: "Foto com frase",
    descricao: "Sua foto em tela cheia, com a frase em branco e laranja embaixo.",
    precisaFoto: true,
    campos: [
      { id: "titulo", rotulo: `Frase${DICA}`, tipo: "texto-longo", padrao: "Valorize\n*seu serviço.*" },
      { id: "posicao", rotulo: "Frase", tipo: "opcoes", opcoes: { esquerda: "Embaixo à esquerda", direita: "Embaixo à direita" }, padrao: "esquerda" },
      logo,
    ],
  },
  {
    id: "icone",
    nome: "Título com ícone",
    descricao: 'Título grande com destaque laranja e um ícone, como "Organize suas obras".',
    campos: [{ id: "titulo", rotulo: `Título${DICA}`, tipo: "texto-longo", padrao: "Organize\n*suas obras*" }, { id: "icone", rotulo: "Ícone", tipo: "icone", padrao: "prancheta" }, fundo("claro"), logo],
  },
  {
    id: "dicas",
    nome: "Número + texto (dicas)",
    descricao: 'Número grande em laranja e o texto ao lado, como "5 dicas para profissionalizar seu trabalho".',
    campos: [
      { id: "numero", rotulo: "Número", tipo: "texto", padrao: "5" },
      { id: "texto", rotulo: `Texto${DICA}`, tipo: "texto-longo", padrao: "dicas para\nprofissionalizar\nseu trabalho" },
      { id: "icone", rotulo: "Ícone", tipo: "icone", padrao: "lampada" },
      logo,
    ],
  },
  {
    id: "tres",
    nome: "Três itens com ícones",
    descricao: 'Três ícones com nomes e um título embaixo, como "Clientes, serviços e orçamentos".',
    campos: [
      { id: "icone1", rotulo: "Ícone 1", tipo: "icone", padrao: "clientes" },
      { id: "rotulo1", rotulo: "Nome 1", tipo: "texto", padrao: "Clientes" },
      { id: "icone2", rotulo: "Ícone 2", tipo: "icone", padrao: "prancheta" },
      { id: "rotulo2", rotulo: "Nome 2", tipo: "texto", padrao: "Serviços" },
      { id: "icone3", rotulo: "Ícone 3", tipo: "icone", padrao: "grafico" },
      { id: "rotulo3", rotulo: "Nome 3", tipo: "texto", padrao: "Orçamentos" },
      { id: "titulo", rotulo: `Título${DICA}`, tipo: "texto-longo", padrao: "Clientes, serviços\ne *orçamentos*" },
    ],
  },
  {
    id: "aviso",
    nome: "Aviso / novidade",
    descricao: "Título, texto de apoio e logo no rodapé (novas versões, comunicados, promoções).",
    campos: [
      { id: "etiqueta", rotulo: "Etiqueta (opcional)", tipo: "texto", padrao: "NOVIDADE" },
      { id: "titulo", rotulo: `Título${DICA}`, tipo: "texto-longo", padrao: "Gestão de *Equipe*\nno seu celular" },
      { id: "texto", rotulo: "Texto de apoio", tipo: "texto-longo", padrao: "Frequência, diárias e pagamentos da sua equipe em um só lugar." },
      { ...fundo("grafite"), opcoes: { grafite: "Grafite", claro: "Claro" } } as Campo,
    ],
  },
];

/** Tema de cada kit (cores e textos); as imagens da marca ficam no arquivo do desenho. */
export type TemaInfo = { slug: string; nome: string; destaque: string; nomeDestaque: string; escuro: string; escuroGrad: string; fundoClaro: string; cinza: string; slogan: string };
export const TEMAS: Record<string, TemaInfo> = {
  "obra-facil": { slug: "obra-facil", nome: "Obra Fácil", destaque: COR.laranja, nomeDestaque: "laranja", escuro: COR.grafite, escuroGrad: "#383838", fundoClaro: COR.fundoClaro, cinza: COR.cinza, slogan: "Seu trabalho mais profissional." },
  finc: { slug: "finc", nome: "FINC", destaque: "#00924C", nomeDestaque: "verde", escuro: "#2B2A2C", escuroGrad: "#363537", fundoClaro: "#F5F7F6", cinza: "#E3E8E5", slogan: "Simplifique." },
};

/** Textos e ícones iniciais de cada modelo, por kit (o Obra Fácil usa os da lista acima). */
const PADROES: Record<string, Partial<Record<ModeloId, Record<string, string>>>> = {
  finc: {
    foto: { titulo: "Nota fiscal em dia\n*é tranquilidade.*" },
    icone: { titulo: "Controle\n*seu caixa*", icone: "grafico" },
    dicas: { numero: "3", texto: "passos para emitir\nsua *nota fiscal*", icone: "lampada" },
    tres: { icone1: "clientes", rotulo1: "Clientes", icone2: "orcamento", rotulo2: "Notas fiscais", icone3: "dinheiro", rotulo3: "Boletos", titulo: "Notas, boletos\ne *caixa*" },
    aviso: { etiqueta: "NOVIDADE", titulo: "Emissão *automática*\nde notas fiscais", texto: "Integrada com bancos e plataformas de e-commerce, por um preço justo." },
  },
};

/** Entidades (slug) que têm kit visual próprio: aba "Artes" e posts automáticos na identidade. */
export const KIT_SLUGS = Object.keys(TEMAS);
export const temKit = (slug: string) => KIT_SLUGS.includes(slug);
export const temaDo = (slug: string) => TEMAS[slug] ?? TEMAS["obra-facil"];

/** Modelos com os textos iniciais e o nome da cor de destaque do kit. */
export function modelosDo(slug: string): ModeloInfo[] {
  const t = temaDo(slug);
  const p = PADROES[t.slug] ?? {};
  return MODELOS.map((m) => ({
    ...m,
    descricao:
      t.slug === "obra-facil"
        ? m.descricao
        : m.descricao
            .replaceAll("laranja", t.nomeDestaque)
            .replace("capacete ao fundo", "símbolo ao fundo")
            .replace(/, como "[^"]*"/, ""),
    campos: m.campos.map((c) => {
      const rotulo = c.rotulo.replace("para o laranja", `para o ${t.nomeDestaque}`);
      const padrao = p[m.id]?.[c.id];
      return (padrao === undefined || c.tipo === "sim-nao" ? { ...c, rotulo } : { ...c, rotulo, padrao }) as Campo;
    }),
  }));
}

/** Valores do formulário já validados: cada campo do modelo, com o padrão quando vier vazio ou inválido. */
export function normalizarCampos(modelo: ModeloInfo, entrada: Record<string, unknown>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const c of modelo.campos) {
    const v = entrada[c.id];
    if (c.tipo === "sim-nao") out[c.id] = v === undefined || v === null || v === "" ? c.padrao : v === true || v === "true" || v === "on" || v === "sim";
    else if (c.tipo === "icone") out[c.id] = typeof v === "string" && v in ICONES ? v : c.padrao;
    else if (c.tipo === "opcoes") out[c.id] = typeof v === "string" && v in c.opcoes ? v : c.padrao;
    else out[c.id] = typeof v === "string" ? v.replace(/\r/g, "").slice(0, 400) : c.padrao;
  }
  return out;
}
