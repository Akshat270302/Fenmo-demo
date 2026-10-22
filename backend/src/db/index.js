const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "../../data");
const dbPath = path.join(dataDir, "expenses.db");

// Tests point this at a throwaway database so real expense data is never
// touched. It is read from the environment, never from model output.
const configuredDbPath = process.env.FENMO_DB_PATH;

const resolvedDbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : dbPath;

const resolvedDataDir = path.dirname(resolvedDbPath);

if (!fs.existsSync(resolvedDataDir)) {
  fs.mkdirSync(resolvedDataDir, { recursive: true });
}

const db = new sqlite3.Database(resolvedDbPath);

const initDB = () => {
  const schemaPath = path.join(__dirname, "../migrations/001_create_expenses.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Keep PRAGMA and schema creation in a single serialized block.
      db.run("PRAGMA foreign_keys = ON");
      db.exec(schemaSql, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  });
};

module.exports = {
  db,
  initDB,
};
