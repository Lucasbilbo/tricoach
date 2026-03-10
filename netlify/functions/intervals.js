const https = require('https');

const ATHLETE_ID = process.env.INTERVALS_ATHLETE_ID;
const INTERVALS_KEY = process.env.INTERVALS_API_KEY;
const auth = Buffer.from(`API_KEY:${INTERVALS_KEY}`).toString('base64');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function intervalsRequest(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'intervals.icu',
      path,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: responseData }));
    });

    req.on('error', (e) => resolve({ status: 500, body: JSON.stringify({ error: e.message }) }));
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const params = event.queryStringParameters || {};
  const action = params.action;

  // GET — listar eventos de una semana
  if (event.httpMethod === 'GET' && action === 'list') {
    const { start, end } = params;
    const res = await intervalsRequest('GET', `/api/v1/athlete/${ATHLETE_ID}/events?oldest=${start}&newest=${end}`);
    return { statusCode: res.status, headers: CORS, body: res.body };
  }

  // GET — wellness de los últimos N días
  if (event.httpMethod === 'GET' && action === 'wellness') {
    const days = parseInt(params.days || '7');
    const newest = new Date().toISOString().slice(0, 10);
    const oldest = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const res = await intervalsRequest('GET', `/api/v1/athlete/${ATHLETE_ID}/wellness?oldest=${oldest}&newest=${newest}`);
    return { statusCode: res.status, headers: CORS, body: res.body };
  }

  // DELETE — borrar evento por ID
  if (event.httpMethod === 'DELETE' && action === 'delete') {
    const { id } = params;
    const res = await intervalsRequest('DELETE', `/api/v1/athlete/${ATHLETE_ID}/events/${id}`);
    return { statusCode: res.status, headers: CORS, body: res.body };
  }

  // POST — crear evento
  if (event.httpMethod === 'POST') {
    const res = await intervalsRequest('POST', `/api/v1/athlete/${ATHLETE_ID}/events`, JSON.parse(event.body));
    return { statusCode: res.status, headers: CORS, body: res.body };
  }

  return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
};
