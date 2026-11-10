import type { Metadata } from "next";
import "./studio.css";

export const metadata: Metadata = {
  title: { default: "Bellman Studio", template: "%s · Bellman Studio" },
  description: "Central de gestão da Bellman e dos produtos do ecossistema.",
  robots: { index: false, follow: false, nocache: true },
};

export default function StudioRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="st-body">{children}</div>;
}
