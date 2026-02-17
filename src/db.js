const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'taplist.db'));

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS beers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tap_number INTEGER,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    abv REAL DEFAULT 0,
    style TEXT DEFAULT '',
    brewery TEXT DEFAULT '',
    image_path TEXT DEFAULT '',
    pints_remaining REAL DEFAULT 38,
    pints_total REAL DEFAULT 38,
    is_draft INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default settings if not present
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
insertSetting.run('taproom_name', 'My Tap Room');
insertSetting.run('logo_path', '');

module.exports = db;
