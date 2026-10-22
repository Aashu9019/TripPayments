import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { connect, query, tx, sys, inScope, useTrip, useSystem } from './db.js';
import { computeBalances, equalShares } from './ledger.js';
import { avatarRoutes } from './avatars.js';

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for per-IP login throttling
const origins = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '400kb' })); // room for one compressed profile photo

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

/** Currencies a trip can use (labels only; amounts are never converted). */
const CURRENCIES = new Set('NPR INR USD EUR GBP AUD CAD CNY JPY THB BDT LKR AED SGD MYR'.split(' '));
const currency = (v) => {
  const c = String(v ?? '').trim().toUpperCase();
  if (!CURRENCIES.has(c)) throw bad('Pick a currency from the list');
  return c;
};

/** "9841234567", "+977-984-1234567" -> "+9779841234567". Nepal is the default country. */
function normalizePhone(v) {
  if (typeof v !== 'string') return null;
  let d = v.replace(/[^\d+]/g, '');
  const intl = d.startsWith('+');
  d = d.replace(/\D/g, '');
  if (!intl && d.length === 10 && d.startsWith('9')) d = `977${d}`;
  if (d.startsWith('00')) d = d.slice(2);
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const money = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 1e12) throw bad('Amount must be a positive whole number of paisa');
  return n;
};

// Every request gets its own tenant scope (see db.js); nothing is visible until a route declares one.
const wrap = (fn) => (req, res) =>
  inScope(() => fn(req, res)).catch((e) => {
    if (!(e instanceof HttpError)) console.error(e);
    res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Something went wrong' });
  });

// Guessing trip codes: at most 30 unknown codes per IP per 10 minutes.
const misses = new Map();
function noteMiss(ip) {
  const now = Date.now();
  const m = misses.get(ip);
  if (!m || now - m.start > 10 * 60_000) misses.set(ip, { start: now, n: 1 });
  else if (++m.n > 30) throw new HttpError(429, 'Too many tries. Wait a few minutes.');
}

/** Find a trip by its code and make it this request's tenant. */
async function loadTrip(code, req) {
  const { rows } = await sys('SELECT * FROM trips WHERE code = $1', [String(code).toUpperCase()]);
  if (!rows[0]) {
    if (req) noteMiss(req.ip);
    throw new HttpError(404, 'No trip with that code');
  }
  useTrip(rows[0].id);
  return rows[0];
}

// ---------- Accounts ----------

