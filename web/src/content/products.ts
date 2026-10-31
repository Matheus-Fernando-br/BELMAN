// Bellman products. Facts adapted from each product's repository and the Dev Zone portfolio.

import type { ProjectType } from "@/lib/contact";

export type Product = {
  slug: ProjectType;
  name: string;
  segment: string;
  tagline: string;
  summary: string;
  problem: string;
  features: string[];
  stack: string[];
  status: string;
  link?: { href: string; label: string };
};

export const products: Product[] = [
  {
    slug: "finc",
    name: "FINC",
    segment: "Financial Technology",
    tagline: "Gestão financeira e fiscal para a sua empresa.",
    summary:
      "Plataforma de gestão e emissão de notas fiscais para MEIs e pequenas empresas, com vendas, estoque e finanças no mesmo lugar.",
    problem:
      "Pequenos negócios costumam emitir notas, controlar estoque e acompanhar o caixa em ferramentas separadas. A FINC reúne essas rotinas em um só sistema.",
    features: [
      "Emissão de NF-e, NFC-e e NFS-e",
      "Vendas com PDV, orçamentos e pedidos",
      "Cadastros, estoque e compras",
      "Finanças, fluxo de caixa e relatórios",
    ],
    stack: ["TypeScript", "React", "Express", "PostgreSQL", "Supabase"],
    status: "Em desenvolvimento",
    link: { href: "https://finc-seven.vercel.app/", label: "Conhecer a FINC" },
  },
  {
    slug: "obra-facil",
    name: "ObraFácil",
    segment: "Construction Technology",
    tagline: "Gestão e tecnologia para a construção civil.",
    summary:
      "Aplicativo de gestão de obras, clientes e orçamentos para construtoras, empreiteiros e profissionais da construção civil.",
    problem:
      "Muitos profissionais controlam clientes e obras pelo WhatsApp, em planilhas e cadernos. O Obra Fácil reúne tudo em um só aplicativo, no bolso de quem está no canteiro.",
    features: [
      "Orçamentos com status, validade e exportação em PDF",
      "Acompanhamento de obras com progresso e prazos",
      "Clientes com contato rápido por telefone e WhatsApp",
      "Relatórios em PDF e planilha, com tema claro e escuro",
    ],
    stack: ["React Native", "Expo", "TypeScript", "Node.js"],
    status: "Em desenvolvimento",
  },
];
