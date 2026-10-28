const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'dictation', 'index.html');
const html = fs.readFileSync(src);
const b64 = html.toString('base64');

const worker = `// Cloudflare Worker —— 听写 App 页面 + 同源 D1 云同步 API
// 路由：kids.liaohao.cc/dictation*（旧地址 liaohao.cc 兼容）
// D1 绑定：DICTATION_DB（见 wrangler.jsonc）

function b64ToUtf8(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

const HTML = b64ToUtf8(${JSON.stringify(b64)});
const SYNC_PATH = '/dictation/api/sync';
const OCR_PATH = '/dictation/api/ocr';
const MAX_REQUEST_BYTES = 1800000;
const MAX_ROW_BYTES = 900000;
const UPSERT_SQL = 'INSERT INTO sync_records (record_key, payload, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(record_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at';

// 百度 OCR access_token 缓存（Worker 全局变量，同一 isolate 内复用）
let _baiduToken = null;
let _baiduTokenExp = 0;

async function getBaiduAccessToken(env){
  if (_baiduToken && Date.now() < _baiduTokenExp) return _baiduToken;
  const url = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=' +
    encodeURIComponent(env.BAIDU_OCR_API_KEY) + '&client_secret=' + encodeURIComponent(env.BAIDU_OCR_SECRET_KEY);
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  if (!data.access_token) throw new Error('baidu_token_failed');
  _baiduToken = data.access_token;
  _baiduTokenExp = Date.now() + (data.expires_in - 300) * 1000; // 提前5分钟过期
  return _baiduToken;
}

async function handleOcrRequest(request, env){
  if (!allowedOrigin(request)) return jsonResponse(request, { error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') {
    const headers = apiHeaders(request);
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type';
    headers['access-control-max-age'] = '86400';
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return jsonResponse(request, { error: 'method_not_allowed' }, 405);
  if (!env.BAIDU_OCR_API_KEY || !env.BAIDU_OCR_SECRET_KEY) {
    return jsonResponse(request, { error: 'ocr_not_configured' }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: 'invalid_json' }, 400); }
  if (!body || typeof body.image !== 'string') return jsonResponse(request, { error: 'missing_image' }, 400);
  // 去掉 data:image/xxx;base64, 前缀
  const b64 = body.image.replace(/^data:image\\/\\w+;base64,/, '');
  if (b64.length > 1800000) return jsonResponse(request, { error: 'image_too_large' }, 413);
  try {
    const token = await getBaiduAccessToken(env);
    const ocrUrl = 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=' + token;
    const formBody = new URLSearchParams();
    formBody.set('image', b64);
    formBody.set('language_type', body.lang === 'en' ? 'ENG' : 'CHN_ENG');
    const res = await fetch(ocrUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString()
    });
    const data = await res.json();
    if (data.error_code) throw new Error('baidu_ocr_' + data.error_code + ': ' + (data.error_msg || ''));
    const text = (data.words_result || []).map(w => w.words).join('\\n');
    return jsonResponse(request, { text }, 200);
  } catch (error) {
    console.error('baidu ocr failed:', error);
    return jsonResponse(request, { error: 'ocr_failed', detail: error instanceof Error ? error.message : String(error) }, 502);
  }
}

function validUserId(value){
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isPlainObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function allowedOrigin(request){
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'liaohao.cc' || parsed.hostname === 'kids.liaohao.cc')) return true;
    return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  } catch (error) {
    return false;
  }
}

function apiHeaders(request){
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin'
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigin(request)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function jsonResponse(request, data, status){
  return new Response(JSON.stringify(data), { status: status || 200, headers: apiHeaders(request) });
}

function parseStoredJson(value, fallback){
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function byteLength(value){
  return new TextEncoder().encode(value).byteLength;
}

async function readSyncData(request, env, url){
  const userId = url.searchParams.get('userId') || 'default';
  if (!validUserId(userId)) return jsonResponse(request, { error: 'invalid_user_id' }, 400);
  const results = await env.DICTATION_DB.batch([
    env.DICTATION_DB.prepare('SELECT payload FROM sync_records WHERE record_key = ?1').bind('users'),
    env.DICTATION_DB.prepare('SELECT payload FROM sync_records WHERE record_key = ?1').bind('user:' + userId)
  ]);
  const usersRow = results[0] && results[0].results && results[0].results[0];
  const userRow = results[1] && results[1].results && results[1].results[0];
  const users = parseStoredJson(usersRow && usersRow.payload, []);
  const userData = parseStoredJson(userRow && userRow.payload, null);
  const response = { users: Array.isArray(users) ? users : [], userData: {} };
  if (isPlainObject(userData)) response.userData[userId] = userData;
  return jsonResponse(request, response, 200);
}

// 服务端数据合并：PUT 时读取旧数据按规则合并，防止多端后写覆盖丢数据
function unionBankVersionsService(x, y){
  // 同一词库 id 的两个版本：bank 级字段取 updatedAt 新者为主，旧版本缺失的课文/词按 id/名称/text 去重并入主版本（防止多端新增数据互相覆盖）
  const main = Number(x.updatedAt||0) >= Number(y.updatedAt||0) ? JSON.parse(JSON.stringify(x)) : JSON.parse(JSON.stringify(y));
  const sub = (Number(x.updatedAt||0) >= Number(y.updatedAt||0)) ? y : x;
  const mainLessonMap = new Map();
  (main.lessons||[]).forEach(l=>mainLessonMap.set(String(l.id||l.name||'').replace(/\s+/g,''), l));
  (sub.lessons||[]).forEach(l=>{
    if(!l) return;
    const k = String(l.id||l.name||'').replace(/\s+/g,'');
    const target = mainLessonMap.get(k);
    if(target){
      const keys = new Set((target.words||[]).map(w=>String(w.text||'').toLocaleLowerCase()));
      (l.words||[]).forEach(w=>{
        if(!w || !w.text) return;
        const t = String(w.text).toLocaleLowerCase();
        if(!keys.has(t)){ target.words.push(w); keys.add(t); }
      });
      if(Number(l.updatedAt||0) > Number(target.updatedAt||0)) target.updatedAt = l.updatedAt;
    }else{
      main.lessons.push(l);
      mainLessonMap.set(k, l);
    }
  });
  const otherKeys = new Set((main.other||[]).map(w=>String(w.text||'').toLocaleLowerCase()));
  (sub.other||[]).forEach(w=>{
    if(!w || !w.text) return;
    const t = String(w.text).toLocaleLowerCase();
    if(!otherKeys.has(t)){ main.other.push(w); otherKeys.add(t); }
  });
  main.updatedAt = Math.max(Number(x.updatedAt||0), Number(y.updatedAt||0));
  return main;
}
function mergeBankStoresService(a, b){
  const out = {version:2, catalogVersions:{...(b&&b.catalogVersions)||{},...(a&&a.catalogVersions)||{}}, zh:[], en:[], deleted:[]};
  const deleted = new Map();
  [...((a&&a.deleted)||[]), ...((b&&b.deleted)||[])].forEach(d=>{
    if(!d || !d.id || !d.lang) return;
    const k = d.lang + '|' + d.id;
    if(!deleted.has(k) || Number((deleted.get(k)).ts||0) < Number(d.ts||0)) deleted.set(k, {lang:d.lang, id:String(d.id), ts:Number(d.ts)||0});
  });
  out.deleted = [...deleted.values()];
  for(const lang of ['zh','en']){
    const map = new Map();
    [...((b&&b[lang])||[]), ...((a&&a[lang])||[])].forEach(bank=>{
      if(!bank || !bank.id) return;
      const id = String(bank.id);
      const old = map.get(id);
      if(!old){ map.set(id, bank); return; }
      map.set(id, unionBankVersionsService(old, bank));
    });
    out[lang] = [...map.values()].filter(bank=>{
      const tomb = deleted.get(lang + '|' + bank.id);
      return !tomb || Number(tomb.ts||0) < Number(bank.updatedAt||0);
    });
  }
  dedupeSameNameBanksService(out);
  return out;
}
function dedupeSameNameBanksService(store){
  for(const lang of ['zh','en']){
    const groups = {};
    (store[lang]||[]).forEach(bank=>{
      const n = String(bank.name||'').trim();
      if(!n) return;
      (groups[n] = groups[n] || []).push(bank);
    });
    Object.keys(groups).forEach(name=>{
      const list = groups[name];
      if(list.length < 2) return;
      const countWords = b => { let c=(b.other||[]).length; (b.lessons||[]).forEach(l=>c+=(l.words||[]).length); return c; };
      list.sort((x,y)=>countWords(y)-countWords(x));
      const keep = list[0], now = Date.now();
      const keepLessonMap = new Map();
      (keep.lessons||[]).forEach(l=>keepLessonMap.set(String(l.name||'').replace(/\s+/g,''), l));
      list.slice(1).forEach(extra=>{
        const keepOtherKeys = new Set((keep.other||[]).map(w=>String(w.text||'').toLocaleLowerCase()));
        (extra.other||[]).forEach(w=>{
          if(!w || !w.text) return;
          const t = String(w.text).toLocaleLowerCase();
          if(!keepOtherKeys.has(t)){ keep.other.push(w); keepOtherKeys.add(t); }
        });
        (extra.lessons||[]).forEach(l=>{
          if(!l) return;
          const k = String(l.name||'').replace(/\s+/g,'');
          const target = keepLessonMap.get(k);
          if(target){
            const keys = new Set((target.words||[]).map(w=>String(w.text||'').toLocaleLowerCase()));
            (l.words||[]).forEach(w=>{
              if(!w || !w.text) return;
              const t = String(w.text).toLocaleLowerCase();
              if(!keys.has(t)){ target.words.push(w); keys.add(t); }
            });
            target.updatedAt = now;
          }else{
            const nid = String(l.id||('lesson'+now+Math.random().toString(36).slice(2,7)));
            keep.lessons.push(Object.assign({}, l, {id:nid, updatedAt:now}));
            keepLessonMap.set(k, keep.lessons[keep.lessons.length-1]);
          }
        });
        keep.updatedAt = now;
        store[lang] = store[lang].filter(x=>x!==extra);
        if(!(store.deleted||[]).some(d=>d.id===extra.id && d.lang===lang)){
          store.deleted.push({lang:lang, id:extra.id, ts:now});
        }
      });
    });
  }
}
function mergeReviewService(oldR, newR){
  const out = {zh:[], en:[]};
  for(const lang of ['zh','en']){
    const map = new Map();
    [...((oldR&&oldR[lang])||[]), ...((newR&&newR[lang])||[])].forEach(w=>{
      if(!w || !w.text) return;
      const k = String(w.text).toLocaleLowerCase();
      const old = map.get(k);
      if(!old){ map.set(k, w); return; }
      const oldS = Number(old.streak||0), newS = Number(w.streak||0);
      if(newS > oldS || (newS === oldS && Number(w.updatedAt||0) >= Number(old.updatedAt||0))){
        map.set(k, Object.assign({}, old, w));
      } else {
        map.set(k, Object.assign({}, w, old));
      }
    });
    out[lang] = [...map.values()];
  }
  return out;
}
function mergeUserDataService(oldData, incoming){
  const out = JSON.parse(JSON.stringify(incoming));
  if(incoming.wordBanks !== undefined && oldData.wordBanks !== undefined){
    out.wordBanks = mergeBankStoresService(oldData.wordBanks, incoming.wordBanks);
  }
  if(oldData.review && incoming.review){
    out.review = mergeReviewService(oldData.review, incoming.review);
  }
  if(Array.isArray(oldData.log) && Array.isArray(incoming.log) && oldData.log.length > incoming.log.length){
    out.log = oldData.log;
  }
  if(oldData.settings && incoming.settings && typeof incoming.settings.ts === 'number' && typeof oldData.settings.ts === 'number' && oldData.settings.ts > incoming.settings.ts){
    out.settings = oldData.settings;
  }
  if(oldData.progress !== undefined && incoming.progress === undefined) out.progress = oldData.progress;
  if(oldData.adminPwd && !incoming.adminPwd) out.adminPwd = oldData.adminPwd;
  return out;
}
async function writeSyncData(request, env){
  if (request.headers.get('X-Dictation-App') !== '1') {
    return jsonResponse(request, { error: 'missing_app_header' }, 400);
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) return jsonResponse(request, { error: 'payload_too_large' }, 413);
  const raw = await request.text();
  if (byteLength(raw) > MAX_REQUEST_BYTES) return jsonResponse(request, { error: 'payload_too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (error) { return jsonResponse(request, { error: 'invalid_json' }, 400); }
  if (!body || !validUserId(body.userId) || !isPlainObject(body.data)) {
    return jsonResponse(request, { error: 'invalid_payload' }, 400);
  }
  const data = body.data;
  const statements = [];
  const now = Date.now();
  if (data.users !== undefined) {
    if (!Array.isArray(data.users) || data.users.length > 50 || data.users.some(user => !user || !validUserId(user.id))) {
      return jsonResponse(request, { error: 'invalid_users' }, 400);
    }
    const payload = JSON.stringify(data.users);
    if (byteLength(payload) > MAX_ROW_BYTES) return jsonResponse(request, { error: 'users_too_large' }, 413);
    statements.push(env.DICTATION_DB.prepare(UPSERT_SQL).bind('users', payload, now));
  }
  if (!isPlainObject(data.userData)) return jsonResponse(request, { error: 'invalid_user_data' }, 400);
  const entries = Object.entries(data.userData);
  if (entries.length > 50) return jsonResponse(request, { error: 'too_many_users' }, 413);
  for (const entry of entries) {
    const userId = entry[0];
    const userData = entry[1];
    if (!validUserId(userId) || !isPlainObject(userData)) return jsonResponse(request, { error: 'invalid_user_data' }, 400);
    let finalData = userData;
    try {
      const oldRow = await env.DICTATION_DB.prepare('SELECT payload FROM sync_records WHERE record_key = ?1').bind('user:' + userId).first();
      if (oldRow && oldRow.payload) {
        const oldData = parseStoredJson(oldRow.payload, null);
        if (isPlainObject(oldData)) finalData = mergeUserDataService(oldData, userData);
      }
    } catch (e) { finalData = userData; }
    const payload = JSON.stringify(finalData);
    if (byteLength(payload) > MAX_ROW_BYTES) return jsonResponse(request, { error: 'user_data_too_large', userId }, 413);
    statements.push(env.DICTATION_DB.prepare(UPSERT_SQL).bind('user:' + userId, payload, now));
  }
  if (statements.length === 0) return jsonResponse(request, { error: 'empty_payload' }, 400);
  await env.DICTATION_DB.batch(statements);
  return jsonResponse(request, { ok: true, updatedAt: now }, 200);
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === 'GET' && (p === '/dictation' || p === '/dictation/')) {
      return new Response(HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
          'x-content-type-options': 'nosniff'
        }
      });
    }
    if (p === OCR_PATH) {
      return await handleOcrRequest(request, env);
    }
    if (p === SYNC_PATH) {      if (!allowedOrigin(request)) return jsonResponse(request, { error: 'origin_not_allowed' }, 403);
      if (request.method === 'OPTIONS') {
        const headers = apiHeaders(request);
        headers['access-control-allow-methods'] = 'GET, PUT, OPTIONS';
        headers['access-control-allow-headers'] = 'Content-Type, X-Dictation-App';
        headers['access-control-max-age'] = '86400';
        return new Response(null, { status: 204, headers });
      }
      try {
        if (request.method === 'GET') return await readSyncData(request, env, url);
        if (request.method === 'PUT') return await writeSyncData(request, env);
        return jsonResponse(request, { error: 'method_not_allowed' }, 405);
      } catch (error) {
        console.error(JSON.stringify({ message: 'dictation sync failed', error: error instanceof Error ? error.message : String(error) }));
        return jsonResponse(request, { error: 'sync_unavailable' }, 500);
      }
    }
    return new Response('Not Found', { status: 404 });
  }
};
`;

const out = path.join(__dirname, 'worker.js');
fs.writeFileSync(out, worker);
console.log('worker.js 已生成，字节数:', Buffer.byteLength(worker));
