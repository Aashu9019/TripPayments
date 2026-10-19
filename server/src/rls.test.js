// Row-level security proof against a real (embedded) Postgres.
// Run: node --test src/rls.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PGLITE_DIR = mkdtempSync(join(tmpdir(), 'sajilo-rls-'));
delete process.env.DATABASE_URL;
const { connect, query, sys, inScope, useTrip, useSystem } = await import('./db.js');
await connect();

for (const t of ['a', 'b']) {
  await sys('INSERT INTO trips (id, code, name) VALUES ($1, $2, $3)', [t, `CODE${t.toUpperCase()}X`, `Trip ${t}`]);
  await sys('INSERT INTO members (id, trip_id, name) VALUES ($1, $2, $3)', [`m${t}`, t, `Member ${t}`]);
  await sys("INSERT INTO entries (id, trip_id, kind, title, amount) VALUES ($1, $2, 'expense', $3, 100)", [`e${t}`, t, `Entry ${t}`]);
  await sys("INSERT INTO places (id, trip_id, kind, title) VALUES ($1, $2, 'stop', $3)", [`p${t}`, t, `Place ${t}`]);
}

const titles = async (sql) => (await query(sql)).rows.map((r) => Object.values(r)[0]).sort();

test('tenant sees only its own rows, even with no WHERE clause', () =>
  inScope(async () => {
    useTrip('a');
    assert.deepEqual(await titles('SELECT title FROM entries'), ['Entry a']);
    assert.deepEqual(await titles('SELECT title FROM places'), ['Place a']);
    assert.deepEqual(await titles('SELECT name FROM members'), ['Member a']);
    assert.deepEqual(await titles('SELECT name FROM trips'), ['Trip a']);
  }));

test('tenant cannot change or delete another trip', () =>
  inScope(async () => {
    useTrip('a');
    await query("UPDATE entries SET title = 'hacked'");
    await query('DELETE FROM places');
    await assert.rejects(query("INSERT INTO entries (id, trip_id, kind, title, amount) VALUES ('x', 'b', 'expense', 'sneaky', 1)"));
    const { rows } = await sys("SELECT title FROM entries WHERE trip_id = 'b'");
    assert.deepEqual(rows.map((r) => r.title), ['Entry b']);
    const { rows: pb } = await sys("SELECT title FROM places WHERE trip_id = 'b'");
    assert.equal(pb.length, 1);
  }));

test('no tenant declared: sees nothing (fails closed)', () =>
  inScope(async () => {
    assert.deepEqual(await titles('SELECT title FROM entries'), []);
    assert.deepEqual(await titles('SELECT name FROM trips'), []);
    assert.deepEqual(await titles('SELECT phone FROM users'), []);
  }));

test('system scope sees everything (sign-in, my trips)', () =>
  inScope(async () => {
    useSystem();
    assert.equal((await titles('SELECT name FROM trips')).length, 2);
  }));
