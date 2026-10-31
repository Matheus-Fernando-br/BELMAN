import { z } from "zod";

export const PROJECT_TYPES = {
  finc: "FINC — gestão financeira e fiscal",
  "obra-facil": "Obra Fácil — gestão de obras",
  web: "Sistema web sob medida",
  site: "Site institucional ou landing page",
  mobile: "Aplicativo mobile",
  integration: "Integração ou automação",
  partnership: "Parceria ou investimento",
  other: "Outro assunto",
};

export const BUDGETS = {
  "a-definir": "Ainda não definido",
  "ate-200": "Até R$ 200,00",
  "200-300": "R$ 200,00 a R$ 300,00",
  "300-600": "R$ 300,00 a R$ 600,00",
  "600-1000": "R$ 600,00 a R$ 1.000,00",
  "1000+": "Mais de R$ 1.000,00",
};

// Minimum time between the form being rendered and submitted. Humans take
// longer than this; naive bots post immediately.
export const MIN_FILL_MS = 3_000;

// Removes control characters (keeps line breaks in the message) and
// collapses runs of blank lines so the Telegram notification stays readable.
const INVISIBLE = "\\u200B-\\u200F\\u2028-\\u202E";
const CONTROL_KEEP_NEWLINE = new RegExp(`[\\u0000-\\u0009\\u000B-\\u001F\\u007F${INVISIBLE}]`, "g");
const CONTROL_ALL = new RegExp(`[\\u0000-\\u001F\\u007F${INVISIBLE}]`, "g");

function clean(value, { multiline = false } = {}) {
  if (multiline) {
    return value
      .replace(CONTROL_KEEP_NEWLINE, "")
      .replace(/\r\n?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return value.replace(CONTROL_ALL, " ").replace(/\s+/g, " ").trim();
}

const text = (min, max, messages, options) =>
  z
    .string({ error: messages.required })
    .transform((value) => clean(value, options))
    .pipe(z.string().min(min, messages.min).max(max, messages.max));

export const contactSchema = z.object({
  name: text(2, 80, {
    required: "Informe seu nome.",
    min: "Informe seu nome.",
    max: "Use no máximo 80 caracteres no nome.",
  }),
  email: z
    .string({ error: "Informe seu e-mail." })
    .trim()
    .toLowerCase()
    .max(120, "Use no máximo 120 caracteres no e-mail.")
    .pipe(z.email("Informe um e-mail válido.")),
  projectType: z.enum(Object.keys(PROJECT_TYPES), {
    error: "Escolha o assunto.",
  }),
  budget: z
    .enum(Object.keys(BUDGETS), { error: "Escolha uma faixa de orçamento válida." })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: text(
    20,
    2000,
    {
      required: "Descreva o que você precisa.",
      min: "Descreva o que você precisa em pelo menos 20 caracteres.",
      max: "Use no máximo 2000 caracteres na descrição.",
    },
    { multiline: true },
  ),
  // Honeypot: invisible to people, often filled by bots.
  website: z.string().max(200).optional(),
  // Timestamp (ms) of when the form was rendered in the browser.
  startedAt: z.number().int().nonnegative().optional(),
});

export function isLikelySpam(data, now = Date.now()) {
  if (data.website && data.website.trim() !== "") return true;
  if (data.startedAt && now - data.startedAt < MIN_FILL_MS) return true;
  return false;
}
