import { autofix, countAsks, hasErrors, lintCaption, normalizeHashtags } from "@shared/social/lint";
import { validateCarousel, validateImage, validateReel } from "@shared/social/media-rules";

const rules = { maxHashtags: 5, maxEmojis: 1, bannedWords: ["solução inovadora", "alavancar"] };
const codes = (c: string, h: string[] = []) => lintCaption(c, h, rules).map((i) => i.code);

const GOOD = "R$ 10.000 de custo vira R$ 12.500 com BDI de 25%.\n\nMaterial e mão de obra são custo. Preço tem BDI.\n\nComece grátis: link na bio.";

describe("lint de legenda", () => {
  it("legenda boa passa sem erros", () => {
    expect(hasErrors(lintCaption(GOOD, ["#orcamentodeobra", "#bdi"], rules))).toBe(false);
  });
  it("travessão, aspas curvas e invisíveis", () => {
    expect(codes("Preço — custo 10 R$. Link na bio")).toContain("dash");
    expect(codes("“Preço” 10 R$. Link na bio")).toContain("curly_quotes");
    expect(codes("Preço​ 10 R$. Link na bio")).toContain("invisible");
  });
  it("autofix corrige tipografia e invisíveis", () => {
    expect(autofix("Preço — custo​ “ok” …")).toBe('Preço, custo "ok" ...');
  });
  it("só uma chamada para ação", () => {
    expect(countAsks("Salve este post e comente BDI. Link na bio.")).toHaveLength(2);
    expect(countAsks("Comece grátis: link na bio.")).toHaveLength(1);
    expect(codes("R$ 10 de exemplo. Salve este post. Link na bio.")).toContain("asks");
    expect(codes("R$ 10 de exemplo.")).toContain("no_ask");
  });
  it("hashtags no limite e só no fim", () => {
    expect(codes(GOOD, ["#a", "#b", "#c", "#d", "#e", "#f"])).toContain("hashtags");
    expect(codes("R$ 10 #obra no meio. Link na bio.")).toContain("tags_in_body");
    expect(lintCaption(GOOD, ["#viral"], rules).find((i) => i.code === "filler_tags")?.level).toBe("warn");
  });
  it("primeira linha até 125 caracteres e sem começar com # @ ou emoji", () => {
    expect(codes("A".repeat(126) + "\nLink na bio")).toContain("first_line");
    expect(codes("#obra 10\nLink na bio")).toContain("first_tag");
    expect(codes("👷 10 R$\nLink na bio")).toContain("first_emoji");
  });
  it("sem link no corpo", () => {
    expect(codes("R$ 10. Veja https://obra.app/x. Link na bio")).toContain("link");
    expect(codes("R$ 10. Acesse obrafacil.com.br hoje. Link na bio")).toContain("link");
  });
  it("palavras proibidas da marca e vocabulário de IA (sem acento também)", () => {
    expect(codes("Vamos alavancar 10 obras. Link na bio")).toContain("banned_words");
    expect(codes("Uma jornada de 10 dias. Link na bio")).toContain("banned_words");
    expect(codes("Uma solucao inovadora de 10. Link na bio")).toContain("banned_words");
  });
  it("limite de emojis da marca", () => {
    expect(codes("R$ 10 de exemplo 👍 🔥. Link na bio")).toContain("emoji");
  });
  it("normaliza hashtags", () => {
    expect(normalizeHashtags(["#Orçamento de Obra", "orcamentodeobra", "##BDI", "x", "y", "z", "w"], 5)).toEqual(["#orcamentodeobra", "#bdi", "#x", "#y", "#z"]);
  });
});

describe("regras de mídia", () => {
  it("imagem JPEG 4:5 até 8 MB", () => {
    expect(validateImage({ mime: "image/jpeg", width: 1080, height: 1350, bytes: 500_000 })).toEqual([]);
    expect(validateImage({ mime: "image/png", width: 1080, height: 1350 })).toHaveLength(1);
    expect(validateImage({ mime: "image/jpeg", width: 1080, height: 1920 })).toHaveLength(1);
    expect(validateImage({ mime: "image/jpeg", width: 1080, height: 1350, bytes: 9e6 })).toHaveLength(1);
  });
  it("carrossel 2 a 10", () => {
    const img = { mime: "image/jpeg", width: 1080, height: 1350 };
    expect(validateCarousel([img])).toHaveLength(1);
    expect(validateCarousel(Array(11).fill(img))).toHaveLength(1);
    expect(validateCarousel(Array(8).fill(img))).toEqual([]);
  });
  it("reels MP4 9:16", () => {
    expect(validateReel({ mime: "video/mp4", width: 1080, height: 1920, durationMs: 30_000 })).toEqual([]);
    expect(validateReel({ mime: "video/quicktime", width: 1920, height: 1080 })).toHaveLength(2);
  });
});
