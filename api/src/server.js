import { createApp } from "./app.js";
import { deliveryMode, loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.info(
    JSON.stringify({
      level: "info",
      event: "server.started",
      port: config.port,
      delivery: deliveryMode(config),
      allowedOrigins: config.allowedOrigins.length,
    }),
  );
});
