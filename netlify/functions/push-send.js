// Netlify Function: push-send.js
// Scheduled cron: sends push notifications at 08:00 and 20:00 Spain time

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@tricoach.app';
const REPO = 'Lucasbilbo/tricoach';

// Simple VAPID JWT signing without external deps
const crypto = require('crypto');

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

async function buildVapidAuth(endpoint) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header = base64urlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = base64urlEncode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_EMAIL }));
  const sigInput = `${header}.${payload}`;

  const privKeyDer = base64urlDecode(VAPID_PRIVATE_KEY);
  // Reconstruct proper PKCS8 key
  const pkcs8Header = Buffer.from('308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420', 'hex');
  const keyData = Buffer.concat([pkcs8Header, privKeyDer.slice(privKeyDer.length - 32), Buffer.from('a144034200', 'hex'), base64urlDecode(VAPID_PUBLIC_KEY)]);

  const privKey = crypto.createPrivateKey({ key: keyData, format: 'der', type: 'pkcs8' });
  const sig = crypto.sign('SHA256', Buffer.from(sigInput), { key: privKey, dsaEncoding: 'ieee-p1363' });

  return `vapid t=${header}.${payload}.${base64urlEncode(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

async function getGithubFile(file) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return JSON.parse(Buffer.from(data.content, 'base64').toString());
}

function getSpainHour() {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }));
}

function getSpainDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
}

exports.handler = async () => {
  try {
    const hour = getSpainHour();
    const isEvening = hour === 20; // 20:00 — notify about tomorrow
    const isMorning = hour === 8;  // 08:00 — notify about today

    if (!isEvening && !isMorning) {
      return { statusCode: 200, body: `Hour ${hour} — no notification needed` };
    }

    // Load subscription and plan from GitHub
    const [subData, histData] = await Promise.all([
      getGithubFile('push-subscription.json'),
      getGithubFile('history.json')
    ]);

    if (!subData?.subscription) return { statusCode: 200, body: 'No subscription found' };

    const plan = histData?.plan || [];
    if (!plan.length) return { statusCode: 200, body: 'No plan found' };

    const targetDate = isEvening ? getSpainDateStr(1) : getSpainDateStr(0);
    const day = plan.find(d => d.date === targetDate);
    if (!day) return { statusCode: 200, body: 'No plan for target date' };

    const sportEmoji = { Swim: '🏊', Run: '🏃', Ride: '🚴' };
    const em = sportEmoji[day.sport] || '💤';
    const title = isEvening ? 'TriCoach AI — Mañana' : 'TriCoach AI — Hoy';
    const body = day.sport
      ? `${em} ${day.name} · ${day.duration_min}min`
      : '💤 Día de descanso — recupera bien';

    // Send push
    const sub = subData.subscription;
    const authHeader = await buildVapidAuth(sub.endpoint);

    // Build encrypted payload (simple text for now — use web-push library approach)
    const payload = JSON.stringify({ title, body, tag: 'tricoach-daily' });

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400'
      },
      body: Buffer.from(payload)
    });

    return { statusCode: 200, body: `Push sent: ${res.status} — ${title}: ${body}` };

  } catch(e) {
    console.error('push-send error:', e);
    return { statusCode: 500, body: e.message };
  }
};
