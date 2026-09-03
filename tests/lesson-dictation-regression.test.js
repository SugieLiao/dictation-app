const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dictation-app.html'), 'utf8');
const langScreenStart = html.indexOf('<section class="screen" id="screen-lang">');
const langScreenEnd = html.indexOf('<!-- ===== 词库管理页 ===== -->', langScreenStart);
const langScreenHtml = html.slice(langScreenStart, langScreenEnd);
assert(langScreenStart >= 0 && langScreenEnd > langScreenStart, '无法读取听写设置页面');
assert(!langScreenHtml.includes('App.openBankManager(App.langPageMode)'), '听写设置页面不应显示词库管理入口');
assert(!langScreenHtml.includes('App.ocrOpen(App.langPageMode)'), '听写设置页面不应显示拍照听写入口');
assert(html.includes('onclick="App.openBankManager(\'zh\')"'), '首页词库管理功能应继续保留');
assert(!html.includes("if(bank.source!=='preset')c.style.borderStyle='dashed';"), '听写页新建词库应与原有词库统一使用实线边框');
assert(html.includes('id="lesson-coverage-mask"'), '选择课文且数量非全部时应提供范围弹窗');
assert(html.includes('<span class="choice-title">全部（默认）</span>'));
assert(html.includes('<span class="choice-title">部分</span>'));
assert(html.includes('const mix=this.calculatePartialMixCounts(cnt,newWordsPool.length);'), '固定数量听写必须按目标比例计算生词和复习词');

const appStart = html.indexOf('const App={');
const appEnd = html.indexOf('\n};\n\nApp.init();', appStart);
assert(appStart >= 0 && appEnd > appStart, '无法从页面中读取 App');

const PRESET = {zh: {}, en: {}};
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
  PRESET
};
const App = vm.runInNewContext(html.slice(appStart, appEnd + 3) + '\nApp;', sandbox);

assert.strictEqual(App.NEW_WORD_RATIO, 10);
assert.strictEqual(App.REVIEW_WORD_RATIO, 3);
assert.strictEqual(App.REVIEW_TARGET_RATIO, 3 / 13);
assert.strictEqual(App.calculateReviewCountForTotal(20), 5, '总量 20 时应混入约 5 个复习词');
assert.strictEqual(App.calculateReviewCountForTotal(15), 3, '总量 15 时应混入约 3 个复习词');
assert.strictEqual(App.calculateAllReviewCount(30), 9, '30 个本课生词应反推最多 9 个复习词');
assert.deepStrictEqual({...App.calculatePartialMixCounts(20, 30)}, {newCount: 15, reviewCount: 5});
assert.deepStrictEqual({...App.calculatePartialMixCounts(20, 5)}, {newCount: 5, reviewCount: 2}, '生词不足时也应保持接近 10:3，而不是用复习词填满');

const coverageClasses = new Set();
const elements = {
  'lang-custom-list': {value: ''},
  'lesson-coverage-mask': {
    classList: {
      add: value => coverageClasses.add(value),
      remove: value => coverageClasses.delete(value)
    }
  },
  'lesson-coverage-sub': {textContent: ''},
  'lesson-coverage-all-detail': {textContent: ''},
  'lesson-coverage-partial-detail': {textContent: ''}
};
sandbox.document = {getElementById: id => elements[id]};

const lessonWords = Array.from({length: 30}, (_, index) => ({text: '生词' + (index + 1), hint: ''}));
const reviewPool = Array.from({length: 25}, (_, index) => ({text: '复习词' + (index + 1), hint: '', streak: 0}));
const bank = {
  id: 'bank-1',
  name: '四年级上册',
  source: 'custom',
  other: [],
  lessons: [{id: 'lesson-1', name: '第1课', words: lessonWords}]
};

App.mode = 'zh';
App.langPageMode = 'zh';
App.cloudSyncReady = true;
App.grade = bank.name;
App.zhSettings = {
  dailyCount: 20,
  dictOrder: 'sequential',
  bankId: bank.id,
  lessonId: 'lesson-1'
};
App.findManagedBank = () => bank;
App.getBankScopeWords = (_bank, lessonId) => lessonId === 'lesson-1' ? lessonWords : [];
App.getBankAllWords = () => lessonWords;
App.getReviewBank = () => ({zh: reviewPool, en: []});
const requestedReviewCounts = [];
App.pickReviewWords = (_mode, count) => {
  requestedReviewCounts.push(count);
  return reviewPool.slice(0, count);
};
App.pickReviewWordsExcluding = (_mode, count) => {
  requestedReviewCounts.push(count);
  return reviewPool.slice(0, count);
};
App.showToast = () => {};
let started = null;
App.startSession = (words, source) => { started = {words, source}; };

App.beginDictation();
assert(coverageClasses.has('show'), '固定数量且选中具体课文时应先显示范围弹窗');
assert.strictEqual(started, null, '用户选择全部或部分前不能直接开始');
assert.strictEqual(elements['lesson-coverage-sub'].textContent, '“第1课”共有 30 个生词。复习词按 10:3 目标比例混入。');
assert.strictEqual(elements['lesson-coverage-all-detail'].textContent, '本课 30 个生词 + 最多 9 个复习词');
assert.strictEqual(elements['lesson-coverage-partial-detail'].textContent, '按当前设置共 20 词：约 15 个生词 + 5 个复习词');

App.chooseLessonCoverage('partial');
assert.strictEqual(coverageClasses.has('show'), false);
assert.strictEqual(requestedReviewCounts.at(-1), 5);
assert.strictEqual(started.words.length, 20);
assert.strictEqual(started.words.filter(word => word.fromReview).length, 5);
assert.strictEqual(started.words.filter(word => !word.fromReview).length, 15);
assert.strictEqual(started.source.lessonCoverage, 'partial');
assert.strictEqual(started.source.reviewCount, 5);

started = null;
App.beginDictation('all');
assert.strictEqual(requestedReviewCounts.at(-1), 9);
assert.strictEqual(started.words.length, 39);
assert.strictEqual(started.words.filter(word => word.fromReview).length, 9);
assert.strictEqual(started.words.filter(word => !word.fromReview).length, 30);
assert.strictEqual(started.source.lessonCoverage, 'all');
assert.strictEqual(started.source.reviewCount, 9);

console.log('lesson dictation regression tests passed');
