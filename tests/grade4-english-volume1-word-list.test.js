const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dictation-app.html'), 'utf8');
const appStart = html.indexOf('const App={');
const appEnd = html.indexOf('\n};\n\nApp.init();', appStart);
assert(appStart >= 0 && appEnd > appStart, '无法从页面中读取 App');

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
  PRESET: {zh: {}, en: {}}
};
const App = vm.runInNewContext(html.slice(appStart, appEnd + 3) + '\nApp;', sandbox);
const info = App.ENGLISH_GRADE4_VOLUME1_INFO;
const units = App.ENGLISH_GRADE4_VOLUME1_UNITS;

assert.strictEqual(info.unitCount, 6);
assert.strictEqual(info.wordCount, 165);
assert.strictEqual(units.length, 6);
assert.deepStrictEqual(Array.from(units, unit => unit.name), ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6']);
assert.deepStrictEqual(Array.from(units, unit => unit.words.length), [31, 40, 27, 19, 26, 22]);
assert.strictEqual(units.reduce((sum, unit) => sum + unit.words.length, 0), 165);

const unit1 = units.find(unit => unit.key === 'unit-1');
assert(unit1.words.some(word => word.text === 'because of sb / sth' && word.hint === '因为某人 / 某事物'));
assert(unit1.words.some(word => word.text === 'try your best' && word.hint === '尽最大努力'));
const unit2 = units.find(unit => unit.key === 'unit-2');
assert(unit2.words.some(word => word.text === 'Good job!' && word.hint === '干得好！真不错！'));
assert(unit2.words.some(word => word.text === 'warm up' && word.hint === '（使）变暖'));
const unit6 = units.find(unit => unit.key === 'unit-6');
assert(unit6.words.some(word => word.text === "on one's own" && word.hint === '独立地'));
assert(unit6.words.some(word => word.text === 'be careful' && word.hint === '当心，小心'));

const targetBank = {
  id: 'bank-english-grade4',
  name: '英语四年级上册',
  source: 'custom',
  catalogVersions: {},
  other: [{text: 'custom outside', hint: '自定义其他'}],
  lessons: [
    {id: 'lesson-old-unit-1', name: 'Unit 1', words: [{text: 'user word', hint: '用户词'}], createdAt: 1, updatedAt: 1},
    {id: 'lesson-custom', name: 'Extra', words: [{text: 'extra', hint: ''}], createdAt: 1, updatedAt: 1}
  ],
  createdAt: 1,
  updatedAt: 1
};
const store = {version: 2, catalogVersions: {}, zh: [], en: [targetBank], deleted: []};
let saves = 0;
let lastSkipPush = null;
App.getWordBankStore = () => store;
App.saveWordBankStore = (_store, skipPush) => { saves++; lastSkipPush = skipPush; return _store; };

const result = App.applyGrade4EnglishVolume1WordList();
assert.deepStrictEqual({...result}, {
  matchedBanks: 1,
  banksCreated: 0,
  updatedBanks: 1,
  lessonsAdded: 5,
  lessonsRemoved: 0,
  wordsAdded: 165
});
assert.strictEqual(saves, 1);
assert.strictEqual(lastSkipPush, true, '迁移应等待现有云同步流程统一推送');
assert.strictEqual(targetBank.lessons.length, 7);
assert.strictEqual(targetBank.name, '四年级上册', '旧显示名应自动改成英语区里的四年级上册');
assert.strictEqual(targetBank.lessons[0].name, 'Unit 1');
assert.strictEqual(targetBank.lessons[0].words[0].text, 'user word', '用户已有单元词语必须保留');
assert.strictEqual(targetBank.lessons[0].words.length, 32, 'Unit 1 应保留用户词并补齐教材词');
assert.strictEqual(targetBank.lessons.at(-1).name, 'Extra', '自定义单元必须保留');
assert.strictEqual(targetBank.other[0].text, 'custom outside');
assert.strictEqual(targetBank.catalogVersions[info.id], info.version);
assert.strictEqual(store.catalogVersions[info.id], info.version);

const secondResult = App.applyGrade4EnglishVolume1WordList();
assert.deepStrictEqual({...secondResult}, {
  matchedBanks: 1,
  banksCreated: 0,
  updatedBanks: 0,
  lessonsAdded: 0,
  lessonsRemoved: 0,
  wordsAdded: 0
});
assert.strictEqual(saves, 1, '同一版本不得重复迁移');

const emptyStore = {version: 2, catalogVersions: {}, zh: [], en: [], deleted: []};
let emptyStoreSaves = 0;
App.getWordBankStore = () => emptyStore;
App.saveWordBankStore = value => { emptyStoreSaves++; return value; };
const beforeCloudResult = App.applyGrade4EnglishVolume1WordList(false);
assert.deepStrictEqual({...beforeCloudResult}, {
  matchedBanks: 0,
  banksCreated: 0,
  updatedBanks: 0,
  lessonsAdded: 0,
  lessonsRemoved: 0,
  wordsAdded: 0
});
assert.strictEqual(emptyStoreSaves, 0, '云端拉取前不得凭空创建同名英语词库');
const createResult = App.applyGrade4EnglishVolume1WordList();
assert.deepStrictEqual({...createResult}, {
  matchedBanks: 1,
  banksCreated: 1,
  updatedBanks: 1,
  lessonsAdded: 6,
  lessonsRemoved: 0,
  wordsAdded: 165
});
assert.strictEqual(emptyStoreSaves, 1);
assert.strictEqual(emptyStore.en[0].name, '四年级上册');
assert.strictEqual(emptyStore.en[0].lessons.length, 6);
assert.strictEqual(emptyStore.en[0].lessons.reduce((sum, lesson) => sum + lesson.words.length, 0), 165);

emptyStore.en = [];
const deletedResult = App.applyGrade4EnglishVolume1WordList();
assert.deepStrictEqual({...deletedResult}, {
  matchedBanks: 0,
  banksCreated: 0,
  updatedBanks: 0,
  lessonsAdded: 0,
  lessonsRemoved: 0,
  wordsAdded: 0
});
assert.strictEqual(emptyStoreSaves, 1, '用户主动删除后不得再次自动创建');

console.log('grade 4 English volume 1 photo-edition tests passed');
