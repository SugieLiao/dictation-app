// 服务端（Worker）词库合并回归：词级墓碑不能被折叠，且旧副本的已删词不能复活
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {pathToFileURL}=require('url');
(async()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','worker.js'),'utf8')+'\nexport { mergeBankStoresService };\n';
  const tmp=path.join(os.tmpdir(),'dictation-worker-merge-'+process.pid+'.mjs');
  fs.writeFileSync(tmp,src);
  try{
    const {mergeBankStoresService}=await import(pathToFileURL(tmp).href);
    const now=Date.now();
    const words=['一','二','三','四','五','六','七','八','九','十'];
    const oldStore={version:2,catalogVersions:{},deleted:[],zh:[{id:'bank_x',name:'测试库',source:'custom',updatedAt:now,other:[],lessons:[{id:'lesson_1',name:'第1课',updatedAt:now,words:words.map(t=>({text:t,hint:''}))}]}],en:[]};
    const removed=['八','九','十'];
    const newWords=words.filter(t=>!removed.includes(t));
    const incoming={version:2,catalogVersions:{},deleted:removed.map(t=>({lang:'zh',bankId:'bank_x',lessonId:'lesson_1',text:t,ts:now})),
      zh:[{id:'bank_x',name:'测试库',source:'custom',updatedAt:now,other:[],lessons:[{id:'lesson_1',name:'第1课',updatedAt:now,words:newWords.map(t=>({text:t,hint:''}))}]}],en:[]};
    const pick=m=>m.zh[0].lessons[0].words.map(w=>w.text);
    const m1=mergeBankStoresService(oldStore,incoming);
    assert.strictEqual(pick(m1).length,7,'第一次合并应为 7 词');
    assert.strictEqual(m1.deleted.filter(d=>d.bankId&&d.text).length,3,'第一次合并应保留 3 条词级墓碑');
    const m2=mergeBankStoresService(m1,oldStore);
    assert.strictEqual(pick(m2).length,7,'旧副本再次提交后仍应为 7 词');
    assert.strictEqual(m2.deleted.filter(d=>d.bankId&&d.text).length,3,'二次合并仍应保留 3 条词级墓碑');
    for(const t of removed)assert.ok(!pick(m2).includes(t),'被删词不应复活: '+t);
    console.log('服务端词级墓碑合并 PASS');
  }finally{try{fs.unlinkSync(tmp);}catch(e){}}
})().catch(e=>{console.error(e);process.exit(1);});
