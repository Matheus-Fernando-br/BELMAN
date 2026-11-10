import Link from "next/link";
import type { TxRow } from "@/lib/studio/finance";
import { formatCents } from "@/lib/studio/finance-math";
import { markPaid } from "./actions";

export function shortDate(date: string) {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

export function TxQuickList({ items, empty }: { items: TxRow[]; empty: string }) {
  if (!items.length) return <p className="st-hint">{empty}</p>;
  return (
    <ul className="st-list">
      {items.map((t) => (
        <li key={t.id}>
          <span className="st-dot" style={{ background: t.entity_color }} title={t.entity_name} aria-hidden="true" />
          <Link href={`/studio/financeiro/lancamentos/${t.id}`} className="st-grow" style={{ textDecoration: "none" }}>
            {t.description}
            <br />
            <small>
              {t.type === "income" ? "Receber" : "Pagar"} · {shortDate(t.due_date)} · {t.entity_name}
            </small>
          </Link>
          <strong style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatCents(t.amount_cents)}</strong>
          <form action={markPaid}>
            <input type="hidden" name="id" value={t.id} />
            <button type="submit" className="st-btn" data-variant="ghost" style={{ minHeight: "2rem", padding: "0.2rem 0.7rem", fontSize: "0.78rem" }}>
              {t.type === "income" ? "Recebido" : "Pago"}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
