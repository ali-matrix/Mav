// The one database connection for the whole app (SQLite file: data/asset.db).
// Uses the SQLite that is built into Node itself, so there is nothing extra to install.
// Changes to the database are "migrations": add a new entry at the END of MIGRATIONS, never edit an old one.
// The file remembers how many have run (PRAGMA user_version), so each runs exactly once.
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

// Loaded with getBuiltinModule so the bundler leaves Node's own module alone.
const { DatabaseSync: Sqlite } = (process as unknown as { getBuiltinModule: (id: string) => unknown })
  .getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "asset.db");

// Starting kinds of assets (main kind → its sub-kinds). Editable on the Categories page.
const SEED: Record<string, string[]> = {
  Computers: ["Laptop", "Desktop", "Server"],
  Peripherals: ["Monitor", "Keyboard", "Mouse", "Printer", "Scanner"],
  Network: ["Switch", "Router", "Access Point", "Firewall"],
  Mobile: ["Phone", "Tablet"],
};
const SEED_SQL = Object.entries(SEED)
  .map(([parent, kids]) =>
    `INSERT INTO categories (name, parent_id) VALUES ('${parent}', NULL);` +
    kids.map((k) =>
      `INSERT INTO categories (name, parent_id) VALUES ('${k}', (SELECT id FROM categories WHERE name='${parent}' AND parent_id IS NULL));`,
    ).join(""),
  ).join("\n");

