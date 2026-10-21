const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'gantt.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('cache_size = -2000'); // 2MB cache
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT,
      website TEXT,
      description TEXT,
      weekends_off INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      date TEXT NOT NULL,
      label TEXT,
      recurring INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, date)
    );
    
    -- perlu kolom project_id yang sudah ada di CREATE TABLE di atas, tapi pastikan tidak duplikat CREATE


    CREATE TABLE IF NOT EXISTS project_weekends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL UNIQUE,
      weekends_off INTEGER DEFAULT 1,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      duration_days INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 1,
      color TEXT DEFAULT '#4A90D9',
      parent_id INTEGER,
      scheduled_start TEXT,
      scheduled_finish TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      predecessor_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('FS','SS','FF','SF')) DEFAULT 'FS',
      delay INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (predecessor_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      role TEXT,
      salary TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS day_offs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE(resource_id, date)
    );

    CREATE TABLE IF NOT EXISTS task_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      resource_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_task ON dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_pred ON dependencies(predecessor_id);
    CREATE INDEX IF NOT EXISTS idx_holidays_project_date ON holidays(project_id, date);
    CREATE INDEX IF NOT EXISTS idx_task_resources_task ON task_resources(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_resources_resource ON task_resources(resource_id);
  `);
}

function resetDatabase() {
  if (db) db.close();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -2000');
  db.exec(`
    DROP TABLE IF EXISTS task_resources;
    DROP TABLE IF EXISTS day_offs;
    DROP TABLE IF EXISTS dependencies;
    DROP TABLE IF EXISTS resources;
    DROP TABLE IF EXISTS project_weekends;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS holidays;
    DROP TABLE IF EXISTS projects;
  `);
  initializeDatabase();
}

module.exports = { getDb, resetDatabase };
