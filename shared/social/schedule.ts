// Agendador: horários das regras semanais, fila de publicação, coleta de métricas e
// limites de uso. Funções puras (testáveis), usadas pelo worker e pelo web.

export type Rule = { id?: string; format: string; weekday: number; local_time: string; timezone: string; count: number; active?: boolean };

/** Diferença (ms) entre o horário local do fuso e UTC naquele instante. */
function tzOffsetMs(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/** Instante UTC de uma data/hora local (YYYY-MM-DD, HH:MM) num fuso. */
export function zonedTime(date: string, time: string, timeZone: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - tzOffsetMs(new Date(first), timeZone));
}

export function localDate(at: Date, timeZone: string) {
  return at.toLocaleDateString("sv-SE", { timeZone });
}

export function localWeekday(at: Date, timeZone: string) {
  const s = localDate(at, timeZone);
  return new Date(`${s}T12:00:00Z`).getUTCDay();
}

export type Slot = { at: Date; rule: Rule };

/** Slots das regras ativas entre [from, to). */
export function slotsBetween(rules: Rule[], from: Date, to: Date): Slot[] {
  const out: Slot[] = [];
  for (const rule of rules) {
    if (rule.active === false) continue;
    for (let t = from.getTime() - 864e5; t < to.getTime() + 864e5; t += 864e5) {
      const day = localDate(new Date(t), rule.timezone);
      if (localWeekday(new Date(t), rule.timezone) !== rule.weekday) continue;
      const at = zonedTime(day, rule.local_time.slice(0, 5), rule.timezone);
      if (at >= from && at < to) for (let i = 0; i < rule.count; i++) out.push({ at: new Date(at.getTime() + i * 5 * 60_000), rule });
    }
  }
  // remove duplicados (mesmo instante e regra)
  const seen = new Set<string>();
  return out
    .filter((s) => {
      const k = `${s.rule.id ?? s.rule.format}-${s.at.getTime()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Próxima semana (segunda a domingo seguinte) a partir de "now" no fuso. */
export function nextWeekRange(now: Date, timeZone = "America/Sao_Paulo") {
  const wd = localWeekday(now, timeZone);
  const daysToMonday = ((8 - wd) % 7) || 7;
  const monday = localDate(new Date(now.getTime() + daysToMonday * 864e5), timeZone);
  const from = zonedTime(monday, "00:00", timeZone);
  return { from, to: new Date(from.getTime() + 7 * 864e5) };
}

/** Próximo horário livre das regras (para "Aprovar → próximo horário livre"). */
export function nextFreeSlot(rules: Rule[], taken: Date[], now: Date, format?: string, minGapMs = 30 * 60_000) {
  const candidates = slotsBetween(
    rules.filter((r) => !format || r.format === format),
    new Date(now.getTime() + 10 * 60_000),
    new Date(now.getTime() + 60 * 864e5),
  );
  return candidates.find((c) => taken.every((t) => Math.abs(t.getTime() - c.at.getTime()) >= minGapMs))?.at ?? null;
}

// ---------------------------------------------------------------- publicação
export type QueuePost = { id: string; status: string; scheduled_at: string | null; require_review: boolean; approved_at: string | null; account_id: string | null };

/** Posts que podem publicar agora: aprovados/agendados com horário até agora + 2 min. Nunca sem aprovação quando a revisão é exigida. */
export function duePosts(posts: QueuePost[], now: Date, leadMs = 2 * 60_000) {
  return posts
    .filter((p) => (p.status === "approved" || p.status === "scheduled") && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now.getTime() + leadMs)
    .filter((p) => !p.require_review || Boolean(p.approved_at))
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
}

/** Espaça no mínimo 2 min entre publicações da mesma conta. */
export function spacingOk(lastPublishedAt: Date | null, now: Date, minMs = 2 * 60_000) {
  return !lastPublishedAt || now.getTime() - lastPublishedAt.getTime() >= minMs;
}

/** Folga de 10% na cota de publicação de 24 h (carrossel conta 1). */
export function withinQuota(used: number, total: number, needed = 1, margin = 0.1) {
  return used + needed <= Math.floor(total * (1 - margin));
}

/** Uso de API acima de 80% → adiar jobs. */
export function shouldDefer(usagePercent: number, threshold = 80) {
  return usagePercent >= threshold;
}

// ---------------------------------------------------------------- métricas
const H = 3600e3;
/** Coletas: 24 h, 72 h e 7 dias após publicar; depois semanal até 30 dias. */
export function metricCheckpoints(publishedAt: Date) {
  const t = publishedAt.getTime();
  const points = [24 * H, 72 * H, 7 * 24 * H, 14 * 24 * H, 21 * 24 * H, 28 * 24 * H, 30 * 24 * H];
  return points.map((p) => new Date(t + p));
}

export function metricsDue(publishedAt: Date, lastCollectedAt: Date | null, now: Date) {
  const due = metricCheckpoints(publishedAt).filter((c) => c <= now);
  if (!due.length) return false;
  const latest = due[due.length - 1];
  return !lastCollectedAt || lastCollectedAt < latest;
}

/** Tipos alternados: nunca dois iguais seguidos, respeitando o mix permitido. */
export function alternateTypes(count: number, mix: string[], previous?: string | null) {
  const pool = mix.length ? mix : ["ensino", "prova", "opiniao", "historia", "oferta"];
  const out: string[] = [];
  let last = previous ?? null;
  let i = Math.max(0, pool.indexOf(last ?? "") + 1);
  for (let n = 0; n < count; n++) {
    let t = pool[i % pool.length];
    if (pool.length > 1 && t === last) t = pool[++i % pool.length];
    out.push(t);
    last = t;
    i++;
  }
  return out;
}
