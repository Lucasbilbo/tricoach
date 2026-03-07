const https = require('https');

function get(url, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: { Authorization: `Bearer ${token}` }
    };
    https.get(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

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

async function refreshAccessToken(refreshToken) {
  return await post('https://oauth2.googleapis.com/token', {
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });
}

exports.handler = async (event) => {
  const { access_token, refresh_token } = event.queryStringParameters || {};

  if (!access_token && !refresh_token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No tokens provided' }) };
  }

  let token = access_token;

  // If no access token but have refresh token, get new access token
  if (!token && refresh_token) {
    const refreshed = await refreshAccessToken(refresh_token);
    if (refreshed.error) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token refresh failed', detail: refreshed.error }) };
    }
    token = refreshed.access_token;
  }

  try {
    // Get next 14 days of events
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    const timeMin = now.toISOString();
    const timeMax = twoWeeks.toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true` +
      `&orderBy=startTime` +
      `&maxResults=50` +
      `&fields=items(summary,start,end,status)`;

    const data = await get(url, token);

    if (data.error) {
      // Token might be expired, try refresh
      if (data.error.code === 401 && refresh_token) {
        const refreshed = await refreshAccessToken(refresh_token);
        if (!refreshed.error) {
          const retryData = await get(url, refreshed.access_token);
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: retryData.items || [], new_access_token: refreshed.access_token })
          };
        }
      }
      return { statusCode: 401, body: JSON.stringify({ error: data.error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: data.items || [] })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
