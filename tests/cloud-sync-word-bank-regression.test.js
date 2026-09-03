const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dictation-app.html'), 'utf8');
const appStart = html.indexOf('const App={');
const appEnd = html.indexOf('\n};\n\n/* ============ 云端同步模块', appStart);
const cloudStart = html.indexOf('const CloudSync={', appEnd);
const cloudEnd = html.indexOf('\n};\n\nApp.init();', cloudStart);
assert(appStart >= 0 && appEnd > appStart && cloudStart > appEnd && cloudEnd > cloudStart, '无法读取同步模块');

const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Set,
  Map,
  URL,
  AbortController,
  localStorage,
  location: {protocol: 'https:', origin: 'https://liaohao.cc'},
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  PRESET: {zh: {}, en: {}}
};
const runtimeSource =
  html.slice(appStart, appEnd + 3) + '\n' +
  html.slice(cloudStart, cloudEnd + 3) + '\n' +
  '({App,CloudSync});';
const {App, CloudSync} = vm.runInNewContext(runtimeSource, sandbox);

const tempUser = {id: 'u_temp', name: '默认用户'};
const cloudUser = {id: 'u_cloud', name: '小七'};
const cloudBank = {
  id: 'bank-grade4',
  name: '四年级上册',
  source: 'custom',
  presetKey: '',
  catalogVersions: {},
  other: [],
  lessons: [{id: 'lesson-1', name: '第1课', words: [{text: '观潮', hint: ''}], createdAt: 10, updatedAt: 10}],
  createdAt: 10,
  updatedAt: 10
};
const cloudStore = {version: 2, zh: [cloudBank], en: [], deleted: []};

// 用户列表已与云端一致，但当前 userId 仍可能是本地丢失数据后创建的临时值。
App.users = [cloudUser];
App.currentUserId = tempUser.id;
App.cloudSyncReady = false;
localStorage.setItem('dict_users', JSON.stringify(App.users));
localStorage.setItem('dict_current_user', tempUser.id);
App.syncSettingsUI = () => {};
App.bindSettings = () => {};
App.initVoicePicker = () => {};
App.renderHomeEntries = () => {};
App.renderUserList = () => {};
App.updateUserSwitchBtn = () => {};
App.refreshWordBankViewsAfterSync = () => {};
App.showToast = () => {};
App.migrateReviewBank = () => {};
App.applyGrade4Volume1WordList = () => ({updatedBanks: 0});
CloudSync.pushDebounced = () => {};

const realPush = CloudSync.push.bind(CloudSync);
const callOrder = [];
CloudSync.init = async () => { CloudSync.enabled = true; return true; };
CloudSync.pull = async forceFresh => {
  callOrder.push('pull:' + App.currentUserId + ':' + !!forceFresh);
  if(App.currentUserId === tempUser.id)return {users: [cloudUser]};
  return {
    users: [cloudUser],
    settings: {zhSettings: {...App.zhSettings}, enSettings: {...App.enSettings}},
    wordBanks: cloudStore,
    log: [],
    review: {zh: [], en: []},
    ts: 20
  };
};
let storeSeenByPush = null;
CloudSync.push = async () => {
  callOrder.push('push:' + App.currentUserId);
  storeSeenByPush = App.getWordBankStore();
  return true;
};
CloudSync.updateIndicator = () => {};

(async () => {
  await App.initCloudSync();
  assert.deepStrictEqual(callOrder, [
    'pull:u_temp:false',
    'pull:u_cloud:true',
    'push:u_cloud'
  ], '切换到云端用户后必须先重新拉取，再允许上传');
  assert.strictEqual(App.currentUserId, cloudUser.id);
  assert(storeSeenByPush.zh.some(bank => bank.name === '四年级上册'), '重新拉取后应先恢复云端自建词库');
  assert.strictEqual(App.cloudSyncReady, true);

  // 如果切换用户后的二次拉取失败，必须中止上传，不得用空数据覆盖云端。
  App.users = [cloudUser];
  App.currentUserId = tempUser.id;
  App.cloudSyncReady = false;
  localStorage.setItem('dict_current_user', tempUser.id);
  const failedCallOrder = [];
  CloudSync.pull = async forceFresh => {
    failedCallOrder.push('pull:' + App.currentUserId + ':' + !!forceFresh);
    return App.currentUserId === tempUser.id ? {users: [cloudUser]} : null;
  };
  CloudSync.push = async () => { failedCallOrder.push('unsafe-push'); return true; };
  await App.initCloudSync();
  assert.deepStrictEqual(failedCallOrder, ['pull:u_temp:false', 'pull:u_cloud:true']);
  assert.strictEqual(App.cloudSyncReady, true);

  // 即使没有经过初始切换流程，push 自身也必须先保全云端词库。
  const localPreset = {
    id: 'preset-grade1', name: '一年级上册', source: 'preset', presetKey: '一年级上册',
    catalogVersions: {}, other: [], lessons: [], createdAt: 1, updatedAt: 1
  };
  localStorage.setItem(App.userKey('dict_word_banks'), JSON.stringify({version: 2, zh: [localPreset], en: [], deleted: []}));
  localStorage.setItem(App.userKey('dict_review'), JSON.stringify({zh: [], en: []}));
  localStorage.setItem(App.userKey('dict_log'), '[]');
  App.users = [cloudUser];
  App.currentUserId = cloudUser.id;
  CloudSync.enabled = true;
  CloudSync.syncing = false;
  CloudSync.remoteWasEmpty = false;
  CloudSync._getLatest = async () => ({
    users: [cloudUser],
    userData: {
      [cloudUser.id]: {wordBanks: cloudStore, review: {zh: [], en: []}, log: [], settings: {}, ts: 20}
    }
  });
  let pushed = null;
  CloudSync._put = async data => { pushed = data; return true; };
  CloudSync.push = realPush;

  const ok = await CloudSync.push();
  assert.strictEqual(ok, true);
  const pushedNames = pushed.userData[cloudUser.id].wordBanks.zh.map(bank => bank.name);
  assert(pushedNames.includes('四年级上册'), '上传不得删掉云端已有的自建词库');
  assert(pushedNames.includes('一年级上册'), '上传时也应保留本地词库');

  console.log('cloud sync word-bank regression tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
