"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

// Camada de movimento do Studio: barra de progresso nas navegações, indicador
// que desliza até o item ativo (menu, filtro e abas) e números que "contam" nos
// indicadores. Tudo respeita "reduzir movimento" do sistema.

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Posiciona o indicador ([data-indicator]) sobre o item ativo (aria-current). */
function placeIndicators() {
  document.querySelectorAll<HTMLElement>("[data-indicator], .st-tabs, .st-filter").forEach((box) => {
    const active = box.querySelector<HTMLElement>('[aria-current="page"], [aria-current="true"]');
    if (!active) {
      box.style.setProperty("--io", "0");
      return;
    }
    const b = box.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    box.style.setProperty("--ix", `${a.left - b.left + box.scrollLeft}px`);
    box.style.setProperty("--iy", `${a.top - b.top + box.scrollTop}px`);
    box.style.setProperty("--iw", `${a.width}px`);
    box.style.setProperty("--ih", `${a.height}px`);
    box.style.setProperty("--io", "1");
    // a primeira posição não anima; as próximas deslizam
    if (!box.dataset.ready) requestAnimationFrame(() => (box.dataset.ready = "1"));
  });
}

const NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/;

/** Faz os valores dos indicadores contarem de 0 até o valor, mantendo o formato pt-BR. */
function countUp() {
  if (reduced()) return;
  document.querySelectorAll<HTMLElement>(".st-kpi dd:not([data-counted])").forEach((el) => {
    el.dataset.counted = "1";
    if (el.children.length) return; // só texto simples
    const text = el.textContent ?? "";
    const m = text.match(NUM);
    if (!m) return;
    const raw = m[0];
    const decimals = raw.includes(",") ? raw.split(",")[1].length : 0;
    const target = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(target) || target === 0) return;
    const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: raw.includes(".") || Math.abs(target) >= 1000 });
    const start = performance.now();
    const dur = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      el.textContent = text.replace(raw, fmt(target * e));
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = text;
    };
    requestAnimationFrame(step);
  });
}

function Inner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const key = `${pathname}?${params}`;
  // a barra começa no clique (guarda de qual endereço saiu) e termina quando o endereço muda
  const [runFrom, setRunFrom] = useState<string | null>(null);
  const keyRef = useRef(key);
  const progress = runFrom === null ? "idle" : runFrom === key ? "run" : "done";

  // começa a barra ao clicar num link interno
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setRunFrom(keyRef.current);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // terminou a navegação: completa a barra, reposiciona indicadores e anima números
  useEffect(() => {
    keyRef.current = key;
    const raf = requestAnimationFrame(() => {
      placeIndicators();
      countUp();
    });
    return () => cancelAnimationFrame(raf);
  }, [key]);

  useEffect(() => {
    if (progress !== "done") return;
    const t = setTimeout(() => setRunFrom(null), 500);
    return () => clearTimeout(t);
  }, [progress]);

  useEffect(() => {
    const ro = new ResizeObserver(() => placeIndicators());
    ro.observe(document.body);
    const mo = new MutationObserver(() => requestAnimationFrame(() => {
      placeIndicators();
      countUp();
    }));
    mo.observe(document.querySelector(".st-shell") ?? document.body, { subtree: true, attributes: true, attributeFilter: ["aria-current"], childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return <div className="st-progress-bar" data-state={progress} aria-hidden="true" />;
}

export function Motion() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
