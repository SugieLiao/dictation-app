const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').join(__dirname, '..', 'dictation-app.html'), 'utf8');
assert(/\.ow-chip\{[^}]*border:2px solid transparent;[^}]*background:transparent;[^}]*color:var\(--muted\)/.test(html));
assert(/\.ow-chip\{[^}]*touch-action:none;/.test(html), '词语拖动手势不应被页面滚动接管');
assert(html.includes('.ow-chip:hover:not(.selected){border-color:transparent;background:transparent;color:var(--text);}'));
assert(html.includes(".ow-chip.merge-hover,.ow-chip.merge-active,.ow-chip.merge-pending{border-color:#d84315;background:#ff7a00;color:#fff;"), '拖动合并高亮应使用高对比样式并保留累计状态');
assert(html.includes(".ow-chip.merge-hover::after,.ow-chip.merge-active::after,.ow-chip.merge-pending::after{content:'✓';"), '拖动合并高亮应显示勾选标记');
assert(html.includes('☑️ 选择多个词语并调整课文'));
assert(/id="ocr-file-input"[^>]*capture="environment"/.test(html), '拍照入口应使用后置相机');
assert(/id="ocr-gallery-input"[^>]*accept="image\/\*"(?![^>]*capture)/.test(html), '相册入口不应强制调用相机');
assert(html.includes('ocrTriggerGallery(){document.getElementById(\'ocr-gallery-input\').click();}'));
assert(html.includes("if(dragged||hasMergeSelection)this._ocrMergeIgnoreClickUntil=Date.now()+160;"), '拖动合并后只应短暂抑制浏览器补发点击');
assert(html.includes("chip.addEventListener('pointercancel',(e)=>{this.ocrFinishMergeGesture(e,chip);});"), 'pointercancel 也必须完成累计选择');
assert(html.includes('this.ocrPersistCurrentMergeSelection();'), '拖动经过新词时必须立即持久化累计选择');
assert(html.includes('单击选择 · 双击修改 · 拖动合并'));
assert(html.includes('拖动可分多次累计合并，双指滑动页面'));
assert(/\.merge-toast\{[^}]*pointer-events:none;/.test(html), '合并提示层不应拦截后续拖动手势');
assert(/\.merge-toast \.mt-btns\{[^}]*pointer-events:auto;/.test(html), '合并与取消按钮仍应保持可点击');
assert(html.includes('window.visualViewport.addEventListener(\'resize\',handler);'), '编辑弹窗应跟随可视键盘区域');
assert.strictEqual(html.includes('class="ow-edit"'), false, '识别结果不应再显示修改小按钮');
const appStart = html.indexOf('const App={');
const appEnd = html.indexOf('\n};\n\nApp.init();', appStart);
assert(appStart >= 0 && appEnd > appStart, '无法从页面中读取 App');

