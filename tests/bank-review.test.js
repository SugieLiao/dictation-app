// 听写页「复习」功能回归测试：入口按钮 / 复习弹窗（难度优先+手动+顺序乱序）/ 对错规则（复习词同步复习库与过关状态）
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','dictation-app.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m)throw new Error('script block not found');

// —— 入口按钮存在性（静态）——
assert.ok(html.includes('id="lang-review-btn"'),'review button in HTML');
assert.ok(html.includes('mode-start-row'),'start button row wrapper');
assert.ok(html.includes('id="bank-review-mask"'),'bank review modal in HTML');

const els={};
function mkClassList(){
  let s=new Set();
  return {add(c){s.add(c);},remove(c){s.delete(c);},contains(c){return s.has(c);},
    toggle(c,on){if(on===undefined){s.has(c)?s.delete(c):s.add(c);}else if(on){s.add(c);}else{s.delete(c);}},
    _sync(cls){s=new Set(String(cls||'').trim().split(/\s+/).filter(Boolean));},
    _raw:s};
}
function mkBtn(label){
  const cl=mkClassList();
  const b={id:'',classList:cl,style:{},dataset:{},innerHTML:'',textContent:label,
    disabled:false,value:'',checked:false,onclick:null,children:[],
    querySelectorAll:()=>[],querySelector:()=>null,appendChild(c){this.children.push(c);},
    removeEventListener(){},addEventListener(){}};
  Object.defineProperty(b,'className',{get(){return [...Array.from(cl._raw)].join(' ');},set(v){cl._sync(v);}});
  return b;
}
function getEl(id){
  if(!els[id])els[id]={id,classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',
    disabled:false,value:'',checked:false,onclick:null,children:[],
    querySelectorAll:(sel)=>els[id].children,querySelector:()=>null,
    appendChild(c){els[id].children.push(c);},removeEventListener(){},addEventListener(){}};
  return els[id];
}
global.document={
  getElementById:getEl,
  querySelector:()=>null,
  querySelectorAll:(sel)=>{
    if(sel==='#bank-review-mask .rd-mode-btn'||sel==='#bank-review-mask .rd-mode-btn[data-mode]'||sel==='#bank-review-mask .rd-mode-btn[data-order]')return getEl('bank-review-mask').children.filter(c=>c.textContent&&(c.textContent.includes('难度')||c.textContent.includes('手动')||c.textContent.includes('顺序')||c.textContent.includes('乱序')));
    if(sel==='#answer-list .answer-review-item.checked')return [];
    return [];
  },
  createElement:(tag)=>{const b=mkBtn('');b.tag=tag;return b;}
};
global.window={scrollTo(){},addEventListener(){}};
global.location={hash:'',replace(){}};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.setTimeout=()=>0;
global.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},addEventListener(){}};
global.SpeechSynthesisUtterance=function(t){this.text=t;};
global.alert=()=>{};
global.prompt=()=>null;
global.confirm=()=>true;

const App=new Function(m[1]+'\n;return App;')();

// —— 准备数据：英语词库 + 复习库 + 过关标记 + 日志 ——
const now=Date.now(),DAY=86400000;
const storage={};
storage['dict_users']=JSON.stringify([{id:'u_test',name:'测试',avatar:'👨',createdAt:now}]);
global.localStorage.getItem=(k)=>storage[k]||null;
global.localStorage.setItem=(k,v)=>{storage[k]=String(v);};
global.localStorage.removeItem=(k)=>{delete storage[k];};

App.currentUserId='u_test';
App.langPageMode='en';
App.mode='en';
App.enSettings={
  currentBankId:'b1',
  selectedLessonKeys:['bank::b1::l1'],
  dailyCount:0,
  dictOrder:'seq'
};

