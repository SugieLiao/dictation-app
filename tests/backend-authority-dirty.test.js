// 后端权威：持久化「待同步」标记回归测试。
// 验证「离线写入 → markDirty → 联网 push 成功 → clearDirty；push 失败则保留 dirty」的闭环，
// 确保长期离线写入后关闭页面，下次启动/重连也会自动补传到后端。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dictation-app.html'), 'utf8');
const cloudStart = html.indexOf('const CloudSync={');
// CloudSync 对象结束于「};」，其后为同步诊断代码块（\n};\n\n\n  // ===== 同步诊断）
const diagIdx = html.indexOf('// ===== 同步诊断', cloudStart);
const cloudEnd = html.lastIndexOf('};', diagIdx) + 2;
assert(cloudStart >= 0 && diagIdx > cloudStart && cloudEnd > cloudStart, '无法读取同步模块边界');

const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
const App = {
  currentUserId: 'u_test',
  users: [],
  userKey: base => base + '_u_test',
  getWordBankStore: () => ({version: 2, zh: [], en: [], deleted: []}),
  exportWordBankStoreForCloud: () => ({version: 2, zh: [], en: [], deleted: []}),
  mergeWordBankStores: (a, b) => b,
  saveWordBankStore: () => {},
  refreshWordBankViewsAfterSync: () => {},
  showToast: () => {}
};
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  Set,
  Map,
  URL,
  AbortController,
  localStorage,
  location: {protocol: 'https:', origin: 'https://liaohao.cc'},
  document: {getElementById: () => null},
  App
};
const runtimeSource = html.slice(cloudStart, cloudEnd) + '({CloudSync});';
const {CloudSync} = vm.runInNewContext(runtimeSource, sandbox);

const dirtyKey = 'dict_sync_dirty_u_test';
const hasDirty = () => storage.has(dirtyKey);

(async () => {
  // 1. 任何数据变更（pushDebounced）都会 markDirty
  CloudSync.pendingTimer = null;
  CloudSync.pushDebounced();
  assert.strictEqual(hasDirty(), true, '数据变更后应标记待同步');
  assert.strictEqual(localStorage.getItem(dirtyKey), '1');

  // 2. push 成功 → clearDirty（数据已可靠到后端，解除待同步）
  CloudSync.enabled = true;
  CloudSync.syncing = false;
  CloudSync.remoteWasEmpty = false;
  CloudSync.cache = null;
  CloudSync.lastSyncTs = 0;
  CloudSync._getLatest = async () => ({users: [], userData: {}});
  CloudSync._put = async () => true;
  const ok = await CloudSync.push();
  assert.strictEqual(ok, true);
  assert.strictEqual(hasDirty(), false, 'push 成功后应清除待同步标记');

  // 3. 再次变更（离线写入）→ markDirty
  CloudSync.pushDebounced();
  assert.strictEqual(hasDirty(), true);

  // 4. push 失败（后端不可达/断网）→ 保留 dirty，等待联网后补传
  CloudSync._put = async () => false;
  const failOk = await CloudSync.push();
  assert.strictEqual(failOk, false);
  assert.strictEqual(hasDirty(), true, 'push 失败必须保留待同步标记，否则离线写入会丢失');

  // 5. 恢复联网后 push 成功 → dirty 清除（联网自动补传闭环）
  CloudSync._put = async () => true;
  const retryOk = await CloudSync.push();
  assert.strictEqual(retryOk, true);
  assert.strictEqual(hasDirty(), false, '恢复联网补传成功后应清除标记');

  // 6. 多用户隔离：dirty 标记按用户区分，切换用户互不影响
  storage.clear();
  const prevUid = App.currentUserId;
  App.currentUserId = 'u_other';
  CloudSync.pushDebounced();
  assert.strictEqual(storage.has('dict_sync_dirty_u_other'), true, '当前用户的 dirty 应记录在其自己的键上');
  assert.strictEqual(storage.has(dirtyKey), false, '其他用户 dirty 不应串到本用户键上');
  App.currentUserId = prevUid;

  console.log('backend-authority dirty regression tests passed');
  // 显式退出：push 失败分支会触发 10s 重试 timer，会阻止 node 自然退出
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
