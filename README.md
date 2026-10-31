# Bellman

Site institucional da **Bellman** — *Technology meets business.* Apresenta a empresa e o seu ecossistema de produtos, **FINC** (gestão financeira e fiscal) e **Obra Fácil** (gestão para a construção civil), com formulário de contato entregue no Telegram.

| Parte | Pasta | Tecnologia | Hospedagem |
| --- | --- | --- | --- |
| Site | [`web/`](web) | Next.js 16 (App Router), React 19, TypeScript, CSS Modules | Vercel |
| API | [`api/`](api) | Node.js 22, Express 5, Zod | Render |

```text
Navegador ──POST /api/contact──▶ API Bellman (Render) ──▶ Telegram Bot API
                                        │
                                        └─(fallback)─▶ relay do portfólio (/api/send-message) ──▶ Telegram
```

O contato usa o mesmo bot do Telegram da Dev Zone. O token existe **somente** no backend; o site recebe apenas a URL pública da API.

## Rodar localmente

```bash
cd api && cp .env.example .env && npm install && npm run dev   # http://localhost:3001/api/health
cd web && cp .env.example .env.local && npm install && npm run dev  # http://localhost:3000
```

Verificações (também rodam no CI): `api: npm test` · `web: npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Variáveis de ambiente

**API (Render):** `ALLOWED_ORIGINS` (domínios do site, separados por vírgula), `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID` (envio direto, os mesmos da Dev Zone) ou `CONTACT_RELAY_URL` (relay que já possui as credenciais), `NODE_ENV=production`. O modo ativo aparece em `GET /api/health`.

**Site (Vercel):** `NEXT_PUBLIC_API_URL` (URL pública da API) e, opcionalmente, `NEXT_PUBLIC_SITE_URL`.

## Identidade visual

- Logo e assinatura "a project by bellman" vetorizados dos arquivos oficiais ([`web/src/lib/logo-paths.ts`](web/src/lib/logo-paths.ts)); o símbolo de rede é desenhado em SVG ([`Logo.tsx`](web/src/components/Logo.tsx)).
- Abertura animada e hero recriam o vídeo da marca: os nós surgem, as conexões se desenham e o wordmark entra em foco.
- Paleta monocromática (`#000000`, `#FFFFFF`, `#F5F5F5`, `#222222`, `#777777`, `#E5E5E5`), Manrope nos títulos e Inter no texto, tokens em [`globals.css`](web/src/app/globals.css).
- Animações respeitam `prefers-reduced-motion`; o conteúdo continua visível sem JavaScript.