const store={version:2,catalogVersions:{},deleted:[],zh:[],en:[{
  id:'b1',name:'Test EN',source:'custom',
  lessons:[
    {id:'l1',name:'Unit 1',words:[{text:'hello',hint:'你好'},{text:'volleyball',hint:'排球'}]},
    {id:'l2',name:'Unit 2',words:[{text:'rubbish',hint:'垃圾'}]}
  ],
  other:[],createdAt:now,updatedAt:now
}]};
storage[App.userKey('dict_word_banks')]=JSON.stringify(store);
storage[App.userKey('dict_review')]=JSON.stringify({zh:[],en:[
  {text:'volleyball',hint:'排球',source:'Test EN-Unit 1',streak:1,last:now-DAY*2,nextReview:now-DAY,addedAt:now-DAY*10},
  {text:'rubbish',hint:'垃圾',source:'Test EN-Unit 2',streak:3,last:now,nextReview:0,addedAt:now-DAY*3}
]});
storage[App.userKey('dict_passed')]=JSON.stringify({'en::hello':now-DAY*20});
storage[App.userKey('dict_log')]=JSON.stringify([
  {mode:'en',date:new Date(now-DAY*2).toISOString(),total:3,correct:0,wrong:3,words:[{text:'hello'},{text:'hello'},{text:'hello'}],wrongIdx:[0,1,2]},
  {mode:'en',date:new Date(now-DAY*5).toISOString(),total:2,correct:1,wrong:1,words:[{text:'volleyball'},{text:'rubbish'}],wrongIdx:[0]}
]);
// 防 CloudSync 空引用
App.cloudSyncReady=true;

// —— 打开复习弹窗 ——
App.openBankReviewModal();
const mask=document.getElementById('bank-review-mask');
assert.ok(mask.classList.contains('show'),'bank review modal shown');
assert.ok(document.getElementById('br-mask-sub').textContent.includes('可复习 2 词（共 2 词）'),'subtitle shows scope: '+document.getElementById('br-mask-sub').textContent);

// 状态标注：hello 已过关、volleyball 复习库
const pool=App._bankReviewPool;
assert.strictEqual(pool.length,2,'pool has 2 words');
const byText={};pool.forEach(w=>byText[w.text]=w);
assert.strictEqual(byText['hello']._status,'passed','hello passed');
assert.strictEqual(byText['volleyball']._status,'review','volleyball in review');

// 默认方式1：词数栏可见，手动面板隐藏
assert.strictEqual(document.getElementById('br-count-field').style.display,'block','count visible in auto');
assert.strictEqual(document.getElementById('br-manual-panel').style.display,'none','manual hidden in auto');
// 数量档位 6 个（5/10/15/20/30/全部）
const countRow=document.getElementById('br-count-row');
assert.strictEqual(countRow.children.length,6,'6 count buttons');
assert.strictEqual(countRow.children[0].textContent,'5');
assert.strictEqual(countRow.children[1].textContent,'10');
assert.ok(countRow.children[1].classList.contains('active'),'default 10 active');
assert.strictEqual(countRow.children[5].textContent,'全部');

// —— 方式1 难度优先：难度降序取词 ——
const sessions=[];
App.startSession=(words,opts)=>{sessions.push({words,opts});};
App.startBankReviewFromModal();
assert.strictEqual(sessions.length,1,'auto session started');
assert.strictEqual(sessions[0].opts.type,'review');
assert.strictEqual(sessions[0].opts.grade,'复习');
assert.strictEqual(sessions[0].words.length,2,'auto picks 2 (all practiced)');
assert.strictEqual(sessions[0].words[0].text,'hello','hello has highest difficulty (3 errors)');
assert.ok(sessions[0].words.every(w=>w.fromReview),'review words flagged fromReview');
assert.ok(!mask.classList.contains('show'),'modal closed after start');

// —— 乱序：走 shuffleArray ——
sessions.length=0;
App._bankReviewOrder='shuffle';
const origShuffle=App.shuffleArray;
App.shuffleArray=(arr)=>arr.slice().reverse();
App.startBankReviewFromModal();
assert.strictEqual(sessions.length,1,'shuffle session started');
assert.strictEqual(sessions[0].words[0].text,'volleyball','shuffle reversed order');
App.shuffleArray=origShuffle;
App._bankReviewOrder='seq';

