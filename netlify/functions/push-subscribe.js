// Netlify Function: push-subscribe.js
// Saves user push subscription to GitHub (alongside history.json)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'Lucasbilbo/tricoach';
const FILE = 'push-subscription.json';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const { subscription } = JSON.parse(event.body);
    if (!subscription) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No subscription' }) };

    // Get current SHA if file exists
    let sha;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
      });
      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
      }
    } catch(e) {}

    // Save subscription
    const content = Buffer.from(JSON.stringify({ subscription, updatedAt: new Date().toISOString() })).toString('base64');
    const body = { message: 'Update push subscription', content, ...(sha ? { sha } : {}) };

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(await res.text());
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
