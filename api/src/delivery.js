import { BUDGETS, PROJECT_TYPES } from "./contact-schema.js";
import { deliveryMode } from "./config.js";

export class DeliveryError extends Error {
  constructor(message, { cause, status } = {}) {
    super(message, { cause });
    this.name = "DeliveryError";
    this.status = status;
  }
}

function timestamp() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatTelegramMessage(contact) {
  const lines = [
    "📩 NOVO CONTATO — BELLMAN",
    "━━━━━━━━━━━━━━━━━━",
    "",
    `👤 Nome: ${contact.name}`,
    `📧 E-mail: ${contact.email}`,
    `🧩 Assunto: ${PROJECT_TYPES[contact.projectType]}`,
    `💰 Orçamento: ${contact.budget ? BUDGETS[contact.budget] : "Não informado"}`,
    `📅 Data: ${timestamp()}`,
    "",
    "💬 Mensagem:",
    contact.message,
  ];
  return lines.join("\n");
}

async function postJson(url, body, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "timeout" : "network";
    throw new DeliveryError(`Upstream ${reason}`, { cause: error });
  }
  if (!response.ok) {
    throw new DeliveryError("Upstream rejected the message", {
      status: response.status,
    });
  }
  return response.json().catch(() => ({}));
}

async function sendViaTelegram(config, contact) {
  const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
  const result = await postJson(
    url,
    {
      chat_id: config.telegram.chatId,
      text: formatTelegramMessage(contact),
      disable_web_page_preview: true,
    },
    config.upstreamTimeoutMs,
  );
  if (result.ok !== true) throw new DeliveryError("Telegram did not confirm");
}

// The relay (the existing portfolio API) expects { nome, email, assunto, mensagem }
// and answers { success: true } only after Telegram accepted the message.
async function sendViaRelay(config, contact) {
  const budget = contact.budget ? BUDGETS[contact.budget] : "Não informado";
  const result = await postJson(
    config.relayUrl,
    {
      nome: contact.name,
      email: contact.email,
      assunto: `[Bellman] ${PROJECT_TYPES[contact.projectType]} — orçamento: ${budget}`,
      mensagem: contact.message,
    },
    config.upstreamTimeoutMs,
  );
  if (result.success !== true) throw new DeliveryError("Relay did not confirm");
}

export function createDeliverer(config) {
  return async function deliver(contact) {
    const mode = deliveryMode(config);
    if (mode === "telegram") return sendViaTelegram(config, contact);
    if (mode === "relay") return sendViaRelay(config, contact);
    throw new DeliveryError("Delivery is not configured");
  };
}

// Fire-and-forget request that wakes a sleeping relay host (free Render
// instances spin down when idle) so the first real message is faster.
export function warmUpRelay(config) {
  if (deliveryMode(config) !== "relay") return;
  const origin = new URL(config.relayUrl).origin;
  fetch(origin, { signal: AbortSignal.timeout(config.upstreamTimeoutMs) }).catch(() => {});
}
