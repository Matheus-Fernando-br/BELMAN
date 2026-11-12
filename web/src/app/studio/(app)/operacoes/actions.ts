"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/;

export async function toggleOnboardingItem(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const id = String(form.get("run_id"));
  const index = Number(form.get("index"));
  if (!UUID.test(id) || !Number.isInteger(index)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("onboarding_runs").select("items").eq("id", id).single();
  if (!data) return;
  const items = (data.items as { label: string; done: boolean; done_at?: string | null }[]).map((it, i) =>
    i === index ? { ...it, done: !it.done, done_at: !it.done ? new Date().toISOString() : null } : it,
  );
  const complete = items.length > 0 && items.every((i) => i.done);
  await supabase.from("onboarding_runs").update({ items, completed_at: complete ? new Date().toISOString() : null }).eq("id", id);
  if (complete) {
    const { data: run } = await supabase.from("onboarding_runs").select("customer_id").eq("id", id).single();
    if (run) await supabase.from("customers").update({ status: "active" }).eq("id", run.customer_id).eq("status", "onboarding");
  }
  revalidatePath("/studio", "layout");
}

export async function startOnboarding(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const customerId = String(form.get("customer_id"));
  const templateId = String(form.get("template_id"));
  if (!UUID.test(customerId) || !UUID.test(templateId)) return;
  const supabase = await createClient();
  const [{ data: c }, { data: t }] = await Promise.all([
    supabase.from("customers").select("entity_id").eq("id", customerId).single(),
    supabase.from("onboarding_templates").select("items").eq("id", templateId).single(),
  ]);
  if (!c || !t) return;
  await supabase.from("onboarding_runs").insert({
    entity_id: c.entity_id,
    customer_id: customerId,
    template_id: templateId,
    items: (t.items as string[]).map((label) => ({ label, done: false })),
  });
  revalidatePath("/studio", "layout");
}

export async function saveTemplate(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const id = String(form.get("id"));
  const items = String(form.get("items") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!UUID.test(id) || !items.length) return;
  const supabase = await createClient();
  await supabase.from("onboarding_templates").update({ items }).eq("id", id);
  revalidatePath("/studio", "layout");
}