const sandbox = {console, setTimeout, clearTimeout, Date, Math, JSON, Set, Map, PRESET: {zh: {}, en: {}}};
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
assert.deepStrictEqual(
  Array.from('堤顿逐渐堵墙浩', char => App.suggestWordForChar(char)),
  ['堤岸', '顿时', '逐渐', '渐渐', '堵塞', '墙壁', '浩荡']
);
assert.strictEqual(App.GRADE4_REFERENCE_INFO.id, 'pep-grade4-local-reference-v1');
assert.strictEqual(App.GRADE4_REFERENCE_INFO.access, 'embedded-offline');
const grade4TextbookChars =
  '潮据堤阔盼滚顿逐渐堵犹崩震霎余淘牵鹅卵坑洼填庄稼俗跃葡萄稻熟豌按舒适暗恐僵硬枪耐探愉曾沟蚊即科横竖绳系蝇证研究达驾驶唤纪技改程超亿核奥益联质哲任善暮吟题侧峰庐缘降费须逊输虎操占嫩顺均叠隙茎柄萎瞧固宅临慎选择址良穴厅卧专卫较睁翻斧劈缓浊丈撑竭累液奔茂滋帝曰溺返衔悲惨兽佩坚违抗环锁既狠著愤获嗅呆奈巢齿躯掩护幼搏庞量愣级链颤攀猴念辫呵摸甚跪捶绕顽脖脱概惹昏握摔凭掐班殷段俩练套裤逃亏挖撤堂砸锅否旋况兵败椅尤恨帅预溃品丑豪塞秦征词催醉杰亦雄项肃默晰振胸怀赞效凡顾训斥戎尝诸竞唯豹派娶媳妇淹逼浮旱徒扔饶骗灌溉' +
  '杂稀篱蜻蜓蝶宿徐疏茅檐翁笼赖剥构饰蹲凤序例率觅耸踏倘绘谐寄眠慰藉卜锐滩帐烁蝙蝠霸鹰怒吼脂拭餐划晌辣渗挣番埋刷测详笨钝鸽毫凌末描隧态吨颅膨肢翼辟纳拥箱臭蔬碳钢隐健康胞疾防灶需繁漫灭藤萝膝涛躲瓶挤叉挥桦涂茸绣潇穗朦胧寂霞抹忧虑贪职屏蹭稿腔解闷蛇遭殃盆勃讨厌坝忠毒绩孵警戒歪咕汤掘伏啼吠促颇剧苟譬侍馆附脾敏捷昂供添扩范努刹烂替镶紫仅浙罗杜鹃窄郁肩臀移额陆乳笋端源囊萤恭勤博贫焉逢卒晋炕铅呜哩栓胳膊劫绸扒敌尸趁慌芙蓉洛壶雁砚乾坤伦腹剖窟窿混嘶维秩岗宰措遣践介绍妖矩乖撵烫丫拽福舔葵瘦棒罢硕允砌牌禁惩踪啸私颊拆';
