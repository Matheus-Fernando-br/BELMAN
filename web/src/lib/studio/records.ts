// Definição única dos registros de Operações, Desenvolvimento e Vendas.
// O formulário (cliente) e a validação (servidor) usam esta mesma descrição.

export type Option = readonly [value: string, label: string];

export type FieldDef = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "date" | "select" | "money" | "int" | "bool" | "entity" | "ref" | "email" | "url";
  required?: boolean;
  max?: number;
  options?: readonly Option[];
  ref?: "profiles" | "projects" | "customers" | "releases" | "campaigns";
  hint?: string;
  wide?: boolean;
  placeholder?: string;
};

export type RecordDef = {
  table: string;
  label: string;
  fields: FieldDef[];
  quick?: string[]; // campos que podem ser alterados direto da lista/quadro
};

export const PRIORITY: readonly Option[] = [
  ["low", "Baixa"],
  ["medium", "Média"],
  ["high", "Alta"],
  ["urgent", "Urgente"],
];
export const TASK_STATUS: readonly Option[] = [
  ["todo", "A fazer"],
  ["doing", "Em andamento"],
  ["review", "Em revisão"],
  ["done", "Concluída"],
];
export const CUSTOMER_STATUS: readonly Option[] = [
  ["onboarding", "Em implantação"],
  ["active", "Ativo"],
  ["paused", "Pausado"],
  ["churned", "Cancelado"],
  ["lead", "Prospect"],
];
export const BACKLOG_TYPE: readonly Option[] = [
  ["feature", "Funcionalidade"],
  ["improvement", "Melhoria"],
  ["bug", "Bug"],
  ["chore", "Técnico"],
];
export const BACKLOG_STATUS: readonly Option[] = [
  ["new", "Novo"],
  ["triaged", "Priorizado"],
  ["in_progress", "Em desenvolvimento"],
  ["testing", "Em testes"],
  ["done", "Entregue"],
  ["wont_do", "Não será feito"],
];
export const SEVERITY: readonly Option[] = [
  ["low", "Baixa"],
  ["medium", "Média"],
  ["high", "Alta"],
  ["critical", "Crítica"],
];
export const PROJECT_STATUS: readonly Option[] = [
  ["planned", "Planejado"],
  ["active", "Em andamento"],
  ["paused", "Pausado"],
  ["done", "Concluído"],
];
export const RELEASE_STATUS: readonly Option[] = [
  ["planned", "Planejada"],
  ["in_progress", "Em desenvolvimento"],
  ["testing", "Em homologação"],
  ["approved", "Aprovada"],
  ["released", "Publicada"],
];
export const LEAD_STAGE: readonly Option[] = [
  ["new", "Lead recebido"],
  ["qualification", "Qualificação"],
  ["presentation", "Apresentação"],
  ["proposal", "Proposta enviada"],
  ["negotiation", "Negociação"],
  ["won", "Venda concluída"],
  ["lost", "Perdida"],
];
export const LEAD_SOURCE: readonly Option[] = [
  ["instagram", "Instagram"],
  ["indicacao", "Indicação"],
  ["site", "Site"],
  ["anuncio", "Anúncio pago"],
  ["parceria", "Parceria"],
  ["evento", "Evento"],
  ["whatsapp", "WhatsApp"],
  ["outro", "Outro"],
];
export const CAMPAIGN_CHANNEL: readonly Option[] = [
  ["instagram", "Instagram"],
  ["anuncio", "Anúncio pago"],
  ["indicacao", "Indicação"],
  ["parceria", "Parceria"],
  ["email", "E-mail"],
  ["evento", "Evento"],
  ["outro", "Outro"],
];

export const label = (options: readonly Option[], value: string | null | undefined) => options.find((o) => o[0] === value)?.[1] ?? value ?? "—";

