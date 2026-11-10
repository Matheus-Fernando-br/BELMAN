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

## Bellman Studio (`/studio`)

Central de gestão da holding e dos produtos. Acesso pelo link "Bellman Studio" no rodapé; não existe cadastro público.

- **Código:** `web/src/app/studio` (telas), `web/src/proxy.ts` (protege `/studio`), `web/src/lib/studio` (sessão, permissões, filtro).
- **Banco:** Supabase (projeto `BELLMAN STUDIO`). Migrações em [`web/supabase/migrations`](web/supabase/migrations). Toda tabela tem RLS; papéis `admin` (Sócio/Admin), `collaborator` e `viewer`, com acesso opcional limitado por produto; auditoria automática em `audit_log`.
- **Produtos** vêm da tabela `entities`: um produto novo é cadastrado em Configurações, sem mudar código.
- **Segurança:** login só no servidor (cookies httpOnly), sessão de 12 h, 2FA (TOTP) opcional, bloqueio de 15 min após 5 senhas erradas, senha forte obrigatória.

| Variável (Vercel) | Descrição |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública do Supabase |
| `SUPABASE_SECRET_KEY` | **Secreta.** Necessária só para enviar convites pelo Studio. Cadastre como *Sensitive* na Vercel. |

### Financeiro (Fase 1)

`/studio/financeiro` (somente Sócio/Admin): visão geral, lançamentos (contas a pagar e a receber com previsto x realizado, comprovante até 4 MB), fluxo de caixa com saldo projetado, resultados por produto com rateio, orçamento por categoria, recorrentes (geram lançamentos previstos para 6 meses), aportes dos sócios e planejamento (burn rate, runway, margem, ponto de equilíbrio, cenários). Categorias, contas e regras de rateio ficam em Configurações → Financeiro. Valores em centavos; regras de acesso e auditoria no banco ([`0002_finance.sql`](web/supabase/migrations/0002_finance.sql)).

### Integração com os produtos (somente leitura)

O Studio lê métricas e pagamentos dos produtos por um canal **assinado e cifrado** ([`product-link.ts`](web/src/lib/studio/product-link.ts), mesmo protocolo de `backend/src/services/studioLink.js` do Obra Fácil): HMAC-SHA256 com chaves derivadas (HKDF) de um segredo que nunca trafega, anti-replay (horário + nonce) e resposta em AES-256-GCM amarrada ao pedido. Só agregados e códigos pseudônimos; nenhum dado pessoal.

- Sincroniza todo dia às 6h (Vercel Cron → `/api/studio/sync`, protegido por `CRON_SECRET`) e pelo botão "Sincronizar agora" na página do produto.
- Pagamentos aprovados viram receita realizada no Financeiro (idempotente por `external_ref`; estornos cancelam o lançamento).
- Segredos por produto: `STUDIO_SECRET_<SLUG>` (ex.: `STUDIO_SECRET_OBRA_FACIL`), só na Vercel, marcados como *Sensitive*.
