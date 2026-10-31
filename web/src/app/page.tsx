import { About } from "@/components/About";
import { Contact } from "@/components/Contact";
import { CtaBand } from "@/components/CtaBand";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { IntroSplash } from "@/components/IntroSplash";
import { Principles } from "@/components/Principles";
import { Products } from "@/components/Products";
import { RevealObserver } from "@/components/RevealObserver";
import { Solutions } from "@/components/Solutions";

export default function Home() {
  return (
    <>
      <IntroSplash />
      <Header />
      <main id="conteudo" tabIndex={-1}>
        <Hero />
        <About />
        <Products />
        <Solutions />
        <Principles />
        <CtaBand />
        <Contact />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
