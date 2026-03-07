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
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    const timeMin = now.toISOString();
    const timeMax = twoWeeks.toISOString();

    // 1. Get all calendars
    const calListUrl = `https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,summary,accessRole)`;
    let calList = await get(calListUrl, token);

    // Handle token expiry
    if (calList.error && calList.error.code === 401 && refresh_token) {
      const refreshed = await refreshAccessToken(refresh_token);
      if (!refreshed.error) {
        token = refreshed.access_token;
        calList = await get(calListUrl, token);
      }
    }
    if (calList.error) return { statusCode: 401, body: JSON.stringify({ error: calList.error.message }) };

    const calendars = calList.items || [];

    // 2. Fetch events from all calendars in parallel
    const allEvents = [];
    await Promise.all(calendars.map(async cal => {
      try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
          `timeMin=${encodeURIComponent(timeMin)}` +
          `&timeMax=${encodeURIComponent(timeMax)}` +
          `&singleEvents=true` +
          `&orderBy=startTime` +
          `&maxResults=30` +
          `&fields=items(summary,start,end,status)`;
        const data = await get(url, token);
        if (data.items) {
          data.items.forEach(e => {
            // For restricted calendars only show busy blocks
            if (cal.accessRole === 'freeBusyReader') {
              allEvents.push({ summary: `[${cal.summary||'Ocupado'}]`, start: e.start, end: e.end });
            } else {
              allEvents.push(e);
            }
          });
        }
      } catch(e) { /* skip calendar on error */ }
    }));

    // Sort by start time
    allEvents.sort((a, b) => {
      const aTime = a.start?.dateTime || a.start?.date || '';
      const bTime = b.start?.dateTime || b.start?.date || '';
      return aTime.localeCompare(bTime);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: allEvents, new_access_token: token !== access_token ? token : undefined })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
