const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').join(__dirname, '..', 'dictation-app.html'), 'utf8');
assert(/\.ow-chip\{[^}]*border:2px solid transparent;[^}]*background:transparent;[^}]*color:var\(--muted\)/.test(html));
assert(/\.ow-chip\{[^}]*touch-action:none;/.test(html), '词语拖动手势不应被页面滚动接管');
assert(html.includes('.ow-chip:hover:not(.selected){border-color:transparent;background:transparent;color:var(--text);}'));
assert(html.includes(".ow-chip.merge-hover,.ow-chip.merge-active{border-color:#d84315;background:#ff7a00;color:#fff;"), '拖动合并高亮应使用高对比样式');
assert(html.includes(".ow-chip.merge-hover::after,.ow-chip.merge-active::after{content:'✓';"), '拖动合并高亮应显示勾选标记');
assert(html.includes('☑️ 选择多个词语并调整课文'));
assert(/id="ocr-file-input"[^>]*capture="environment"/.test(html), '拍照入口应使用后置相机');
assert(/id="ocr-gallery-input"[^>]*accept="image\/\*"(?![^>]*capture)/.test(html), '相册入口不应强制调用相机');
assert(html.includes('ocrTriggerGallery(){document.getElementById(\'ocr-gallery-input\').click();}'));
assert(html.includes("if(dragged)this._ocrMergeIgnoreClickUntil=Date.now()+700;"), '拖动合并后应抑制误触点击');
assert(html.includes('单击选择 · 双击修改 · 拖动合并'));
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
