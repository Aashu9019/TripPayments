// Postgres in production (Render), PGlite locally when DATABASE_URL is unset.
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

export const query = (sql, params) => impl.query(sql, params);
export const tx = (fn) => impl.tx(fn);

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
}
