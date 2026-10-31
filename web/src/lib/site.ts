// Single source for brand, URLs and confirmed contact details.

function resolveSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const site = {
  name: "Bellman",
  url: resolveSiteUrl(),
  title: "Bellman — Technology meets business.",
  tagline: "Tecnologia que conecta negócios.",
  description:
    "A Bellman cria produtos digitais que simplificam processos e conectam negócios: FINC, gestão financeira e fiscal, e Obra Fácil, gestão para a construção civil.",
  contact: {
    email: "bellman.adm@gmail.com",
    github: "https://github.com/Matheus-Fernando-br",
    linkedin: "https://www.linkedin.com/in/matheus-fernando-",
    instagram: "https://www.instagram.com/devzoneoficial",
    youtube: "https://www.youtube.com/@devzoneoficial",
  },
} as const;

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const nav = [
  { href: "#sobre", label: "Sobre" },
  { href: "#produtos", label: "Produtos" },
  { href: "#solucoes", label: "Soluções" },
  { href: "#diferenciais", label: "Diferenciais" },
  { href: "#contato", label: "Contato" },
] as const;
