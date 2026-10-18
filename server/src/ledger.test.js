import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances, equalShares } from './ledger.js';

const M = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
const all = M.map((m) => m.id);

const applyTransfers = (net, transfers) => {
  const after = { ...net };
  for (const t of transfers) {
    after[t.from] += t.amount;
    after[t.to] -= t.amount;
  }
  return after;
};

test('equal shares distribute leftover paisa', () => {
  assert.deepEqual(equalShares(100, ['a', 'b', 'c']), { a: 34, b: 33, c: 33 });
});

test('fund deposits, fund spending and personal spending settle to zero', () => {
  const entries = [
    ...all.map((id) => ({ kind: 'deposit', amount: 1000, from_id: id })),
    { kind: 'expense', amount: 3000, from_id: null, shares: equalShares(3000, all) },
    { kind: 'expense', amount: 500, from_id: 'b', shares: equalShares(500, all) },
  ];
  const r = computeBalances(M, entries, 'a');
  assert.equal(r.fund.cash, 2000);
  assert.equal(Object.values(r.net).reduce((s, v) => s + v, 0), 0);
  // Keeper a holds 2000 of fund cash, so a owes it back out.
  assert.equal(r.net.a, -1700);
  assert.equal(r.net.b, 800);
  assert.ok(Object.values(applyTransfers(r.net, r.transfers)).every((v) => v === 0));
});

test('payments clear debts', () => {
  const entries = [
    { kind: 'expense', amount: 1000, from_id: 'a', shares: { a: 500, b: 500 } },
    { kind: 'payment', amount: 500, from_id: 'b', to_id: 'a' },
  ];
  const r = computeBalances(M, entries, 'a');
  assert.equal(r.net.a, 0);
  assert.equal(r.net.b, 0);
  assert.equal(r.transfers.length, 0);
});
