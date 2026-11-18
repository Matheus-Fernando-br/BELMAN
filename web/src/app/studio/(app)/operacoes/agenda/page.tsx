import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { label, PRIORITY, RECURRENCE, TASK_STATUS } from "@/lib/studio/records";
import { br, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agenda" };

type Item = {
  key: string;
  date: string;
  kind: "Tarefa" | "Reunião" | "A pagar" | "A receber" | "Contrato" | "Post";
  title: string;
  href: string;
  entity: string;
  detail?: string;
  how?: { href: string; title: string } | null;
  task?: { id: string; status: string };
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ e?: string; quem?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const today = todayLocal();
  const until = addDays(today, 30);
  const slugOf = new Map(ctx.entities.map((x) => [x.id, x]));
  const qs = params.e ? `?e=${params.e}` : "";

  let tq = supabase.from("tasks").select("id,title,status,priority,due_date,recurrence,assignee_id,entity_id,wiki_page_id,wiki_pages(id,title)").in("entity_id", ctx.scopeIds).neq("status", "done").not("due_date", "is", null).lte("due_date", until).order("due_date").limit(500);
  if (params.quem === "eu") tq = tq.eq("assignee_id", ctx.profile.id);
  const [tasks, meetings, money, docs, posts, noDate] = await Promise.all([
    tq,
    supabase.from("meetings").select("id,title,held_at,entity_id,attendees").in("entity_id", ctx.scopeIds).gte("held_at", today).lte("held_at", until).order("held_at"),
    ctx.canSeeFinance
      ? supabase.from("fin_transactions").select("id,type,description,amount_cents,due_date,entity_id").in("entity_id", ctx.scopeIds).eq("cancelled", false).is("paid_date", null).lte("due_date", until).order("due_date").limit(300)
      : Promise.resolve({ data: [] as { id: string; type: string; description: string; amount_cents: number; due_date: string; entity_id: string }[] }),
    supabase.from("documents").select("id,title,valid_until,entity_id").in("entity_id", ctx.scopeIds).eq("status", "vigente").gte("valid_until", today).lte("valid_until", until),
    supabase.from("social_posts").select("id,theme,scheduled_at,status,entity_id").in("entity_id", ctx.scopeIds).in("status", ["review", "approved", "scheduled"]).not("scheduled_at", "is", null).lte("scheduled_at", `${until}T23:59:59`).order("scheduled_at").limit(200),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("entity_id", ctx.scopeIds).neq("status", "done").is("due_date", null),
  ]);

  const items: Item[] = [];
  for (const t of (tasks.data ?? []) as unknown as { id: string; title: string; status: string; priority: string; due_date: string; recurrence: string | null; entity_id: string; wiki_pages: { id: string; title: string } | null }[]) {
    items.push({
      key: `t${t.id}`,
      date: t.due_date,
      kind: "Tarefa",
      title: t.title,
      href: `/studio/operacoes/tarefas?editar=${t.id}${params.e ? `&e=${params.e}` : ""}`,
      entity: t.entity_id,
      detail: [label(PRIORITY, t.priority), t.recurrence ? `↻ ${label(RECURRENCE, t.recurrence).toLowerCase()}` : null].filter(Boolean).join(" · "),
      how: t.wiki_pages ? { href: `/studio/operacoes/processos/${t.wiki_pages.id}`, title: t.wiki_pages.title } : null,
      task: { id: t.id, status: t.status },
    });
  }
  for (const m of meetings.data ?? []) items.push({ key: `m${m.id}`, date: m.held_at, kind: "Reunião", title: m.title, href: `/studio/operacoes/reunioes${qs}`, entity: m.entity_id, detail: m.attendees ?? undefined });
  for (const f of money.data ?? [])
    items.push({ key: `f${f.id}`, date: f.due_date, kind: f.type === "income" ? "A receber" : "A pagar", title: f.description, href: `/studio/financeiro/lancamentos/${f.id}`, entity: f.entity_id, detail: formatCents(Number(f.amount_cents)) });
  for (const d of docs.data ?? []) items.push({ key: `d${d.id}`, date: d.valid_until!, kind: "Contrato", title: `Vence: ${d.title}`, href: `/studio/vendas/documentos/${d.id}`, entity: d.entity_id });
  for (const p of posts.data ?? []) {
    const date = new Date(p.scheduled_at!).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const time = new Date(p.scheduled_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    items.push({ key: `p${p.id}`, date, kind: "Post", title: p.theme || "Post no Instagram", href: `/studio/social/${slugOf.get(p.entity_id)?.slug}/post/${p.id}`, entity: p.entity_id, detail: `${time}${p.status === "review" ? " · aguardando sua revisão" : ""}` });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  const late = items.filter((i) => i.date < today);
  const days = new Map<string, Item[]>();
  for (const i of items.filter((i) => i.date >= today)) days.set(i.date, [...(days.get(i.date) ?? []), i]);
  const tone: Record<Item["kind"], string> = { Tarefa: "neutral", Reunião: "ok", "A pagar": "bad", "A receber": "ok", Contrato: "warn", Post: "neutral" };

  const Row = ({ i }: { i: Item }) => (
    <li style={{ alignItems: "center" }}>
      <span className="st-status" data-tone={tone[i.kind]} style={{ minWidth: "5.5rem", justifyContent: "center" }}>
        {i.kind}
      </span>
      <span className="st-dot" style={{ background: slugOf.get(i.entity)?.color }} title={slugOf.get(i.entity)?.name} aria-hidden="true" />
      <span className="st-grow">
        <Link href={i.href}>{i.title}</Link>
        {i.detail && <small className="st-hint"> · {i.detail}</small>}
        {i.how && (
          <small>
            {" "}
            · <Link href={i.how.href}>como fazer: {i.how.title}</Link>
          </small>
        )}
      </span>
      {i.task && <QuickSelect kind="tasks" id={i.task.id} field="status" value={i.task.status} options={TASK_STATUS} label={`Situação de ${i.title}`} disabled={!ctx.canWrite} />}
    </li>
  );

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Operações · {ctx.filter.label}</p>
          <h1>Agenda</h1>
          <p>O que tem para fazer e quando, nos próximos 30 dias: tarefas e rotinas, reuniões{ctx.canSeeFinance ? ", contas a pagar e a receber" : ""}, contratos vencendo e posts agendados.</p>
        </div>
        <div className="st-actions">
          <Link className="st-tag" href={`/studio/operacoes/agenda${params.quem === "eu" ? qs : `?quem=eu${params.e ? `&e=${params.e}` : ""}`}`} aria-current={params.quem === "eu" ? "true" : undefined}>
            Só minhas tarefas
          </Link>
          {ctx.canWrite && (
            <Link className="st-btn" href={`/studio/operacoes/tarefas${qs}#nova`}>
              + Tarefa ou rotina
            </Link>
          )}
        </div>
      </div>

      {late.length > 0 && (
        <article className="st-card" style={{ borderColor: "#b42318" }}>
          <div className="st-card-head">
            <h2>Atrasados</h2>
            <span>{late.length}</span>
          </div>
          <ul className="st-list">
            {late.map((i) => (
              <Row key={i.key} i={i} />
            ))}
          </ul>
        </article>
      )}

      {[...days.entries()].map(([d, list]) => (
        <article key={d} className="st-card" style={d === today ? { borderColor: "#0b0b0b" } : undefined}>
          <div className="st-card-head">
            <h2 style={{ textTransform: "capitalize" }}>{d === today ? `Hoje · ${weekday(d)}` : d === addDays(today, 1) ? `Amanhã · ${weekday(d)}` : weekday(d)}</h2>
            <span>{br(d)}</span>
          </div>
          <ul className="st-list">
            {list.map((i) => (
              <Row key={i.key} i={i} />
            ))}
          </ul>
        </article>
      ))}

      {!items.length && <p className="st-restricted">Nada agendado para os próximos 30 dias.</p>}
      {!!noDate.count && (
        <p className="st-hint">
          {noDate.count} tarefa(s) em aberto sem prazo não aparecem aqui. <Link href={`/studio/operacoes/tarefas${qs}`}>Ver no quadro</Link>
        </p>
      )}
    </>
  );
}
