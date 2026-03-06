const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ATHLETE_ID    = "i524242";
  const INTERVALS_KEY = "2snw5gkbwutghni2cde17itbi";
  const auth = Buffer.from(`API_KEY:${INTERVALS_KEY}`).toString('base64');

  const body = event.body;

  return new Promise((resolve) => {
    const options = {
      hostname: 'intervals.icu',
      path: `/api/v1/athlete/${ATHLETE_ID}/events`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: data
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: e.message })
      });
    });

    req.write(body);
    req.end();
  });
};
