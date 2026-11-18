// Remonta a cada navegação: cada tela entra com um movimento suave (ver .st-page em studio.css).
export default function StudioTemplate({ children }: { children: React.ReactNode }) {
  return <div className="st-page">{children}</div>;
}