const scrypt = (password, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))),
  );

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${await scrypt(password, salt)}`;
}

async function checkPassword(password, stored) {
  const [salt, key] = stored.split(':');
  const test = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(key, 'hex'));
}

async function newSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await sys('INSERT INTO auth_sessions (token_hash, user_id) VALUES ($1, $2)', [hash(token), userId]);
  return token;
}

/** The signed-in user from `Authorization: Bearer <token>`, or null. */
async function currentUser(req) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const { rows } = await sys(
    'SELECT u.id, u.phone, u.name, u.avatar_id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1',
    [hash(token)],
  );
  return rows[0] ?? null;
}

async function requireUser(req) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, 'Please sign in');
  return user;
}

// Roles, Clash of Clans style. Leader: everything. Co-leader: everything but
// deleting the trip or acting on equal/higher ranks. Member: trip info + own payments.
const RANK = { member: 0, coleader: 1, leader: 2 };
const rank = (m) => RANK[m.role] ?? 0;
const canManage = (m) => rank(m) >= RANK.coleader;

/** The caller's membership in this trip. `manage`: leader or co-leader. `owner`: leader only. */
async function auth(req, trip, { manage = false, owner = false } = {}) {
  const user = await requireUser(req);
  const { rows } = await query('SELECT * FROM members WHERE trip_id = $1 AND user_id = $2 AND left_at IS NULL', [
    trip.id,
    user.id,
  ]);
  const me = rows[0];
  if (!me) throw new HttpError(403, 'You are not on this trip. Join it first.');
  if (owner && me.role !== 'leader') throw new HttpError(403, 'Only the trip leader can do that');
  if (manage && !canManage(me)) throw new HttpError(403, 'Only the leader or a co-leader can do that');
  return me;
}

// Small in-memory brake on password guessing: 10 tries per 10 minutes per IP + phone number.
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.start > 10 * 60_000) {
    attempts.set(key, { start: now, n: 1 });
    return;
  }
  if (++a.n > 10) throw new HttpError(429, 'Too many tries. Wait a few minutes.');
}

/**
 * Seats the leader added with this phone number, not yet claimed, become the
 * account's seats. One seat per trip; trips the account is already on are skipped.
 */
async function linkSeatsByPhone(run, userId, phone) {
  if (!phone) return;
  const { rows } = await run(
    `SELECT DISTINCT ON (m.trip_id) m.id, m.trip_id FROM members m
     WHERE m.phone = $1 AND m.user_id IS NULL AND m.left_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM members x WHERE x.trip_id = m.trip_id AND x.user_id = $2)
     ORDER BY m.trip_id, m.created_at`,
    [phone, userId],
  );
  for (const r of rows) {
    await run('UPDATE members SET user_id = $1 WHERE id = $2', [userId, r.id]);
    await run('UPDATE trips SET version = version + 1 WHERE id = $1', [r.trip_id]);
  }
}

const bump = (run, tripId) => run('UPDATE trips SET version = version + 1 WHERE id = $1', [tripId]);

async function nextColor(run, tripId) {
  const { rows } = await run('SELECT count(*)::int AS n FROM members WHERE trip_id = $1', [tripId]);
  return rows[0].n % 8;
}

const MEMBER_COLS = `m.id, m.name, m.role, m.phone, m.color, m.left_at, m.created_at, m.user_id, COALESCE(u.avatar_id, m.avatar_id) AS avatar`;
const ENTRY_COLS = 'id, kind, title, category, amount, from_id, to_id, split_mode, shares, date, note, created_by, created_at, updated_at';
const PLACE_COLS = 'id, kind, title, phone, address, day, note, sort, created_at';

async function state(trip, userId = null) {
  const [members, entries, places] = await tx(async (run) => [
    await run(
      `SELECT ${MEMBER_COLS} FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.trip_id = $1 ORDER BY m.created_at`,
      [trip.id],
    ),
    await run(`SELECT ${ENTRY_COLS} FROM entries WHERE trip_id = $1 ORDER BY date DESC, created_at DESC`, [trip.id]),
    await run(`SELECT ${PLACE_COLS} FROM places WHERE trip_id = $1 ORDER BY kind, sort, day NULLS LAST, created_at`, [trip.id]),
  ]);
  const { id: _id, ...publicTrip } = trip;
  const me = userId ? members.rows.find((m) => m.user_id === userId && !m.left_at) : null;
  if (!me) {
    // Not a member: only what the join screen needs. No phones, money, places or notes.
    return {
      preview: true,
      trip: { code: trip.code, name: trip.name, destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date, currency: trip.currency },
      meId: null,
      members: members.rows
        .filter((m) => !m.left_at)
        .map((m) => ({ id: m.id, name: m.name, color: m.color, role: m.role, claimed: m.user_id !== null, phone: '', left_at: null, avatar: null })),
      entries: [],
      places: [],
      ledger: computeBalances([], [], null),
      version: 0,
    };
  }
  return {
    trip: publicTrip,
    meId: me?.id ?? null,
    members: members.rows.map(({ user_id, ...m }) => ({ ...m, claimed: user_id !== null })),
    entries: entries.rows,
    places: places.rows,
    ledger: computeBalances(members.rows, entries.rows, trip.fund_keeper_id),
    version: trip.version,
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post(
  '/api/auth/signup',
  wrap(async (req, res) => {
    useSystem();
    const phone = normalizePhone(req.body.phone);
    const name = str(req.body.name, 40);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!phone) throw bad('Enter a valid phone number');
    if (!name) throw bad('Add your name');
    if (password.length < 6) throw bad('Password needs at least 6 characters');
    const { rows } = await query('SELECT 1 FROM users WHERE phone = $1', [phone]);
    if (rows.length) throw new HttpError(409, 'An account with this number exists. Sign in instead.');
    const userId = id();
    await query('INSERT INTO users (id, phone, name, pass_hash) VALUES ($1, $2, $3, $4)', [
      userId,
      phone,
      name,
      await hashPassword(password),
    ]);
    await linkSeatsByPhone(query, userId, phone);
    res.status(201).json({ token: await newSession(userId), user: { id: userId, phone, name } });
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    useSystem();
    const phone = normalizePhone(req.body.phone);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!phone) throw bad('Enter a valid phone number');
    throttle(`${req.ip}:${phone}`);
    const { rows } = await query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = rows[0];
    if (!user || !(await checkPassword(password, user.pass_hash))) throw new HttpError(401, 'Wrong phone number or password');
    await linkSeatsByPhone(query, user.id, user.phone);
    res.json({ token: await newSession(user.id), user: { id: user.id, phone: user.phone, name: user.name, avatarId: user.avatar_id } });
  }),
);

app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    useSystem();
    const header = req.get('authorization') ?? '';
    if (header.startsWith('Bearer ')) await query('DELETE FROM auth_sessions WHERE token_hash = $1', [hash(header.slice(7))]);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/auth/me',
  wrap(async (req, res) => {
    useSystem();
    const { avatar_id, ...user } = await requireUser(req);
    res.json({ user: { ...user, avatarId: avatar_id } });
  }),
);

// Every trip the signed-in user is on, with their balance in each.
app.get(
  '/api/me/trips',
  wrap(async (req, res) => {
    useSystem();
    const user = await requireUser(req);
    const { rows: trips } = await query(
      `SELECT t.*, m.id AS member_id, m.role FROM trips t JOIN members m ON m.trip_id = t.id
       WHERE m.user_id = $1 AND m.left_at IS NULL ORDER BY COALESCE(t.start_date, t.created_at::date) DESC`,
      [user.id],
    );
    const out = await Promise.all(
      trips.map(async (t) => {
        const [{ rows: members }, { rows: entries }] = await Promise.all([
          query('SELECT id FROM members WHERE trip_id = $1', [t.id]),
          query('SELECT kind, amount, from_id, to_id, shares FROM entries WHERE trip_id = $1', [t.id]),
        ]);
        const ledger = computeBalances(members, entries, t.fund_keeper_id);
        return {
          code: t.code,
          name: t.name,
          destination: t.destination,
          start_date: t.start_date,
          end_date: t.end_date,
          currency: t.currency,
          role: t.role,
          people: members.length,
          total: ledger.total,
          net: ledger.net[t.member_id] ?? 0,
        };
      }),
    );
    res.json({ trips: out });
  }),
);

// Create a trip; the creator becomes its leader.
app.post(
  '/api/trips',
  wrap(async (req, res) => {
    useSystem();
    const user = await requireUser(req);
    const name = str(req.body.name, 80);
    if (!name) throw bad('Give the trip a name');
    const code = await tx(async (run) => {
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
          req.body.currency ? currency(req.body.currency) : 'NPR', memberId],
      );
      await run(
        `INSERT INTO members (id, trip_id, name, role, color, user_id, phone) VALUES ($1, $2, $3, 'leader', 0, $4, $5)`,
        [memberId, tripId, user.name, user.id, user.phone],
      );
      return code;
    });
    res.status(201).json({ code });
  }),
);

// Full trip state. Pass ?v=<version> to get { unchanged: true } when nothing moved.
app.get(
  '/api/trips/:code',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    const user = await currentUser(req);
    if (req.query.v && Number(req.query.v) === trip.version && user) {
      const { rows } = await query('SELECT 1 FROM members WHERE trip_id = $1 AND user_id = $2 AND left_at IS NULL', [trip.id, user.id]);
      if (rows.length) return res.json({ unchanged: true });
    }
    res.json(await state(trip, user?.id));
  }),
);

// Join: claim a seat the leader added, or add yourself. Safe to call again.
app.post(
  '/api/trips/:code/join',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    const user = await requireUser(req);
    const memberId = await tx(async (run) => {
      const { rows: existing } = await run('SELECT id, left_at FROM members WHERE trip_id = $1 AND user_id = $2', [
        trip.id,
        user.id,
      ]);
      if (existing[0] && !existing[0].left_at) return existing[0].id;
      if (existing[0]) {
        await run('UPDATE members SET left_at = NULL WHERE id = $1', [existing[0].id]);
      } else if (req.body.memberId) {
        const { rows } = await run(
          `UPDATE members SET user_id = $1, phone = CASE WHEN phone = '' THEN $4 ELSE phone END
           WHERE id = $2 AND trip_id = $3 AND user_id IS NULL AND left_at IS NULL RETURNING id`,
          [user.id, req.body.memberId, trip.id, user.phone],
        );
        if (!rows[0]) throw new HttpError(409, 'Someone already joined as this person. Ask the leader to free it up.');
      } else {
        await run('INSERT INTO members (id, trip_id, name, color, user_id, phone) VALUES ($1, $2, $3, $4, $5, $6)', [
          id(),
          trip.id,
          str(req.body.name, 40) || user.name,
          await nextColor(run, trip.id),
          user.id,
          user.phone,
        ]);
      }
      await bump(run, trip.id);
      const { rows } = await run('SELECT id FROM members WHERE trip_id = $1 AND user_id = $2', [trip.id, user.id]);
      return rows[0].id;
    });
    res.status(201).json({ memberId });
  }),
);

app.patch(
  '/api/trips/:code',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    const me = await auth(req, trip);
    const b = req.body;
    if (b.fundKeeperId !== undefined && !canManage(me)) throw new HttpError(403, 'Only the leader or a co-leader can change the fund keeper');
    if (b.currency !== undefined && !canManage(me)) throw new HttpError(403, 'Only the leader or a co-leader can change the currency');
    const next = {
      name: b.name !== undefined ? str(b.name, 80) || trip.name : trip.name,
      destination: b.destination !== undefined ? str(b.destination, 120) : trip.destination,
      start_date: b.startDate !== undefined ? date(b.startDate) : trip.start_date,
      end_date: b.endDate !== undefined ? date(b.endDate) : trip.end_date,
      notes: b.notes !== undefined ? str(b.notes, 4000) : trip.notes,
      fund_keeper_id: b.fundKeeperId !== undefined ? b.fundKeeperId : trip.fund_keeper_id,
      currency: b.currency !== undefined ? currency(b.currency) : trip.currency,
    };
    if (b.fundKeeperId !== undefined) {
      const { rows } = await query('SELECT 1 FROM members WHERE id = $1 AND trip_id = $2', [b.fundKeeperId, trip.id]);
      if (!rows.length) throw bad('Fund keeper must be on the trip');
    }
    await query(
      `UPDATE trips SET name=$1, destination=$2, start_date=$3, end_date=$4, notes=$5, fund_keeper_id=$6, currency=$7,
       version = version + 1 WHERE id = $8`,
      [next.name, next.destination, next.start_date, next.end_date, next.notes, next.fund_keeper_id, next.currency, trip.id],
    );
    res.json({ ok: true });
  }),
);

// Leader deletes the whole trip: members, payments, places. Clients confirm with the trip code.
app.delete(
  '/api/trips/:code',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    await auth(req, trip, { owner: true });
    if (String(req.body?.confirm ?? '').toUpperCase() !== trip.code) throw bad('Type the trip code to confirm');
    await query('DELETE FROM trips WHERE id = $1', [trip.id]);
    res.json({ ok: true });
  }),
);

// Members
app.post(
  '/api/trips/:code/members',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    await auth(req, trip);
    const name = str(req.body.name, 40);
    if (!name) throw bad('Add a name');
    const memberId = id();
    const raw = str(req.body.phone, 30);
    const phone = raw ? normalizePhone(raw) : '';
    if (raw && !phone) throw bad('That phone number does not look right');
    let linked = false;
    // Look the account up first: no system query may run inside the tenant transaction.
    const account = phone ? (await sys('SELECT id FROM users WHERE phone = $1', [phone])).rows[0] : null;
    await tx(async (run) => {
      await run(
        'INSERT INTO members (id, trip_id, name, phone, color) VALUES ($1, $2, $3, $4, $5)',
        [memberId, trip.id, name, phone, await nextColor(run, trip.id)],
      );
      if (account) {
        await linkSeatsByPhone(run, account.id, phone);
        const { rows } = await run('SELECT user_id FROM members WHERE id = $1', [memberId]);
        linked = !!rows[0]?.user_id;
      }
      await bump(run, trip.id);
    });
    res.status(201).json({ id: memberId, linked });
  }),
);

app.patch(
  '/api/trips/:code/members/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    const me = await auth(req, trip);
    const self = me.id === req.params.id;
    const { rows } = await query('SELECT * FROM members WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
    const m = rows[0];
    if (!m) throw new HttpError(404, 'Member not found');
    // You may change yourself, or anyone ranked below you if you are leader / co-leader.
    const over = canManage(me) && rank(me) > rank(m);
    if (!self && !over) throw new HttpError(403, 'You can only change people ranked below you');
    const b = req.body;
    let role = m.role;
    if (b.role === 'coleader' && m.role === 'member') {
      if (!canManage(me)) throw new HttpError(403, 'Only the leader or a co-leader can promote');
      role = 'coleader';
    } else if (b.role === 'member' && m.role === 'coleader') {
      if (me.role !== 'leader' && !self) throw new HttpError(403, 'Only the leader can demote a co-leader');
      role = 'member';
    }
    if (b.makeLeader && !self) {
      if (me.role !== 'leader') throw new HttpError(403, 'Only the leader can hand over leadership');
      // Hand over leadership; the old leader stays on as co-leader.
      await query("UPDATE members SET role = 'coleader' WHERE id = $1", [me.id]);
      role = 'leader';
    }
    if (b.left === true && self && m.role === 'leader') throw bad('Hand over leadership before leaving the trip');
    const rawPhone = b.phone !== undefined ? str(b.phone, 30) : null;
    const newPhone = rawPhone === null ? m.phone : rawPhone ? (normalizePhone(rawPhone) ?? rawPhone) : '';
    await query(
      `UPDATE members SET name=$1, phone=$2, role=$3,
         user_id = CASE WHEN $4 THEN NULL ELSE user_id END,
         left_at = CASE WHEN $5 THEN now() WHEN $6 THEN NULL ELSE left_at END
       WHERE id = $7`,
      [
        b.name !== undefined ? str(b.name, 40) || m.name : m.name,
        newPhone,
        role,
        Boolean(b.release && over),
        Boolean(b.left === true && (self || over) && m.role !== 'leader'),
        Boolean(b.left === false && canManage(me)),
        m.id,
      ],
    );
    // A number added for an unclaimed seat may already belong to an account.
    if (!m.user_id && newPhone && newPhone !== m.phone) {
      const { rows: acct } = await sys('SELECT id FROM users WHERE phone = $1', [newPhone]);
      if (acct[0]) await linkSeatsByPhone(query, acct[0].id, newPhone);
    }
    await bump(query, trip.id);
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/trips/:code/members/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
    const me = await auth(req, trip, { manage: true });
    if (me.id === req.params.id) throw bad('Use Leave trip to remove yourself');
    const { rows: target } = await query('SELECT role FROM members WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
    if (!target[0]) throw new HttpError(404, 'Member not found');
    if (rank(me) <= rank(target[0])) throw new HttpError(403, 'You can only remove people ranked below you');
    const { rows } = await query(
      `SELECT 1 FROM entries WHERE trip_id = $1 AND (from_id = $2 OR to_id = $2 OR shares ? $2) LIMIT 1`,
      [trip.id, req.params.id],
    );
    if (rows.length) {
      // Their payments must stay so balances add up: drop access, keep the ledger seat.
      await query('UPDATE members SET left_at = now(), user_id = NULL WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
    } else {
      await query('DELETE FROM members WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
    }
    await bump(query, trip.id);
    res.json({ ok: true, kept: rows.length > 0 });
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
    const trip = await loadTrip(req.params.code, req);
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
  if (!canManage(me) && rows[0].created_by !== me.id) {
    throw new HttpError(403, 'Only the person who added this, the leader or a co-leader can change it');
  }
  return rows[0];
}

app.put(
  '/api/trips/:code/entries/:id',
  wrap(async (req, res) => {
    const trip = await loadTrip(req.params.code, req);
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
    const trip = await loadTrip(req.params.code, req);
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
    const trip = await loadTrip(req.params.code, req);
    await auth(req, trip);
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
    const trip = await loadTrip(req.params.code, req);
    await auth(req, trip);
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
    const trip = await loadTrip(req.params.code, req);
    await auth(req, trip);
    await tx(async (run) => {
      await run('DELETE FROM places WHERE id = $1 AND trip_id = $2', [req.params.id, trip.id]);
      await bump(run, trip.id);
    });
    res.json({ ok: true });
  }),
);

avatarRoutes(app, { query, tx, wrap, requireUser, HttpError, id, useSystem, loadTrip });

const port = Number(process.env.PORT) || 8787;
await connect();
app.listen(port, () => console.log(`SajiloTrip API on :${port}`));
