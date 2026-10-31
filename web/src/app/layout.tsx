import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { introScript } from "@/components/IntroSplash";
import { site } from "@/lib/site";
import "./globals.css";

const manrope = localFont({
  src: "../fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-manrope",
});

const inter = localFont({
  src: "../fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.name }],
  creator: site.name,
  keywords: [
    "Bellman",
    "FINC",
    "Obra Fácil",
    "emissão de notas fiscais",
    "gestão financeira",
    "gestão de obras",
    "construção civil",
    "software sob medida",
    "tecnologia para empresas",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f5f5",
  width: "device-width",
  initialScale: 1,
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  slogan: "Technology meets business.",
  description: site.description,
  url: site.url,
  email: site.contact.email,
  logo: `${site.url}/icon.svg`,
  areaServed: { "@type": "Country", name: "Brasil" },
  sameAs: [site.contact.instagram, site.contact.youtube, site.contact.github, site.contact.linkedin],
  owns: [
    { "@type": "SoftwareApplication", name: "FINC", applicationCategory: "BusinessApplication" },
    { "@type": "SoftwareApplication", name: "Obra Fácil", applicationCategory: "BusinessApplication" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`no-js ${manrope.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
      </head>
      <body>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
