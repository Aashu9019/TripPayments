# API

Base: `/api`. Amounts are integer paisa. Mutations need header
`x-member-token` (issued on create/join, stored on the device).

| Method | Path | Who | Body |
|---|---|---|---|
| GET | `/health` | anyone | |
| POST | `/trips` | anyone | `name, leaderName, destination?, startDate?, endDate?` → `{code, memberId, token}` |
| GET | `/trips/:code?v=N` | anyone with code | full state, or `{unchanged:true}` if version is N |
| POST | `/trips/:code/join` | anyone with code | `memberId` (claim a seat) or `name` (new) → `{memberId, token}` |
| PATCH | `/trips/:code` | leader | `name, destination, startDate, endDate, notes, fundKeeperId` |
| POST | `/trips/:code/members` | leader | `name, phone?` |
| PATCH | `/trips/:code/members/:id` | leader or self | `name, phone, release, makeLeader, left` |
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
