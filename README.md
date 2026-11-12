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

### Operações, Desenvolvimento e Vendas (Fases 2 e 3)

- **Operações** (`/studio/operacoes`): tarefas (kanban/lista), clientes, processos de onboarding por produto, reuniões.
- **Desenvolvimento** (`/studio/desenvolvimento`): backlog com anexos, versões com checklist de QA, projetos, infraestrutura e formulários públicos de feedback (`/feedback/<token>`, com anti-spam).
- **Vendas** (`/studio/vendas`): CRM/funil, contratos e indicadores (conversão, MRR adquirido, ticket, churn, LTV, CAC). "Concluir venda" cria cliente, contrato, contas a receber e onboarding de uma vez (`studio_win_lead`).
- Migrações [`0005`](web/supabase/migrations/0005_operations_dev.sql), [`0006`](web/supabase/migrations/0006_sales.sql) e [`0008`](web/supabase/migrations/0008_contract_cancel.sql).

## Redes Sociais (`/studio/social`)

Um workspace por produto (Obra Fácil, FINC e futuros), isolado: conta, marca, templates, fila, calendário, métricas e custo de IA.

```
web (Vercel)  ── server actions ──▶  Supabase (tabelas social_*, RLS por entidade)  ◀── fila ──  worker (Render, Docker)
 · cola token / conexão               studio_private.social_credentials (cifrado)               · Claude: só TEXTO estruturado
 · Tema → post, revisão               bucket privado social-media                                · Satori + resvg + sharp (imagens)
 · calendário, regras, publicados                                                               · Remotion + FFmpeg (vídeo)
                                                                                                 · Piper (voz) · whisper.cpp (legendas)
                                                                                                 · agendador 1/min: publicar, renovar
                                                                                                   tokens, métricas, plano semanal
```

- **Banco:** [`0009_social.sql`](web/supabase/migrations/0009_social.sql). Credenciais e app secrets ficam cifrados (AES-256-GCM, `SOCIAL_ENC_KEY`) no schema `studio_private`, sem acesso do navegador; o servidor e o worker usam funções restritas à service role. Auditoria sem segredos (`studio.audit_redacted`). O navegador não consegue marcar post como publicado nem aprovar em nome de outra pessoa.
- **Código compartilhado:** [`shared/social`](shared/social) (cripto, cliente da Graph API, lint de legenda, regras de mídia, agendador) e [`shared/social-templates`](shared/social-templates) (templates de arte), usados pelo web e pelo worker.
- **Worker:** [`worker/`](worker) (Node 22 + TypeScript via `tsx`, [`Dockerfile`](worker/Dockerfile)). Fila com `FOR UPDATE SKIP LOCKED` (`social_claim_jobs`), 1 job pesado + `WORKER_CONCURRENCY` leves, retry com backoff e erro legível no post.
- **Só APIs oficiais da Meta.** Nada de curtir, seguir, comentar em perfis de terceiros, DM em massa, login ou scraping no instagram.com. Nome, bio, site e foto do perfil são somente leitura na API: o "Assistente de perfil" guia a troca manual e confere a cada 6 h.
- **Revisão humana por padrão.** Publicar sem revisão só se for desligado explicitamente numa regra semanal.
- **Custo de IA:** Claude escreve só o texto (modelo por workspace, padrão `claude-opus-5-5`, com fallback do servidor ativado e cache de prompt). Editar texto re-renderiza sem IA; lint local com no máximo 1 correção. Gasto mensal em Publicados (admin) e lançado no Financeiro todo dia 1 (IA + worker, com rateio por produto).
- **Licença do Remotion:** gratuita para pessoas físicas e empresas com até 3 funcionários; acima disso, é preciso a licença de empresa (remotion.pro).
- **Limites do plano grátis do Supabase:** arquivos de até 50 MB (vídeos enviados até 50 MB).

| Onde | Variável | Descrição |
| --- | --- | --- |
| Vercel | `SOCIAL_ENC_KEY` | **Secreta.** 32 bytes em base64 (`openssl rand -base64 32`). A MESMA no worker. |
| Worker | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Acesso ao banco (service role). |
| Worker | `SOCIAL_ENC_KEY` | Igual à da Vercel. |
| Worker | `ANTHROPIC_API_KEY` | Chave da API da Anthropic (geração de texto). |
| Worker | `WORKER_CONCURRENCY` | Jobs leves em paralelo (padrão 3). |
| Worker | `SOCIAL_VIDEO` | `1` liga Reels/vinhetas por Remotion (use o plano Standard). |
| Worker | `TZ` | `America/Sao_Paulo`. |
| Worker | `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` | Opcional: alertas (token vencendo, falha de publicação) no mesmo bot do contato. |
| Worker | `USD_BRL`, `WORKER_MONTHLY_USD` | Opcional: câmbio e custo mensal do worker para o lançamento no Financeiro. |

**Checklist de teste com a conta real (Obra Fácil):**
1. Configurações → Meta: App ID e App Secret do app "Bellman Studio".
2. Redes Sociais → Obra Fácil → Conexão: cole o token (`EAA…` ou, melhor, de System User) → Conectar.
3. Criar: tema → Gerar (texto → artes → pronto para revisão).
4. Revisão: confira, edite se precisar, Aprovar → data e hora daqui a 5 min.
5. Em até 1 min do horário, o post aparece como Publicado com o link.
6. Métricas em 24 h (Publicados).
