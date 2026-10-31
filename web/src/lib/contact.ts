// Client-side mirror of the API validation (api/src/contact-schema.js).
// The server validates again; this only gives faster, friendlier feedback.

export const projectTypes = {
  finc: "FINC — gestão financeira e fiscal",
  "obra-facil": "Obra Fácil — gestão de obras",
  web: "Sistema web sob medida",
  site: "Site institucional ou landing page",
  mobile: "Aplicativo mobile",
  integration: "Integração ou automação",
  partnership: "Parceria ou investimento",
  other: "Outro assunto",
} as const;

export const budgets = {
  "a-definir": "Ainda não definido",
  "ate-200": "Até R$ 200,00",
  "200-300": "R$ 200,00 a R$ 300,00",
  "300-600": "R$ 300,00 a R$ 600,00",
  "600-1000": "R$ 600,00 a R$ 1.000,00",
  "1000+": "Mais de R$ 1.000,00",
} as const;

export type ProjectType = keyof typeof projectTypes;
export type Budget = keyof typeof budgets;

export const limits = {
  name: { min: 2, max: 80 },
  email: { max: 120 },
  message: { min: 20, max: 2000 },
} as const;

export type ContactInput = {
  name: string;
  email: string;
  projectType: string;
  budget: string;
  message: string;
};

export type FieldErrors = Partial<Record<keyof ContactInput, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateContact(input: ContactInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  if (name.length < limits.name.min) errors.name = "Informe seu nome.";
  else if (name.length > limits.name.max) errors.name = `Use no máximo ${limits.name.max} caracteres no nome.`;

  if (!email) errors.email = "Informe seu e-mail.";
  else if (email.length > limits.email.max || !EMAIL.test(email)) errors.email = "Informe um e-mail válido.";

  if (!(input.projectType in projectTypes)) errors.projectType = "Escolha o assunto.";

  if (input.budget && !(input.budget in budgets)) errors.budget = "Escolha uma faixa de orçamento válida.";

  if (message.length < limits.message.min)
    errors.message = `Descreva o que você precisa em pelo menos ${limits.message.min} caracteres.`;
  else if (message.length > limits.message.max)
    errors.message = `Use no máximo ${limits.message.max} caracteres na descrição.`;

  return errors;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string; fields?: FieldErrors };

export async function submitContact(
  endpoint: string,
  payload: ContactInput & { website: string; startedAt: number },
  { timeoutMs = 90_000, fetcher = fetch }: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<SubmitResult> {
  if (!endpoint) {
    return { ok: false, error: "O envio pelo formulário está indisponível. Use o e-mail ao lado." };
  }
  let response: Response;
  try {
    response = await fetcher(`${endpoint}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, budget: payload.budget || undefined }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return {
      ok: false,
      error: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
    };
  }
  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; fields?: FieldErrors }
    | null;
  if (response.ok && body?.ok === true) return { ok: true };
  return {
    ok: false,
    error: body?.error ?? "Não foi possível enviar sua mensagem agora. Tente novamente.",
    fields: body?.fields,
  };
}
