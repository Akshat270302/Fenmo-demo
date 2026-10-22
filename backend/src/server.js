// Load `.env` and resolve configuration before anything else reads process.env.
const {
  env,
  describeConfig,
  hasGeminiCredentials,
} = require("./config/env");
const app = require("./app");
const { db, initDB } = require("./db");

const PORT = env.port;

let server;

initDB()
  .then(() => {
    server = app.listen(PORT, () => {
      const config = describeConfig();
      console.log(`Server listening on port ${PORT}`);
      console.log(
        `[config] env=${config.nodeEnv} source=${config.envSource} ` +
          `geminiModel=${config.geminiModel} geminiConfigured=${config.geminiConfigured}`
      );

      if (!hasGeminiCredentials()) {
        console.warn(
          "[config] GEMINI_API_KEY is not set. Gemini-backed features will be unavailable."
        );
      }
    });

    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the other process or set PORT to a free port.`
        );
      } else {
        console.error("Server failed to start", err);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database", err);
    process.exit(1);
  });

const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down...`);

  if (!server) {
    if (db && typeof db.close === "function") {
      db.close();
    }
    process.exit(0);
  }

  server.close(() => {
    if (db && typeof db.close === "function") {
      db.close();
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
