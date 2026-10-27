import { findDeviceByCode, findDeviceByToken, getWatchlist, noteDeviceInfo, registerDevice, saveSubscription, saveWatchlist } from './db.js';
import { activatePage, alreadyActivePage, errorPage, freePage, successPage, watchlistCodePage, watchlistPage } from './pages.js';
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

// Kursverlauf auf 0..100 skalieren (inkl. Vortagslinie), damit die Uhr nur kleine Ganzzahlen bekommt
export function normalizeSeries(values, prevClose) {
  const all = prevClose > 0 ? [...values, prevClose] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const scale = (v) => Math.round(((v - lo) / span) * 100);
  return { sp: values.map(scale), pc: prevClose > 0 ? scale(prevClose) : -1 };
}

// Punkte fürs Mini-Chart: höchstens max (ältere Uhren zeichnen max. 64 Polygonpunkte),
// am Ende der aktuelle Kurs, damit das Chart genau beim angezeigten Preis endet
export const CHART_MAX = 55;
export function chartPoints(values, price, max = CHART_MAX) {
  let v = values.filter((x) => Number.isFinite(x) && x > 0);
  const room = price > 0 ? max - 1 : max;
  if (v.length > room) {
    const out = [];
    for (let i = 0; i < room; i++) out.push(v[Math.round((i * (v.length - 1)) / (room - 1))]);
    v = out;
  }
  if (price > 0 && v[v.length - 1] !== price) v.push(price);
  return v;
}

const CODE_RE = /^[A-Z0-9]{6}$/;

function cleanWatchlist(items, max) {
  if (!Array.isArray(items)) return null;
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const k = String(it?.k || '').toUpperCase();
    const [sym] = k.split('@');
    if (!parseSymbols(k, 1).length || seen.has(k)) continue;
    seen.add(k);
    out.push({
      k,
      s: String(it?.s || sym).toUpperCase().slice(0, 20),
      n: String(it?.n || '').slice(0, 80),
      x: String(it?.x || '').slice(0, 40),
    });
    if (out.length >= max) break;
  }
  return out;
}