// —— 方式2 手动：显示状态、默认勾选已听写过的 ——
sessions.length=0;
App.openBankReviewModal();
App.bankReviewSetMode('manual');
assert.strictEqual(document.getElementById('br-manual-panel').style.display,'block','manual panel shown');
assert.strictEqual(document.getElementById('br-count-field').style.display,'none','count hidden in manual');
assert.strictEqual(App._bankReviewManualSel.size,2,'default selects passed+review (2)');
assert.ok(![...App._bankReviewManualSel].some(k=>pool.find(w=>w.key===k&&w._status==='new')),'no new words default selected');
assert.ok(document.getElementById('br-manual-count').textContent.includes('已选 2 个'),'manual count text');
// 手动表渲染含状态标签
const listHtml=document.getElementById('br-manual-list').innerHTML;
assert.ok(listHtml.includes('br-status passed')&&listHtml.includes('已过关'),'passed status rendered');
assert.ok(listHtml.includes('br-status review')&&listHtml.includes('复习库'),'review status rendered');
// 全选/取消全选（初始已全选：2 个）
App.bankReviewToggleAll();
assert.strictEqual(App._bankReviewManualSel.size,0,'toggle all off when already all selected');
App.bankReviewToggleAll();
assert.strictEqual(App._bankReviewManualSel.size,2,'toggle all on again');
// 取消一个再开始
App.bankReviewToggleManual(pool[0].key,false);
assert.strictEqual(App._bankReviewManualSel.size,1,'unchecked one');
App.startBankReviewFromModal();
assert.strictEqual(sessions.length,1,'manual session started');
assert.strictEqual(sessions[0].words.length,1,'manual uses checked words');
// 全不选 → 不开始
sessions.length=0;
App._bankReviewManualSel=new Set();
App.startBankReviewFromModal();
assert.strictEqual(sessions.length,0,'0 selected → no session');

// —— 对错规则 ——
// 1) 复习写对且词在复习库 → streak+1（需求2）
const rb0=JSON.parse(storage[App.userKey('dict_review')]);
const vb0=rb0.en.find(w=>w.text==='volleyball');
assert.strictEqual(vb0.streak,1,'volleyball streak 1 before');
App.words=[{text:'volleyball',hint:'',fromReview:true}];
App.sessionSource={type:'review',mode:'en',grade:'复习'};
App.allCorrect();
const rb1=JSON.parse(storage[App.userKey('dict_review')]);
assert.strictEqual(rb1.en.find(w=>w.text==='volleyball').streak,2,'volleyball streak 2 after allCorrect');

// 2) 复习写错且已过关 → 记入复习库 streak=0（需求3）
App._bankReviewPool=pool;
App.words=[
  {text:'hello',hint:'',fromReview:true},
  {text:'volleyball',hint:'',fromReview:true}
];
App.sessionSource={type:'review',mode:'en',grade:'复习'};
global.document.querySelectorAll=(sel)=>{
  if(sel==='#answer-list .answer-review-item.checked')return [{dataset:{idx:'0'}}];
  return [];
};
App.saveWrongToReview();
const rb2=JSON.parse(storage[App.userKey('dict_review')]);
const helloRb=rb2.en.find(w=>w.text==='hello');
assert.ok(helloRb,'hello added to review bank after wrong');
assert.strictEqual(helloRb.streak,0,'hello streak 0 in review bank');
assert.strictEqual(rb2.en.find(w=>w.text==='volleyball').streak,3,'volleyball streak +1 to 3 (still counted as correct)');
// 过关标记仍保留（写错只是进复习库，过关记录不删除）
const passed=JSON.parse(storage[App.userKey('dict_passed')]);
assert.ok(passed['en::hello'],'hello still passed-marked');

// 3) 复习写对且已过关（不在复习库）→ 保持过关、不重复进复习库
App.words=[{text:'rubbish',hint:'',fromReview:true}];
App.sessionSource={type:'review',mode:'en',grade:'复习'};
global.document.querySelectorAll=()=>[];
App.saveWrongToReview();
const rb3=JSON.parse(storage[App.userKey('dict_review')]);
assert.ok(rb3.en.filter(w=>w.text==='rubbish').length===1,'rubbish not duplicated');
const passed2=JSON.parse(storage[App.userKey('dict_passed')]);
assert.ok(passed2['en::rubbish']||rb3.en.some(w=>w.text==='rubbish'&&(w.streak||0)>=3),'rubbish remains mastered');

console.log('bank-review tests passed');
