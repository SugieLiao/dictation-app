const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DATA_DIR = path.join(__dirname, 'data');
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper: read JSON file safely
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// Helper: write JSON file
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Helper: get user data file path
function userFile(userId) {
  // Sanitize userId to prevent path traversal
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `user_${safe}.json`);
}

// Helper: parse POST body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve the frontend (handle both GET and HEAD for curl -I compatibility)
  if ((method === 'GET' || method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(method === 'HEAD' ? '' : html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'index.html not found' }));
    }
    return;
  }

  // Set JSON content-type for API routes only
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // API routes
  const apiMatch = pathname.match(/^\/api\/(.+)$/);
  if (!apiMatch) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const route = apiMatch[1];
  const userId = req.headers['x-user-id'] || parsedUrl.query.userId || 'default';

  try {
    // GET /api/data - load all data for a user
    if (method === 'GET' && route === 'data') {
      const data = readJson(userFile(userId)) || {
        settings: {},
        log: [],
        review: { zh: [], en: [] },
        progress: null,
        adminPwd: '0000'
      };
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data }));
      return;
    }

    // POST /api/data - save all data for a user (full replace)
    if (method === 'POST' && route === 'data') {
      const body = await parseBody(req);
      writeJson(userFile(userId), body);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // POST /api/sync - incremental sync (merge)
    if (method === 'POST' && route === 'sync') {
      const body = await parseBody(req);
      const existing = readJson(userFile(userId)) || {
        settings: {},
        log: [],
        review: { zh: [], en: [] },
        progress: null,
        adminPwd: '0000'
      };

      // Merge: update only provided fields
      if (body.settings) existing.settings = body.settings;
      if (body.log) existing.log = body.log;
      if (body.review) existing.review = body.review;
      if (body.progress !== undefined) existing.progress = body.progress;
      if (body.adminPwd) existing.adminPwd = body.adminPwd;
      existing.lastSync = Date.now();

      writeJson(userFile(userId), existing);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: existing }));
      return;
    }

    // GET /api/users - get user list (global, not per-user)
    if (method === 'GET' && route === 'users') {
      const users = readJson(path.join(DATA_DIR, 'users.json')) || [];
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, users }));
      return;
    }

    // POST /api/users - save user list
    if (method === 'POST' && route === 'users') {
      const body = await parseBody(req);
      writeJson(path.join(DATA_DIR, 'users.json'), body.users || []);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Unknown route: ' + route }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Dictation server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
