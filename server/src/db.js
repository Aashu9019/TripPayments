// Postgres in production (Render), PGlite locally when DATABASE_URL is unset.
import { AsyncLocalStorage } from 'node:async_hooks';
let impl;

export async function connect() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    // BIGINT comes back as string by default; amounts fit safely in JS numbers.
    pg.types.setTypeParser(20, (v) => Number(v));
    // Keep DATE as 'YYYY-MM-DD' so time zones never shift the day.
    pg.types.setTypeParser(1082, (v) => v);
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 5,
    });
    impl = {
      query: (sql, params) => pool.query(sql, params),
      tx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn((s, p) => client.query(s, p));
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
    };
  } else {
    // Render's disk is wiped on every deploy; embedded storage there would silently lose all data.
    if (process.env.RENDER) {
      throw new Error('DATABASE_URL is not set. Add the Neon connection string in Render > Environment.');
    }
    const { PGlite, types } = await import('@electric-sql/pglite');
    const db = new PGlite(process.env.PGLITE_DIR ?? './.data', {
      parsers: { [types.INT8]: (v) => Number(v), [types.DATE]: (v) => v },
    });
    impl = {
      query: (sql, params) => db.query(sql, params),
      tx: (fn) => db.transaction((t) => fn((s, p) => t.query(s, p))),
    };
    console.log('Using embedded PGlite at', process.env.PGLITE_DIR ?? './.data');
  }
  await migrate();
}

// ---------- Tenant scoping (row-level security) ----------
//
// Every request runs inside a scope. A trip route declares its trip with
// useTrip(id); global routes (auth, "my trips", admin) declare useSystem().
// Each query then runs in a transaction that sets:
//   app.trip_id  - the tenant; RLS policies only expose rows of this trip
//   app.bypass   - 'on' only for system work
// and, for tenant work, switches to the restricted sajilo_app role, which has
// no BYPASSRLS. A request that declares nothing sees nothing (fails closed).

const scope = new AsyncLocalStorage();

/** Run a request handler in its own fresh scope. */
export const inScope = (fn) => scope.run({ tripId: null, system: false }, fn);

export function useTrip(tripId) {
  const s = scope.getStore();
  if (!s) throw new Error('useTrip outside a request scope');
  s.tripId = tripId;
  s.system = false;
}

export function useSystem() {
  const s = scope.getStore();
  if (!s) throw new Error('useSystem outside a request scope');
  s.system = true;
}

const current = () => {
  const s = scope.getStore();
  return { tripId: s?.tripId ?? '', system: !!s?.system };
};

async function enter(run, { tripId, system }) {
  if (!system) await run('SET LOCAL ROLE sajilo_app');
  await run("SELECT set_config('app.trip_id', $1, true), set_config('app.bypass', $2, true)", [tripId, system ? 'on' : 'off']);
}

/** One statement, scoped to the current request's tenant. */
export const query = (sql, params) => {
  const c = current();
  return impl.tx(async (run) => {
    await enter(run, c);
    return run(sql, params);
  });
};

/** Several statements in one transaction, scoped to the current tenant. */
export const tx = (fn) => {
  const c = current();
  return impl.tx(async (run) => {
    await enter(run, c);
    return fn(run);
  });
};

/** Explicit system query (sign-in lookups, trip-code lookup). Never tenant-scoped. */
export const sys = (sql, params) =>
  impl.tx(async (run) => {
    await enter(run, { tripId: '', system: true });
    return run(sql, params);
  });

async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT '',
      start_date DATE,
      end_date DATE,
      currency TEXT NOT NULL DEFAULT 'NPR',
      notes TEXT NOT NULL DEFAULT '',
      fund_keeper_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      phone TEXT NOT NULL DEFAULT '',
      color INTEGER NOT NULL DEFAULT 0,
      token_hash TEXT,
      left_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      amount BIGINT NOT NULL,
      from_id TEXT,
      to_id TEXT,
      split_mode TEXT NOT NULL DEFAULT 'equal',
      shares JSONB NOT NULL DEFAULT '{}'::jsonb,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      note TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_id TEXT`,
    `CREATE TABLE IF NOT EXISTS avatars (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_id TEXT`,
    `ALTER TABLE avatars ALTER COLUMN user_id DROP NOT NULL`,
    `ALTER TABLE avatars ADD COLUMN IF NOT EXISTS member_id TEXT REFERENCES members(id) ON DELETE CASCADE`,
    `CREATE INDEX IF NOT EXISTS members_phone_idx ON members(phone) WHERE user_id IS NULL`,
    `CREATE INDEX IF NOT EXISTS members_user_idx ON members(user_id)`,
    `CREATE INDEX IF NOT EXISTS entries_trip_idx ON entries(trip_id, date DESC)`,
    `CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      day INTEGER,
      note TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ];
  for (const s of statements) await impl.query(s);
  await enableRls();
}

const TENANT = "current_setting('app.trip_id', true)";
const BYPASS = "current_setting('app.bypass', true) = 'on'";

/** Row-level security: each trip is a tenant. Safe to run on every start. */
async function enableRls() {
  const policies = {
    trips: `${BYPASS} OR id = ${TENANT}`,
    members: `${BYPASS} OR trip_id = ${TENANT}`,
    entries: `${BYPASS} OR trip_id = ${TENANT}`,
    places: `${BYPASS} OR trip_id = ${TENANT}`,
    // Photos a leader set for a seat in this trip; account photos are system-only.
    avatars: `${BYPASS} OR EXISTS (SELECT 1 FROM members m WHERE m.id = avatars.member_id AND m.trip_id = ${TENANT})`,
    // Inside a trip you may read the accounts of that trip's members (names, photos).
    users: `${BYPASS} OR EXISTS (SELECT 1 FROM members m WHERE m.user_id = users.id AND m.trip_id = ${TENANT})`,
    auth_sessions: BYPASS,
  };
  await impl.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sajilo_app') THEN
        CREATE ROLE sajilo_app NOLOGIN NOBYPASSRLS;
      END IF;
    END $$`);
  await impl.query('GRANT sajilo_app TO CURRENT_USER').catch(() => {}); // superusers already can SET ROLE
  await impl.query('GRANT USAGE ON SCHEMA public TO sajilo_app');
  await impl.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sajilo_app');
  for (const [table, rule] of Object.entries(policies)) {
    await impl.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await impl.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await impl.query(`DROP POLICY IF EXISTS tenant ON ${table}`);
    await impl.query(`CREATE POLICY tenant ON ${table} USING (${rule}) WITH CHECK (${rule})`);
  }
}
