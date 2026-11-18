// Kit visual do Obra Fácil (laranja #F57C00, grafite #2D2D2D, Montserrat, capacete em
// marca-d'água, faixas diagonais e o slogan "Seu trabalho mais profissional.").
// Dois usos: (1) os 6 modelos da aba "Artes" (arte avulsa com texto livre e foto);
// (2) os posts automáticos (carrossel, post único e stories) desenhados a partir do texto da IA.

import type { CarouselCopy, PostCopy, StoryCopy } from "../social/copy";
import { h, type Brand, type Frame, type Node } from "./index";
import { OBRA_FACIL_ICONES, OBRA_FACIL_PNG } from "./obra-facil-assets";
import { COR, FORMATOS, MODELOS, normalizarCampos, type FormatoArte, type ModeloId } from "./obra-facil-modelos";

const FONTE = "Montserrat";

/** div com display flex (o Satori exige quando há mais de um filho). */
function d(style: Record<string, unknown>, ...children: (Node | Node[])[]): Node {
  return h("div", { style: { display: "flex", ...style } }, ...children);
}
const img = (src: string, w: number, hh: number, style: Record<string, unknown> = {}) => h("img", { src, width: w, height: hh, style });

function base64(s: string) {
  // Ícones são ASCII puro (SVG do Ionicons).
  return typeof Buffer !== "undefined" ? Buffer.from(s).toString("base64") : btoa(s);
}

/** Ícone (Ionicons) como imagem SVG na cor pedida. */
export function iconeSrc(nome: string, cor: string) {
  const svg = OBRA_FACIL_ICONES[nome] ?? OBRA_FACIL_ICONES.prancheta;
  const colorido = svg.replaceAll("currentColor", cor).replace("<svg ", `<svg fill="${cor}" `);
  return `data:image/svg+xml;base64,${base64(colorido)}`;
}

/**
 * Texto com destaque: linhas separadas por quebra de linha; trechos entre
 * *asteriscos* saem em laranja. Ex.: "Organize\n*suas obras*".
 */
export function textoMarcado(
  texto: string,
  { tamanho, cor, destaque = COR.laranja, peso = 800, alinhar = "flex-start", altura = 1.08, maxLinhas = 6 }: { tamanho: number; cor: string; destaque?: string; peso?: number; alinhar?: "flex-start" | "center" | "flex-end"; altura?: number; maxLinhas?: number },
): Node {
  const linhas = String(texto ?? "").split("\n").slice(0, maxLinhas);
  return d(
    { flexDirection: "column", alignItems: alinhar },
    linhas.map((linha) =>
      d(
        { flexWrap: "wrap", justifyContent: alinhar === "center" ? "center" : alinhar, fontSize: tamanho, fontWeight: peso, color: cor, lineHeight: altura, letterSpacing: -tamanho * 0.02 },
        // Uma palavra por trecho: assim a quebra de linha acontece entre palavras,
        // mesmo quando o destaque em laranja cai no meio da frase.
        linha
          .split(/(\*[^*]+\*)/g)
          .filter(Boolean)
          .flatMap((parte) => {
            const destacado = parte.startsWith("*") && parte.endsWith("*") && parte.length > 2;
            return (destacado ? parte.slice(1, -1) : parte)
              .split(/\s+/)
              .filter(Boolean)
              .map((palavra) => ({ palavra, destacado }));
          })
          .map(({ palavra, destacado }, i, todas) =>
            h("span", { style: { ...(destacado ? { color: destaque } : {}), ...(i < todas.length - 1 ? { marginRight: tamanho * 0.26 } : {}) } }, palavra),
          ),
      ),
    ),
  );
}

type Canto = "topo-esquerda" | "topo-direita" | "base-esquerda" | "base-direita";

/** Faixas diagonais laranja + grafite (ou branca, no fundo escuro) num canto. */
function diagonais(canto: Canto, tamanho: number, escuro = false): Node {
  const topo = canto.startsWith("topo");
  const direita = canto.endsWith("direita");
  const angulo = topo === direita ? "35deg" : "-35deg";
  const faixa = (cor: string, deslocamento: number, espessura: number) =>
    d({
      position: "absolute",
      width: tamanho * 2.2,
      height: espessura,
      backgroundColor: cor,
      transform: `rotate(${angulo})`,
      left: -tamanho * 0.6,
      top: tamanho * 0.5 - espessura / 2 + (topo ? -deslocamento : deslocamento),
    });
  return d(
    { position: "absolute", width: tamanho, height: tamanho, overflow: "hidden", ...(topo ? { top: 0 } : { bottom: 0 }), ...(direita ? { right: 0 } : { left: 0 }) },
    faixa(COR.laranja, tamanho * 0.28, tamanho * 0.17),
    faixa(escuro ? COR.branco : COR.grafite, tamanho * 0.06, tamanho * 0.08),
  );
}

