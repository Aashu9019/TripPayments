# Data isolation

Each trip is a tenant. Isolation is enforced in Postgres itself with
row-level security (RLS), not only in application code.

## How it works

- Tables `trips`, `members`, `entries`, `places`, `avatars`, `users` and
  `auth_sessions` have RLS enabled and **forced** (applies to the table owner too).
- Every request runs in its own scope (`AsyncLocalStorage` in `server/src/db.js`).
  Each query runs in a transaction that sets:
  - `app.trip_id` — the tenant the request is working on
  - `app.bypass` — `on` only for system work (sign-in, "my trips", admin)
- Tenant work also switches to the restricted role `sajilo_app`
  (`NOLOGIN NOBYPASSRLS`), so policies apply even if the connection role
  could normally bypass them.
- Policy: a row is visible/writable only when its `trip_id` equals
  `app.trip_id`. Users are visible inside a trip only if they are members of
  it. Sessions are system-only.
- A request that declares no tenant sees **nothing** (fails closed).
- Trip routes declare their tenant in `loadTrip()`, which looks the trip up
  by code and calls `useTrip()`. Global routes call `useSystem()`.

## What non-members can see

`GET /api/trips/:code` without membership returns a join preview only:
trip name, destination, dates and the names of open seats. No phone
numbers, payments, places, notes or balances. Unknown codes are throttled
(30 per IP per 10 minutes) to stop code guessing.

## Tests

- `server/src/rls.test.js` — runs against a real Postgres (PGlite): a tenant
  sees only its rows with no `WHERE` clause, cannot update/delete/insert into
  another trip, and an undeclared scope sees nothing.
- API isolation checks (one person in two trips, an outsider, a removed
  member) cover cross-trip edits, deletes, payments, photos, fund keeper and
  the "my trips" list.

## Known trade-offs

- Anyone with a trip code can see the open seat names and claim one.
- Phone numbers are not verified by SMS; whoever first creates an account
  with a number owns it.
