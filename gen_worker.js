const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'dictation', 'index.html');
const html = fs.readFileSync(src);
const b64 = html.toString('base64');

const worker = `// Cloudflare Worker —— 把听写 app 挂在 /dictation 路径下
// 部署：Cloudflare 控制台 → Workers & Pages → 创建 Worker → 粘贴本文件
// 路由(Routes)： liaohao.cc/dictation*   （指向这个 Worker）
// 注意：liaohao.cc 必须先把 DNS 托管到 Cloudflare（改 nameserver）

function b64ToUtf8(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

const HTML = b64ToUtf8(${JSON.stringify(b64)});

export default {
  async fetch(request){
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/dictation' || p === '/dictation/') {
      return new Response(HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache'
        }
      });
    }
    return new Response('Not Found', { status: 404 });
  }
};
`;

const out = path.join(__dirname, 'worker.js');
fs.writeFileSync(out, worker);
console.log('worker.js 已生成，字节数:', Buffer.byteLength(worker));
