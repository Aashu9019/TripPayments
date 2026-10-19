# API

Base: `/api`. Amounts are integer paisa. Signed-in requests send
`Authorization: Bearer <token>` (from signup/login). Phone numbers are
normalised to `+<country><number>`; bare 10-digit Nepali mobiles get +977.

| Method | Path | Who | Body |
|---|---|---|---|
| GET | `/health` | anyone | |
| POST | `/auth/signup` | anyone | `phone, name, password` → `{token, user}` |
| POST | `/auth/login` | anyone | `phone, password` → `{token, user}` (10 tries / 10 min) |
| POST | `/auth/logout` | signed in | ends this session |
| GET | `/auth/me` | signed in | `{user}` |
| GET | `/me/trips` | signed in | your trips with your balance in each |
| PATCH | `/me` | signed in | `name` (also renames your trip seats) |
| PUT | `/me/avatar` | signed in | `image` as a JPEG/WebP/PNG data URL, max 200 KB → `{avatarId}` |
| DELETE | `/me/avatar` | signed in | removes your photo |
| PUT | `/trips/:code/members/:id/avatar` | leader | `image` data URL, or `null` to remove; shown until the person sets their own |
| GET | `/avatars/:id` | anyone | the photo, cached for a year (ids change on every upload) |
| POST | `/trips` | signed in | `name, destination?, startDate?, endDate?` → `{code}`; you become leader |
| GET | `/trips/:code?v=N` | anyone with code | full state incl. `meId` when signed in, or `{unchanged:true}` |
| POST | `/trips/:code/join` | signed in | `memberId` (claim a seat) or nothing (join as yourself) → `{memberId}` |
| PATCH | `/trips/:code` | leader | `name, destination, startDate, endDate, notes, fundKeeperId` |
| POST | `/trips/:code/members` | leader | `name, phone?` → `{id, linked}`; a phone that already has an account links the seat at once |
| PATCH | `/trips/:code/members/:id` | leader or self | `name, phone, release` (free seat), `makeLeader, left` |
| DELETE | `/trips/:code/members/:id` | leader | only if no entries reference them |
| POST | `/trips/:code/entries` | member | see below |
| PUT/DELETE | `/trips/:code/entries/:id` | creator or leader | |
| POST | `/trips/:code/places` | leader | `kind (stop/stay/contact), title, phone, address, day, note` |
| PUT/DELETE | `/trips/:code/places/:id` | leader | |

Admin (signed in as the `ADMIN_PHONE` account):

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | platform totals |
| GET | `/admin/trips?q=` | trips with leader, people, entries, total, last activity |
| GET | `/admin/trips/:code` | members with balances, latest 50 entries |
| DELETE | `/admin/trips/:code` | deletes trip and everything in it |
| GET | `/admin/users?q=` | people with trip counts and last sign-in |
| DELETE | `/admin/users/:id` | deletes account; trip seats stay, unclaimed |
| DELETE | `/admin/users/:id/sessions` | signs the person out everywhere |

Removing a member (`DELETE /trips/:code/members/:id`, leader) deletes the seat
if it has no payments; otherwise the seat is kept for the ledger, marked left,
and unlinked from the account.

Entry body:
- expense: `kind:"expense", title, category, amount, fromId (null = common fund), splitMode:"equal", participants[]` or `splitMode:"exact", shares:{memberId: paisa}`
- deposit: `kind:"deposit", amount, fromId`
- payment: `kind:"payment", amount, fromId, toId`

Every mutation bumps `trips.version`; clients poll every 6s with `?v=`.
