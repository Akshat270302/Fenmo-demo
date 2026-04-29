const app = require("./app");
const { db, initDB } = require("./db");

const PORT = process.env.PORT || 3000;

let server;

initDB()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
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
