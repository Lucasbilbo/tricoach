const https = require('https');

const CLIENT_ID     = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function httpsPost(hostname, path, data) {
  return new Promise((resolve) => {
    const body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
    const options = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', e => resolve({ status: 500, body: { error: e.message } }));
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname, path, token) {
  return new Promise((resolve) => {
    const options = {
      hostname, path, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', e => resolve({ status: 500, body: { error: e.message } }));
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    // 1. Obtener access token
    const tokenRes = await httpsPost('www.strava.com', '/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token'
    });

    if (!tokenRes.body.access_token) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token error', detail: tokenRes.body }) };
    }

    const accessToken = tokenRes.body.access_token;

    // 2. Obtener actividades (últimas 100)
    const params = new URLSearchParams({ per_page: '100', page: '1' });
    const activitiesRes = await httpsGet('www.strava.com', `/api/v3/athlete/activities?${params}`, accessToken);

    if (activitiesRes.status !== 200) {
      return { statusCode: activitiesRes.status, headers: CORS, body: JSON.stringify({ error: 'Strava error' }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(activitiesRes.body) };

  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