/** Capacete grande em marca-d'água (grafite no claro, branco no escuro). */
function marcaDagua(lado: "esquerda" | "direita", tamanho: number, { escuro = false, x = 0, y = 0 }: { escuro?: boolean; x?: number; y?: number } = {}): Node {
  return img(escuro ? OBRA_FACIL_PNG.capaceteBranco : OBRA_FACIL_PNG.capaceteGrafite, tamanho, tamanho, {
    position: "absolute",
    opacity: escuro ? 0.07 : 0.06,
    top: y,
    ...(lado === "direita" ? { right: x } : { left: x }),
  });
}

/** Logotipo: capacete + ObraFácil (+ slogan). */
function logotipo({ tamanho = 80, escuro = false, slogan = true, empilhado = true, naLaranja = false }: { tamanho?: number; escuro?: boolean; slogan?: boolean; empilhado?: boolean; naLaranja?: boolean }): Node {
  const nome = d(
    { fontSize: tamanho * (empilhado ? 1.25 : 0.62), fontWeight: 800, letterSpacing: -tamanho * 0.025, color: escuro ? COR.branco : COR.grafite },
    h("span", null, "Obra"),
    h("span", { style: { color: naLaranja ? COR.branco : COR.laranja } }, "Fácil"),
  );
  // Sobre o fundo laranja o símbolo (capacete laranja) some: fica só o nome.
  if (naLaranja) return nome;
  const traco = () => d({ width: tamanho * 0.55, height: Math.max(3, tamanho * 0.045), backgroundColor: COR.laranja, borderRadius: 4 });
  const linhaSlogan = slogan
    ? d(
        { alignItems: "center", marginTop: tamanho * 0.12 },
        traco(),
        d({ fontSize: tamanho * 0.3, fontWeight: 500, color: escuro ? "#D9D9D9" : "#555555", margin: `0 ${tamanho * 0.16}px` }, "Seu trabalho mais profissional."),
        traco(),
      )
    : null;
  const simbolo = escuro ? OBRA_FACIL_PNG.logoEscuro : OBRA_FACIL_PNG.logo;
  if (empilhado) {
    return d({ flexDirection: "column", alignItems: "center" }, img(simbolo, tamanho * 1.45, tamanho * 1.45), d({ height: tamanho * 0.1 }), nome, linhaSlogan);
  }
  return d(
    { flexDirection: "column", alignItems: "flex-start" },
    d(
      { alignItems: "center" },
      img(simbolo, tamanho * 0.85, tamanho * 0.85),
      d({ width: 3, height: tamanho * 0.7, backgroundColor: escuro ? COR.branco : COR.grafite, opacity: 0.7, margin: `0 ${tamanho * 0.22}px` }),
      nome,
    ),
    linhaSlogan,
  );
}

/**
 * Margens seguras: no story/Reels (9:16) o Instagram cobre ~250 px no topo
 * (perfil) e ~280 px na base (resposta/legenda); logo e textos ficam fora.
 */
function margens(W: number, H: number) {
  const b = Math.min(W, H);
  return H / W > 1.6 ? { topo: 260, base: 300 } : { topo: b * 0.06, base: b * 0.06 };
}

const tracoLaranja = (largura: number, altura = 8) => d({ width: largura, height: altura, backgroundColor: COR.laranja, borderRadius: altura });

function fundo(W: number, H: number, escuro: boolean, filhos: Node[], cor?: string): Node {
  return d(
    {
      width: W,
      height: H,
      position: "relative",
      overflow: "hidden",
      fontFamily: FONTE,
      backgroundColor: cor ?? (escuro ? COR.grafite : COR.fundoClaro),
      ...(escuro && !cor ? { backgroundImage: "linear-gradient(135deg, #2D2D2D 0%, #383838 100%)" } : {}),
    },
    ...filhos,
  );
}

// ================================================================ 6 modelos (aba "Artes")