const MIGRATIONS: string[] = [
  // 1: reference tables
  `
  CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE locations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE,
    parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX categories_unique ON categories (COALESCE(parent_id, 0), name);
  CREATE INDEX categories_parent ON categories (parent_id);
  ${SEED_SQL}
  `,
  // 2: employees (from the ERP) and a log of each sync
  `
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    erp_id INTEGER NOT NULL UNIQUE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    designation TEXT NOT NULL DEFAULT '',
    position_title TEXT,
    department TEXT NOT NULL DEFAULT '',
    division TEXT,
    email TEXT,
    phone TEXT,
    intercom_ext TEXT,
    joining_date TEXT,
    manager_erp_id INTEGER,
    manager_name TEXT,
    manager_designation TEXT,
    manager_active INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
    seen_at TEXT,
    search_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX employees_status_name ON employees (status, name);
  CREATE INDEX employees_department ON employees (department, status);
  CREATE INDEX employees_designation ON employees (designation, status);
  CREATE INDEX employees_code ON employees (code);
  CREATE INDEX employees_joining ON employees (joining_date);
  CREATE TABLE sync_runs (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error')),
    added INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    marked_left INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
  CREATE INDEX sync_runs_source ON sync_runs (source, finished_at);
  `,
  // 3: backfill departments from employees synced before department sync was added
  `
  INSERT OR IGNORE INTO departments (name)
  SELECT DISTINCT TRIM(department) FROM employees WHERE TRIM(department) <> '';
  `,
  // 4: the persistent asset register
  `
  CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    brand TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    serial_number TEXT NOT NULL DEFAULT '',
    department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
    location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
    assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
    purchase_cost REAL,
    purchase_date TEXT,
    warranty_start TEXT,
    warranty_expiry TEXT,
    status TEXT NOT NULL DEFAULT 'In Store'
      CHECK (status IN ('In Use', 'In Store', 'Under Maintenance', 'Insurance Claim', 'Disposed')),
    remarks TEXT NOT NULL DEFAULT '',
    processor TEXT NOT NULL DEFAULT '',
    ram TEXT NOT NULL DEFAULT '',
    storage TEXT NOT NULL DEFAULT '',
    operating_system TEXT NOT NULL DEFAULT '',
    service_tag TEXT NOT NULL DEFAULT '',
    hostname TEXT NOT NULL DEFAULT '',
    mac_address TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX assets_status ON assets (status, id);
  CREATE INDEX assets_category ON assets (category_id, id);
  CREATE INDEX assets_department ON assets (department_id, id);
  CREATE INDEX assets_location ON assets (location_id, id);
  CREATE INDEX assets_employee ON assets (assigned_employee_id, id);
  CREATE INDEX assets_serial ON assets (serial_number);
  `,
  // 5: assets get one free-text description (no per-kind technical columns), plus status history,
  //    assignment history and the counters behind asset tags (LAP-0001, LAP-0002 …)
  `
  UPDATE assets SET remarks = TRIM(
      remarks
      || CASE WHEN processor <> '' THEN char(10) || 'Processor: ' || processor ELSE '' END
      || CASE WHEN ram <> '' THEN char(10) || 'RAM: ' || ram ELSE '' END
      || CASE WHEN storage <> '' THEN char(10) || 'Storage: ' || storage ELSE '' END
      || CASE WHEN operating_system <> '' THEN char(10) || 'Operating system: ' || operating_system ELSE '' END
      || CASE WHEN service_tag <> '' THEN char(10) || 'Service tag: ' || service_tag ELSE '' END
      || CASE WHEN hostname <> '' THEN char(10) || 'Hostname: ' || hostname ELSE '' END
      || CASE WHEN mac_address <> '' THEN char(10) || 'MAC: ' || mac_address ELSE '' END
      || CASE WHEN ip_address <> '' THEN char(10) || 'IP: ' || ip_address ELSE '' END,
      char(10) || ' ')
    WHERE processor <> '' OR ram <> '' OR storage <> '' OR operating_system <> ''
       OR service_tag <> '' OR hostname <> '' OR mac_address <> '' OR ip_address <> '';
  ALTER TABLE assets DROP COLUMN processor;
  ALTER TABLE assets DROP COLUMN ram;
  ALTER TABLE assets DROP COLUMN storage;
  ALTER TABLE assets DROP COLUMN operating_system;
  ALTER TABLE assets DROP COLUMN service_tag;
  ALTER TABLE assets DROP COLUMN hostname;
  ALTER TABLE assets DROP COLUMN mac_address;
  ALTER TABLE assets DROP COLUMN ip_address;

  CREATE TABLE asset_status_history (
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    from_status TEXT,
    to_status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX asset_status_history_asset ON asset_status_history (asset_id, id);

  CREATE TABLE asset_assignments (
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    returned_at TEXT,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX asset_assignments_asset ON asset_assignments (asset_id, id);
  CREATE INDEX asset_assignments_employee ON asset_assignments (employee_id, id);

  CREATE TABLE asset_tag_counters (
    prefix TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL
  );

  INSERT INTO asset_status_history (asset_id, from_status, to_status, note)
    SELECT id, NULL, status, 'Existing record' FROM assets;
  INSERT INTO asset_assignments (asset_id, employee_id, note)
    SELECT id, assigned_employee_id, 'Existing record' FROM assets WHERE assigned_employee_id IS NOT NULL;
  INSERT INTO asset_tag_counters (prefix, last_number)
    SELECT substr(asset_tag, 1, instr(asset_tag, '-') - 1),
           MAX(CAST(substr(asset_tag, instr(asset_tag, '-') + 1) AS INTEGER))
    FROM assets WHERE instr(asset_tag, '-') > 1 GROUP BY 1;
  `,
  // 6: assets no longer have a department of their own: it comes from the employee who holds them
  `
  CREATE TABLE assets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    brand TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    serial_number TEXT NOT NULL DEFAULT '',
    location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
    assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
    purchase_cost REAL,
    purchase_date TEXT,
    warranty_start TEXT,
    warranty_expiry TEXT,
    status TEXT NOT NULL DEFAULT 'In Store'
      CHECK (status IN ('In Use', 'In Store', 'Under Maintenance', 'Insurance Claim', 'Disposed')),
    remarks TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO assets_new (id, asset_tag, name, category_id, brand, model, serial_number, location_id,
      assigned_employee_id, purchase_cost, purchase_date, warranty_start, warranty_expiry, status, remarks,
      created_at, updated_at)
    SELECT id, asset_tag, name, category_id, brand, model, serial_number, location_id,
      assigned_employee_id, purchase_cost, purchase_date, warranty_start, warranty_expiry, status, remarks,
      created_at, updated_at
    FROM assets;
  DROP TABLE assets;
  ALTER TABLE assets_new RENAME TO assets;
  CREATE INDEX assets_status ON assets (status, id);
  CREATE INDEX assets_category ON assets (category_id, id);
  CREATE INDEX assets_location ON assets (location_id, id);
  CREATE INDEX assets_employee ON assets (assigned_employee_id, id);
  CREATE INDEX assets_serial ON assets (serial_number);
  `,
  // 7: indexes for the Assignments page (order by date, and "who holds it right now")
  `
  CREATE INDEX asset_assignments_assigned ON asset_assignments (assigned_at, id);
  CREATE INDEX asset_assignments_open ON asset_assignments (id) WHERE returned_at IS NULL;
  `,
  // 8: maintenance history kept on the asset, while assignment remains untouched
  `
  CREATE TABLE asset_maintenance (
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    details TEXT NOT NULL DEFAULT '',
    cost REAL
  );
  CREATE INDEX asset_maintenance_asset ON asset_maintenance (asset_id, id);
  CREATE INDEX asset_maintenance_open ON asset_maintenance (id) WHERE ended_at IS NULL;
  `,
];

function migrate(db: DatabaseSync) {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    // Rebuilding a table needs foreign-key checking switched off while it happens (SQLite's own
    // documented way). It is switched back on after, and the links are checked before we commit.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      const broken = db.prepare("PRAGMA foreign_key_check").all();
      if (broken.length > 0) throw new Error(`Migration ${v + 1} would break the links between records, so it was cancelled.`);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
}

function open() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Sqlite(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON"); // a record in use can't be deleted
  migrate(db);
  return db;
}

// Kept on globalThis so the dev server's hot reload doesn't open a new connection every save.
const g = globalThis as unknown as { __assetDb?: DatabaseSync };
export const db = () => (g.__assetDb ??= open());