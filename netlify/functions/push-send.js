// Netlify Function: push-send.js
// Uses web-push library for proper VAPID encryption

const webpush = require('web-push');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@tricoach.app';
const REPO = 'Lucasbilbo/tricoach';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

  const isManual = event.httpMethod === 'POST';
  const isEvening = hour >= 19 && hour <= 21;
  const isMorning = hour >= 7 && hour <= 9;

  if (!isManual && !isEvening && !isMorning) {
    return { statusCode:200, body:`Hour ${hour} — no notification needed` };
  }

  const sendTomorrow = isEvening || (isManual && hour >= 12);
  const targetDate = sendTomorrow ? getSpainDateStr(1) : getSpainDateStr(0);
  const notifTitle = sendTomorrow ? 'TriCoach AI — Mañana' : 'TriCoach AI — Hoy';

  console.log(`Target date: ${targetDate}`);

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

    const payload = JSON.stringify({ title:notifTitle, body:notifBody, tag:'tricoach-daily' });
    const result = await webpush.sendNotification(subData.subscription, payload);

    console.log(`Push sent: ${result.statusCode}`);
    return { statusCode:200, body:`OK: ${result.statusCode} — ${notifTitle}: ${notifBody}` };

  } catch(e) {
    console.error('push-send error:', e.statusCode, e.message);
    return { statusCode:500, body:`${e.statusCode}: ${e.message}` };
  }
};
