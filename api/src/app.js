import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { deliveryMode } from "./config.js";
import { contactSchema, isLikelySpam } from "./contact-schema.js";
import { createDeliverer, warmUpRelay } from "./delivery.js";

function log(level, event, details = {}) {
  // Structured, minimal logs. Never include message content, e-mails or secrets.
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}

export function createApp(config, { deliver = createDeliverer(config) } = {}) {
  const app = express();

  // Render (and most PaaS) sit behind one proxy hop; needed for correct client IPs.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without Origin (health checks, curl) are not browser CORS requests.
        if (!origin) return callback(null, true);
        callback(null, config.allowedOrigins.includes(origin));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "10kb" }));

  app.get("/", (_req, res) => {
    res.json({ service: "bellman-api", docs: "/api/health" });
  });

  app.get("/api/health", (_req, res) => {
    warmUpRelay(config);
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok", delivery: deliveryMode(config), uptime: Math.round(process.uptime()) });
  });

  const contactLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: "Muitas mensagens em pouco tempo. Tente novamente em alguns minutos.",
      });
    },
  });

  app.post("/api/contact", contactLimiter, async (req, res, next) => {
    const origin = req.get("origin");
    if (origin && !config.allowedOrigins.includes(origin)) {
      return res.status(403).json({ ok: false, error: "Origem não autorizada." });
    }

    const parsed = contactSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
      }
      return res.status(422).json({ ok: false, error: "Revise os campos destacados.", fields });
    }

    if (isLikelySpam(parsed.data)) {
      log("warn", "contact.spam_blocked");
      // Answer like a success so bots get no signal, but nothing is sent.
      return res.status(202).json({ ok: true });
    }

    try {
      const { website: _website, startedAt: _startedAt, ...contact } = parsed.data;
      await deliver(contact);
      log("info", "contact.delivered", { mode: deliveryMode(config) });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Rota não encontrada." });
  });

  // Centralized error handler: generic messages to clients, safe details to logs.
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ ok: false, error: "Mensagem muito grande." });
    }
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ ok: false, error: "Requisição inválida." });
    }
    if (error?.name === "DeliveryError") {
      log("error", "contact.delivery_failed", { reason: error.message, status: error.status });
      return res.status(502).json({
        ok: false,
        error: "Não foi possível enviar sua mensagem agora. Tente novamente ou use o e-mail ao lado.",
      });
    }
    log("error", "server.unhandled", { name: error?.name });
    return res.status(500).json({ ok: false, error: "Erro interno. Tente novamente." });
  });

  return app;
}
