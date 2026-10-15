// 复习库听写弹窗回归测试：词数档位 / 选词方式（自动按到期 / 手动勾选）/ startSession 入参
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','dictation-app.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m)throw new Error('script block not found');

const els={};
function mkClassList(){
  let s=new Set();
  return {add(c){s.add(c);},remove(c){s.delete(c);},contains(c){return s.has(c);},
    toggle(c,on){if(on===undefined){s.has(c)?s.delete(c):s.add(c);}else if(on){s.add(c);}else{s.delete(c);}},
    _sync(cls){s=new Set(String(cls||'').trim().split(/\s+/).filter(Boolean));}};
}
function mkBtn(label){
  const cl=mkClassList();
  const b={id:'',classList:cl,style:{},dataset:{},innerHTML:'',textContent:label,
    disabled:false,value:'',checked:false,onclick:null,querySelectorAll:()=>[],querySelector:()=>null,
    appendChild(){},removeEventListener(){},addEventListener(){},children:[]};
  Object.defineProperty(b,'className',{get(){return [...Array.from(cl._raw?cl._raw:[])].join(' ');},set(v){cl._sync(v);}});
  return b;
}
function el(id){
  if(!els[id])els[id]={id,classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',
    disabled:false,value:'',checked:false,onclick:null,children:[],
    querySelectorAll:(sel)=>{if(sel==='.rd-count-btn'||sel==='.rd-mode-btn')return els[id].children.filter(c=>c.className&&c.className.contains&&(sel==='.rd-count-btn'?(c.textContent!=='全部'&&c.textContent!=='全部'):true));return [];},
    querySelector:()=>null,appendChild(c){els[id].children.push(c);},removeEventListener(){},addEventListener(){}};
  return els[id];
}
// 简化：querySelectorAll('.rd-count-btn') 由 children 过滤
function elx(id){
  if(!els[id])els[id]={id,classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',
    disabled:false,value:'',checked:false,onclick:null,children:[],
    querySelectorAll:()=>els[id].children,querySelector:()=>null,
    appendChild(c){els[id].children.push(c);},removeEventListener(){},addEventListener(){}};
  return els[id];
}
// 兜底：所有 getElementById 都返回带 children 的元素
const getEl=(id)=>{if(!els[id])els[id]={id,classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',disabled:false,value:'',checked:false,onclick:null,children:[],querySelectorAll:()=>els[id].children,querySelector:()=>null,appendChild(c){els[id].children.push(c);},removeEventListener(){},addEventListener(){}};return els[id];};

global.document={
  getElementById:getEl,
  querySelector:(sel)=>{if(sel==='#review-dict-mask .rd-mode-btn')return null;return null;},
  querySelectorAll:(sel)=>{if(sel==='#review-dict-mask .rd-mode-btn')return getEl('review-dict-mask').children;return [];},
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

// —— 准备数据：语文复习库 6 个词，2 个已到期 ——
const now=Date.now();
const DAY=86400000;
const zh=[
  {text:'浩浩荡荡',hint:'',source:'四年级上册-第1课',streak:0,last:now,nextReview:now-DAY,addedAt:now-DAY*10},
  {text:'人山人海',hint:'',source:'四年级上册-第1课',streak:1,last:now,nextReview:now-DAY,addedAt:now-DAY*9},
  {text:'目不转睛',hint:'',source:'四年级上册-第2课',streak:0,last:now,nextReview:now+DAY*2,addedAt:now-DAY*8},
  {text:'鸦雀无声',hint:'',source:'四年级上册-第2课',streak:2,last:now,nextReview:now+DAY*4,addedAt:now-DAY*7},
  {text:'窃窃私语',hint:'',source:'四年级上册-第3课',streak:0,last:now,nextReview:now+DAY,addedAt:now-DAY*6},
  {text:'奔流不息',hint:'',source:'四年级上册-第3课',streak:1,last:now,nextReview:now+DAY*2,addedAt:now-DAY*5},
];
const storage={};
storage[App.userKey('dict_review')]=JSON.stringify({zh,en:[]});
global.localStorage.getItem=(k)=>storage[k]||null;

// 断言初始语言
App.reviewLang='zh';

// —— 打开弹窗 ——
App.startReview();
const mask=document.getElementById('review-dict-mask');
assert.ok(mask.classList.contains('show'),'modal shown');
assert.strictEqual(document.getElementById('rd-mask-sub').textContent,'语文 · 待复习 6 词 · 已到期 2 词');

// 数量档位：5/10/15/20/30/全部 共 6 个
const countRow=document.getElementById('rd-count-row');
assert.strictEqual(countRow.children.length,6,'6 count buttons');
assert.strictEqual(countRow.children[0].textContent,'5');
assert.ok(countRow.children[1].textContent==='10'&&countRow.children[1].classList.contains('active'),'default 10 active');
assert.strictEqual(countRow.children[5].textContent,'全部');

// —— 方式1 自动：取 2 个 → 到期优先 ——
const sessions=[];
App.startSession=(words,opts)=>{sessions.push({words,opts});};
App._reviewDictCount='2';
App.reviewDictSetCount(2);
App.startReviewFromModal();
assert.strictEqual(sessions.length,1,'one session');
assert.strictEqual(sessions[0].opts.type,'review');
assert.strictEqual(sessions[0].opts.mode,'zh');
assert.strictEqual(sessions[0].words.length,2,'auto picks 2');
assert.strictEqual(sessions[0].words[0].text,'浩浩荡荡','due first by nextReview asc');
assert.strictEqual(sessions[0].words[1].text,'人山人海');
assert.ok(!mask.classList.contains('show'),'modal closed after start');

// —— 方式2 手动：重新打开，切手动，取消一个再开始 ——
App.startReview();
App.reviewDictSetCount('3');
App.reviewDictSetMode('manual');
assert.ok(document.getElementById('rd-manual-panel').style.display==='block','manual panel shown');
// 默认勾选 3 个（按到期排序前3：浩浩荡荡、人山人海、窃窃私语）
const sel=App._reviewDictManualSel;
assert.strictEqual(sel.size,3,'default 3 selected');
assert.ok(document.getElementById('rd-manual-count').textContent.includes('已选 3 个'));
// 取消第一个
App.toggleReviewDictManual(App._reviewDictPool[0].key,false);
assert.strictEqual(sel.size,2,'after uncheck 2 selected');
sessions.length=0;
App.startReviewFromModal();
assert.strictEqual(sessions.length,1);
assert.strictEqual(sessions[0].words.length,2,'manual uses checked words');
assert.ok(!sessions[0].words.some(w=>w.text==='浩浩荡荡'),'unchecked word excluded');

// —— 手动勾选 0 个 → 提示不开始 ——
sessions.length=0;
App._reviewDictManualSel=new Set();
App.startReviewFromModal();
assert.strictEqual(sessions.length,0,'0 selected → no session');

// —— 数量切换会重置手动默认勾选 ——
App.reviewDictSetCount('2');
assert.strictEqual(App._reviewDictManualSel.size,2,'count change resets manual default to 2');

// —— 全选 / 取消全选 ——
const selBtn=document.getElementById('rd-select-all-btn');
assert.strictEqual(selBtn.textContent,'全选','btn shows 全选 when not all selected');
App.toggleReviewDictSelectAll();
assert.strictEqual(App._reviewDictManualSel.size,6,'select all picks all 6');
assert.strictEqual(selBtn.textContent,'取消全选','btn shows 取消全选 when all selected');
App.toggleReviewDictSelectAll();
assert.strictEqual(App._reviewDictManualSel.size,0,'select all again clears all');
assert.strictEqual(selBtn.textContent,'全选','btn back to 全选 after clear');
// 全选后取消一个 → 文案回 全选
App.toggleReviewDictSelectAll();
App.toggleReviewDictManual(App._reviewDictPool[0].key,false);
assert.strictEqual(selBtn.textContent,'全选','btn back to 全选 after unchecking one');
// 取消全选后开始听写 → 拦截
sessions.length=0;
App._reviewDictManualSel=new Set();
App.startReviewFromModal();
assert.strictEqual(sessions.length,0,'none selected after clear-all blocks start');
// 全选后开始听写 → 6 个词全部听写
App.toggleReviewDictSelectAll();
sessions.length=0;
App.startReviewFromModal();
assert.strictEqual(sessions.length,1);
assert.strictEqual(sessions[0].words.length,6,'select-all then start writes all 6');

console.log('review-dict-modal tests passed');
