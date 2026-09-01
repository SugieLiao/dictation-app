const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').join(__dirname, '..', 'dictation-app.html'), 'utf8');
assert(/\.ow-chip\{[^}]*border:2px solid transparent;[^}]*background:transparent;[^}]*color:var\(--muted\)/.test(html));
assert(html.includes('.ow-chip:hover:not(.selected){border-color:transparent;background:transparent;color:var(--text);}'));
const appStart = html.indexOf('const App={');
const appEnd = html.indexOf('\n};\n\nApp.init();', appStart);
assert(appStart >= 0 && appEnd > appStart, '无法从页面中读取 App');

const sandbox = {console, setTimeout, clearTimeout, Date, Math, JSON, Set, Map};
const App = vm.runInNewContext(html.slice(appStart, appEnd + 3) + '\nApp;', sandbox);
const element = {style: {}};
sandbox.document = {getElementById: () => element};

assert.deepStrictEqual(
  Array.from(App.parseManualWords('人山人海|高山 海水\n山谷'), word => word.text),
  ['人山人海', '高山', '海水', '山谷']
);
assert.deepStrictEqual(
  Array.from(App.parseManualWords('学校 老师：lǎo shī | 同学:同班 学生'), word => ({text: word.text, hint: word.hint})),
  [
    {text: '学校', hint: ''},
    {text: '老师', hint: 'lǎo shī'},
    {text: '同学', hint: '同班 学生'}
  ]
);
assert.deepStrictEqual(
  Array.from(App.parseCustom('apple | banana：香蕉'), word => ({text: word.text, hint: word.hint})),
  [{text: 'apple', hint: ''}, {text: 'banana', hint: '香蕉'}]
);

App.ocrRenderWords = () => {};
App.ocrRenderBankList = () => {};
App.ocrUpdateConfirmBtn = () => {};
App.showToast = () => {};
App.suggestWordForChar = char => char;

App.ocrEntryMode = 'chars';
App.ocrParseText('人山人海');
assert.deepStrictEqual(Array.from(App.ocrWords, word => word.sourceChar), ['人', '山', '人', '海']);

App.ocrEntryMode = 'words';
App.ocrParseText('人山人海');
assert.deepStrictEqual(Array.from(App.ocrWords, word => word.text), ['人山人海']);

const manualInput = {value: '人山|人海 高山'};
sandbox.document = {getElementById: id => id === 'ocr-add-word' ? manualInput : element};
App.ocrWords = [];
App.ocrAddWord();
assert.deepStrictEqual(Array.from(App.ocrWords, word => word.text), ['人山', '人海', '高山']);

sandbox.prompt = () => '人山|人海 高山';
App.ocrWords = [{text: '人山人海', hint: '', sourceChar: '人', selected: true}];
App.ocrEditSuggestedWord(0);
assert.deepStrictEqual(Array.from(App.ocrWords, word => word.text), ['人山', '人海', '高山']);

sandbox.prompt = () => '人山：很多人 | 人海';
App.ocrWords = [{text: '人山人海', hint: '', sourceChar: '', selected: true}];
App.ocrEditSuggestedWord(0);
assert.deepStrictEqual(
  Array.from(App.ocrWords, word => ({text: word.text, hint: word.hint})),
  [{text: '人山', hint: '很多人'}, {text: '人海', hint: ''}]
);

const bank = {id: 'bank-1', name: '测试词库', other: [{text: '人山人海', hint: ''}], lessons: []};
App.bankManagerLang = 'zh';
App.bankManagerBankId = bank.id;
App.getWordBankStore = () => ({version: 2, zh: [bank], en: [], deleted: []});
App.saveWordBankStore = () => {};
App.renderBankManagerDetail = () => {};
sandbox.prompt = () => '人山|人海 高山';
App.editManagedWord('other', 0);
assert.deepStrictEqual(Array.from(bank.other, word => word.text), ['人山', '人海', '高山']);

bank.other = [{text: '人山人海', hint: '齐头并进  | 山崩地裂 |  霎时'}];
sandbox.prompt = (message, initialValue) => initialValue;
App.editManagedWord('other', 0);
assert.deepStrictEqual(Array.from(bank.other, word => word.text), ['人山人海', '齐头并进', '山崩地裂', '霎时']);

console.log('word-input regression tests passed');
