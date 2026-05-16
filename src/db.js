import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL .env এ সেট করুন');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

export const query = (text, params) => pool.query(text, params);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','manager','member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tours (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  budget      NUMERIC NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed')),
  cover       TEXT DEFAULT '✈️',
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tour_members (
  tour_id  TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (tour_id, user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  tour_id       TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  amount        NUMERIC NOT NULL,
  paid_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  date          DATE NOT NULL,
  note          TEXT,
  split_between TEXT[] NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  tour_id      TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  assigned_to  TEXT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itinerary (
  id         TEXT PRIMARY KEY,
  tour_id    TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  time       TEXT NOT NULL,
  location   TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tour ON expenses(tour_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tour ON tasks(tour_id);
CREATE INDEX IF NOT EXISTS idx_itin_tour ON itinerary(tour_id);
CREATE INDEX IF NOT EXISTS idx_tm_user ON tour_members(user_id);
`;

export async function initDb() {
  await query(SCHEMA);
  console.log('✅ Database schema ready');
}

// CLI: node src/db.js init
if (process.argv[2] === 'init') {
  initDb()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
