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
const info = App.GRADE4_VOLUME1_2024_INFO;
const lessons = App.GRADE4_VOLUME1_2024_LESSONS;

assert.strictEqual(info.lessonCount, 25);
assert.strictEqual(info.numberedLessonCount, 21);
assert.strictEqual(info.gardenCount, 4);
assert.strictEqual(info.characterCount, 250);
assert.strictEqual(info.wordCount, 220);
assert.strictEqual(lessons.length, 25);
assert.deepStrictEqual(
  Array.from(lessons, lesson => lesson.key),
  [
    'lesson-1', 'lesson-2', 'lesson-4', 'lesson-5', 'lesson-6', 'garden-2',
    'lesson-8', 'lesson-9', 'lesson-10', 'lesson-11', 'lesson-12', 'lesson-13', 'garden-4',
    'lesson-15', 'lesson-16', 'lesson-17', 'lesson-18', 'garden-6',
    'lesson-20', 'lesson-21', 'lesson-23', 'garden-7', 'lesson-24', 'lesson-25', 'lesson-27'
  ]
);
assert.deepStrictEqual(
  Array.from(lessons, lesson => lesson.title),
  [
    '观潮', '繁星', '一个豆荚里的五粒豆', '夜间飞行的秘密', '万帽子店', '语文园地二',
    '古诗三首', '爬山虎的脚', '蟋蟀的住宅', '盘古开天地', '精卫填海', '普罗米修斯', '语文园地四',
    '麻雀', '爬天都峰', '长城', '颐和园', '语文园地六',
    '牛和鹅', '一只窝囊的大老虎', '王戎不取道旁李', '语文园地七',
    '我将无我，不负人民', '为中华之崛起而读书', '古诗三首'
  ]
);
assert.strictEqual(lessons.reduce((sum, lesson) => sum + Array.from(lesson.chars).length, 0), 250);
assert.strictEqual(lessons.reduce((sum, lesson) => sum + lesson.words.length, 0), 220);

const lesson10 = lessons.find(lesson => lesson.key === 'lesson-10');
assert.deepStrictEqual(
  Array.from(lesson10.words),
  ['住宅', '选择', '住址', '大厅', '柔弱', '平坦', '光滑', '修理', '重要', '增长'],
  '第10课跨页词语必须完整合并'
);
const lesson20 = lessons.find(lesson => lesson.key === 'lesson-20');
assert.deepStrictEqual(
  Array.from(lesson20.words),
  ['虽然', '拳头', '故意', '神气', '忙乱', '鞋子', '助威', '胳膊', '纷纷', '可笑', '无缘无故'],
  '第20课跨页词语必须完整合并'
);

let generatedCount = 0;
for(const lesson of lessons){
  const generated = App.getGrade4Volume1LessonWords(lesson);
  generatedCount += generated.length;
  for(const word of lesson.words)assert(generated.includes(word), `${lesson.key} 缺少词语表原词：${word}`);
  for(const char of Array.from(lesson.chars)){
    assert(generated.some(word => word !== char && word.includes(char)), `${lesson.key} 的“${char}”没有组词`);
  }
}
assert.strictEqual(generatedCount, 315);
assert(App.getGrade4Volume1LessonWords(lesson10).includes('重要'));
assert(!App.getGrade4Volume1LessonWords(lesson10).includes('重叠'), '多音字应优先使用本课词语表中的词');
assert(App.getGrade4Volume1LessonWords(lesson20).includes('天鹅'));
assert(App.getGrade4Volume1LessonWords(lessons.find(lesson => lesson.key === 'lesson-27')).includes('塞外'));

