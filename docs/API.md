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
| POST | `/trips` | signed in | `name, destination?, startDate?, endDate?` → `{code}`; you become leader |
| GET | `/trips/:code?v=N` | anyone with code | full state incl. `meId` when signed in, or `{unchanged:true}` |
| POST | `/trips/:code/join` | signed in | `memberId` (claim a seat) or nothing (join as yourself) → `{memberId}` |
| PATCH | `/trips/:code` | leader | `name, destination, startDate, endDate, notes, fundKeeperId` |
| POST | `/trips/:code/members` | leader | `name, phone?` |
| PATCH | `/trips/:code/members/:id` | leader or self | `name, phone, release` (free seat), `makeLeader, left` |
| DELETE | `/trips/:code/members/:id` | leader | only if no entries reference them |
| POST | `/trips/:code/entries` | member | see below |
| PUT/DELETE | `/trips/:code/entries/:id` | creator or leader | |
| POST | `/trips/:code/places` | leader | `kind (stop/stay/contact), title, phone, address, day, note` |
| PUT/DELETE | `/trips/:code/places/:id` | leader | |

Entry body:
- expense: `kind:"expense", title, category, amount, fromId (null = common fund), splitMode:"equal", participants[]` or `splitMode:"exact", shares:{memberId: paisa}`
- deposit: `kind:"deposit", amount, fromId`
- payment: `kind:"payment", amount, fromId, toId`

Every mutation bumps `trips.version`; clients poll every 6s with `?v=`.
