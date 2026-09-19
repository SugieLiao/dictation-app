const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dictation-app.html'), 'utf8');
const appStart = html.indexOf('const App={');
const appEnd = html.indexOf('\n};\n\nApp.init();', appStart);
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  window: {},
  localStorage: { _data: {}, getItem(k){return this._data[k]||null}, setItem(k,v){this._data[k]=v}, removeItem(k){delete this._data[k]} },
  document: { getElementById: (id) => id === 'lang-custom-list' ? {value: ''} : null, querySelector: () => null, querySelectorAll: () => [] },
  TTS: { speak(){}, stop(){} },
  speechSynthesis: { getVoices: () => [] },
  CloudSync: { pushDebounced(){} },
  PRESET: { zh:{}, en:{} }
};
const App = vm.runInNewContext(html.slice(appStart, appEnd + 3) + '\nApp;', sandbox);

assert.strictEqual(App.NEW_WORD_RATIO, 10);
assert.strictEqual(App.REVIEW_WORD_RATIO, 3);
assert.strictEqual(App.calculateReviewCountForTotal(20), 5);
assert.strictEqual(App.calculateAllReviewCount(30), 9);

const lessonWords = Array.from({length: 30}, (_, i) => ({text: '生词' + (i + 1), hint: ''}));
const reviewPool = Array.from({length: 25}, (_, i) => ({text: '复习词' + (i + 1), hint: '', streak: 0}));
const bank = {
  id: 'bank-1', name: '四年级上册', source: 'custom', other: [],
  lessons: [{id: 'lesson-1', name: '第1课', words: lessonWords}]
};

App.mode = 'zh';
App.langPageMode = 'zh';
App.cloudSyncReady = true;
App.zhSettings = {dailyCount: 20, dictOrder: 'sequential', selectedLessonKeys: ['bank::bank-1::lesson-1']};
App.findManagedBank = () => bank;
App.getBankScopeWords = (_b, id) => id === 'lesson-1' ? lessonWords : [];
App.getBankAllWords = () => lessonWords;
App.getReviewBank = () => ({zh: reviewPool, en: []});
const requestedReviewCounts = [];
App.pickReviewWords = (_m, c) => { requestedReviewCounts.push(c); return reviewPool.slice(0, c); };
App.pickReviewWordsExcluding = (_m, c) => { requestedReviewCounts.push(c); return reviewPool.slice(0, c); };
App.showToast = () => {};
let started = null;
App.startSession = (words, source) => { started = {words, source}; };

App.beginDictation();
assert.notStrictEqual(started, null, '应直接开始听写');
assert.strictEqual(requestedReviewCounts.at(-1), 5);
assert.strictEqual(started.words.length, 20);
assert.strictEqual(started.words.filter(w => w.fromReview).length, 5);
assert.strictEqual(started.words.filter(w => !w.fromReview).length, 15);

started = null;
App.zhSettings.dailyCount = 0;
App.beginDictation();
assert.strictEqual(requestedReviewCounts.at(-1), 9);
assert.strictEqual(started.words.length, 39);
assert.strictEqual(started.words.filter(w => w.fromReview).length, 9);
assert.strictEqual(started.words.filter(w => !w.fromReview).length, 30);

started = null;
App.zhSettings.dailyCount = 20;
App.zhSettings.selectedLessonKeys = [];
App.beginDictation();
assert.strictEqual(started, null, '没有选中内容时不应开始');

console.log('lesson dictation regression tests passed');