type Ctx = { W: number; H: number; c: Record<string, string | boolean>; foto: string | null };
const s = (v: string | boolean | undefined) => String(v ?? "");

const DESENHOS: Record<ModeloId, (x: Ctx) => Node> = {
  marca({ W, H, c }) {
    const escuro = c.fundo === "grafite";
    const b = Math.min(W, H);
    return fundo(W, H, escuro, [
      marcaDagua("direita", b * 0.95, { escuro, x: -b * 0.2, y: H * 0.5 - b * 0.5 }),
      diagonais("topo-esquerda", b * 0.32, escuro),
      diagonais("base-direita", b * 0.32, escuro),
      d(
        { position: "absolute", top: 0, left: 0, width: W, height: H, flexDirection: "column", alignItems: "center", justifyContent: "center" },
        logotipo({ tamanho: b * 0.12, escuro }),
        c.frase ? d({ marginTop: b * 0.07, maxWidth: W * 0.8 }, textoMarcado(s(c.frase), { tamanho: b * 0.05, cor: escuro ? COR.branco : COR.grafite, peso: 700, alinhar: "center", altura: 1.25 })) : null,
      ),
    ]);
  },

  foto({ W, H, c, foto }) {
    const b = Math.min(W, H);
    const direita = c.posicao === "direita";
    const m = margens(W, H);
    return fundo(W, H, true, [
      foto
        ? img(foto, W, H, { position: "absolute", top: 0, left: 0, objectFit: "cover" })
        : d({ position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: "linear-gradient(160deg, #4A4A4A, #2D2D2D)" }),
      // Escurece a parte de baixo para a frase ficar legível.
      d({ position: "absolute", left: 0, bottom: 0, width: W, height: H * 0.62, backgroundImage: "linear-gradient(180deg, rgba(20,20,20,0) 0%, rgba(20,20,20,0.55) 45%, rgba(20,20,20,0.88) 100%)" }),
      diagonais(direita ? "base-esquerda" : "base-direita", b * 0.2, true),
      d(
        {
          position: "absolute",
          bottom: Math.max(H * 0.085, m.base),
          ...(direita ? { right: W * 0.07, alignItems: "flex-end" } : { left: W * 0.07, alignItems: "flex-start" }),
          flexDirection: "column",
          maxWidth: W * 0.78,
        },
        textoMarcado(s(c.titulo), { tamanho: b * 0.085, cor: COR.branco, alinhar: direita ? "flex-end" : "flex-start" }),
        d({ height: b * 0.03 }),
        tracoLaranja(b * 0.16, b * 0.009),
      ),
      c.logo ? d({ position: "absolute", top: m.topo, ...(direita ? { left: W * 0.06 } : { right: W * 0.06 }) }, logotipo({ tamanho: b * 0.06, escuro: true, slogan: false, empilhado: false })) : null,
    ]);
  },

  icone({ W, H, c }) {
    const escuro = c.fundo === "grafite";
    const b = Math.min(W, H);
    return fundo(W, H, escuro, [
      marcaDagua("direita", b * 0.9, { escuro, x: -b * 0.25, y: -b * 0.05 }),
      diagonais("base-direita", b * 0.36, escuro),
      d(
        { position: "absolute", top: 0, left: W * 0.09, height: H, width: W * 0.82, flexDirection: "column", justifyContent: "center" },
        textoMarcado(s(c.titulo), { tamanho: b * 0.105, cor: escuro ? COR.branco : COR.grafite }),
        d({ height: b * 0.07 }),
        img(iconeSrc(s(c.icone), COR.laranja), b * 0.24, b * 0.24),
      ),
      c.logo ? d({ position: "absolute", top: margens(W, H).topo, left: W * 0.09 }, logotipo({ tamanho: b * 0.06, escuro, slogan: false, empilhado: false })) : null,
    ]);
  },

  dicas({ W, H, c }) {
    const b = Math.min(W, H);
    return fundo(W, H, false, [
      marcaDagua("direita", b * 0.85, { x: -b * 0.25, y: H * 0.5 - b * 0.42 }),
      diagonais("base-direita", b * 0.34),
      d(
        { position: "absolute", top: 0, left: 0, width: W, height: H, flexDirection: "column", alignItems: "center", justifyContent: "center" },
        d(
          { alignItems: "center", maxWidth: W * 0.86 },
          d({ fontSize: b * 0.36, fontWeight: 800, color: COR.laranja, lineHeight: 1, letterSpacing: -b * 0.015, marginRight: b * 0.035 }, s(c.numero).slice(0, 3)),
          textoMarcado(s(c.texto), { tamanho: b * 0.068, cor: COR.grafite, peso: 700, altura: 1.12 }),
        ),
        d({ height: b * 0.07 }),
        img(iconeSrc(s(c.icone), COR.laranja), b * 0.17, b * 0.17),
      ),
      c.logo ? d({ position: "absolute", top: margens(W, H).topo, left: W * 0.08 }, logotipo({ tamanho: b * 0.06, slogan: false, empilhado: false })) : null,
    ]);
  },

  tres({ W, H, c }) {
    const b = Math.min(W, H);
    const item = (i: number) =>
      d(
        { flexDirection: "column", alignItems: "center", width: W * 0.24 },
        img(iconeSrc(s(c[`icone${i}`]), COR.grafite), b * 0.13, b * 0.13),
        d({ marginTop: b * 0.025, fontSize: b * 0.036, fontWeight: 600, color: COR.grafite }, s(c[`rotulo${i}`]).slice(0, 20)),
      );
    const divisor = () => d({ width: 4, height: b * 0.2, backgroundColor: COR.laranja, borderRadius: 4 });
    return fundo(W, H, false, [
      marcaDagua("direita", b * 0.9, { x: -b * 0.3, y: -b * 0.1 }),
      diagonais("topo-esquerda", b * 0.26),
      diagonais("base-direita", b * 0.3),
      d(
        { position: "absolute", top: 0, left: W * 0.07, width: W * 0.86, height: H, flexDirection: "column", justifyContent: "center" },
        d({ alignItems: "center", justifyContent: "space-between" }, item(1), divisor(), item(2), divisor(), item(3)),
        d({ height: b * 0.09 }),
        textoMarcado(s(c.titulo), { tamanho: b * 0.085, cor: COR.grafite }),
      ),
    ]);
  },

  aviso({ W, H, c }) {
    const escuro = c.fundo !== "claro";
    const b = Math.min(W, H);
    return fundo(W, H, escuro, [
      marcaDagua("direita", b * 0.95, { escuro, x: -b * 0.3, y: H * 0.18 }),
      diagonais("topo-direita", b * 0.3, escuro),
      d(
        { position: "absolute", top: 0, left: W * 0.08, width: W * 0.84, height: H, flexDirection: "column", justifyContent: "center" },
        c.etiqueta
          ? d(
              { alignSelf: "flex-start", backgroundColor: COR.laranja, color: COR.grafite, fontSize: b * 0.03, fontWeight: 800, letterSpacing: b * 0.003, padding: `${b * 0.012}px ${b * 0.028}px`, borderRadius: b * 0.04, marginBottom: b * 0.04 },
              s(c.etiqueta).slice(0, 30),
            )
          : null,
        textoMarcado(s(c.titulo), { tamanho: b * 0.09, cor: escuro ? COR.branco : COR.grafite }),
        d({ height: b * 0.035 }),
        tracoLaranja(b * 0.14, b * 0.009),
        c.texto ? d({ marginTop: b * 0.04, fontSize: b * 0.04, fontWeight: 500, lineHeight: 1.4, color: escuro ? "#DADADA" : "#555555", maxWidth: W * 0.78 }, s(c.texto).slice(0, 220)) : null,
      ),
      d({ position: "absolute", bottom: margens(W, H).base, left: W * 0.08 }, logotipo({ tamanho: b * 0.055, escuro, slogan: true, empilhado: false })),
    ]);
  },
};

