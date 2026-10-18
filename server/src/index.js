import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { connect, query, tx } from './db.js';
import { computeBalances, equalShares } from './ledger.js';

const app = express();
const origins = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '64kb' }));

const id = () => crypto.randomUUID();
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () =>
  Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const money = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 1e12) throw bad('Amount must be a positive whole number of paisa');
  return n;
};

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (!(e instanceof HttpError)) console.error(e);
    res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Something went wrong' });
  });

async function loadTrip(code) {
  const { rows } = await query('SELECT * FROM trips WHERE code = $1', [String(code).toUpperCase()]);
  if (!rows[0]) throw new HttpError(404, 'No trip with that code');
  return rows[0];
}

/** Resolves the caller from the x-member-token header. */
async function auth(req, trip, { leader = false } = {}) {
  const token = req.get('x-member-token');
  if (!token) throw new HttpError(401, 'Join the trip first');
  const { rows } = await query(
    'SELECT * FROM members WHERE trip_id = $1 AND token_hash = $2 AND left_at IS NULL',
    [trip.id, hash(token)],
  );
  const me = rows[0];
  if (!me) throw new HttpError(401, 'Your session for this trip has ended. Join again.');
  if (leader && me.role !== 'leader') throw new HttpError(403, 'Only the trip leader can do that');
  return me;
}

const bump = (run, tripId) => run('UPDATE trips SET version = version + 1 WHERE id = $1', [tripId]);

async function nextColor(run, tripId) {
  const { rows } = await run('SELECT count(*)::int AS n FROM members WHERE trip_id = $1', [tripId]);
  return rows[0].n % 8;
}

