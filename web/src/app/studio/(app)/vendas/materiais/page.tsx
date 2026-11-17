import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { label, MATERIAL_PURPOSE } from "@/lib/studio/records";
import { fileSize, isImage, signedSalesUrls } from "@/lib/studio/sales-files";
import { loadRefs, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { deleteSalesItem } from "../actions";
import { MaterialUpload } from "../Uploads";

export const metadata: Metadata = { title: "Materiais de divulgação" };

type Sp = { e?: string; fin?: string; contato?: string; q?: string };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const ctx = await requireScope(sp.e);
  const supabase = await createClient();
  let query = supabase
    .from("materials")
    .select("id,title,purpose,entity_id,contact_id,campaign_id,storage_path,file_name,mime,bytes,created_at,contacts(name,trade_name),campaigns(name)")
    .in("entity_id", ctx.scopeIds)
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.fin && MATERIAL_PURPOSE.some(([v]) => v === sp.fin)) query = query.eq("purpose", sp.fin);
  if (sp.contato && /^[0-9a-f-]{36}$/.test(sp.contato)) query = query.eq("contact_id", sp.contato);
  const q = (sp.q ?? "").trim().slice(0, 80).replace(/[%,()]/g, " ");
  if (q) query = query.ilike("title", `%${q}%`);
  const visibleIds = ctx.visible.map((x) => x.id);
  const [{ data }, refs, { data: all }] = await Promise.all([query, loadRefs(visibleIds, ["contacts", "campaigns"]), supabase.from("materials").select("purpose").in("entity_id", ctx.scopeIds)]);
  const items = data ?? [];
  const thumbs = await signedSalesUrls(items.filter((m) => isImage(m.mime)).map((m) => m.storage_path));
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const count = (p: string) => (all ?? []).filter((m) => m.purpose === p).length;
  const link = (fin?: string) => {
    const p = new URLSearchParams();
    Object.entries({ e: sp.e, fin, contato: sp.contato }).forEach(([k, v]) => v && p.set(k, v));
    return `/studio/vendas/materiais${p.size ? `?${p}` : ""}`;
  };
  const ext = (name?: string | null) => (name?.split(".").pop() ?? "").toUpperCase().slice(0, 4);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>Materiais de divulgação</h1>
          <p>Artes, panfletos, cartazes, apresentações e materiais institucionais, separados por empresa e finalidade.</p>
        </div>
      </div>

      {ctx.canWrite && (
        <details className="st-card" id="novo" open={Boolean(sp.contato) || !(all ?? []).length}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Enviar materiais</summary>
          <div style={{ marginTop: "1rem" }}>
            <MaterialUpload
              entities={ctx.entityOptions}
              purposes={MATERIAL_PURPOSE}
              contacts={refs.contacts ?? []}
              campaigns={refs.campaigns ?? []}
              defaultEntity={ctx.scope.length === 1 ? ctx.scope[0].id : undefined}
              defaultContact={sp.contato}
            />
          </div>
        </details>
      )}

      <nav className="st-actions" aria-label="Finalidade" style={{ margin: "1rem 0" }}>
        <Link href={link()} className="st-tag" aria-current={!sp.fin ? "true" : undefined}>
          Todos · {(all ?? []).length}
        </Link>
        {MATERIAL_PURPOSE.filter(([v]) => count(v)).map(([v, l]) => (
          <Link key={v} href={link(v)} className="st-tag" aria-current={sp.fin === v ? "true" : undefined}>
            {l} · {count(v)}
          </Link>
        ))}
        <form role="search" style={{ marginLeft: "auto" }}>
          {sp.e && <input type="hidden" name="e" value={sp.e} />}
          {sp.fin && <input type="hidden" name="fin" value={sp.fin} />}
          <input name="q" defaultValue={q} placeholder="Buscar por título" className="st-input" style={{ maxWidth: 240 }} aria-label="Buscar material" />
        </form>
      </nav>

      <div className="st-grid" data-cols="3">
        {items.map((m) => {
          const c = m.contacts as unknown as { name: string; trade_name: string | null } | null;
          const k = m.campaigns as unknown as { name: string } | null;
          const url = `/studio/vendas/arquivo?t=m&id=${m.id}`;
          return (
            <article key={m.id} className="st-card" style={{ gap: "0.5rem" }}>
              <a href={url} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", aspectRatio: "4 / 3", background: "var(--st-bg)", borderRadius: 8, overflow: "hidden", textDecoration: "none" }}>
                {thumbs.get(m.storage_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs.get(m.storage_path)} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <strong style={{ fontSize: "1.6rem", color: "var(--st-muted)" }}>{ext(m.file_name) || "ARQ"}</strong>
                )}
              </a>
              <strong>{m.title}</strong>
              <div className="st-actions" style={{ gap: "0.35rem" }}>
                <span className="st-tag">
                  <span className="st-dot" style={{ background: ent.get(m.entity_id)?.color }} aria-hidden="true" />
                  {ent.get(m.entity_id)?.name}
                </span>
                <span className="st-tag">{label(MATERIAL_PURPOSE, m.purpose)}</span>
              </div>
              <span className="st-hint">
                {fileSize(m.bytes)}
                {c ? ` · ${c.trade_name || c.name}` : ""}
                {k ? ` · campanha ${k.name}` : ""}
              </span>
              <div className="st-actions">
                <a className="st-btn" data-variant="ghost" href={`${url}&baixar=1`}>
                  Baixar
                </a>
                {ctx.canWrite && (
                  <form action={deleteSalesItem}>
                    <input type="hidden" name="table" value="materials" />
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton variant="danger" pendingLabel="…">
                      Excluir
                    </SubmitButton>
                  </form>
                )}
              </div>
            </article>
          );
        })}
        {!items.length && <p className="st-hint">Nenhum material {sp.fin || sp.contato || q ? "com esse filtro" : "ainda"}.</p>}
      </div>
    </>
  );
}
