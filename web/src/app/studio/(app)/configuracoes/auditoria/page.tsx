import type { Metadata } from "next";
import { requireAdmin } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Auditoria" };

const ACTION = { insert: "criou", update: "alterou", delete: "excluiu" } as const;
const TABLE: Record<string, string> = {
  entities: "produto/entidade",
  profiles: "usuário",
  user_entity_access: "acesso a produto",
  invitations: "convite",
};

function changed(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  if (!oldData || !newData) return "";
  return Object.keys(newData)
    .filter((k) => !["updated_at", "updated_by"].includes(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .join(", ");
}

export default async function AuditPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(100);

  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <caption className="visually-hidden">Últimas 100 alterações</caption>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Quem</th>
            <th scope="col">O quê</th>
            <th scope="col">Campos</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((row) => {
            const rec = (row.new_data ?? row.old_data ?? {}) as Record<string, unknown>;
            const label = (rec.name ?? rec.email ?? row.record_id) as string;
            return (
              <tr key={row.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {new Date(row.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                </td>
                <td>{row.actor_email ?? "sistema"}</td>
                <td>
                  {ACTION[row.action as keyof typeof ACTION]} {TABLE[row.table_name] ?? row.table_name} <strong>{label}</strong>
                </td>
                <td className="st-hint">{changed(row.old_data, row.new_data)}</td>
              </tr>
            );
          })}
          {!data?.length && (
            <tr>
              <td colSpan={4}>Nenhum registro ainda.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
