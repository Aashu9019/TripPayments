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

test('equal shares keep whole rupees when the total is whole', () => {
  assert.deepEqual(equalShares(100000, ['a', 'b', 'c']), { a: 33400, b: 33300, c: 33300 });
});

test('equal shares fall back to paisa for paisa totals', () => {
  assert.deepEqual(equalShares(1001, ['a', 'b']), { a: 501, b: 500 });
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

test('direct debts: pairwise, and each person still adds up to their balance', () => {
  // The Shey Phoksundo example: me, bijesh, arjun, bimal, prabesh (amounts in rupees).
  const P = ['me', 'bij', 'arj', 'bim', 'pra'].map((id) => ({ id }));
  const all5 = P.map((p) => p.id);
  const rs = (n) => n * 100;
  const entries = [
    { kind: 'expense', amount: rs(3750), from_id: 'me', shares: equalShares(rs(3750), all5) },
    { kind: 'expense', amount: rs(4000), from_id: 'me', shares: equalShares(rs(4000), ['bij', 'arj', 'bim', 'pra']) },
    { kind: 'expense', amount: rs(736), from_id: 'bij', shares: equalShares(rs(736), all5) },
    { kind: 'expense', amount: rs(1570), from_id: 'bij', shares: equalShares(rs(1570), all5) },
  ];
  const r = computeBalances(P, entries, 'me');
  const pair = (a, b) => r.direct.find((t) => t.from === a && t.to === b)?.amount;
  // bijesh owes me 750 + 1000 = 1750; I owe him 148 + 314 = 462 -> 1288.
  assert.equal(pair('bij', 'me'), rs(1288));
  const sum = Object.fromEntries(P.map((p) => [p.id, 0]));
  for (const t of r.direct) { sum[t.from] -= t.amount; sum[t.to] += t.amount; }
  assert.deepEqual(sum, r.net);
});

test('direct debts include the common fund via its keeper and recorded payments', () => {
  const entries = [
    ...all.map((id) => ({ kind: 'deposit', amount: 1000, from_id: id })),
    { kind: 'expense', amount: 3000, from_id: null, shares: equalShares(3000, all) },
    { kind: 'expense', amount: 500, from_id: 'b', shares: equalShares(500, all) },
    { kind: 'payment', amount: 100, from_id: 'c', to_id: 'b' },
  ];
  const r = computeBalances(M, entries, 'a');
  const sum = Object.fromEntries(M.map((p) => [p.id, 0]));
  for (const t of r.direct) { sum[t.from] -= t.amount; sum[t.to] += t.amount; }
  assert.deepEqual(sum, r.net);
});
