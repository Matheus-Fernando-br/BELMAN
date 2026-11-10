import { requireStudio } from "@/lib/studio/session";
import { SettingsTabs } from "./Tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStudio();
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Configurações do Studio</p>
          <h1>Configurações</h1>
        </div>
      </div>
      <SettingsTabs isAdmin={ctx.isAdmin} />
      {children}
    </>
  );
}
