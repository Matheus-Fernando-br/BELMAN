// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { arteObraFacil, obraFacilCarousel, obraFacilPost, obraFacilStory } from "@shared/social-templates/obra-facil";
import { framesFor } from "@/lib/social/engine/render";
import { FORMATOS, MODELOS, normalizarCampos, temKit } from "@shared/social-templates/obra-facil-modelos";
import { renderPng } from "@/lib/social/engine/images";

const brand = { handle: "@obra.facil.app", palette: { primary: "#C2570C", accent: "#F08A3C", bg: "#141110", text: "#FFFFFF" }, fonts: { heading: "Inter", body: "Inter" }, logo: null };
const dims = (png: Buffer) => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });

describe("kit visual do Obra Fácil", () => {
  it("Obra Fácil e FINC têm kit; os outros usam os templates genéricos", () => {
    expect(temKit("obra-facil")).toBe(true);
    expect(temKit("finc")).toBe(true);
    expect(temKit("bellman")).toBe(false);
  });

  it("normaliza campos: padrão quando vazio/inválido, corta texto longo", () => {
    const m = MODELOS.find((x) => x.id === "icone")!;
    const c = normalizarCampos(m, { icone: "nao-existe", fundo: "roxo", titulo: "x".repeat(900), logo: "false" });
    expect(c.icone).toBe("prancheta");
    expect(c.fundo).toBe("claro");
    expect(String(c.titulo)).toHaveLength(400);
    expect(c.logo).toBe(false);
  });

  it("recusa modelo desconhecido e ignora foto que não é data URL de imagem", () => {
    expect(() => arteObraFacil({ modelo: "xyz", formato: "quadrado", campos: {} })).toThrow("Modelo desconhecido.");
    const f = arteObraFacil({ modelo: "foto", formato: "retrato", campos: {}, foto: "https://exemplo.com/a.jpg" });
    expect(JSON.stringify(f.node)).not.toContain("exemplo.com");
  });

  it("desenha os 6 modelos nos 3 formatos com o tamanho certo", async () => {
    for (const m of MODELOS)
      for (const [k, f] of Object.entries(FORMATOS)) {
        const png = await renderPng(arteObraFacil({ modelo: m.id, formato: k, campos: {} }));
        if (process.env.ARTES_DIR) (await import("node:fs")).writeFileSync(`${process.env.ARTES_DIR}/${m.id}-${k}.png`, png);
        expect(dims(png), `${m.id}/${k}`).toEqual({ w: f.largura, h: f.altura });
      }
  }, 120_000);

  it("modelo com foto usa a imagem enviada", async () => {
    const sharp = (await import("sharp")).default;
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3366AA" } }).jpeg().toBuffer();
    const frame = arteObraFacil({ modelo: "foto", formato: "quadrado", campos: { titulo: "Obra *entregue*" }, foto: `data:image/jpeg;base64,${jpg.toString("base64")}` });
    const png = await renderPng(frame);
    const { data } = await sharp(png).extract({ left: 540, top: 100, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    // topo da arte mostra a foto (JPEG pode variar 1 a 2 tons)
    [0x33, 0x66, 0xaa].forEach((v, i) => expect(Math.abs(data[i] - v)).toBeLessThanOrEqual(3));
  });

  it("posts automáticos: carrossel, post e stories na identidade", async () => {
    const car = obraFacilCarousel(brand, {
      cover: { kicker: "Orçamento", title: "Como cobrar *BDI* sem perder obra", subtitle: "O que entra no preço além de material e mão de obra." },
      slides: [
        { kind: "dor", title: "Você cobra o custo, não o preço", body: "Material + diária não paga imposto nem lucro.", items: [], number: null },
        { kind: "numero", title: "de BDI médio em reformas", body: "Exemplo: referência do TCU.", items: [], number: "25%" },
        { kind: "lista", title: "O que entra no BDI", body: "", items: ["Administração", "Impostos", "Risco", "Lucro"], number: null },
        { kind: "citacao", title: "Orçamento bonito fecha mais obra do que orçamento barato.", body: "", items: [], number: null },
        { kind: "conteudo", title: "Mostre o PDF", body: "Cliente confia no que entende.", items: [], number: null },
      ],
      recap: ["Custo não é preço", "BDI cobre o resto", "PDF claro fecha obra"],
      cta: "Comece grátis no Obra Fácil",
    });
    expect(car).toHaveLength(8);
    const all = [...car, ...obraFacilPost(brand, { kicker: "Dica", title: "Prazo sem cronograma é promessa", body: "Monte o cronograma no app." }), ...obraFacilStory(brand, { frames: [{ text: "Você usa BDI?", sticker_suggestion: "Enquete: sim / não" }, { text: "Veja no app", sticker_suggestion: null }] })];
    for (const [i, f] of all.entries()) {
      const png = await renderPng(f);
      if (process.env.ARTES_DIR) (await import("node:fs")).writeFileSync(`${process.env.ARTES_DIR}/auto-${i}.png`, png);
      expect(dims(png)).toEqual({ w: f.width, h: f.height });
    }
    expect(framesFor("carousel", brand, { carousel: null }, "obra-facil")).toEqual([]);
  }, 120_000);
});

describe("kit visual da FINC", () => {
  it("desenha os 6 modelos na identidade da FINC (verde, logo oficial) e os posts automáticos", async () => {
    const { arteKit, KITS } = await import("@shared/social-templates/obra-facil");
    const { modelosDo } = await import("@shared/social-templates/obra-facil-modelos");
    const modelos = modelosDo("finc");
    expect(modelos.find((m) => m.id === "icone")!.campos.find((c) => c.id === "titulo")!.rotulo).toContain("verde");
    for (const m of modelos) {
      const frame = arteKit("finc", { modelo: m.id, formato: "quadrado", campos: Object.fromEntries(m.campos.map((c) => [c.id, c.padrao])) });
      expect(JSON.stringify(frame.node)).toContain("#00924C");
      expect(JSON.stringify(frame.node)).not.toContain("#F57C00");
      const png = await renderPng(frame);
      if (process.env.ARTES_DIR) (await import("node:fs")).writeFileSync(`${process.env.ARTES_DIR}/finc-${m.id}.png`, png);
      expect(dims(png)).toEqual({ w: 1080, h: 1080 });
    }
    const fincBrand = { ...brand, handle: "@plataforma.finc" };
    const post = KITS.finc.post(fincBrand, { kicker: "Dica", title: "Nota fiscal *em dia*", body: "Sem complicação.", alt_text: "x" } as never);
    expect(JSON.stringify(post[0].node)).toContain("#00924C");
    // o Obra Fácil continua laranja depois de desenhar a FINC
    const of = obraFacilPost(brand, { kicker: "Dica", title: "Obra *em dia*", body: "x", alt_text: "x" } as never);
    expect(JSON.stringify(of[0].node)).toContain("#F57C00");
    if (process.env.ARTES_DIR) (await import("node:fs")).writeFileSync(`${process.env.ARTES_DIR}/finc-post.png`, await renderPng(post[0]));
  }, 60000);
});

describe("textos do kit por produto", () => {
  it("a FINC não herda os exemplos do Obra Fácil", async () => {
    const { modelosDo } = await import("@shared/social-templates/obra-facil-modelos");
    const txt = JSON.stringify(modelosDo("finc").map((m) => [m.descricao, m.campos]));
    expect(txt).not.toMatch(/capacete|obras|laranja|profissionalizar/i);
    expect(JSON.stringify(modelosDo("obra-facil"))).toMatch(/capacete/);
  });
});
