// Superadmin: platform-wide view of people and trips.
// Credentials come only from ADMIN_PHONE / ADMIN_PASSWORD env vars.

/** Create or refresh the admin account from env on every start (rotating the password is a redeploy). */
export async function ensureAdmin({ query, id, normalizePhone, hashPassword }) {
  const phone = normalizePhone(process.env.ADMIN_PHONE ?? '');
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!phone || password.length < 10) {
    if (process.env.ADMIN_PHONE || process.env.ADMIN_PASSWORD) {
      console.warn('Admin not set up: ADMIN_PHONE must be valid and ADMIN_PASSWORD at least 10 characters.');
    }
    return;
  }
  const pass = await hashPassword(password);
  const { rows } = await query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (rows[0]) {
    await query('UPDATE users SET is_admin = true, pass_hash = $1 WHERE id = $2', [pass, rows[0].id]);
  } else {
    await query("INSERT INTO users (id, phone, name, pass_hash, is_admin) VALUES ($1, $2, 'Super admin', $3, true)", [
      id(),
      phone,
      pass,
    ]);
  }
  // Only the env-configured number is admin.
  await query('UPDATE users SET is_admin = false WHERE is_admin AND phone <> $1', [phone]);
  console.log('Admin account ready for', phone);
}

export function adminRoutes(app, { query, wrap, requireUser, HttpError, computeBalances }) {
  const requireAdmin = async (req) => {
    const user = await requireUser(req);
    if (!user.is_admin) throw new HttpError(403, 'Admins only');
    return user;
  };
  const like = (q) => `%${String(q ?? '').trim().replace(/[%_\\]/g, '\\$&')}%`;

  app.get(
    '/api/admin/stats',
    wrap(async (req, res) => {
      await requireAdmin(req);
      const { rows } = await query(`SELECT
        (SELECT count(*)::int FROM users WHERE NOT is_admin) AS users,
        (SELECT count(*)::int FROM users WHERE NOT is_admin AND created_at > now() - interval '7 days') AS users_week,
        (SELECT count(*)::int FROM trips) AS trips,
        (SELECT count(*)::int FROM trips WHERE created_at > now() - interval '7 days') AS trips_week,
        (SELECT count(*)::int FROM entries) AS entries,
        (SELECT COALESCE(sum(amount), 0)::bigint FROM entries WHERE kind = 'expense') AS spent,
        (SELECT count(DISTINCT trip_id)::int FROM entries WHERE updated_at > now() - interval '7 days') AS active_trips`);
      res.json(rows[0]);
    }),
  );

  app.get(
    '/api/admin/trips',
    wrap(async (req, res) => {
      await requireAdmin(req);
      const { rows } = await query(
        `SELECT t.code, t.name, t.destination, t.start_date, t.end_date, t.currency, t.created_at,
           (SELECT name FROM members WHERE trip_id = t.id AND role = 'leader' LIMIT 1) AS leader,
           (SELECT u.phone FROM members m JOIN users u ON u.id = m.user_id WHERE m.trip_id = t.id AND m.role = 'leader' LIMIT 1) AS leader_phone,
           (SELECT count(*)::int FROM members WHERE trip_id = t.id AND left_at IS NULL) AS people,
           (SELECT count(*)::int FROM entries WHERE trip_id = t.id) AS entries,
           (SELECT COALESCE(sum(amount), 0)::bigint FROM entries WHERE trip_id = t.id AND kind = 'expense') AS total,
           (SELECT max(updated_at) FROM entries WHERE trip_id = t.id) AS last_activity
         FROM trips t
         WHERE t.name ILIKE $1 OR t.code ILIKE $1 OR t.destination ILIKE $1
         ORDER BY t.created_at DESC LIMIT 500`,
        [like(req.query.q)],
      );
      res.json({ trips: rows });
    }),
  );

  app.get(
    '/api/admin/trips/:code',
    wrap(async (req, res) => {
      await requireAdmin(req);
      const { rows } = await query('SELECT * FROM trips WHERE code = $1', [req.params.code.toUpperCase()]);
      const t = rows[0];
      if (!t) throw new HttpError(404, 'Trip not found');
      const [{ rows: members }, { rows: entries }] = await Promise.all([
        query(
          `SELECT m.id, m.name, m.role, m.left_at, m.created_at, u.phone AS account_phone
           FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.trip_id = $1 ORDER BY m.created_at`,
          [t.id],
        ),
        query('SELECT * FROM entries WHERE trip_id = $1 ORDER BY date DESC, created_at DESC', [t.id]),
      ]);
      const ledger = computeBalances(members, entries, t.fund_keeper_id);
      res.json({
        trip: { code: t.code, name: t.name, destination: t.destination, currency: t.currency, created_at: t.created_at },
        members: members.map((m) => ({ ...m, spent: ledger.spent[m.id] ?? 0, net: ledger.net[m.id] ?? 0 })),
        entries: entries.slice(0, 50).map((e) => ({ id: e.id, kind: e.kind, title: e.title, amount: e.amount, date: e.date })),
        total: ledger.total,
        fund: ledger.fund,
      });
    }),
  );

  app.delete(
    '/api/admin/trips/:code',
    wrap(async (req, res) => {
      await requireAdmin(req);
      const { rows } = await query('DELETE FROM trips WHERE code = $1 RETURNING code', [req.params.code.toUpperCase()]);
      if (!rows.length) throw new HttpError(404, 'Trip not found');
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/admin/users',
    wrap(async (req, res) => {
      await requireAdmin(req);
      const { rows } = await query(
        `SELECT u.id, u.name, u.phone, u.created_at,
           (SELECT count(*)::int FROM members WHERE user_id = u.id AND left_at IS NULL) AS trips,
           (SELECT count(*)::int FROM members WHERE user_id = u.id AND role = 'leader') AS leading,
           (SELECT max(created_at) FROM auth_sessions WHERE user_id = u.id) AS last_login
         FROM users u
         WHERE NOT u.is_admin AND (u.name ILIKE $1 OR u.phone ILIKE $1)
         ORDER BY u.created_at DESC LIMIT 500`,
        [like(req.query.q)],
      );
      res.json({ users: rows });
    }),
  );

  app.delete(
    '/api/admin/users/:id',
    wrap(async (req, res) => {
      await requireAdmin(req);
      // Their trip seats stay (balances must still add up) but become unclaimed.
      const { rows } = await query('DELETE FROM users WHERE id = $1 AND NOT is_admin RETURNING id', [req.params.id]);
      if (!rows.length) throw new HttpError(404, 'Person not found');
      res.json({ ok: true });
    }),
  );

  app.delete(
    '/api/admin/users/:id/sessions',
    wrap(async (req, res) => {
      await requireAdmin(req);
      await query('DELETE FROM auth_sessions WHERE user_id = $1', [req.params.id]);
      res.json({ ok: true });
    }),
  );
}
