// Profile photos. The browser crops and compresses to a small square before
// upload, so photos live in Postgres; each upload gets a new id, so the image
// URL can be cached forever.

const MAX_BYTES = 200 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

export function avatarRoutes(app, { query, tx, wrap, requireUser, HttpError, id, useSystem, loadTrip }) {
  // Everyone sharing a trip with this user should pull fresh state.
  const bumpTrips = (run, userId) =>
    run('UPDATE trips SET version = version + 1 WHERE id IN (SELECT trip_id FROM members WHERE user_id = $1)', [userId]);

  app.put(
    '/api/me/avatar',
    wrap(async (req, res) => {
      useSystem();
      const user = await requireUser(req);
      const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image ?? ''));
      if (!m || !TYPES[m[1]]) throw new HttpError(400, 'Send a JPEG, WebP or PNG image');
      const data = Buffer.from(m[2], 'base64');
      if (data.length > MAX_BYTES) throw new HttpError(413, 'Photo is too large');
      const avatarId = id();
      await tx(async (run) => {
        await run('DELETE FROM avatars WHERE user_id = $1', [user.id]);
        await run('INSERT INTO avatars (id, user_id, mime, data) VALUES ($1, $2, $3, $4)', [avatarId, user.id, m[1], data]);
        await run('UPDATE users SET avatar_id = $1 WHERE id = $2', [avatarId, user.id]);
        await bumpTrips(run, user.id);
      });
      res.json({ avatarId });
    }),
  );

  // Trip leader sets a photo for someone on the trip (shown until they set their own).
  app.put(
    '/api/trips/:code/members/:id/avatar',
    wrap(async (req, res) => {
      const trip = await loadTrip(req.params.code, req);
      const user = await requireUser(req);
      const { rows } = await query('SELECT id, trip_id FROM members WHERE trip_id = $1 AND id = $2', [trip.id, req.params.id]);
      const target = rows[0];
      if (!target) throw new HttpError(404, 'Member not found');
      const { rows: mine } = await query(
        'SELECT id, role FROM members WHERE trip_id = $1 AND user_id = $2 AND left_at IS NULL',
        [target.trip_id, user.id],
      );
      const { rows: tr } = await query('SELECT role FROM members WHERE id = $1', [target.id]);
      const RANK = { member: 0, coleader: 1, leader: 2 };
      const me = mine[0];
      if (!me || RANK[me.role] < 1 || RANK[me.role] <= RANK[tr[0].role]) {
        throw new HttpError(403, 'Only the leader or a co-leader can set photos for people ranked below them');
      }
      const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image ?? ''));
      const remove = req.body.image === null;
      if (!remove && (!m || !TYPES[m[1]])) throw new HttpError(400, 'Send a JPEG, WebP or PNG image');
      const data = remove ? null : Buffer.from(m[2], 'base64');
      if (data && data.length > MAX_BYTES) throw new HttpError(413, 'Photo is too large');
      const avatarId = remove ? null : id();
      await tx(async (run) => {
        await run('DELETE FROM avatars WHERE member_id = $1', [target.id]);
        if (!remove) {
          await run('INSERT INTO avatars (id, member_id, mime, data) VALUES ($1, $2, $3, $4)', [avatarId, target.id, m[1], data]);
        }
        await run('UPDATE members SET avatar_id = $1 WHERE id = $2', [avatarId, target.id]);
        await run('UPDATE trips SET version = version + 1 WHERE id = $1', [target.trip_id]);
      });
      res.json({ avatarId });
    }),
  );

  app.delete(
    '/api/me/avatar',
    wrap(async (req, res) => {
      useSystem();
      const user = await requireUser(req);
      await tx(async (run) => {
        await run('DELETE FROM avatars WHERE user_id = $1', [user.id]);
        await run('UPDATE users SET avatar_id = NULL WHERE id = $1', [user.id]);
        await bumpTrips(run, user.id);
      });
      res.json({ ok: true });
    }),
  );

  app.patch(
    '/api/me',
    wrap(async (req, res) => {
      useSystem();
      const user = await requireUser(req);
      const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
      if (!name) throw new HttpError(400, 'Add your name');
      await tx(async (run) => {
        await run('UPDATE users SET name = $1 WHERE id = $2', [name, user.id]);
        await run('UPDATE members SET name = $1 WHERE user_id = $2', [name, user.id]);
        await bumpTrips(run, user.id);
      });
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/avatars/:id',
    wrap(async (req, res) => {
      useSystem();
      const { rows } = await query('SELECT mime, data FROM avatars WHERE id = $1', [req.params.id]);
      if (!rows[0]) throw new HttpError(404, 'No such photo');
      res.set('Content-Type', rows[0].mime);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(Buffer.from(rows[0].data));
    }),
  );
}
