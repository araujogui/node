'use strict';
const { skipIfSQLiteMissing } = require('../common');
skipIfSQLiteMissing();
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');
const { once } = require('node:events');
const { Worker } = require('node:worker_threads');
const { nextDb } = require('../sqlite/next-db.js');

test('waits to acquire lock', async (t) => {
  const DB_PATH = nextDb();
  using conn = new DatabaseSync(DB_PATH);

  conn.exec('CREATE TABLE IF NOT EXISTS data (value TEXT)');
  conn.exec('BEGIN EXCLUSIVE;');
  const worker = new Worker(`
    'use strict';
    const { DatabaseSync } = require('node:sqlite');
    const { workerData } = require('node:worker_threads');
    const conn = new DatabaseSync(workerData.database, { timeout: 30000 });
    conn.exec('SELECT * FROM data');
    conn.close();
  `, {
    eval: true,
    workerData: {
      database: DB_PATH,
    }
  });
  await once(worker, 'online');
  conn.exec('COMMIT;');
  await once(worker, 'exit');
});

test('throws if the lock cannot be acquired before timeout', (t) => {
  const DB_PATH = nextDb();

  using conn1 = new DatabaseSync(DB_PATH);
  using conn2 = new DatabaseSync(DB_PATH, { timeout: 1 });

  conn1.exec('CREATE TABLE IF NOT EXISTS data (value TEXT)');
  conn1.exec('PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE;');
  t.assert.throws(() => {
    conn2.exec('SELECT * FROM data');
  }, /database is locked/);
});
