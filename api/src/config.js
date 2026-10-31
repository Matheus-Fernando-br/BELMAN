// Reads runtime configuration from environment variables.
// Secrets (TELEGRAM_TOKEN) are only ever read here and never logged or returned.

function list(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 3001),
    nodeEnv: env.NODE_ENV || "development",
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    telegram: {
      token: env.TELEGRAM_TOKEN || "",
      chatId: env.TELEGRAM_CHAT_ID || "",
    },
    // Optional fallback: an existing server-side relay that already holds the
    // Telegram credentials (e.g. the portfolio API). Used only when the direct
    // Telegram variables are not configured on this service.
    relayUrl: env.CONTACT_RELAY_URL || "",
    upstreamTimeoutMs: int(env.UPSTREAM_TIMEOUT_MS, 60_000),
    rateLimit: {
      windowMs: int(env.RATE_LIMIT_WINDOW_MS, 15 * 60_000),
      max: int(env.RATE_LIMIT_MAX, 5),
    },
  };
}

export function deliveryMode(config) {
  if (config.telegram.token && config.telegram.chatId) return "telegram";
  if (config.relayUrl) return "relay";
  return "unconfigured";
}