export const RECORDS = {
  tasks: {
    table: "tasks",
    label: "Tarefa",
    quick: ["status", "priority", "assignee_id"],
    fields: [
      { name: "title", label: "Tarefa", kind: "text", required: true, max: 160, wide: true },
      { name: "entity_id", label: "Entidade", kind: "entity", required: true },
      { name: "status", label: "Situação", kind: "select", options: TASK_STATUS, required: true },
      { name: "priority", label: "Prioridade", kind: "select", options: PRIORITY, required: true },
      { name: "assignee_id", label: "Responsável", kind: "ref", ref: "profiles" },
      { name: "due_date", label: "Prazo", kind: "date" },
      { name: "project_id", label: "Projeto", kind: "ref", ref: "projects" },
      { name: "customer_id", label: "Cliente", kind: "ref", ref: "customers" },
      { name: "description", label: "Detalhes", kind: "textarea", max: 4000, wide: true },
    ],
  },
  customers: {
    table: "customers",
    label: "Cliente",
    quick: ["status"],
    fields: [
      { name: "name", label: "Empresa ou nome", kind: "text", required: true, max: 140 },
      { name: "entity_id", label: "Produto contratado", kind: "entity", required: true },
      { name: "status", label: "Situação da conta", kind: "select", options: CUSTOMER_STATUS, required: true },
      { name: "plan", label: "Plano", kind: "text", max: 60 },
      { name: "mrr_cents", label: "Mensalidade (R$)", kind: "money" },
      { name: "started_at", label: "Cliente desde", kind: "date" },
      { name: "contact_name", label: "Contato", kind: "text", max: 120 },
      { name: "email", label: "E-mail", kind: "email", max: 160 },
      { name: "phone", label: "Telefone/WhatsApp", kind: "text", max: 40 },
      { name: "document", label: "CPF/CNPJ", kind: "text", max: 20 },
      { name: "notes", label: "Observações", kind: "textarea", max: 4000, wide: true },
    ],
  },
  wiki_pages: {
    table: "wiki_pages",
    label: "Página",
    fields: [
      { name: "title", label: "Título", kind: "text", required: true, max: 140 },
      { name: "entity_id", label: "Entidade", kind: "entity", required: true },
      { name: "category", label: "Categoria", kind: "text", max: 60, placeholder: "Processos, Atendimento, Financeiro…" },
      { name: "body", label: "Conteúdo", kind: "textarea", max: 50000, wide: true, hint: "Passo a passo, links e responsáveis. Linhas em branco separam parágrafos." },
    ],
  },
  meetings: {
    table: "meetings",
    label: "Reunião",
    fields: [
      { name: "title", label: "Assunto", kind: "text", required: true, max: 140 },
      { name: "entity_id", label: "Entidade", kind: "entity", required: true },
      { name: "held_at", label: "Data", kind: "date", required: true },
      { name: "attendees", label: "Participantes", kind: "text", max: 300 },
      { name: "notes", label: "Ata", kind: "textarea", max: 20000, wide: true },
      { name: "decisions", label: "Decisões", kind: "textarea", max: 10000, wide: true, hint: "Uma decisão por linha." },
    ],
  },
  projects: {
    table: "projects",
    label: "Projeto",
    quick: ["status"],
    fields: [
      { name: "name", label: "Projeto", kind: "text", required: true, max: 120 },
      { name: "entity_id", label: "Entidade", kind: "entity", required: true },
      { name: "status", label: "Situação", kind: "select", options: PROJECT_STATUS, required: true },
      { name: "owner_id", label: "Responsável", kind: "ref", ref: "profiles" },
      { name: "start_date", label: "Início", kind: "date" },
      { name: "due_date", label: "Prazo", kind: "date" },
      { name: "description", label: "Objetivo e etapas", kind: "textarea", max: 8000, wide: true },
    ],
  },
  releases: {
    table: "releases",
    label: "Versão",
    quick: ["status"],
    fields: [
      { name: "version", label: "Versão", kind: "text", required: true, max: 30, placeholder: "1.2.0" },
      { name: "entity_id", label: "Produto", kind: "entity", required: true },
      { name: "title", label: "Nome/tema", kind: "text", max: 120 },
      { name: "status", label: "Situação", kind: "select", options: RELEASE_STATUS, required: true },
      { name: "target_date", label: "Previsão", kind: "date" },
      { name: "released_at", label: "Publicada em", kind: "date" },
      { name: "notes", label: "Notas da versão", kind: "textarea", max: 10000, wide: true },
    ],
  },
  backlog_items: {
    table: "backlog_items",
    label: "Item",
    quick: ["status", "priority", "release_id"],
    fields: [
      { name: "title", label: "Título", kind: "text", required: true, max: 160, wide: true },
      { name: "entity_id", label: "Produto", kind: "entity", required: true },
      { name: "type", label: "Tipo", kind: "select", options: BACKLOG_TYPE, required: true },
      { name: "status", label: "Situação", kind: "select", options: BACKLOG_STATUS, required: true },
      { name: "priority", label: "Prioridade", kind: "select", options: PRIORITY, required: true },
      { name: "severity", label: "Gravidade (bugs)", kind: "select", options: SEVERITY },
      { name: "release_id", label: "Versão", kind: "ref", ref: "releases" },
      { name: "project_id", label: "Projeto", kind: "ref", ref: "projects" },
      { name: "assignee_id", label: "Responsável", kind: "ref", ref: "profiles" },
      { name: "description", label: "Descrição", kind: "textarea", max: 8000, wide: true },
      { name: "steps_to_reproduce", label: "Como reproduzir", kind: "textarea", max: 8000, wide: true, hint: "Passo a passo, aparelho, versão do app e o que era esperado." },
      { name: "reporter_name", label: "Quem relatou", kind: "text", max: 120 },
    ],
  },
  infra_assets: {
    table: "infra_assets",
    label: "Recurso",
    fields: [
      { name: "name", label: "Recurso", kind: "text", required: true, max: 120, placeholder: "API do Obra Fácil" },
      { name: "entity_id", label: "Entidade", kind: "entity", required: true },
      { name: "provider", label: "Fornecedor", kind: "text", max: 60, placeholder: "Render, Vercel, MongoDB Atlas…" },
      { name: "kind", label: "Tipo", kind: "text", max: 40, placeholder: "hospedagem, banco, e-mail, domínio, API…" },
      { name: "url", label: "Link do painel", kind: "url", max: 300 },
      { name: "monthly_cost_cents", label: "Custo mensal (R$)", kind: "money" },
      { name: "notes", label: "Observações (sem senhas ou chaves)", kind: "textarea", max: 4000, wide: true },
    ],
  },
  leads: {
    table: "leads",
    label: "Lead",
    quick: ["stage", "owner_id"],
    fields: [
      { name: "contact_name", label: "Contato", kind: "text", required: true, max: 120 },
      { name: "company", label: "Empresa", kind: "text", max: 140 },
      { name: "entity_id", label: "Produto de interesse", kind: "entity", required: true },
      { name: "stage", label: "Etapa", kind: "select", options: LEAD_STAGE.filter((s) => s[0] !== "won"), required: true },
      { name: "source", label: "Origem", kind: "select", options: LEAD_SOURCE, required: true },
      { name: "campaign_id", label: "Campanha", kind: "ref", ref: "campaigns" },
      { name: "value_cents", label: "Valor mensal esperado (R$)", kind: "money" },
      { name: "owner_id", label: "Responsável", kind: "ref", ref: "profiles" },
      { name: "email", label: "E-mail", kind: "email", max: 160 },
      { name: "phone", label: "Telefone/WhatsApp", kind: "text", max: 40 },
      { name: "next_step", label: "Próximo passo", kind: "text", max: 200 },
      { name: "next_step_date", label: "Data do próximo passo", kind: "date" },
      { name: "lost_reason", label: "Motivo da perda", kind: "text", max: 300, hint: "Preencha se a etapa for “Perdida”." },
    ],
  },
  campaigns: {
    table: "campaigns",
    label: "Campanha",
    quick: ["status"],
    fields: [
      { name: "name", label: "Campanha", kind: "text", required: true, max: 120 },
      { name: "entity_id", label: "Produto", kind: "entity", required: true },
      { name: "channel", label: "Canal", kind: "select", options: CAMPAIGN_CHANNEL, required: true },
      { name: "status", label: "Situação", kind: "select", options: [["planned", "Planejada"], ["active", "Ativa"], ["done", "Encerrada"]], required: true },
      { name: "budget_cents", label: "Orçamento (R$)", kind: "money" },
      { name: "start_date", label: "Início", kind: "date" },
      { name: "end_date", label: "Fim", kind: "date" },
      { name: "goal", label: "Meta", kind: "text", max: 200 },
      { name: "notes", label: "Estratégia e resultados", kind: "textarea", max: 8000, wide: true },
    ],
  },
} as const satisfies Record<string, RecordDef>;

export type RecordKind = keyof typeof RECORDS;
