const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
assert(workerSource.includes("const SYNC_PATH = '/dictation/api/sync';"));
assert(workerSource.includes('env.DICTATION_DB.prepare'));

const executableSource = workerSource.replace('export default {', 'const Worker = {') + '\nWorker;';
const Worker = vm.runInNewContext(executableSource, {
  atob,
  TextDecoder,
  TextEncoder,
  URL,
  Request,
  Response,
  Date,
  Error,
  console
});

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async execute() {
    if (this.sql.startsWith('SELECT')) {
      const payload = this.db.rows.get(this.values[0]);
      return {success: true, results: payload === undefined ? [] : [{payload}]};
    }
    if (this.sql.startsWith('INSERT INTO sync_records')) {
      this.db.rows.set(this.values[0], this.values[1]);
      return {success: true, results: []};
    }
    throw new Error('Unexpected SQL: ' + this.sql);
  }
}

class MockD1 {
  constructor() {
    this.rows = new Map();
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map(statement => statement.execute()));
  }
}

(async () => {
  const db = new MockD1();
  const env = {DICTATION_DB: db};

  let response = await Worker.fetch(new Request('https://liaohao.cc/dictation/'), env);
  assert.strictEqual(response.status, 200);
  assert((await response.text()).includes('<title>听写小助手</title>'));

  response = await Worker.fetch(new Request('https://liaohao.cc/dictation/api/sync?userId=u_1'), env);
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), {users: [], userData: {}});

  const payload = {
    userId: 'u_1',
    data: {
      users: [{id: 'u_1', name: '小七'}],
      userData: {
        u_1: {settings: {}, log: [], review: {zh: [], en: []}, progress: null, adminPwd: '0000', ts: 1}
      }
    }
  };
  response = await Worker.fetch(new Request('https://liaohao.cc/dictation/api/sync', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json', 'X-Dictation-App': '1'},
    body: JSON.stringify(payload)
  }), env);
  assert.strictEqual(response.status, 200);

  response = await Worker.fetch(new Request('https://liaohao.cc/dictation/api/sync?userId=u_1'), env);
  const stored = await response.json();
  assert.deepStrictEqual(stored.users, payload.data.users);
  assert.deepStrictEqual(stored.userData.u_1.review, {zh: [], en: []});

  response = await Worker.fetch(new Request('https://liaohao.cc/dictation/api/sync', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json', Origin: 'https://evil.example'},
    body: JSON.stringify(payload)
  }), env);
  assert.strictEqual(response.status, 403);

  console.log('worker D1 regression tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
