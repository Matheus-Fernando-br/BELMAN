import type { Metadata } from "next";
import { FORMATS, formatLabel, POST_TYPES, typeLabel, WEEKDAYS } from "@/lib/social/labels";
import { requireWorkspace } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { deleteRule, planWeekNow, saveRule, toggleRule } from "../../actions";
import { StateForm } from "../../ui";

export const metadata: Metadata = { title: "Regras · Redes Sociais" };

export default async function RulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const [{ data: rules }, { data: plan }] = await Promise.all([
    supabase.from("content_rules").select("*").eq("entity_id", entity.id).order("weekday").order("local_time"),
    supabase.from("social_jobs").select("status,updated_at,last_error,payload").eq("entity_id", entity.id).eq("kind", "plan_week").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const Toggle = ({ id, field, value, label }: { id: string; field: string; value: boolean; label: string }) => (
    <form action={toggleRule.bind(null, slug)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(!value)} />
      <button type="submit" className="st-status" data-tone={value ? "ok" : "neutral"} disabled={!ctx.canWrite} style={{ cursor: "pointer", border: 0 }} title={`Clique para ${value ? "desligar" : "ligar"}`}>
        {label}: {value ? "sim" : "não"}
      </button>
    </form>
  );
  const summary = WEEKDAYS.map((d, i) => {
    const r = (rules ?? []).filter((x) => x.active && x.weekday === i);
    return r.length ? `${d}: ${r.map((x) => `${x.count}× ${formatLabel(x.format)} ${x.local_time.slice(0, 5)}`).join(", ")}` : null;
  }).filter(Boolean);
  return (
    <div className="st-grid" data-cols="2-1">
      <section className="st-grid">
        <article className="st-card">
          <h2>Regras semanais</h2>
          {summary.length ? <p className="st-hint">{summary.join(" · ")}</p> : <p className="st-hint">Nenhuma regra ativa.</p>}
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Formato</th>
                  <th scope="col">Tipos</th>
                  <th scope="col">Opções</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {(rules ?? []).map((r) => (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                    <th scope="row">
                      {WEEKDAYS[r.weekday]} {r.local_time.slice(0, 5)}
                    </th>
                    <td>
                      {r.count}× {formatLabel(r.format)}
                    </td>
                    <td>{r.mix_types.map(typeLabel).join(", ")}</td>
                    <td>
                      <div className="st-actions" style={{ gap: "0.3rem" }}>
                        <Toggle id={r.id} field="active" value={r.active} label="Ativa" />
                        <Toggle id={r.id} field="auto_generate" value={r.auto_generate} label="Gerar sozinho" />
                        <Toggle id={r.id} field="require_review" value={r.require_review} label="Exige revisão" />
                      </div>
                    </td>
                    <td>
                      {ctx.canWrite && (
                        <form action={deleteRule.bind(null, slug)}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton variant="danger" pendingLabel="…">
                            Excluir
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="st-hint">
            “Exige revisão” vem ligado: nada é publicado sem alguém aprovar. Desligar faz os posts gerados por esta regra publicarem sozinhos no horário.
          </p>
        </article>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>Nova regra</h2>
            <StateForm action={saveRule.bind(null, slug)} submit="Adicionar regra">
              <div className="st-row">
                <div className="st-field">
                  <label htmlFor="format">Formato</label>
                  <select id="format" name="format" className="st-input" defaultValue="carousel">
                    {FORMATS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="st-field">
                  <label htmlFor="local_time">Horário (São Paulo)</label>
                  <input id="local_time" name="local_time" type="time" defaultValue="19:00" className="st-input" />
                </div>
                <div className="st-field">
                  <label htmlFor="count">Quantidade por dia</label>
                  <input id="count" name="count" type="number" min={1} max={10} defaultValue={1} className="st-input" />
                </div>
              </div>
              <fieldset className="st-field" style={{ border: 0, padding: 0 }}>
                <legend>Dias</legend>
                <div className="st-actions">
                  {WEEKDAYS.map((d, i) => (
                    <label key={d} className="st-check">
                      <input type="checkbox" name="weekday" value={i} /> {d.slice(0, 3)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="st-field" style={{ border: 0, padding: 0 }}>
                <legend>Mistura de tipos</legend>
                <div className="st-actions">
                  {POST_TYPES.map(([v, l]) => (
                    <label key={v} className="st-check">
                      <input type="checkbox" name="mix_types" value={v} defaultChecked /> {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="st-check">
                <input type="checkbox" name="auto_generate" /> Gerar sozinho toda semana (domingo 18h)
              </label>
              <label className="st-check">
                <input type="checkbox" name="require_review" value="off" /> Publicar SEM revisão (não recomendado)
              </label>
            </StateForm>
          </article>
        )}
      </section>
      <aside className="st-grid">
        <article className="st-card">
          <h2>Planejar a semana</h2>
          <p className="st-hint">
            Todo domingo às 18h o worker gera os temas da semana seguinte para as regras com “Gerar sozinho”, alternando os tipos e sem repetir temas. Os posts aparecem na Revisão.
          </p>
          {plan && (
            <p className="st-hint">
              Último planejamento: {plan.status}
              {plan.last_error ? ` · ${plan.last_error}` : ""}
            </p>
          )}
          {ctx.canWrite && (
            <StateForm action={planWeekNow.bind(null, slug)} submit="Planejar a próxima semana agora" pending="Enfileirando…" variant="ghost" />
          )}
        </article>
      </aside>
    </div>
  );
}
