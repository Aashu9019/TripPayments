# Saathi

Shared trip ledger for friend groups. Who paid, who owes, what's left in the
common fund — plus the trip's route, stays and phone numbers in one place.
Installable PWA, works offline for reading.

## Stack
- `web/` — React + Vite + TypeScript PWA. Deploy on **Netlify**.
- `server/` — Node + Express API. Deploy on **Render** with Render Postgres.
  Local dev uses embedded PGlite (real Postgres in WASM), no install needed.

## Local development
```bash
npm run setup   # installs root, server and web packages
npm run dev     # API on :8787 + web on http://localhost:5173 (proxies /api)
```

## Deploy
### API on Render
1. New > Blueprint, point at this repo. `render.yaml` creates the web service
   and a Postgres database and wires `DATABASE_URL`.
2. Set `CORS_ORIGIN` to your Netlify URL (comma-separate several origins).

### Web on Netlify
1. Import repo. `netlify.toml` sets base `web`, build `npm run build`, publish `dist`.
2. Set env `VITE_API_URL` to the Render URL, e.g. `https://saathi-api.onrender.com`.

Render free instances sleep when idle; the first request after a nap takes
~30s. The app shows cached data meanwhile.

## How the money works
All amounts are stored as integer paisa.
- Expense paid by a member: payer +amount, each person in the split −share.
- Expense paid by the common fund: the fund +amount, each person −share.
- Putting money in the fund: member +amount, fund −amount.
- Recorded payment A→B: A +amount, B −amount.
- The fund's balance (cash it holds) is assigned to the fund keeper, who
  physically holds that cash. Suggested transfers then settle everyone with
  the fewest payments (greedy largest-debtor to largest-creditor).

See `docs/API.md` for endpoints.