assert.deepStrictEqual(
  [...new Set(grade4TextbookChars)].filter(char => App.suggestWordForChar(char) === char),
  []
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

const modalFields = {
  'word-edit-title': {textContent: ''},
  'word-edit-sub': {textContent: ''},
  'word-edit-text': {value: '', placeholder: '', style: {}},
  'word-edit-hint': {value: '', style: {}},
  'word-edit-hint-field': {style: {}},
  'word-edit-msg': {textContent: '', style: {}}
};
sandbox.document = {getElementById: id => modalFields[id] || element};
const realOpenWordEditMask = App.openWordEditMask;
const realCloseWordEditModal = App.closeWordEditModal;
App.openWordEditMask = () => {};
App.closeWordEditModal = () => { App._wordEditTarget = null; };
App.ocrWords = [{text: '人山人海', hint: '', sourceChar: '人', selected: true}];
App.ocrEditSuggestedWord(0);
modalFields['word-edit-text'].value = '人山|人海 高山';
App.submitOcrWordEdit();
assert.deepStrictEqual(Array.from(App.ocrWords, word => word.text), ['人山', '人海', '高山']);

App.ocrWords = [{text: '人山人海', hint: '', sourceChar: '', selected: true}];
App.ocrEditSuggestedWord(0);
modalFields['word-edit-text'].value = '人山：很多人 | 人海';
App.submitOcrWordEdit();
assert.deepStrictEqual(
  Array.from(App.ocrWords, word => ({text: word.text, hint: word.hint})),
  [{text: '人山', hint: '很多人'}, {text: '人海', hint: ''}]
);
App.openWordEditMask = realOpenWordEditMask;
App.closeWordEditModal = realCloseWordEditModal;

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

const moveBank = {
  id: 'bank-move',
  name: '移动测试',
  other: [{text: '潮水', hint: ''}, {text: '大堤', hint: ''}],
  lessons: [
    {id: 'lesson-1', name: '第1课', words: [{text: '宽阔', hint: ''}, {text: '盼望', hint: ''}], createdAt: 1, updatedAt: 1},
    {id: 'lesson-2', name: '第2课', words: [{text: '滚动', hint: ''}], createdAt: 1, updatedAt: 1}
  ],
  createdAt: 1,
  updatedAt: 1
};
let moveResult = App._moveManagedBankWords(
  moveBank,
  [{lessonId: 'other', index: 1}, {lessonId: 'lesson-1', index: 0}],
  'lesson-2'
);
assert.strictEqual(moveResult.moved, 2);
assert.deepStrictEqual(Array.from(moveBank.other, word => word.text), ['潮水']);
assert.deepStrictEqual(Array.from(moveBank.lessons[0].words, word => word.text), ['盼望']);
assert.deepStrictEqual(Array.from(moveBank.lessons[1].words, word => word.text), ['滚动', '大堤', '宽阔']);

moveResult = App._moveManagedBankWords(
  moveBank,
  [{lessonId: 'lesson-2', index: 0}, {lessonId: 'lesson-2', index: 2}],
  'other'
);
assert.strictEqual(moveResult.moved, 2);
assert.deepStrictEqual(Array.from(moveBank.other, word => word.text), ['潮水', '滚动', '宽阔']);
assert.deepStrictEqual(Array.from(moveBank.lessons[1].words, word => word.text), ['大堤']);

moveResult = App._moveManagedBankWords(moveBank, [{lessonId: 'lesson-2', index: 0}], 'new', '第3课');
assert.strictEqual(moveResult.moved, 1);
assert.strictEqual(moveResult.lessonName, '第3课');
assert.deepStrictEqual(Array.from(moveBank.lessons[2].words, word => word.text), ['大堤']);

const duplicateBank = {
  id: 'bank-duplicate',
  name: '跨课文同名词测试',
  other: [{text: '跟随', hint: ''}, {text: '堤岸', hint: ''}, {text: '渐渐', hint: ''}],
  lessons: [{id: 'lesson-1', name: '第1课', words: [], createdAt: 1, updatedAt: 1}],
  createdAt: 1,
  updatedAt: 1
};
const duplicateStore = {version: 2, zh: [duplicateBank], en: [], deleted: []};
let addResult = App._addWordsToBank(
  duplicateStore,
  'zh',
  duplicateBank.id,
  'lesson-1',
  '',
  [{text: '跟随', hint: ''}, {text: '堤岸', hint: ''}, {text: '渐渐', hint: ''}]
);
assert.strictEqual(addResult.added, 3);
assert.deepStrictEqual(Array.from(duplicateBank.other, word => word.text), ['跟随', '堤岸', '渐渐']);
assert.deepStrictEqual(Array.from(duplicateBank.lessons[0].words, word => word.text), ['跟随', '堤岸', '渐渐']);
assert.strictEqual(App.getBankAllWords(duplicateBank).length, 6);
addResult = App._addWordsToBank(duplicateStore, 'zh', duplicateBank.id, 'lesson-1', '', [{text: '跟随', hint: ''}]);
assert.strictEqual(addResult.added, 0);

const refreshedViews = [];
App.renderLangGradeChips = () => refreshedViews.push('lang');
App.renderBankManager = () => refreshedViews.push('banks');
sandbox.document = {querySelector: () => ({id: 'screen-lang'})};
App.refreshWordBankViewsAfterSync();
sandbox.document = {querySelector: () => ({id: 'screen-banks'})};
App.refreshWordBankViewsAfterSync();
sandbox.document = {querySelector: () => ({id: 'screen-home'})};
App.refreshWordBankViewsAfterSync();
assert.deepStrictEqual(refreshedViews, ['lang', 'banks']);

const realSetTimeout = sandbox.setTimeout;
const realClearTimeout = sandbox.clearTimeout;
let fakeTimer = null;
let fakeTimerId = 0;
const tapActions = [];
const realOcrToggleWord = App.ocrToggleWord;
const realOcrEditSuggestedWord = App.ocrEditSuggestedWord;
sandbox.setTimeout = fn => { fakeTimer = fn; return ++fakeTimerId; };
sandbox.clearTimeout = () => { fakeTimer = null; };
App.ocrToggleWord = index => tapActions.push(['toggle', index]);
App.ocrEditSuggestedWord = index => tapActions.push(['edit', index]);
App.ocrCancelPendingWordTap();
App.ocrHandleWordTap(2);
assert(fakeTimer, '单击应等待双击判断时间');
fakeTimer();
assert.deepStrictEqual(tapActions, [['toggle', 2]]);
App.ocrHandleWordTap(3);
App.ocrHandleWordTap(3);
assert.deepStrictEqual(tapActions, [['toggle', 2], ['edit', 3]]);
assert.strictEqual(fakeTimer, null, '双击后不应残留单击任务');
sandbox.setTimeout = realSetTimeout;
sandbox.clearTimeout = realClearTimeout;
App.ocrToggleWord = realOcrToggleWord;
App.ocrEditSuggestedWord = realOcrEditSuggestedWord;

const mergeText = {textContent: ''};
const mergeConfirm = {disabled: false};
const mergeToastClasses = new Set();
const mergeToast = {classList: {add: value => mergeToastClasses.add(value), remove: value => mergeToastClasses.delete(value)}};
const makeMergeChip = index => {
  const classes = new Set(['ow-chip']);
  return {
    dataset: {idx: String(index)},
    classes,
    classList: {
      add: (...values) => values.forEach(value => classes.add(value)),
      remove: (...values) => values.forEach(value => classes.delete(value)),
      toggle: (value, force) => {
        if (force === undefined ? !classes.has(value) : force) classes.add(value);
        else classes.delete(value);
      }
    }
  };
};
const mergeChips = [0, 1, 2, 3, 4].map(makeMergeChip);
sandbox.document = {
  getElementById: id => id === 'merge-text' ? mergeText : id === 'merge-toast' ? mergeToast : id === 'merge-confirm-btn' ? mergeConfirm : element,
  querySelectorAll: selector => selector === '#ocr-words-grid .ow-chip' ? mergeChips : []
};
App.ocrWords = ['人山', '人海', '齐头', '并进', '山崩'].map(text => ({text, selected: true}));
App._ocrMergePending = null;
App._ocrMergeIndices = [0, 1];
assert.strictEqual(App.ocrPersistCurrentMergeSelection(), true);
assert.deepStrictEqual(mergeChips.map(chip => chip.classes.has('merge-pending')), [true, true, false, false, false]);
// 模拟手机浏览器没有派发 pointerup / pointercancel：直接清理临时状态，累计选择仍须存在。
App.ocrClearMergeState();
assert.deepStrictEqual(Array.from(App._ocrMergePending.indices), [0, 1]);
assert.deepStrictEqual(mergeChips.map(chip => chip.classes.has('merge-pending')), [true, true, false, false, false]);
App._ocrMergeIndices = [2, 3];
App.ocrShowMergeToast();
assert.deepStrictEqual(Array.from(App._ocrMergePending.indices), [0, 1, 2, 3]);
assert.strictEqual(App._ocrMergePending.merged, '人山人海齐头并进');
assert.strictEqual(mergeText.textContent, '已选 4 个词，合并为：人山人海齐头并进');
assert(mergeToastClasses.has('show'));

// 拖动选 3 个后，单击第 4、5 个应依次加入；再单击第 5 个应只取消它。
App.ocrSetMergePendingIndices([0, 1, 2]);
App.ocrToggleWord(3);
assert.deepStrictEqual(Array.from(App._ocrMergePending.indices), [0, 1, 2, 3]);
App.ocrToggleWord(4);
assert.deepStrictEqual(Array.from(App._ocrMergePending.indices), [0, 1, 2, 3, 4]);
assert.strictEqual(mergeText.textContent, '已选 5 个词，合并为：人山人海齐头并进山崩');
App.ocrToggleWord(4);
assert.deepStrictEqual(Array.from(App._ocrMergePending.indices), [0, 1, 2, 3]);
assert.strictEqual(mergeText.textContent, '已选 4 个词，合并为：人山人海齐头并进');
assert(App.ocrWords.every(word => word.selected), '增删待合并成员不应改变词语本身的选中状态');

App.ocrSetMergePendingIndices([0]);
assert.strictEqual(mergeConfirm.disabled, true, '只剩 1 个词时不能执行合并');
assert.strictEqual(mergeText.textContent, '已选 1 个词，请再选择至少 1 个词');
App.ocrToggleWord(0);
assert.strictEqual(App._ocrMergePending, null, '取消最后一个待合并词后应退出待合并状态');
assert.strictEqual(mergeToastClasses.has('show'), false);
assert.strictEqual(mergeConfirm.disabled, false);

App.ocrSetMergePendingIndices([0, 1, 2, 3]);
mergeChips.forEach(chip => {
  chip.classes.add('merge-active');
  chip.classes.add('merge-hover');
});
App.ocrClearMergeState();
assert.deepStrictEqual(
  mergeChips.map(chip => chip.classes.has('merge-pending')),
  [true, true, true, true, false],
  '松手清理后累计选择必须保持高亮'
);
assert(mergeChips.every(chip => !chip.classes.has('merge-active') && !chip.classes.has('merge-hover')));
App.ocrCancelMerge();
assert(mergeChips.every(chip => !chip.classes.has('merge-pending')), '仅在取消合并后清除累计选择');

const gestureHandlers = {};
const fakeGrid = {
  addEventListener: (name, handler) => { gestureHandlers[name] = handler; },
  removeEventListener: () => {}
};
let scrolledBy = 0;
sandbox.window = {scrollBy: (_x, y) => { scrolledBy += y; }};
App._ocrGridGestureHandlers = null;
App._ocrTouchPointers = new Map();
App._ocrTwoFingerScroll = false;
App.ocrBindGridTwoFingerScroll(fakeGrid);
const touchEvent = (pointerId, clientY) => ({pointerType: 'touch', pointerId, clientX: 10, clientY, preventDefault(){}, stopPropagation(){}});
gestureHandlers.pointerdown(touchEvent(9, 300));
App._ocrMergeStartIdx = 0;
App._ocrMergeIndices = [0, 1, 2];
App._ocrMergeDragged = true;
gestureHandlers.pointercancel(touchEvent(9, 300));
assert.deepStrictEqual(Array.from(App._ocrMergePending.indices), [0, 1, 2], '单指 pointercancel 必须保留已划过的词');
assert.deepStrictEqual(mergeChips.map(chip => chip.classes.has('merge-pending')), [true, true, true, false, false]);
assert.strictEqual(App._ocrMergeStartIdx, -1);
App.ocrCancelMerge();
gestureHandlers.pointerdown(touchEvent(1, 300));
gestureHandlers.pointerdown(touchEvent(2, 340));
assert.strictEqual(App._ocrTwoFingerScroll, true);
gestureHandlers.pointermove(touchEvent(1, 260));
gestureHandlers.pointermove(touchEvent(2, 300));
assert.notStrictEqual(scrolledBy, 0, '双指移动应滚动页面');
gestureHandlers.pointerup(touchEvent(1, 260));
gestureHandlers.pointerup(touchEvent(2, 300));
assert.strictEqual(App._ocrTwoFingerScroll, false);

assert.strictEqual(html.includes('api.jsonbin.io'), false);
assert.strictEqual(html.includes("API_KEY:"), false);
assert(html.includes("API_PATH:'/dictation/api/sync'"));
assert(html.includes('const reconnected=await this.init();'));
const cloudStart = html.indexOf('const CloudSync={');
const cloudEnd = html.indexOf('\n};\n\nApp.init();', cloudStart);
assert(cloudStart >= 0 && cloudEnd > cloudStart, '无法从页面中读取 CloudSync');
const CloudSync = vm.runInNewContext(
  html.slice(cloudStart, cloudEnd + 3) + '\nCloudSync;',
  {URL, location: {protocol: 'https:', origin: 'https://liaohao.cc'}}
);
assert.strictEqual(CloudSync._apiUrl(), 'https://liaohao.cc/dictation/api/sync');
assert.strictEqual(CloudSync._remoteIsEmpty({users: [], userData: {}}), true);
assert.strictEqual(CloudSync._remoteIsEmpty({users: [{id: 'u_1'}], userData: {}}), false);

console.log('word-input regression tests passed');
