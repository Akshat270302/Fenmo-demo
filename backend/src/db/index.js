const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "../../data");
const dbPath = path.join(dataDir, "expenses.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

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
