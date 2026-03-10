const https = require('https');

const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const FUNCTION_SECRET = process.env.TRICOACH_SECRET;
const REPO_OWNER      = 'Lucasbilbo';
const REPO_NAME       = 'tricoach';
const FILE_PATH       = 'history.json';
const BRANCH          = 'main';

const MAX_BODY_BYTES = 256 * 1024; // 256 KB — el historial puede ser grande

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-tricoach-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function checkAuth(event) {
  const secret = event.headers['x-tricoach-secret'];
  return !FUNCTION_SECRET || secret === FUNCTION_SECRET;
}

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'TriCoach-App',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (!checkAuth(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // GET — cargar historial
    if (event.httpMethod === 'GET') {
      const res = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`);
      if (res.status === 404) return { statusCode: 200, headers, body: JSON.stringify({ history: [], plan: [] }) };
      if (res.status !== 200) return { statusCode: res.status, headers, body: JSON.stringify({ error: 'Error reading history' }) };
      const content = JSON.parse(Buffer.from(res.body.content, 'base64').toString('utf8'));
      return { statusCode: 200, headers, body: JSON.stringify({ ...content, sha: res.body.sha }) };
    }

    // POST — guardar historial
    if (event.httpMethod === 'POST') {
      const rawBody = event.body || '';
      if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
        return { statusCode: 413, headers, body: JSON.stringify({ error: 'Request demasiado grande' }) };
      }
      let parsed;
      try { parsed = JSON.parse(rawBody); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
      }
      const { history, plan, memory, weekHistory, sha } = parsed;
      const content = Buffer.from(JSON.stringify({ history, plan, memory, weekHistory }, null, 2)).toString('base64');
      const body = {
        message: `[skip ci] Update history ${new Date().toISOString().slice(0, 16)}`,
        content,
        branch: BRANCH,
        ...(sha && { sha })
      };
      const res = await githubRequest('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, body);
      if (res.status === 200 || res.status === 201) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sha: res.body.content?.sha }) };
      }
      return { statusCode: res.status, headers, body: JSON.stringify({ error: 'Error saving history' }) };
    }

    return { statusCode: 405, headers, body: 'Method Not Allowed' };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
