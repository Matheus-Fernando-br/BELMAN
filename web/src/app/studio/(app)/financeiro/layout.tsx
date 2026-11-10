import { requireStudio } from "@/lib/studio/session";
import { redirect } from "next/navigation";
import { FinanceTabs } from "./Tabs";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStudio();
  if (!ctx.canSeeFinance) redirect("/studio?erro=restrito");
  return (
    <>
      <FinanceTabs />
      {children}
    </>
  );
}
