// 词级删除墓碑回归测试：删除后被“云端旧版有、本地没有”的并回逻辑恢复的问题
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','dictation-app.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m)throw new Error('script block not found');

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
const els={};
function getEl(id){
  if(!els[id])els[id]={id,classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',
    disabled:false,value:'',checked:false,onclick:null,children:[],
    focus(){},querySelectorAll:(sel)=>els[id].children,querySelector:()=>null,
    appendChild(c){els[id].children.push(c);},removeEventListener(){},addEventListener(){}};
  return els[id];
}
global.document={getElementById:getEl,querySelector:()=>null,querySelectorAll:()=>[],createElement:(tag)=>{const b=mkBtn('');b.tag=tag;return b;}};
global.window={scrollTo(){},addEventListener(){}};
global.location={hash:'',replace(){}};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.setTimeout=()=>0;
global.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},addEventListener(){}};
global.SpeechSynthesisUtterance=function(t){this.text=t;};
global.alert=()=>{};global.prompt=()=>null;global.confirm=()=>true;

const loaded=new Function(m[1]+'\n;return {App,CloudSync};')();
const App=loaded.App;

const now=Date.now(),DAY=86400000;
const storage={};
storage['dict_users']=JSON.stringify([{id:'u_test',name:'测试',avatar:'👨',createdAt:now}]);
global.localStorage.getItem=(k)=>storage[k]||null;
global.localStorage.setItem=(k,v)=>{storage[k]=String(v);};
global.localStorage.removeItem=(k)=>{delete storage[k];};
App.currentUserId='u_test';

// 构造词库：第15课 29 词（云端旧版）+ 本地删除 5 词后的 24 词 + 词级墓碑
const allWords=['麻雀','猛烈','身躯','掩护','浑身','庞大','强大','力量','嗅觉','牲畜','嗅闻','凶猛','热烈','烈火','无奈','奈何','躯体','遮掩','浑浊','牺牲','牲口','脸庞','坚强','重量','悄悄','无可奈何','紧张','梧桐','勇气'].map(t=>({text:t,hint:''}));
const deletedWords=['悄悄','无可奈何','紧张','梧桐','勇气'];

const cloudBank={id:'bank_mtisdklc_thvuww',name:'四年级上册',source:'custom',other:[],lessons:[{id:'lesson_15',name:'第15课 麻雀',words:JSON.parse(JSON.stringify(allWords)),createdAt:1,updatedAt:1}],createdAt:1,updatedAt:now-60000};
const localBank=JSON.parse(JSON.stringify(cloudBank));
// 本地删除 5 词
const lesson=localBank.lessons[0];
lesson.words=lesson.words.filter(w=>!deletedWords.includes(w.text));
const localStore={version:2,catalogVersions:{},deleted:[{lang:'zh',bankId:'bank_mtisdklc_thvuww',lessonId:'lesson_15',text:'悄悄',ts:now},
  {lang:'zh',bankId:'bank_mtisdklc_thvuww',lessonId:'lesson_15',text:'无可奈何',ts:now},
  {lang:'zh',bankId:'bank_mtisdklc_thvuww',lessonId:'lesson_15',text:'紧张',ts:now},
  {lang:'zh',bankId:'bank_mtisdklc_thvuww',lessonId:'lesson_15',text:'梧桐',ts:now},
  {lang:'zh',bankId:'bank_mtisdklc_thvuww',lessonId:'lesson_15',text:'勇气',ts:now}],zh:[localBank],en:[]};
const cloudStore={version:2,catalogVersions:{},deleted:[],zh:[cloudBank],en:[]};

// 场景1：本地删 5 词 + 云端旧版 29 词 → 合并后应为 24 词（删除保持）
const merged=App.mergeWordBankStores(localStore,cloudStore);
const mergedLesson=merged.zh[0].lessons[0];
assert.strictEqual(mergedLesson.words.length,24,'场景1：合并后应为 24 词');
for(const w of deletedWords){
  assert.ok(!mergedLesson.words.some(x=>x.text===w),'场景1：被删词不应回来: '+w);
}
console.log('场景1 PASS：删除后的词在合并中保持删除（29 → 24）');

// 场景2：反向参数顺序（cloud, local）也应一致
const merged2=App.mergeWordBankStores(cloudStore,localStore);
assert.strictEqual(merged2.zh[0].lessons[0].words.length,24,'场景2：反向合并仍为 24 词');
console.log('场景2 PASS：参数顺序不影响删除结果');

// 场景3：重新添加被删词后清除墓碑 → 合并时词应回来
const reAddStore=JSON.parse(JSON.stringify(localStore));
const reAddResult=App._addWordsToBank(reAddStore,'zh','bank_mtisdklc_thvuww','lesson_15','','[{text:"悄悄"}]'.length?[{text:'悄悄'},{text:'勇气'}]:[]);
assert.strictEqual(reAddResult.added,2,'场景3：重新添加 2 词成功');
assert.ok(!reAddStore.deleted.some(d=>d.text==='悄悄'||d.text==='勇气'),'场景3：墓碑应被清除');
const merged3=App.mergeWordBankStores(reAddStore,cloudStore);
assert.strictEqual(merged3.zh[0].lessons[0].words.length,26,'场景3：合并后 24+2=26 词');
console.log('场景3 PASS：重新添加会清除墓碑，词可恢复');

// 场景4：词级墓碑不影响其他课/词库
const cloudOther={id:'bank_other',name:'另一个库',source:'custom',other:[{text:'梧桐',hint:''}],lessons:[],createdAt:1,updatedAt:now};
const merged4=App.mergeWordBankStores(localStore,{version:2,catalogVersions:{},deleted:[],zh:[cloudOther],en:[]});
assert.ok(merged4.zh.some(b=>b.id==='bank_other'&&b.other.some(w=>w.text==='梧桐')),'场景4：其他词库的同名词不受影响');
console.log('场景4 PASS：墓碑按 词库+课文 限定，不影响其他位置同名词');

// 场景5：_normalizeWordBankStore 保留词级墓碑
const norm=App._normalizeWordBankStore(localStore);
assert.strictEqual(norm.deleted.length,5,'场景5：normalize 保留词级墓碑');
assert.ok(norm.deleted.every(d=>d.bankId&&d.text),'场景5：词级墓碑字段齐全');
console.log('场景5 PASS：normalize 兼容词级墓碑');

// 场景6：批量删除方法写墓碑（模拟 refs 删除）
const bulkStore=JSON.parse(JSON.stringify(cloudStore));
const bankBulk=bulkStore.zh[0];
const refs=['悄悄','紧张'].map(text=>{
  const idx=bankBulk.lessons[0].words.findIndex(w=>w.text===text);
  return {lessonId:'lesson_15',index:idx};
}).filter(r=>r.index>=0);
const removed=App._deleteManagedBankWords(bulkStore,bankBulk,refs,'zh');
assert.strictEqual(removed,2,'场景6：批量删除 2 词成功');
assert.strictEqual(bankBulk.lessons[0].words.length,27,'场景6：课内剩 27 词');
assert.strictEqual(bulkStore.deleted.filter(d=>d.text).length,2,'场景6：写入 2 条词级墓碑');
console.log('场景6 PASS：批量删除写词级墓碑');

console.log('ALL PASS');