const FOTO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Monta a arte de um modelo da aba "Artes" (campos já vêm do formulário; tudo é validado aqui). */
export function arteObraFacil({ modelo, formato, campos, foto }: { modelo: string; formato: string; campos: Record<string, unknown>; foto?: string | null }): Frame {
  const info = MODELOS.find((m) => m.id === modelo);
  if (!info) throw new Error("Modelo desconhecido.");
  const f = FORMATOS[formato as FormatoArte] ?? FORMATOS.quadrado;
  const c = normalizarCampos(info, campos);
  const fotoOk = foto && FOTO_RE.test(foto) ? foto : null;
  return { node: DESENHOS[info.id]({ W: f.largura, H: f.altura, c, foto: fotoOk }), width: f.largura, height: f.altura, name: `${info.id}-${formato}` };
}

// ================================================================ posts automáticos (texto da IA)

/** Rodapé: logo horizontal à esquerda; @ e página à direita. */
function rodape(W: number, H: number, b: Brand, page: string | null, tom: Tom, baseY: number): Node {
  const escuro = tom === "grafite";
  return d(
    { position: "absolute", left: 96, width: W - 192, top: H - baseY - 64, height: 64, alignItems: "center", justifyContent: "space-between" },
    logotipo({ tamanho: 56, escuro, slogan: false, empilhado: false, naLaranja: tom === "laranja" }),
    d({ fontSize: 28, fontWeight: 600, color: escuro ? "#D9D9D9" : tom === "laranja" ? COR.grafite : "#555555" }, page ? `${b.handle} · ${page}` : b.handle),
  );
}

