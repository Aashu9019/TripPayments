# SajiloTrip — trip money, settled

**Live app:** https://sajilotrip.netlify.app

SajiloTrip is a small shared ledger for groups of friends on a trip. Log who paid
for what, split it in a tap, and always know who owes whom — including the
money you pooled into a common fund on day one.

Built for treks and budget trips: works on any phone, installs like an app,
and keeps the last synced data readable offline.

---

## Why

Five friends go on a trek. Everyone puts Rs 10,000 into a common pot. Then one
person pays the jeep, another pays for dinner, the pot pays for the flight,
someone covers a porter for just two people. By the end of the trip nobody
knows who owes whom.

SajiloTrip keeps one ledger the whole group shares, does the math, and tells each
person a single number: **you owe Rs X** or **you get back Rs X** — plus the
fewest payments needed to settle everyone.

## Features

**Money**
- Expenses paid by a person *or* by the common fund
- Split equally between any subset of people, or enter exact amounts per person
- Common fund tracking: who put in what, what it paid for, how much cash is left
- Your balance front and center, with who to pay and a one-tap "Paid" button
- Suggested settlements using the fewest transfers
- Spend history grouped by day, filterable (mine, expenses, fund, settlements)
- Categories: food, stay, transport, permits, guide & porter, gear

**Trip**
- Route, day by day
- Stays (hotels, teahouses) with one-tap **Call** and **WhatsApp** buttons
- Important contacts: driver, guide, porter, rescue — also Call / WhatsApp
- Shared notes: permits, packing list, meeting point

**Accounts and groups**
- Sign up with your **phone number** and a password — no email needed
- **All your trips in one list**, on any phone you sign in on, with your
  balance in each; switch trips from the trip name at the top
- Anyone can start a trip for any group; the creator is that trip's leader
- Friends join with the invite link or 6-letter code and tap their name
- If the leader adds a friend with their phone number, that friend is linked
  automatically when they create an account (or sign in) with the same
  number; everyone always chooses their own password
- The leader can set a photo for anyone they added (the person's own
  profile photo takes over once they set one)
- Every member's number is one tap away (Call / WhatsApp)
- Profile photo and name, set once and shown on every trip (photos are
  cropped and compressed on the phone before upload)
- The leader can add people, remove people (with confirmation), hand over
  leadership, or free up a seat. Removed people with payments keep their
  balance until it is settled
- Everyone's screen updates within a few seconds of any change

**Superadmin**
- Sign in on the normal login form with the admin phone + password (set on
  the server) to open the admin panel
- Platform numbers: people, trips, active trips, entries, money tracked
- Search and inspect any trip (members, balances, latest entries) or person
- Delete trips, delete accounts, sign a person out on all devices

**App**
- Installable PWA (Android, iPhone, desktop)
- Phone layout with bottom tabs and swipe-down sheets; desktop layout with a
  sidebar and side panels
- Nepali (Bikram Sambat) dates by default: day headers, trip dates and
  date pickers in BS; switch to English (AD) in Your profile. Dates are
  stored as AD, so switching never changes data
- Light and dark mode
- Offline reading of the last synced trip

## Using the app

