// Client-side split math, mirroring server/src/ledger.js. Amounts are paisa.

/** Equal split; whole-rupee totals stay in whole rupees, leftovers go to the first ids. */
export function equalShares(total: number, ids: string[]): Record<string, number> {
  const n = ids.length;
  if (!n || total <= 0) return Object.fromEntries(ids.map((id) => [id, 0]));
  const unit = total % 100 === 0 ? 100 : 1;
  const units = total / unit;
  const base = Math.floor(units / n);
  let rem = units - base * n;
  const out: Record<string, number> = {};
  for (const id of ids) {
    out[id] = (base + (rem > 0 ? 1 : 0)) * unit;
    if (rem > 0) rem--;
  }
  return out;
}

/**
 * Uneven split: people with a typed amount keep it; everyone else included
 * shares what is left equally. Never hands out a negative amount.
 */
export function autoSplit(total: number, included: string[], typed: Record<string, number>) {
  const fixed = included.filter((id) => id in typed);
  const auto = included.filter((id) => !(id in typed));
  const fixedSum = fixed.reduce((s, id) => s + typed[id]!, 0);
  const out: Record<string, number> = { ...equalShares(Math.max(0, total - fixedSum), auto) };
  for (const id of fixed) out[id] = typed[id]!;
  return out;
}

/** The most one person can be given without the typed amounts passing the total. */
export function maxFor(id: string, total: number, included: string[], typed: Record<string, number>) {
  const others = included.filter((x) => x !== id && x in typed).reduce((s, x) => s + typed[x]!, 0);
  return Math.max(0, total - others);
}