type Tom = "grafite" | "claro" | "laranja";
/** Tela 1080×H com fundo, marca-d'água, diagonais, conteúdo centralizado e rodapé. */
function tela(b: Brand, tom: Tom, conteudo: Node[], page: string | null, H = 1350): Node {
  const W = 1080;
  const escuro = tom === "grafite";
  const m = H / W > 1.6 ? { topo: 260, base: 300 } : { topo: 96, base: 72 };
  return fundo(
    W,
    H,
    escuro,
    [
      tom === "laranja" ? null : marcaDagua("direita", 1000, { escuro, x: -320, y: H * 0.5 - 420 }),
      // faixas no topo: a base é do rodapé (logo e @)
      tom === "laranja" ? null : diagonais("topo-direita", 300, escuro),
      d({ position: "absolute", left: 96, top: m.topo, width: W - 192, height: H - m.topo - m.base - 120, flexDirection: "column", justifyContent: "center" }, ...conteudo),
      rodape(W, H, b, page, tom, m.base),
    ],
    tom === "laranja" ? COR.laranja : undefined,
  );
}

const cores = (tom: Tom) => ({ titulo: tom === "grafite" ? COR.branco : COR.grafite, texto: tom === "grafite" ? "#DADADA" : tom === "laranja" ? COR.grafite : "#555555", destaque: tom === "laranja" ? COR.branco : COR.laranja });

