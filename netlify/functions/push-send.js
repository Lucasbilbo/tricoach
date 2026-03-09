// Netlify Function: push-send.js
// Scheduled: 0 7,19 * * * (UTC) = 8:00 y 20:00 España

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@tricoach.app';
const REPO = 'Lucasbilbo/tricoach';
const crypto = require('crypto');

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function base64urlDecode(str) {
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function getSpainHour() {
  return parseInt(new Date().toLocaleString('en-US', { timeZone:'Europe/Madrid', hour:'numeric', hour12:false }));
}
function getSpainDateStr(offsetDays=0) {
  const d = new Date(Date.now() + offsetDays*86400000);
  return d.toLocaleDateString('en-CA', { timeZone:'Europe/Madrid' });
}

async function getGithubFile(file) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
    headers: { Authorization:`token ${GITHUB_TOKEN}`, Accept:'application/vnd.github.v3+json' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return JSON.parse(Buffer.from(data.content, 'base64').toString());
}

exports.handler = async (event) => {
  const hour = getSpainHour();
  console.log(`push-send running at Spain hour: ${hour}`);

  // Allow manual trigger (Run now) OR scheduled at 8/20
  const isManual = event.httpMethod === 'POST';
  const isEvening = hour >= 19 && hour <= 21;
  const isMorning = hour >= 7 && hour <= 9;

  if (!isManual && !isEvening && !isMorning) {
    return { statusCode:200, body:`Hour ${hour} — no notification needed` };
  }

  // Determine which notification to send
  const sendTomorrow = isEvening || (isManual && hour >= 12);
  const targetDate = sendTomorrow ? getSpainDateStr(1) : getSpainDateStr(0);
  const notifTitle = sendTomorrow ? 'TriCoach AI — Mañana' : 'TriCoach AI — Hoy';

  console.log(`Sending notification for date: ${targetDate}`);

  try {
    const [subData, histData] = await Promise.all([
      getGithubFile('push-subscription.json'),
      getGithubFile('history.json')
    ]);

    if (!subData?.subscription) {
      console.log('No subscription found');
      return { statusCode:200, body:'No subscription found' };
    }

    const plan = histData?.plan || [];
    console.log(`Plan has ${plan.length} days`);

    if (!plan.length) return { statusCode:200, body:'No plan found' };

    const day = plan.find(d => d.date === targetDate);
    if (!day) {
      console.log(`No plan for ${targetDate}`);
      return { statusCode:200, body:`No plan for ${targetDate}` };
    }

    const sportEmoji = { Swim:'🏊', Run:'🏃', Ride:'🚴' };
    const em = sportEmoji[day.sport] || '💤';
    const notifBody = day.sport
      ? `${em} ${day.name} · ${day.duration_min}min`
      : '💤 Día de descanso — recupera bien';

    console.log(`Sending: ${notifTitle} — ${notifBody}`);

    // Build VAPID JWT
    const sub = subData.subscription;
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const now = Math.floor(Date.now()/1000);
    const header = base64urlEncode(JSON.stringify({typ:'JWT',alg:'ES256'}));
    const payload = base64urlEncode(JSON.stringify({aud:audience, exp:now+43200, sub:VAPID_EMAIL}));
    const sigInput = `${header}.${payload}`;

    const privKeyBytes = base64urlDecode(VAPID_PRIVATE_KEY);
    const privKey = crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420','hex'),
        privKeyBytes.slice(-32)
      ]),
      format:'der', type:'pkcs8'
    });

    const sig = crypto.sign('SHA256', Buffer.from(sigInput), {key:privKey, dsaEncoding:'ieee-p1363'});
    const vapidAuth = `vapid t=${header}.${payload}.${base64urlEncode(sig)}, k=${VAPID_PUBLIC_KEY}`;

    // Encrypt payload using web-push standard (simplified — use text/plain for testing)
    const pushPayload = JSON.stringify({ title:notifTitle, body:notifBody, tag:'tricoach-daily' });

    const pushRes = await fetch(sub.endpoint, {
      method:'POST',
      headers: {
        'Authorization': vapidAuth,
        'Content-Type': 'application/json',
        'TTL': '86400'
      },
      body: pushPayload
    });

    console.log(`Push response: ${pushRes.status}`);
    return { statusCode:200, body:`Push sent: ${pushRes.status} — ${notifTitle}: ${notifBody}` };

  } catch(e) {
    console.error('push-send error:', e.message);
    return { statusCode:500, body:e.message };
  }
};