export function createApp({ cfg, pool, quotes, series = null, directory = null, stripe, log = console }) {
  const registerLimit = createLimiter(20, 60 * 60 * 1000);
  const activateLimit = createLimiter(30, 60 * 60 * 1000);
  const searchLimit = createLimiter(240, 60 * 1000);
  const codeLimit = createLimiter(60, 60 * 60 * 1000);
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

    // Uhrmodell + Entwickler-Build (ab App 1.5) für die Statistik
    const pn = String(url.searchParams.get('m') || '');
    if (/^\d{3}-[A-Z0-9]{5}-\d{2}$/.test(pn)) {
      noteDeviceInfo(pool, device, { partNumber: pn, dev: url.searchParams.get('d') === '1' })
        .catch((err) => log.warn('Geräteinfo:', err.message));
    }

    // Bewusst Status 200: manche Uhren liefern bei 4xx keinen Body an die App
    const a = access(device);
    if (!a.entitled) {
      return json(res, 200, { st: 'pay', code: device.pair_code, url: shortUrl });
    }

    // Watchlist von der Webseite hat Vorrang vor den Symbolen aus den Uhr-Einstellungen
    const wl = await getWatchlist(pool, device.id);
    const fromWeb = Array.isArray(wl) && wl.length > 0;
    const symbols = fromWeb
      ? wl.map((w) => w.k).slice(0, cfg.maxSymbols)
      : parseSymbols(url.searchParams.get('s'), cfg.maxSymbols);
    if (symbols.length === 0) return json(res, 400, { error: 'keine gültigen Symbole' });

    let raw;
    try {
      raw = await quotes.get(symbols);
    } catch (err) {
      log.error('Kursabruf fehlgeschlagen:', err.message);
      return json(res, 502, { error: 'Datenquelle nicht erreichbar' });
    }

    let ser = {};
    if (series && url.searchParams.get('sp') !== '0') {
      try { ser = await series.get(symbols); } catch { ser = {}; }
    }

    const q = {};
    const n = {};
    const sp = {};
    const pc = {};
    const x = {};
    for (const k of symbols) {
      const r = raw[k];
      if (!r) continue;
      q[k] = r.slice(0, 7);
      // Vor-/Nachbörse: [kurs, änderung% gegen Schluss, "pre"|"post"]
      if (r[10] && r[8] > 0) x[k] = [r[8], r[9], r[10]];
      const name = (fromWeb && wl.find((w) => w.k === k)?.n) || r[7] || directory?.lookup(k)?.name || '';
      if (name) n[k] = name;
      if (Array.isArray(ser[k]) && ser[k].length >= 2) {
        const norm = normalizeSeries(chartPoints(ser[k], r[0]), r[6]);
        sp[k] = norm.sp;
        pc[k] = norm.pc;
      }
    }
    const body = {
      st: 'ok',
      src: quotes.sourceFor ? quotes.sourceFor(Object.keys(q)) : quotes.source,
      code: device.pair_code,
      url: shortUrl,
      trial: a.trial,
      free: !paywall,
      q, n, sp, pc,
    };
    if (Object.keys(x).length) body.x = x;
    if (fromWeb) body.syms = symbols;
    return json(res, 200, body);
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

  async function deviceForCode(req, code) {
    if (!CODE_RE.test(code)) return null;
    if (!codeLimit(clientIp(req))) {
      throw Object.assign(new Error('zu viele Versuche'), { status: 429 });
    }
    return findDeviceByCode(pool, code);
  }

  async function handleWatchlistApi(req, res, code) {
    const device = await deviceForCode(req, code);
    if (!device) return json(res, 404, { error: 'Code nicht gefunden' });
    if (req.method === 'GET') {
      return json(res, 200, { items: (await getWatchlist(pool, device.id)) || [], max: cfg.maxSymbols });
    }
    let data;
    try {
      data = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    } catch {
      return json(res, 400, { error: 'ungültiges JSON' });
    }
    const items = cleanWatchlist(data.items, cfg.maxSymbols);
    if (!items) return json(res, 400, { error: 'items fehlt' });
    await saveWatchlist(pool, device.id, items);
    return json(res, 200, { ok: true, items });
  }

  function handleSearch(req, res, url) {
    if (!searchLimit(clientIp(req))) return json(res, 429, { error: 'zu viele Anfragen' });
    const q = String(url.searchParams.get('q') || '').slice(0, 60);
    const results = directory ? directory.search(q, 12) : [];
    return send(res, 200, { results, ready: (directory?.size || 0) > 0 }, 'application/json; charset=utf-8');
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
        case 'GET /w':
          return html(res, 200, watchlistCodePage(cfg, { code: (url.searchParams.get('code') || '').toUpperCase().slice(0, 6) }));
        case 'GET /api/search':
          return handleSearch(req, res, url);
        default: {
          const page = url.pathname.match(/^\/w\/([A-Za-z0-9]{6})$/);
          if (page && req.method === 'GET') {
            const code = page[1].toUpperCase();
            const device = await deviceForCode(req, code);
            if (!device) return html(res, 404, watchlistCodePage(cfg, { code, error: 'Code nicht gefunden. Bitte auf der Uhr prüfen.' }));
            return html(res, 200, watchlistPage(cfg, { code, max: cfg.maxSymbols }));
          }
          const api = url.pathname.match(/^\/api\/watchlist\/([A-Za-z0-9]{6})$/);
          if (api && (req.method === 'GET' || req.method === 'PUT')) {
            return await handleWatchlistApi(req, res, api[1].toUpperCase());
          }
          return json(res, 404, { error: 'nicht gefunden' });
        }
      }
    } catch (err) {
      log.error(`${route} fehlgeschlagen:`, err);
      if (!res.headersSent) json(res, err.status || 500, { error: 'interner Fehler' });
    }
  };
}
