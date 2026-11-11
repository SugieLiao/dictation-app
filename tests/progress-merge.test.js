// progress（未完成听写进度）同步仲裁回归测试：
// 防止已完成清空的进度被另一端/云端旧缓存重新灌回首页「继续上次」提示。
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','dictation-app.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m)throw new Error('script block not found');

// —— 最小 DOM / 存储 mock（参照既有测试骨架）——
const els={};
const getEl=(id)=>{if(!els[id])els[id]={id,classList:{add(){},remove(){},contains:()=>false,toggle(){}},style:{},dataset:{},innerHTML:'',textContent:'',disabled:false,value:'',checked:false,onclick:null,children:[],querySelectorAll:()=>[],querySelector:()=>null,appendChild(){},removeEventListener(){},addEventListener(){}};return els[id];};
global.document={getElementById:getEl,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>getEl('tmp')};
global.window={scrollTo(){},addEventListener(){}};
global.location={hash:'',replace(){}};
const storage={};
global.localStorage={getItem:(k)=>storage[k]??null,setItem:(k,v)=>{storage[k]=String(v);},removeItem:(k)=>{delete storage[k];}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.setTimeout=()=>0;
global.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},addEventListener(){}};
global.SpeechSynthesisUtterance=function(t){this.text=t;};
global.alert=()=>{};
global.prompt=()=>null;
global.confirm=()=>true;

const App=new Function(m[1]+'\n;return App;')();
App.currentUserId='u_test';
const KEY=App.userKey('dict_progress');

const now=Date.now();
// 线上旧格式残留：未完成进度，但没有 updatedAt 时间戳
const oldProg={words:['踏青','翻山越岭'],idx:21,source:{type:'continue'},date:'2026-11-11T08:08:46.280Z'};
const freshProg={words:['x','y'],idx:3,source:{type:'new'},date:new Date().toISOString(),updatedAt:now};
const cleared={cleared:true,updatedAt:now};

// —— 1. 纯函数 _pickNewerProgress 新旧仲裁 ——
// 1.1 本地较新 → 保留本地
assert.strictEqual(App._pickNewerProgress(freshProg,oldProg),freshProg,'本地新进度应胜出');
// 1.2 云端较新 → 取云端
assert.strictEqual(App._pickNewerProgress(oldProg,freshProg),freshProg,'云端新进度应胜出');
// 1.3 两端都无记录 → null
assert.strictEqual(App._pickNewerProgress(null,null),null,'两端无进度应返回 null');
// 1.4 仅本地有 → 保留本地
assert.strictEqual(App._pickNewerProgress(freshProg,null),freshProg,'仅本地有应保留本地');
// 1.5 仅云端有 → 拉取云端
assert.strictEqual(App._pickNewerProgress(null,freshProg),freshProg,'仅云端有应取云端');
// 1.6 旧数据都无时间戳（同为 0）→ 保留本地，避免云端旧值覆盖本地
assert.strictEqual(App._pickNewerProgress(oldProg,{...oldProg,idx:5}),oldProg,'无时间戳的旧数据应保留本地');
// 1.7 本地已清空（cleared 且时间戳新）vs 云端旧未完成进度 → 保留本地清空标记
assert.strictEqual(App._pickNewerProgress(cleared,oldProg),cleared,'本地清空标记应压过云端旧进度');

// —— 2. mergeCloudData 拉取合并仲裁 ——
// 2.1 本地已清空、云端残留旧进度：不得把旧进度灌回本地
storage[KEY]=JSON.stringify(cleared);
App.mergeCloudData({progress:oldProg});
let after=JSON.parse(storage[KEY]);
assert.ok(after.cleared===true,'本地清空标记不应被云端旧进度覆盖回来');

// 2.2 本地无记录（新设备/缓存丢失），云端有未完成进度：正常拉回继续
delete storage[KEY];
App.mergeCloudData({progress:freshProg});
after=JSON.parse(storage[KEY]);
assert.deepStrictEqual(after,freshProg,'新设备应能从云端拉回未完成进度');

// 2.3 本地未完成进度较新，云端旧：保留本地
storage[KEY]=JSON.stringify(freshProg);
App.mergeCloudData({progress:oldProg});
after=JSON.parse(storage[KEY]);
assert.deepStrictEqual(after,freshProg,'本地新进度不应被云端旧进度覆盖');

// —— 3. clearProgress 写入带时间戳的清空标记，可被仲裁识别 ——
delete storage[KEY];
App.clearProgress();
after=JSON.parse(storage[KEY]);
assert.ok(after.cleared===true && typeof after.updatedAt==='number','clearProgress 应写 cleared 标记与时间戳');

console.log('progress-merge tests passed');
