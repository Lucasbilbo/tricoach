const https = require('https');

function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};

  if (error) return { statusCode: 302, headers: { Location: '/?google_error=access_denied' } };
  if (!code)  return { statusCode: 400, body: 'No code provided' };

  try {
    const tokens = await post('https://oauth2.googleapis.com/token', {
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code'
    });

    if (tokens.error) {
      return { statusCode: 302, headers: { Location: `/?google_error=${tokens.error}` } };
    }

    // ✅ FIXED: tokens via URL fragment — no quedan en logs de servidor ni historial del navegador
    const fragment = encodeURIComponent(JSON.stringify({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in:    tokens.expires_in
    }));

    return {
      statusCode: 302,
      headers: { Location: `/#google_tokens=${fragment}` }
    };
  } catch (e) {
    return { statusCode: 302, headers: { Location: `/?google_error=token_exchange_failed` } };
  }
};