1. Open the [live app](https://sajilotrip.netlify.app), create an account with
   your phone number, and tap **Start a trip**.
2. Go to the **Trip** tab: add your friends, the route, stays and phone numbers.
3. Tap the share icon and send the invite link to the group.
4. Each friend opens the link, signs up with their number, and taps their own name.
5. Anyone taps **+** to log an expense, money into the fund, or a settle-up payment.
6. At the end, open **Settle** and follow the suggested payments.

**Install it:** Android Chrome → menu → *Install app*. iPhone Safari → Share →
*Add to Home Screen*.

> Anyone with the trip code can join the trip, so share it only with your
> group. Members can see each other's phone numbers.

## How the math works

All amounts are stored as whole paisa, so nothing is lost to rounding.

| Event | Effect on balances |
|---|---|
| A person pays an expense | payer +amount, each person in the split −their share |
| The common fund pays an expense | fund +amount, each person in the split −their share |
| A person puts money in the fund | person +amount, fund −amount |
| A pays B directly | A +amount, B −amount |

Positive means the group owes you; negative means you owe. Cash left in the
fund is held by the **fund keeper** (the leader by default, changeable), so it
is counted as money the keeper owes back. Settlements then pair the biggest
debtor with the biggest creditor until everyone is at zero — at most one
fewer payment than the number of people.

Equal splits of whole-rupee amounts stay in whole rupees; any leftover rupee
goes to the first people in the list.

## Tech stack

| Part | Tech | Hosted on |
|---|---|---|
| Frontend (`web/`) | React 18, TypeScript, Vite, vite-plugin-pwa, Vaul, Sonner | Netlify |
| Backend (`server/`) | Node 22, Express | Render |
| Database | PostgreSQL | Neon (production), PGlite embedded (local) |

```
TripPayments/
├── web/                 PWA frontend
│   └── src/
│       ├── screens/     Landing, Create, Join, Home, Spend, Settle, Trip
│       ├── sheets/      Add/edit forms (bottom sheet / side panel)
│       ├── components/
│       ├── lib/         API client, formatting, trip sync
│       └── styles/      Design tokens and CSS
├── server/
│   └── src/
│       ├── index.js     REST API
│       ├── db.js        Postgres / PGlite connection + schema
│       └── ledger.js    Balance and settle-up math (unit tested)
├── docs/API.md          Endpoint reference
├── DESIGN.md            Design system
├── PRODUCT.md           Product brief
├── render.yaml          Render blueprint
└── netlify.toml         Netlify build config
```

## Run it locally

Requires Node 20 or newer. No database install needed — local dev uses an
embedded Postgres (PGlite) stored in `server/.data/`.

```bash
git clone https://github.com/Aashu9019/TripPayments.git
cd TripPayments
npm run setup   # installs root, server and web packages
npm run dev     # API on :8787, app on http://localhost:5173
```

Other scripts:

```bash
npm test        # ledger math tests
npm run build   # production build of the web app
```

To try it on your phone on the same Wi-Fi, run
`npm run dev --prefix web -- --host` and open the Network URL it prints.

## Deploy your own

Order matters: each step needs a URL from the one before.

**1. Database — Neon**
Create a free project at [neon.tech](https://neon.tech) and copy the
**pooled** connection string. Tables are created automatically on first start.

**2. Backend — Render**
New → Blueprint → select this repo. When prompted, set:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `CORS_ORIGIN` | `*` for now; your Netlify URL once you have it |
| `ADMIN_PHONE` | phone number for the superadmin login |
| `ADMIN_PASSWORD` | superadmin password, at least 10 characters |

The admin account is created (or its password updated) from these two
variables every time the server starts. Never put them in the repo.

Check `https://<your-api>.onrender.com/api/health` returns `{"ok":true}`.
Free Render services sleep after 15 minutes idle; a cron job hitting
`/api/health` every 10 minutes keeps it awake.

**3. Frontend — Netlify**
Import this repo (settings come from `netlify.toml`) and add the environment
variable `VITE_API_URL` = your Render URL, without a trailing slash. Deploy,
then put the Netlify URL into `CORS_ORIGIN` on Render.

`VITE_API_URL` is baked in at build time — after changing it, use
*Clear cache and deploy site*.

## API

REST API under `/api`. Sign up or sign in with a phone number to get a
session token, sent as `Authorization: Bearer <token>`. Full reference in
[docs/API.md](docs/API.md).

## Limitations

- Adding or editing needs a connection; offline mode is read-only.
- One currency per trip (Nepali rupees by default), no conversion.
- No SMS verification of phone numbers (it costs money per message); the
  number is the login, protected by a password.
- No password reset yet; the leader can free your seat so you can rejoin
  from a new account.

## License

Personal project. Ask before reusing.
