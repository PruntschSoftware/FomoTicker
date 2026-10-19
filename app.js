import { findDeviceByCode, findDeviceByToken, registerDevice, saveSubscription } from './db.js';
import { activatePage, alreadyActivePage, errorPage, freePage, successPage } from './pages.js';
import { parseSymbols } from './quotes.js';
import { verifyWebhook } from './stripe.js';

const MAX_BODY = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body zu groß'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(payload);
}
const json = (res, status, body) => send(res, status, body);
const html = (res, status, body) => send(res, status, body, 'text/html; charset=utf-8');

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

// Einfaches Rate-Limit pro IP und Zweck (pro Instanz, reicht für den Start)
function createLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      if (hits.size > 10000) hits.clear();
      hits.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}

export function createApp({ cfg, pool, quotes, stripe, log = console }) {
  const registerLimit = createLimiter(20, 60 * 60 * 1000);
  const activateLimit = createLimiter(30, 60 * 60 * 1000);
  const shortUrl = (cfg.displayUrl || cfg.publicUrl).replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const paywall = cfg.paywallEnabled;
  // Im Gratis-Modus ist jedes Gerät freigeschaltet; trial -1 = keine Testtage anzeigen
  const access = (device) => ({
    entitled: !paywall || device.entitled,
    trial: !paywall || device.subscribed ? -1 : device.trial_days_left,
  });

  function bearer(req) {
    const h = String(req.headers.authorization || '');
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  }

  async function handleRegister(req, res) {
    if (!registerLimit(clientIp(req))) return json(res, 429, { error: 'zu viele Anfragen' });
    let data = {};
    try {
      const raw = (await readBody(req)).toString('utf8');
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { error: 'ungültiges JSON' });
    }
    const uid = typeof data.uid === 'string' && data.uid.length > 0 && data.uid.length <= 128 ? data.uid : null;
    const { token, device } = await registerDevice(pool, { uid, trialDays: cfg.trialDays });
    const a = access(device);
    return json(res, 200, {
      token,
      code: device.pair_code,
      url: shortUrl,
      st: a.entitled ? 'ok' : 'pay',
      trial: a.trial,
      free: !paywall,
    });
  }

  async function handleQuotes(req, res, url) {
    const token = bearer(req);
    if (!token) return json(res, 401, { error: 'Token fehlt' });
    const device = await findDeviceByToken(pool, token);
    if (!device) return json(res, 401, { error: 'Token unbekannt' });

    // Bewusst Status 200: manche Uhren liefern bei 4xx keinen Body an die App
    const a = access(device);
    if (!a.entitled) {
      return json(res, 200, { st: 'pay', code: device.pair_code, url: shortUrl });
    }

    const symbols = parseSymbols(url.searchParams.get('s'), cfg.maxSymbols);
    if (symbols.length === 0) return json(res, 400, { error: 'keine gültigen Symbole' });

    let q;
    try {
      q = await quotes.get(symbols);
    } catch (err) {
      log.error('Kursabruf fehlgeschlagen:', err.message);
      return json(res, 502, { error: 'Datenquelle nicht erreichbar' });
    }
    return json(res, 200, {
      st: 'ok',
      src: quotes.source,
      code: device.pair_code,
      url: shortUrl,
      trial: a.trial,
      free: !paywall,
      q,
    });
  }

  async function handleActivate(req, res) {
    if (!activateLimit(clientIp(req))) {
      return html(res, 429, errorPage(cfg, 'Zu viele Versuche. Bitte später erneut.'));
    }
    const form = new URLSearchParams((await readBody(req)).toString('utf8'));
    const code = String(form.get('code') || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return html(res, 400, activatePage(cfg, { code, error: 'Der Code hat 6 Zeichen.' }));
    }
    const device = await findDeviceByCode(pool, code);
    if (!device) {
      return html(res, 404, activatePage(cfg, { code, error: 'Code nicht gefunden. Bitte auf der Uhr prüfen.' }));
    }
    if (device.subscribed) return html(res, 200, alreadyActivePage(cfg));

    try {
      const session = await stripe.createCheckoutSession(device);
      res.writeHead(303, { Location: session.url, 'Cache-Control': 'no-store' });
      return res.end();
    } catch (err) {
      log.error('Checkout fehlgeschlagen:', err.message);
      return html(res, 502, errorPage(cfg, 'Zahlung konnte nicht gestartet werden. Bitte später erneut.'));
    }
  }

  async function handleWebhook(req, res) {
    const raw = await readBody(req);
    let event;
    try {
      event = verifyWebhook(raw, req.headers['stripe-signature'], cfg.stripe.webhookSecret);
    } catch (err) {
      log.warn('Webhook abgelehnt:', err.message);
      return json(res, 400, { error: 'Signatur ungültig' });
    }

    const obj = event.data?.object || {};
    let subscriptionId = null;
    let deviceId = null;
    let customerId = null;

    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      subscriptionId = obj.subscription;
      customerId = obj.customer;
      deviceId = obj.client_reference_id || obj.metadata?.device_id || null;
    } else if (event.type?.startsWith('customer.subscription.')) {
      subscriptionId = obj.id;
    } else {
      return json(res, 200, { received: true, ignored: true });
    }
    if (!subscriptionId) return json(res, 200, { received: true, ignored: true });

    // Immer den aktuellen Stand bei Stripe holen – Events können in falscher Reihenfolge kommen
    const sub = await stripe.getSubscription(subscriptionId);
    const updated = await saveSubscription(pool, {
      deviceId: deviceId || sub.metadata?.device_id || null,
      customerId: customerId || sub.customer || null,
      subscriptionId: sub.id,
      status: sub.status,
    });
    log.info(`Webhook ${event.type}: Abo ${sub.id} -> ${sub.status} (${updated} Gerät)`);
    return json(res, 200, { received: true });
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /health':
          await pool.query('SELECT 1');
          return json(res, 200, { ok: true });
        case 'POST /v1/register':
          return await handleRegister(req, res);
        case 'GET /v1/quotes':
          return await handleQuotes(req, res, url);
        case 'GET /':
          if (!paywall) return html(res, 200, freePage(cfg));
          return html(res, 200, activatePage(cfg, { code: (url.searchParams.get('code') || '').slice(0, 6) }));
        case 'POST /activate':
          if (!paywall) return html(res, 200, freePage(cfg));
          return await handleActivate(req, res);
        case 'GET /success':
          return html(res, 200, successPage(cfg));
        case 'POST /stripe/webhook':
          if (!stripe) return json(res, 404, { error: 'Abo nicht aktiviert' });
          return await handleWebhook(req, res);
        default:
          return json(res, 404, { error: 'nicht gefunden' });
      }
    } catch (err) {
      log.error(`${route} fehlgeschlagen:`, err);
      if (!res.headersSent) json(res, err.status || 500, { error: 'interner Fehler' });
    }
  };
}