const firstLessonWords = [{text: '用户已有词语', hint: '必须保留'}];
const targetBank = {
  id: 'bank-grade4',
  name: '四年级上册',
  source: 'custom',
  catalogVersions: {'pep-grade4-volume1-2024-word-list': 'v1'},
  other: [{text: '其他词语', hint: ''}],
  lessons: [
    {id: 'lesson-1', name: '第1课', words: firstLessonWords, createdAt: 1, updatedAt: 1},
    {id: 'lesson_pep_g4v1_2024_2', name: '第2课 走月亮', words: [{text: '河床', hint: ''}], createdAt: 1, updatedAt: 1},
    {id: 'lesson-custom', name: '我的课文', words: [{text: '自定义词', hint: ''}], createdAt: 1, updatedAt: 1}
  ],
  createdAt: 1,
  updatedAt: 1
};
const unrelatedBank = {
  id: 'bank-other', name: '课外词语', source: 'custom', catalogVersions: {}, other: [], lessons: [], createdAt: 1, updatedAt: 1
};
const store = {version: 2, catalogVersions: {}, zh: [targetBank, unrelatedBank], en: [], deleted: []};
let saves = 0;
let lastSkipPush = null;
App.getWordBankStore = () => store;
App.saveWordBankStore = (_store, skipPush) => { saves++; lastSkipPush = skipPush; return _store; };

const result = App.applyGrade4Volume1WordList();
assert.deepStrictEqual({...result}, {
  matchedBanks: 1,
  banksCreated: 0,
  updatedBanks: 1,
  lessonsAdded: 24,
  lessonsRemoved: 1,
  wordsAdded: 315
});
assert.strictEqual(saves, 1);
assert.strictEqual(lastSkipPush, true, '迁移应等待现有云同步流程统一推送');
assert.strictEqual(targetBank.lessons.length, 26);
assert.strictEqual(targetBank.lessons[0].name, '第1课 观潮');
assert.strictEqual(targetBank.lessons[0].words[0], firstLessonWords[0], '用户已有第1课词语必须保留');
assert.strictEqual(targetBank.lessons[1].name, '第2课 繁星');
assert(!targetBank.lessons[1].words.some(word => word.text === '河床'), '旧教材自动生成的课文内容必须移除');
assert.strictEqual(targetBank.lessons.at(-1).name, '我的课文', '自定义课文必须保留');
assert.strictEqual(targetBank.other[0].text, '其他词语');
assert.strictEqual(unrelatedBank.lessons.length, 0, '不得修改其他词库');
assert.strictEqual(targetBank.catalogVersions[info.id], info.version);
assert.strictEqual(store.catalogVersions[info.id], info.version);

const secondResult = App.applyGrade4Volume1WordList();
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
const beforeCloudResult = App.applyGrade4Volume1WordList(false);
assert.deepStrictEqual({...beforeCloudResult}, {
  matchedBanks: 0,
  banksCreated: 0,
  updatedBanks: 0,
  lessonsAdded: 0,
  lessonsRemoved: 0,
  wordsAdded: 0
});
assert.strictEqual(emptyStoreSaves, 0, '云端拉取前不得凭空创建同名词库');
const createResult = App.applyGrade4Volume1WordList();
assert.deepStrictEqual({...createResult}, {
  matchedBanks: 1,
  banksCreated: 1,
  updatedBanks: 1,
  lessonsAdded: 25,
  lessonsRemoved: 0,
  wordsAdded: 315
});
assert.strictEqual(emptyStoreSaves, 1);
assert.strictEqual(emptyStore.zh[0].name, '四年级上册');
assert.strictEqual(emptyStore.zh[0].lessons.length, 25);

emptyStore.zh = [];
const deletedResult = App.applyGrade4Volume1WordList();
assert.deepStrictEqual({...deletedResult}, {
  matchedBanks: 0,
  banksCreated: 0,
  updatedBanks: 0,
  lessonsAdded: 0,
  lessonsRemoved: 0,
  wordsAdded: 0
});
assert.strictEqual(emptyStoreSaves, 1, '用户主动删除后不得再次自动创建');

const normalized = App._normalizeWordBankStore({version: 2, catalogVersions: {[info.id]: info.version}, zh: [], en: [], deleted: []});
assert.strictEqual(normalized.catalogVersions[info.id], info.version, '根级教材迁移标记必须保留');

console.log('grade 4 volume 1 photo-edition tests passed');
