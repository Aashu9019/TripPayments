// Pure money logic. All amounts are integer minor units (paisa).
// Balance convention: positive = the group owes you, negative = you owe.

export const FUND = 'fund';

/**
 * Split `total` equally across ids. Whole-rupee totals split in whole rupees
 * (nobody wants to pay Rs 299.83); the leftover units go to the first ids.
 */
export function equalShares(total, ids) {
  const n = ids.length;
  if (!n) return {};
  const unit = total % 100 === 0 ? 100 : 1;
  const units = total / unit;
  const base = Math.floor(units / n);
  let rem = units - base * n;
  const out = {};
  for (const id of ids) {
    out[id] = (base + (rem > 0 ? 1 : 0)) * unit;
    if (rem > 0) rem--;
  }
  return out;
}

/**
 * entries: { kind, amount, from_id, to_id, shares }
 *  - expense: from_id = payer member id, or null when the common fund paid
 *  - deposit: from_id = member putting cash into the fund
 *  - payment: from_id paid to_id directly (settling up)
 */
export function computeBalances(members, entries, fundKeeperId) {
  const bal = Object.fromEntries(members.map((m) => [m.id, 0]));
  bal[FUND] = 0;
  const spent = Object.fromEntries(members.map((m) => [m.id, 0]));
  const paid = Object.fromEntries(members.map((m) => [m.id, 0]));
  const deposited = Object.fromEntries(members.map((m) => [m.id, 0]));
  let fundIn = 0;
  let fundOut = 0;
  let total = 0;
  const add = (id, v) => {
    if (id in bal) bal[id] += v;
  };

  for (const e of entries) {
    const amt = Number(e.amount);
    if (e.kind === 'expense') {
      total += amt;
      const payer = e.from_id ?? FUND;
      add(payer, amt);
      if (payer === FUND) fundOut += amt;
      else if (payer in paid) paid[payer] += amt;
      for (const [id, share] of Object.entries(e.shares ?? {})) {
        add(id, -Number(share));
        if (id in spent) spent[id] += Number(share);
      }
    } else if (e.kind === 'deposit') {
      add(e.from_id, amt);
      add(FUND, -amt);
      fundIn += amt;
      if (e.from_id in deposited) deposited[e.from_id] += amt;
    } else if (e.kind === 'payment') {
      add(e.from_id, amt);
      add(e.to_id, -amt);
    }
  }

  // The fund's leftover cash sits in the keeper's pocket.
  const fundCash = -bal[FUND];
  const net = { ...bal };
  delete net[FUND];
  const keeper = fundKeeperId && fundKeeperId in net ? fundKeeperId : (members[0]?.id ?? null);
  if (keeper) net[keeper] -= fundCash;

  return {
    net,
    spent,
    paid,
    deposited,
    total,
    fund: { in: fundIn, out: fundOut, cash: fundCash, keeperId: keeper },
    transfers: settle(net),
    direct: directDebts(members, entries, keeper),
  };
}

/** Greedy: largest debtor pays largest creditor. At most n-1 transfers. */
export function settle(net) {
  const debt = [];
  const cred = [];
  for (const [id, v] of Object.entries(net)) {
    if (v < 0) debt.push({ id, v: -v });
    else if (v > 0) cred.push({ id, v });
  }
  debt.sort((a, b) => b.v - a.v);
  cred.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].v, cred[j].v);
    if (amt > 0) out.push({ from: debt[i].id, to: cred[j].id, amount: amt });
    debt[i].v -= amt;
    cred[j].v -= amt;
    if (debt[i].v === 0) i++;
    if (cred[j].v === 0) j++;
  }
  return out;
}

/**
 * Who owes whom directly, without simplifying through third people.
 * Each expense makes every participant owe the payer their share; the common
 * fund's side is carried by its keeper (depositors are owed by the keeper,
 * fund-paid shares are owed to the keeper). Recorded payments reduce the
 * pair they were between. Each pair nets to one payment.
 * Per person this always adds up to the same balance as `net`.
 */
export function directDebts(members, entries, keeperId) {
  const ids = new Set(members.map((m) => m.id));
  const owe = new Map(); // "a>b" -> amount a owes b
  const add = (a, b, v) => {
    if (!a || !b || a === b || !ids.has(a) || !ids.has(b) || !v) return;
    owe.set(`${a}>${b}`, (owe.get(`${a}>${b}`) ?? 0) + v);
  };
  for (const e of entries) {
    const amt = Number(e.amount);
    if (e.kind === 'expense') {
      const payer = e.from_id ?? keeperId;
      for (const [id, share] of Object.entries(e.shares ?? {})) add(id, payer, Number(share));
    } else if (e.kind === 'deposit') {
      add(keeperId, e.from_id, amt);
    } else if (e.kind === 'payment') {
      add(e.to_id, e.from_id, amt); // paying someone back cancels what you owed them
    }
  }
  const out = [];
  const seen = new Set();
  for (const key of owe.keys()) {
    const [a, b] = key.split('>');
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const d = (owe.get(`${a}>${b}`) ?? 0) - (owe.get(`${b}>${a}`) ?? 0);
    if (d > 0) out.push({ from: a, to: b, amount: d });
    else if (d < 0) out.push({ from: b, to: a, amount: -d });
  }
  return out.sort((x, y) => y.amount - x.amount);
}
