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

assert.strictEqual(App.GRADE4_VOLUME1_2024_INFO.lessonCount, 15);
assert.strictEqual(App.GRADE4_VOLUME1_2024_INFO.wordCount, 224);
assert.deepStrictEqual(
  Array.from(App.GRADE4_VOLUME1_2024_LESSONS, lesson => lesson.number),
  [2, 5, 6, 7, 10, 11, 12, 14, 16, 17, 18, 19, 20, 22, 26]
);
assert.deepStrictEqual(
  Array.from(App.GRADE4_VOLUME1_2024_LESSONS, lesson => lesson.words.length),
  [14, 17, 12, 17, 16, 16, 14, 15, 17, 12, 14, 16, 17, 15, 12]
);
assert.strictEqual(
  App.GRADE4_VOLUME1_2024_LESSONS.reduce((sum, lesson) => sum + lesson.words.length, 0),
  224
);

const firstLessonWords = [{text: '用户已有词语', hint: '必须保留'}];
const targetBank = {
  id: 'bank-grade4',
  name: '四年级上册',
  source: 'custom',
  catalogVersions: {},
  other: [{text: '其他词语', hint: ''}],
  lessons: [{id: 'lesson-1', name: '第1课', words: firstLessonWords, createdAt: 1, updatedAt: 1}],
  createdAt: 1,
  updatedAt: 1
};
const unrelatedBank = {
  id: 'bank-other', name: '课外词语', source: 'custom', catalogVersions: {}, other: [], lessons: [], createdAt: 1, updatedAt: 1
};
const store = {version: 2, zh: [targetBank, unrelatedBank], en: [], deleted: []};
let saves = 0;
let lastSkipPush = null;
App.getWordBankStore = () => store;
App.saveWordBankStore = (_store, skipPush) => { saves++; lastSkipPush = skipPush; return _store; };

const result = App.applyGrade4Volume1WordList();
assert.deepStrictEqual({...result}, {matchedBanks: 1, updatedBanks: 1, lessonsAdded: 15, wordsAdded: 224});
assert.strictEqual(saves, 1);
assert.strictEqual(lastSkipPush, true, '迁移应等待现有云同步流程统一推送');
assert.strictEqual(targetBank.lessons.length, 16);
assert.strictEqual(targetBank.lessons[0].name, '第1课');
assert.strictEqual(targetBank.lessons[0].words, firstLessonWords, '不得替换用户已有第1课');
assert.deepStrictEqual(
  Array.from(targetBank.lessons.find(lesson => lesson.name === '第2课 走月亮').words, word => word.text),
  ['柔和', '鹅卵石', '河床', '新鲜', '修补', '坑坑洼洼', '庄稼', '风俗', '葡萄', '满意', '水稻', '成熟', '招待', '传说']
);
assert.deepStrictEqual(
  Array.from(targetBank.lessons.find(lesson => lesson.name === '第26课 西门豹治邺').words, word => word.text),
  ['管理', '人烟', '媳妇', '新娘', '眼睁睁', '干旱', '迎接', '徒弟', '面如土色', '求饶', '灌溉', '收成']
);
assert.strictEqual(unrelatedBank.lessons.length, 0, '不得修改其他词库');
assert.strictEqual(
  targetBank.catalogVersions[App.GRADE4_VOLUME1_2024_INFO.id],
  App.GRADE4_VOLUME1_2024_INFO.version
);

const lesson2 = targetBank.lessons.find(lesson => lesson.name === '第2课 走月亮');
lesson2.words = lesson2.words.filter(word => word.text !== '柔和');
const secondResult = App.applyGrade4Volume1WordList();
assert.deepStrictEqual({...secondResult}, {matchedBanks: 1, updatedBanks: 0, lessonsAdded: 0, wordsAdded: 0});
assert.strictEqual(saves, 1, '同一版本不得重复迁移');
assert(!lesson2.words.some(word => word.text === '柔和'), '迁移完成后应尊重用户主动删词');

const partialBank = {
  id: 'bank-grade4-partial',
  name: '四年级上册',
  source: 'custom',
  catalogVersions: {},
  other: [],
  lessons: [{
    id: 'lesson-2-existing',
    name: '第2课',
    words: [{text: '柔和', hint: '已有说明'}, {text: '自定义词', hint: ''}],
    createdAt: 1,
    updatedAt: 1
  }],
  createdAt: 1,
  updatedAt: 1
};
const partialStore = {version: 2, zh: [partialBank], en: [], deleted: []};
App.getWordBankStore = () => partialStore;
App.saveWordBankStore = value => value;
const partialResult = App.applyGrade4Volume1WordList();
assert.deepStrictEqual({...partialResult}, {matchedBanks: 1, updatedBanks: 1, lessonsAdded: 14, wordsAdded: 223});
assert.strictEqual(partialBank.lessons[0].words[0].hint, '已有说明');
assert(partialBank.lessons[0].words.some(word => word.text === '自定义词'));
assert.strictEqual(partialBank.lessons[0].words.filter(word => word.text === '柔和').length, 1);

console.log('grade 4 volume 1 word-list tests passed');
