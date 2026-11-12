import type { Metadata } from "next";
import Link from "next/link";
import { slotsBetween, zonedTime, type Rule } from "@shared/social/schedule";
import { formatLabel, statusLabel, statusTone } from "@/lib/social/labels";
import { requireWorkspace } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { reschedule } from "../../actions";
import { DragCalendar } from "../../ui";

export const metadata: Metadata = { title: "Calendário · Redes Sociais" };

const TZ = "America/Sao_Paulo";
const local = (iso: string) => {
  const d = new Date(iso);
  return { day: d.toLocaleDateString("sv-SE", { timeZone: TZ }), time: d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) };
};

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { ctx, entity } = await requireWorkspace(slug);
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : todayStr.slice(0, 7);
  const week = sp.ver === "semana";
  const [y, m] = month.split("-").map(Number);
  // grade: semanas completas (domingo a sábado)
  let start: Date;
  let days: number;
  if (week) {
    const t = new Date(`${todayStr}T12:00:00Z`);
    start = new Date(t.getTime() - t.getUTCDay() * 864e5);
    days = 7;
  } else {
    const first = new Date(Date.UTC(y, m - 1, 1, 12));
    start = new Date(first.getTime() - first.getUTCDay() * 864e5);
    const last = new Date(Date.UTC(y, m, 0, 12));
    days = Math.ceil((last.getTime() - start.getTime()) / 864e5 / 7 + 0.0001) * 7;
  }
  const dayList = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10));
  const weeks = Array.from({ length: days / 7 }, (_, w) => dayList.slice(w * 7, w * 7 + 7));
  const from = zonedTime(dayList[0], "00:00", TZ);
  const to = new Date(zonedTime(dayList.at(-1)!, "00:00", TZ).getTime() + 864e5);
  const supabase = await createClient();
  const [{ data: posts }, { data: rules }] = await Promise.all([
    supabase
      .from("social_posts")
      .select("id,theme,format,status,scheduled_at,published_at")
      .eq("entity_id", entity.id)
      .neq("status", "rejected")
      .or(`and(scheduled_at.gte.${from.toISOString()},scheduled_at.lt.${to.toISOString()}),and(published_at.gte.${from.toISOString()},published_at.lt.${to.toISOString()})`),
    supabase.from("content_rules").select("*").eq("entity_id", entity.id).eq("active", true),
  ]);
  const items = (posts ?? []).map((p) => {
    const when = local(p.published_at ?? p.scheduled_at);
    return {
      id: p.id,
      ...when,
      title: `${formatLabel(p.format)} · ${p.theme ?? statusLabel(p.status)}`,
      status: p.status,
      tone: statusTone(p.status),
      href: `/studio/social/${slug}/post/${p.id}`,
      movable: ["approved", "scheduled"].includes(p.status),
    };
  });
  // slots vazios das regras viram "criar post aqui"
  const empty = slotsBetween((rules ?? []) as Rule[], from, to)
    .map((s) => ({ ...local(s.at.toISOString()), format: s.rule.format }))
    .filter((s) => !items.some((p) => p.day === s.day));
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <div className="st-actions" style={{ margin: "1rem 0" }}>
        {!week && (
          <>
            <Link className="st-btn" data-variant="ghost" href={`?mes=${prev}`} aria-label="Mês anterior">
              ‹
            </Link>
            <strong style={{ textTransform: "capitalize" }}>{name}</strong>
            <Link className="st-btn" data-variant="ghost" href={`?mes=${next}`} aria-label="Próximo mês">
              ›
            </Link>
          </>
        )}
        <Link className="st-tag" aria-current={!week ? "true" : undefined} href="?">
          Mês
        </Link>
        <Link className="st-tag" aria-current={week ? "true" : undefined} href="?ver=semana">
          Semana
        </Link>
        <span className="st-hint" style={{ marginLeft: "auto" }}>
          Arraste um post aprovado para outro dia para reagendar. Dias com regra e sem post mostram “+”.
        </span>
      </div>
      <DragCalendar
        weeks={weeks}
        posts={[
          ...items,
          ...empty.map((s, i) => ({
            id: `slot-${i}`,
            day: s.day,
            time: s.time,
            title: `Livre · ${formatLabel(s.format)}`,
            status: "slot",
            tone: "neutral",
            href: `/studio/social/${slug}/criar?dia=${s.day}`,
            movable: false,
          })),
        ]}
        canWrite={ctx.canWrite}
        newHref={`/studio/social/${slug}/criar`}
        onMove={async (id: string, day: string, time: string) => {
          "use server";
          return reschedule(slug, id, zonedTime(day, time, TZ).toISOString());
        }}
      />
    </>
  );
}
