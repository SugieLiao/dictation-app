// 听写页「复习」自动选词回归：次数优先 + 同级随机，验证多次复习能均匀覆盖
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','dictation-app.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m)throw new Error('script block not found');

const els={};
function mkClassList(){
  let s=new Set();
  return {add(c){s.add(c);},remove(c){s.delete(c);},contains(c){return s.has(c);},
    toggle(c,on){if(on===undefined){s.has(c)?s.delete(c):s.add(c);}else if(on){s.add(c);}else{s.delete(c);}},
    _sync(cls){s=new Set(String(cls||'').trim().split(/\s+/).filter(Boolean));},_raw:s};
}
function mkEl(tag){
  const cl=mkClassList();
  const el={tag,id:'',classList:cl,style:{},dataset:{},innerHTML:'',textContent:'',value:'',checked:false,children:[],
    focus(){},appendChild(c){this.children.push(c);},querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener(){},removeEventListener(){}};
  Object.defineProperty(el,'className',{get(){return [...Array.from(cl._raw)].join(' ');},set(v){cl._sync(v);}});
  return el;
}
function getEl(id){
  if(!els[id])els[id]=mkEl('div');
  return els[id];
}
global.document={
  getElementById:getEl,
  querySelector:()=>null,
  querySelectorAll:()=>[],
  createElement:(tag)=>mkEl(tag)
};
global.window={scrollTo(){},addEventListener(){}};
global.location={hash:'',replace(){}};
const storage={};
global.localStorage={getItem:(k)=>storage[k]===undefined?null:storage[k],setItem:(k,v)=>{storage[k]=String(v);},removeItem:(k)=>{delete storage[k];}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.setTimeout=()=>0;
global.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},addEventListener(){}};
global.SpeechSynthesisUtterance=function(t){this.text=t;};
global.alert=()=>{};global.prompt=()=>null;global.confirm=()=>true;

const loaded=new Function(m[1]+'\n;return {App,CloudSync};')();
const App=loaded.App;
const CloudSync=loaded.CloudSync;

const now=Date.now();
App.currentUserId='u_fair';
App.langPageMode='en';App.mode='en';
App.enSettings={currentBankId:'b1',selectedLessonKeys:['bank::b1::l1'],dailyCount:0,dictOrder:'seq'};
App.cloudSyncReady=true;
CloudSync.pushDebounced=()=>{};

// 31 个词（模拟英语四上一单元），全部已过关
const words=Array.from({length:31},(_,i)=>({text:'word'+String(i+1).padStart(2,'0'),hint:'h'+i}));
const store={version:2,catalogVersions:{},deleted:[],zh:[],en:[{
  id:'b1',name:'Test EN',source:'custom',
  lessons:[{id:'l1',name:'Unit 1',words}],other:[],createdAt:now,updatedAt:now
}]};
storage[App.userKey('dict_word_banks')]=JSON.stringify(store);
storage[App.userKey('dict_review')]=JSON.stringify({zh:[],en:[]});
const passed={};words.forEach(w=>{passed['en::'+w.text]=now-86400000;});
storage[App.userKey('dict_passed')]=JSON.stringify(passed);
storage[App.userKey('dict_log')]=JSON.stringify([]);

// 1) 规则：次数少的优先；进过复习库的同等次数优先（加权 0.5）
const stats={'en::word01':{n:1,c:1,last:now,rev:0},'en::word02':{n:1,c:1,last:now,rev:1},'en::word03':{n:0,c:0,last:0,rev:0}};
storage[App.userKey('dict_word_stats')]=JSON.stringify(stats);
const ranked=App.rankReviewWords([{text:'word01'},{text:'word02'},{text:'word03'}]).map(w=>w.text);
assert.strictEqual(ranked[0],'word03','never-dictated word first');
assert.strictEqual(ranked[1],'word02','review-bank word beats same-count plain word');
assert.strictEqual(ranked[2],'word01','more times → later');
delete storage[App.userKey('dict_word_stats')];

// 2) 连续 6 次复习，每次 20 词，统计每个词被抽中的次数
const sessions=[];
App.startSession=(ws,opts)=>{sessions.push({words:ws,opts});};
const hits={};words.forEach(w=>hits[w.text]=0);
for(let round=0;round<6;round++){
  App.openBankReviewModal();
  App.bankReviewSetCount(20);
  sessions.length=0;
  App.startBankReviewFromModal();
  assert.strictEqual(sessions.length,1,'round '+(round+1)+' session started');
  const picked=sessions[0].words.map(w=>w.text);
  assert.strictEqual(picked.length,20,'round '+(round+1)+' picks 20');
  assert.strictEqual(new Set(picked).size,20,'round '+(round+1)+' no duplicates');
  picked.forEach(t=>{hits[t]++;});
  App.recordWordAttempts(sessions[0].words);
}

// 每个词至少被覆盖一次，且次数差距不超过 2（31 词 × 6 轮 × 20 = 120 次，均值约 3.9）
const counts=Object.values(hits);
assert.strictEqual(counts.length,31,'all 31 words tracked');
assert.ok(Math.min(...counts)>0,'every word covered at least once: '+JSON.stringify(counts));
assert.ok(Math.max(...counts)-Math.min(...counts)<=2,'coverage spread ≤2: '+JSON.stringify(counts));

// 3) 统计持久化：recordWordAttempts 会累加 n/c/rev
const s=JSON.parse(storage[App.userKey('dict_word_stats')]);
const totalN=Object.values(s).reduce((a,x)=>a+(x.n||0),0);
assert.strictEqual(totalN,120,'total attempts recorded = 120: '+totalN);
const word01=s['en::word01'];
assert.ok(word01&&word01.n>=1&&word01.c>=1,'sample word recorded n/c');

console.log('bank-review-fair: all assertions passed');
