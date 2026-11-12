import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STAGE, label } from "./records";
import type { DashboardData } from "./sample-data";

// Dados reais das Fases 2 a 5 para o Dashboard: tarefas, funil, desenvolvimento,
// entregas, conteúdo das redes sociais e alertas.

const TZ = "America/Sao_Paulo";
const dm = (d: string) => d.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

export async function liveDashboard(scopeIds: string[], slugOf: Map<string, string>, now = new Date()) {
  const supabase = await createClient();
  const today = now.toLocaleDateString("sv-SE", { timeZone: TZ });
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = new Date(Date.parse(`${today}T03:00:00Z`) - ((wd + 6) % 7) * 864e5).toISOString();
  const weekEnd = new Date(Date.parse(weekStart) + 7 * 864e5).toISOString();
  const in30 = new Date(now.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const stale = new Date(now.getTime() - 15 * 60_000).toISOString();

  const [tasks, leads, backlog, releases, posts, accounts, jobs] = await Promise.all([
    supabase.from("tasks").select("title,entity_id,due_date,status").in("entity_id", scopeIds).neq("status", "done").order("due_date", { ascending: true, nullsFirst: false }).limit(8),
    supabase.from("leads").select("stage,entity_id").in("entity_id", scopeIds),
    supabase.from("backlog_items").select("title,entity_id,type,status,severity,created_at").in("entity_id", scopeIds).not("status", "in", "(done,wont_do)"),
    supabase.from("releases").select("version,entity_id,target_date,status").in("entity_id", scopeIds).neq("status", "released").gte("target_date", today).lte("target_date", in30).order("target_date"),
    supabase.from("social_posts").select("status,entity_id,scheduled_at,published_at,error,theme").in("entity_id", scopeIds).or(`status.in.(review,failed),and(scheduled_at.gte.${weekStart},scheduled_at.lt.${weekEnd}),and(published_at.gte.${weekStart},published_at.lt.${weekEnd})`),
    supabase.from("social_accounts").select("entity_id,username,status,token_expires_at").in("entity_id", scopeIds),
    supabase.from("social_jobs").select("id").in("entity_id", scopeIds).eq("status", "queued").lt("run_at", stale).limit(1),
  ]);
  const slug = (id: string) => slugOf.get(id) ?? "";
  const L = leads.data ?? [];
  const order = LEAD_STAGE.filter(([s]) => s !== "lost").map(([s]) => s);
  const funnel = order.map((stage, i) => ({ stage: label(LEAD_STAGE, stage), count: L.filter((l) => l.stage !== "lost" && order.indexOf(l.stage) >= i).length }));
  const won = L.filter((l) => l.stage === "won").length;
  const lost = L.filter((l) => l.stage === "lost").length;
  const B = backlog.data ?? [];
  const P = posts.data ?? [];
  const inWeek = (iso?: string | null) => Boolean(iso && iso >= weekStart && iso < weekEnd);

  const alerts: DashboardData["alerts"] = [];
  for (const a of accounts.data ?? []) {
    if (a.status === "expired") alerts.push({ tone: "bad", text: `Token do Instagram expirado (@${a.username})`, entity: slug(a.entity_id) });
    else if (a.status === "expiring") alerts.push({ tone: "warn", text: `Token do Instagram vence em ${a.token_expires_at ? dm(a.token_expires_at) : "breve"} (@${a.username})`, entity: slug(a.entity_id) });
    else if (a.status === "error") alerts.push({ tone: "warn", text: `Conexão do Instagram com erro (@${a.username})`, entity: slug(a.entity_id) });
  }
  const failed = P.filter((p) => p.status === "failed");
  if (failed.length) alerts.push({ tone: "bad", text: `${failed.length} post(s) com falha de publicação`, entity: slug(failed[0].entity_id) });
  const review = P.filter((p) => p.status === "review");
  if (review.length) alerts.push({ tone: "warn", text: `${review.length} post(s) aguardando revisão`, entity: slug(review[0].entity_id) });
  if (jobs.data?.length) alerts.push({ tone: "bad", text: "Automação das redes sociais parada há mais de 15 min", entity: "" });
  const critical = B.filter((b) => b.type === "bug" && b.severity === "critical");
  if (critical.length) alerts.push({ tone: "bad", text: `${critical.length} bug(s) crítico(s) em aberto`, entity: slug(critical[0].entity_id) });
  const lateTasks = (tasks.data ?? []).filter((t) => t.due_date && t.due_date < today);
  if (lateTasks.length) alerts.push({ tone: "warn", text: `${lateTasks.length} tarefa(s) atrasada(s)`, entity: slug(lateTasks[0].entity_id) });

  return {
    funnel,
    conversion: won + lost ? won / (won + lost) : 0,
    tasks: (tasks.data ?? []).map((t) => ({ title: t.title, entity: slug(t.entity_id), due: t.due_date ? dm(t.due_date) : "—", late: Boolean(t.due_date && t.due_date < today) })),
    features: B.filter((b) => b.type !== "bug" && ["in_progress", "testing"].includes(b.status)).map((b) => ({ title: b.title, entity: slug(b.entity_id), status: b.status === "testing" ? "Em testes" : "Em desenvolvimento" })),
    bugs: B.filter((b) => b.type === "bug" && (b.severity === "critical" || b.severity === "high")).map((b) => ({ title: b.title, entity: slug(b.entity_id), severity: b.severity === "critical" ? ("crítico" as const) : ("alto" as const) })),
    deliveries: (releases.data ?? []).map((r) => ({ title: `Versão ${r.version}`, entity: slug(r.entity_id), date: dm(r.target_date) })),
    content: {
      week: P.filter((p) => ["approved", "scheduled", "publishing"].includes(p.status) && inWeek(p.scheduled_at)).length,
      awaiting: review.length,
      published: P.filter((p) => p.status === "published" && inWeek(p.published_at)).length,
    },
    alerts,
  } satisfies Partial<DashboardData>;
}
