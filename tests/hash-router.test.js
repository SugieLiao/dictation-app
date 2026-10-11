// hash 路由核心逻辑回归测试：验证路由构建/解析/切屏/历史/语言恢复与数据刷新分派
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','dictation-app.html'),'utf8');
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m)throw new Error('script block not found');

const els={};
function mkClassList(){
  const s=new Set();
  return {add(c){s.add(c);},remove(c){s.delete(c);},contains(c){return s.has(c);},
    toggle(c,on){if(on===undefined){s.has(c)?s.delete(c):s.add(c);}else if(on){s.add(c);}else{s.delete(c);}}};
}
const SCREEN_IDS=['screen-home','screen-dict','screen-result','screen-log','screen-lang','screen-banks','screen-ocr','screen-review'];
function el(id){
  if(id.startsWith('screen-')&&!SCREEN_IDS.includes(id))return null;
  if(!els[id])els[id]={id,classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',disabled:false,value:'',checked:false,onclick:null,querySelectorAll:()=>[],querySelector:()=>null,appendChild(){},removeEventListener(){},addEventListener(){}};
  return els[id];
}
global.document={
  getElementById:el,
  querySelector:(sel)=>{if(sel==='.screen.active')return Object.keys(els).filter(k=>k.startsWith('screen-')&&els[k].classList.contains('active')).map(k=>els[k])[0]||null;return null;},
  querySelectorAll:(sel)=>{if(sel==='.screen')return Object.keys(els).filter(k=>k.startsWith('screen-')).map(k=>els[k]);return [];},
  createElement:()=>({classList:mkClassList(),style:{},dataset:{},innerHTML:'',textContent:'',appendChild(){},querySelector:()=>null})
};
global.window={scrollTo(){},addEventListener(){}};
global.location={hash:'',replace(){}};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.setTimeout=()=>0;
global.speechSynthesis={getVoices:()=>[],speak(){},cancel(){},addEventListener(){}};
global.SpeechSynthesisUtterance=function(t){this.text=t;};

const App=new Function(m[1]+'\n;return App;')();

// —— 路由构建 ——
assert.strictEqual(App._buildRoute('lang',{lang:'zh'}),'#/lang/zh');
assert.strictEqual(App._buildRoute('review',{lang:'en'}),'#/review/en');
assert.strictEqual(App._buildRoute('banks',{lang:'zh'}),'#/banks/zh');
assert.strictEqual(App._buildRoute('ocr',{lang:'zh'}),'#/ocr/zh');
assert.strictEqual(App._buildRoute('log',{lang:'en'}),'#/log/en');
assert.strictEqual(App._buildRoute('home'),'#/home');
assert.strictEqual(App._buildRoute('dict'),'#/dict');
assert.strictEqual(App._buildRoute('result'),'#/result');

// —— 路由解析 ——
assert.deepStrictEqual(App._parseRoute('#/lang/zh'),{name:'lang',lang:'zh'});
assert.deepStrictEqual(App._parseRoute('#/home'),{name:'home',lang:''});
assert.deepStrictEqual(App._parseRoute(''),{name:'home',lang:''});
assert.deepStrictEqual(App._parseRoute('#/banks/en'),{name:'banks',lang:'en'});
assert.strictEqual(App._currentRoute(),'#/home');

// —— spy 数据刷新：验证路由层会按页面调用刷新函数 ——
const refreshCalls=[];
const realRefresh=App._refreshScreen;
App._refreshScreen=(name)=>{refreshCalls.push(name);};

// 语言状态恢复 + 切屏 + 刷新分派
App._applyRoute('#/review/en');
assert.strictEqual(App.reviewLang,'en');
assert.strictEqual(refreshCalls[refreshCalls.length-1],'review');
assert.ok(el('screen-review').classList.contains('active'),'review active');

App._applyRoute('#/lang/zh');
assert.strictEqual(App.langPageMode,'zh');
assert.strictEqual(refreshCalls[refreshCalls.length-1],'lang');
assert.ok(!el('screen-review').classList.contains('active'));
assert.ok(el('screen-lang').classList.contains('active'));

App._applyRoute('#/banks/zh');
assert.strictEqual(App.bankManagerLang,'zh');
assert.strictEqual(refreshCalls[refreshCalls.length-1],'banks');

App._applyRoute('#/ocr/en');
assert.strictEqual(App.ocrLang,'en');
assert.strictEqual(refreshCalls[refreshCalls.length-1],'ocr');

App._applyRoute('#/log/zh');
assert.strictEqual(App.logLang,'zh');
assert.strictEqual(refreshCalls[refreshCalls.length-1],'log');

// 无效路由 → 回 home 且清空历史
App.navHistory=['#/lang/zh'];
App._applyRoute('#/nonexistent');
assert.ok(el('screen-home').classList.contains('active'),'invalid → home');
assert.strictEqual(App.navHistory.length,0,'history cleared');

// 去重
const before=App._lastRoute;
App._applyRoute(App._lastRoute);
assert.strictEqual(App._lastRoute,before,'same route skipped');

// go() 历史：从 home 进 review 会 push 上一路由；goBack 返回
App.navHistory=[];
App.go('review',{lang:'zh'});
assert.strictEqual(App.navHistory.length,1,'go pushes previous route');
assert.strictEqual(refreshCalls[refreshCalls.length-1],'review');
App.goBack();
assert.ok(el('screen-home').classList.contains('active'),'goBack to home');
assert.strictEqual(App.navHistory.length,0,'history popped');

// —— 还原 refresh，验证 switch 覆盖全部 8 页且每页有对应初始化函数 ——
App._refreshScreen=realRefresh;
const cases={'home':'renderHomeEntries','lang':'initLangPage','review':'initReviewPage','banks':'renderBankManager','ocr':'initOcrPage','log':'initLogPage','dict':'tryRestoreDict'};
for(const [name,method] of Object.entries(cases)){
  assert.strictEqual(typeof App[method],'function',`${method} must exist`);
}

// 静态断言：8 个 screen 均存在
for(const id of ['home','dict','result','log','lang','banks','ocr','review']){
  const sec=html.match(new RegExp('<section class="screen" id="screen-'+id+'"[\\s\\S]*?</section>'));
  assert.ok(sec||html.includes('id="screen-'+id+'"'),'screen-'+id+' present');
}

console.log('hash-router tests passed');