async function state(trip) {
  const [members, entries, places] = await Promise.all([
    query(
      `SELECT id, name, role, phone, color, left_at, created_at, (token_hash IS NOT NULL) AS claimed
       FROM members WHERE trip_id = $1 ORDER BY created_at`,
      [trip.id],
    ),
    query('SELECT * FROM entries WHERE trip_id = $1 ORDER BY date DESC, created_at DESC', [trip.id]),
    query('SELECT * FROM places WHERE trip_id = $1 ORDER BY kind, sort, day NULLS LAST, created_at', [trip.id]),
  ]);
  const { id: _id, ...publicTrip } = trip;
  return {
    trip: publicTrip,
    members: members.rows,
    entries: entries.rows,
    places: places.rows,
    ledger: computeBalances(members.rows, entries.rows, trip.fund_keeper_id),
    version: trip.version,
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Create a trip; the creator becomes its leader.
app.post(
  '/api/trips',
  wrap(async (req, res) => {
    const name = str(req.body.name, 80);
    const leaderName = str(req.body.leaderName, 40);
    if (!name) throw bad('Give the trip a name');
    if (!leaderName) throw bad('Add your name');
    const token = crypto.randomBytes(24).toString('base64url');
    const out = await tx(async (run) => {
      const tripId = id();
      const memberId = id();
      let code;
      for (let i = 0; i < 5; i++) {
        code = newCode();
        const { rows } = await run('SELECT 1 FROM trips WHERE code = $1', [code]);
        if (!rows.length) break;
      }
      await run(
        `INSERT INTO trips (id, code, name, destination, start_date, end_date, currency, fund_keeper_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tripId, code, name, str(req.body.destination, 120), date(req.body.startDate), date(req.body.endDate),
          str(req.body.currency, 3).toUpperCase() || 'NPR', memberId],
      );
      await run(
        `INSERT INTO members (id, trip_id, name, role, color, token_hash) VALUES ($1, $2, $3, 'leader', 0, $4)`,
        [memberId, tripId, leaderName, hash(token)],
      );
      return { code, memberId };
    });
    res.status(201).json({ ...out, token });
  }),
);

// Full trip state. Pass ?v=<version> to get { unchanged: true } when nothing moved.
app.get(
  '/api/trips/:code',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    if (req.query.v && Number(req.query.v) === trip.version) return res.json({ unchanged: true });
    res.json(await state(trip));
  }),
);

// Join: claim an existing unclaimed member, or add yourself by name.
app.post(
  '/api/trips/:code/join',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    const token = crypto.randomBytes(24).toString('base64url');
    const memberId = await tx(async (run) => {
      if (req.body.memberId) {
        const { rows } = await run(
          `UPDATE members SET token_hash = $1
           WHERE id = $2 AND trip_id = $3 AND token_hash IS NULL AND left_at IS NULL RETURNING id`,
          [hash(token), req.body.memberId, trip.id],
        );
        if (!rows[0]) throw new HttpError(409, 'Someone already joined as this person. Ask the leader to free it up.');
        await bump(run, trip.id);
        return rows[0].id;
      }
      const name = str(req.body.name, 40);
      if (!name) throw bad('Add your name');
      const newId = id();
      await run(
        'INSERT INTO members (id, trip_id, name, color, token_hash) VALUES ($1, $2, $3, $4, $5)',
        [newId, trip.id, name, await nextColor(run, trip.id), hash(token)],
      );
      await bump(run, trip.id);
      return newId;
    });
    res.status(201).json({ memberId, token });
  }),
);

app.patch(
  '/api/trips/:code',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    await auth(req, trip, { leader: true });
    const b = req.body;
    const next = {
      name: b.name !== undefined ? str(b.name, 80) || trip.name : trip.name,
      destination: b.destination !== undefined ? str(b.destination, 120) : trip.destination,
      start_date: b.startDate !== undefined ? date(b.startDate) : trip.start_date,
      end_date: b.endDate !== undefined ? date(b.endDate) : trip.end_date,
      notes: b.notes !== undefined ? str(b.notes, 4000) : trip.notes,
      fund_keeper_id: b.fundKeeperId !== undefined ? b.fundKeeperId : trip.fund_keeper_id,
    };
    if (b.fundKeeperId !== undefined) {
      const { rows } = await query('SELECT 1 FROM members WHERE id = $1 AND trip_id = $2', [b.fundKeeperId, trip.id]);
      if (!rows.length) throw bad('Fund keeper must be on the trip');
    }
    await query(
      `UPDATE trips SET name=$1, destination=$2, start_date=$3, end_date=$4, notes=$5, fund_keeper_id=$6,
       version = version + 1 WHERE id = $7`,
      [next.name, next.destination, next.start_date, next.end_date, next.notes, next.fund_keeper_id, trip.id],
    );
    res.json({ ok: true });
  }),
);

// Members
app.post(
  '/api/trips/:code/members',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    await auth(req, trip, { leader: true });
    const name = str(req.body.name, 40);
    if (!name) throw bad('Add a name');
    const memberId = id();
    await tx(async (run) => {
      await run(
        'INSERT INTO members (id, trip_id, name, phone, color) VALUES ($1, $2, $3, $4, $5)',
        [memberId, trip.id, name, str(req.body.phone, 30), await nextColor(run, trip.id)],
      );
      await bump(run, trip.id);
    });
    res.status(201).json({ id: memberId });
  }),
);

app.patch(
  '/api/trips/:code/members/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    const me = await auth(req, trip);
    const isLeader = me.role === 'leader';
    const self = me.id === req.params.id;
    if (!isLeader && !self) throw new HttpError(403, 'You can only edit yourself');
    const { rows } = await query('SELECT * FROM members WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
    const m = rows[0];
    if (!m) throw new HttpError(404, 'Member not found');
    const b = req.body;
    let role = m.role;
    if (b.makeLeader && isLeader && !self) {
      // Hand over leadership.
      await query("UPDATE members SET role = 'member' WHERE id = $1", [me.id]);
      role = 'leader';
    }
    await query(
      `UPDATE members SET name=$1, phone=$2, role=$3,
         token_hash = CASE WHEN $4 THEN NULL ELSE token_hash END,
         left_at = CASE WHEN $5 THEN now() WHEN $6 THEN NULL ELSE left_at END
       WHERE id = $7`,
      [
        b.name !== undefined ? str(b.name, 40) || m.name : m.name,
        b.phone !== undefined ? str(b.phone, 30) : m.phone,
        role,
        Boolean(b.release && isLeader && !self),
        Boolean(b.left === true && m.role !== 'leader'),
        Boolean(b.left === false && isLeader),
        m.id,
      ],
    );
    await bump(query, trip.id);
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/trips/:code/members/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    const me = await auth(req, trip, { leader: true });
    if (me.id === req.params.id) throw bad('Hand over leadership before removing yourself');
    const { rows } = await query(
      `SELECT 1 FROM entries WHERE trip_id = $1 AND (from_id = $2 OR to_id = $2 OR shares ? $2) LIMIT 1`,
      [trip.id, req.params.id],
    );
    if (rows.length) throw new HttpError(409, 'This person has payments on the trip. Mark them as left instead.');
    await query('DELETE FROM members WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
    await bump(query, trip.id);
    res.json({ ok: true });
  }),
);

// Entries: expenses, fund deposits and settle-up payments.
async function parseEntry(body, trip) {
  const { rows: members } = await query('SELECT id FROM members WHERE trip_id = $1', [trip.id]);
  const valid = new Set(members.map((m) => m.id));
  const kind = body.kind;
  if (!['expense', 'deposit', 'payment'].includes(kind)) throw bad('Unknown entry type');
  const amount = money(body.amount);
  const e = {
    kind,
    amount,
    title: str(body.title, 80),
    category: str(body.category, 20) || 'other',
    note: str(body.note, 500),
    date: date(body.date) ?? new Date().toISOString().slice(0, 10),
    from_id: body.fromId ?? null,
    to_id: null,
    split_mode: 'equal',
    shares: {},
  };
  if (kind === 'expense') {
    if (!e.title) throw bad('What was it for?');
    if (e.from_id !== null && !valid.has(e.from_id)) throw bad('Pick who paid');
    if (body.splitMode === 'exact') {
      e.split_mode = 'exact';
      const shares = {};
      let sum = 0;
      for (const [mid, v] of Object.entries(body.shares ?? {})) {
        if (!valid.has(mid)) throw bad('Split includes someone not on the trip');
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) throw bad('Shares must be whole paisa');
        if (n > 0) shares[mid] = n;
        sum += n;
      }
      if (sum !== amount) throw bad('Shares must add up to the total');
      e.shares = shares;
    } else {
      const ids = (body.participants ?? []).filter((p) => valid.has(p));
      if (!ids.length) throw bad('Pick at least one person to split with');
      e.shares = equalShares(amount, ids);
    }
  } else {
    if (!valid.has(e.from_id)) throw bad('Pick who paid');
    if (kind === 'payment') {
      e.to_id = body.toId;
      if (!valid.has(e.to_id) || e.to_id === e.from_id) throw bad('Pick who received it');
    }
  }
  return e;
}

app.post(
  '/api/trips/:code/entries',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    const me = await auth(req, trip);
    const e = await parseEntry(req.body, trip);
    const entryId = id();
    await tx(async (run) => {
      await run(
        `INSERT INTO entries (id, trip_id, kind, title, category, amount, from_id, to_id, split_mode, shares, date, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [entryId, trip.id, e.kind, e.title, e.category, e.amount, e.from_id, e.to_id, e.split_mode,
          JSON.stringify(e.shares), e.date, e.note, me.id],
      );
      await bump(run, trip.id);
    });
    res.status(201).json({ id: entryId });
  }),
);

async function ownEntry(req, trip) {
  const me = await auth(req, trip);
  const { rows } = await query('SELECT * FROM entries WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
  if (!rows[0]) throw new HttpError(404, 'Entry not found');
  if (me.role !== 'leader' && rows[0].created_by !== me.id) {
    throw new HttpError(403, 'Only the person who added this, or the leader, can change it');
  }
  return rows[0];
}

app.put(
  '/api/trips/:code/entries/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    const old = await ownEntry(req, trip);
    const e = await parseEntry({ ...req.body, kind: old.kind }, trip);
    await tx(async (run) => {
      await run(
        `UPDATE entries SET title=$1, category=$2, amount=$3, from_id=$4, to_id=$5, split_mode=$6, shares=$7,
         date=$8, note=$9, updated_at=now() WHERE id=$10`,
        [e.title, e.category, e.amount, e.from_id, e.to_id, e.split_mode, JSON.stringify(e.shares), e.date, e.note, old.id],
      );
      await bump(run, trip.id);
    });
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/trips/:code/entries/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    const old = await ownEntry(req, trip);
    await tx(async (run) => {
      await run('DELETE FROM entries WHERE id = $1', [old.id]);
      await bump(run, trip.id);
    });
    res.json({ ok: true });
  }),
);

// Places: route stops, stays and contacts. Leader-managed.
const PLACE_KINDS = ['stop', 'stay', 'contact'];
const parsePlace = (b) => {
  if (!PLACE_KINDS.includes(b.kind)) throw bad('Unknown place type');
  const title = str(b.title, 80);
  if (!title) throw bad('Add a name');
  const day = b.day === '' || b.day == null ? null : Number(b.day);
  return [b.kind, title, str(b.phone, 30), str(b.address, 200), Number.isInteger(day) ? day : null, str(b.note, 500), Number(b.sort) || 0];
};

app.post(
  '/api/trips/:code/places',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    await auth(req, trip, { leader: true });
    const placeId = id();
    await tx(async (run) => {
      await run(
        'INSERT INTO places (id, trip_id, kind, title, phone, address, day, note, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [placeId, trip.id, ...parsePlace(req.body)],
      );
      await bump(run, trip.id);
    });
    res.status(201).json({ id: placeId });
  }),
);

app.put(
  '/api/trips/:code/places/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    await auth(req, trip, { leader: true });
    await tx(async (run) => {
      await run(
        'UPDATE places SET kind=$1, title=$2, phone=$3, address=$4, day=$5, note=$6, sort=$7 WHERE id=$8 AND trip_id=$9',
        [...parsePlace(req.body), req.params.id, trip.id],
      );
      await bump(run, trip.id);
    });
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/trips/:code/places/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code);
    await auth(req, trip, { leader: true });
    await tx(async (run) => {
      await run('DELETE FROM places WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
      await bump(run, trip.id);
    });
    res.json({ ok: true });
  }),
);

const port = Number(process.env.PORT) || 8787;
await connect();
app.listen(port, () => console.log(`Saathi API on :${port}`));