function etiqueta(texto: string, tom: Tom): Node {
  if (!texto) return null;
  return d(
    { alignSelf: "flex-start", backgroundColor: tom === "laranja" ? COR.grafite : COR.laranja, color: tom === "laranja" ? COR.branco : COR.grafite, fontSize: 30, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", padding: "12px 28px", borderRadius: 40, marginBottom: 40 },
    texto.slice(0, 40),
  );
}
const tamTitulo = (t: string, grande: number, medio: number, pequeno: number) => (t.length > 70 ? pequeno : t.length > 38 ? medio : grande);
const titulo = (t: string, tom: Tom, tam: number) => textoMarcado(t, { tamanho: tam, cor: cores(tom).titulo, destaque: cores(tom).destaque, altura: 1.1 });
const texto = (t: string, tom: Tom, tam = 42) => (t ? d({ marginTop: 36, fontSize: tam, fontWeight: 500, lineHeight: 1.4, color: cores(tom).texto }, t) : null);

export function obraFacilCarousel(b: Brand, c: CarouselCopy): Frame[] {
  const total = c.slides.length + 3;
  const pg = (i: number) => `${i}/${total}`;
  const frames: Frame[] = [];
  const add = (node: Node, name: string) => frames.push({ node, width: 1080, height: 1350, name });

  add(
    tela(b, "grafite", [etiqueta(c.cover.kicker, "grafite"), titulo(c.cover.title, "grafite", tamTitulo(c.cover.title, 112, 96, 80)), d({ height: 36 }), tracoLaranja(150, 10), texto(c.cover.subtitle, "grafite", 44)], pg(1)),
    "capa",
  );

  c.slides.forEach((sl, i) => {
    const page = pg(i + 2);
    const nome = `slide ${i + 1}`;
    if (sl.kind === "dor") {
      add(tela(b, "grafite", [etiqueta("O problema", "grafite"), titulo(sl.title, "grafite", tamTitulo(sl.title, 88, 76, 64)), texto(sl.body, "grafite")], page), nome);
    } else if (sl.kind === "citacao") {
      add(tela(b, "laranja", [d({ fontSize: 200, lineHeight: 0.7, fontWeight: 800, color: COR.grafite, opacity: 0.35 }, "“"), titulo(sl.title, "laranja", tamTitulo(sl.title, 80, 70, 60)), texto(sl.body, "laranja", 40)], page), nome);
    } else if (sl.kind === "numero" && sl.number) {
      add(
        tela(b, "claro", [d({ fontSize: 220, fontWeight: 800, color: COR.laranja, lineHeight: 1, letterSpacing: -6 }, sl.number.slice(0, 8)), titulo(sl.title, "claro", tamTitulo(sl.title, 68, 60, 52)), texto(sl.body, "claro")], page),
        nome,
      );
    } else if (sl.kind === "lista" && sl.items.length) {
      add(
        tela(
          b,
          "claro",
          [
            titulo(sl.title, "claro", tamTitulo(sl.title, 76, 64, 56)),
            d(
              { flexDirection: "column", marginTop: 32 },
              ...sl.items.slice(0, 6).map((item, n) =>
                d(
                  { gap: 32, padding: "22px 0", borderBottom: `3px solid ${COR.cinza}`, fontSize: 38, lineHeight: 1.3, color: COR.grafite, fontWeight: 500 },
                  d({ color: COR.laranja, fontWeight: 800, width: 44 }, String(n + 1)),
                  d({ flex: 1 }, item),
                ),
              ),
            ),
          ],
          page,
        ),
        nome,
      );
    } else {
      add(tela(b, "claro", [titulo(sl.title, "claro", tamTitulo(sl.title, 84, 72, 60)), d({ height: 32 }), tracoLaranja(120, 10), texto(sl.body, "claro", 44)], page), nome);
    }
  });

  add(
    tela(
      b,
      "grafite",
      [
        etiqueta("Resumo", "grafite"),
        d(
          { flexDirection: "column", gap: 28 },
          ...c.recap.slice(0, 5).map((r) => d({ gap: 28, fontSize: 42, lineHeight: 1.3, color: COR.branco, fontWeight: 600 }, d({ width: 24, height: 24, marginTop: 14, borderRadius: 6, backgroundColor: COR.laranja, flexShrink: 0 }), d({ flex: 1 }, r))),
        ),
      ],
      pg(total - 1),
    ),
    "resumo",
  );

  add(
    tela(
      b,
      "laranja",
      [
        titulo(c.cta, "laranja", tamTitulo(c.cta, 96, 80, 66)),
        d({ marginTop: 56 }, d({ padding: "24px 44px", borderRadius: 999, backgroundColor: COR.grafite, color: COR.branco, fontSize: 38, fontWeight: 800 }, "Link na bio")),
      ],
      pg(total),
    ),
    "chamada",
  );
  return frames;
}

export function obraFacilPost(b: Brand, c: PostCopy): Frame[] {
  return [{ node: tela(b, "grafite", [etiqueta(c.kicker, "grafite"), titulo(c.title, "grafite", tamTitulo(c.title, 108, 92, 76)), d({ height: 36 }), tracoLaranja(150, 10), texto(c.body, "grafite", 42)], null), width: 1080, height: 1350, name: "arte" }];
}

export function obraFacilStory(b: Brand, c: StoryCopy): Frame[] {
  return c.frames.map((f, i) => {
    const tom: Tom = i % 2 ? "claro" : "grafite";
    return {
      node: tela(
        b,
        tom,
        [
          titulo(f.text, tom, tamTitulo(f.text, 100, 84, 70)),
          // espaço para a figurinha (enquete, caixinha, link): adicionada no app
          f.sticker_suggestion
            ? d(
                { marginTop: 80, height: 300, borderRadius: 48, border: `5px dashed ${tom === "grafite" ? COR.branco : COR.grafite}`, opacity: 0.45, alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 600, color: cores(tom).titulo },
                f.sticker_suggestion,
              )
            : null,
        ],
        `${i + 1}/${c.frames.length}`,
        1920,
      ),
      width: 1080,
      height: 1920,
      name: `story ${i + 1}`,
    };
  });
}

/** Desenho dos posts automáticos por entidade (slug) com kit próprio. */
export const KITS: Record<string, { carousel: typeof obraFacilCarousel; post: typeof obraFacilPost; story: typeof obraFacilStory }> = {
  "obra-facil": { carousel: obraFacilCarousel, post: obraFacilPost, story: obraFacilStory },
};
