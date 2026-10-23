// Twelve Data
//  Kurse:      GET /quote?symbol=AAPL,MSFT          (US-Werte gebündelt)
//              GET /quote?symbol=SAP&mic_code=XETR  (andere Börsen einzeln)
//  Verzeichnis: GET /stocks?mic_code=XETR, GET /etfs?mic_code=ARCX (für die Suche)
// Zahlen kommen als Strings. Je Symbol bzw. Verzeichnis-Abruf 1 API-Credit.

import { splitKey } from './directory.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => Math.round(n * 10000) / 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Börsen, deren Aktien (bzw. ETFs) für die Suche geladen werden.
// Twelve Data Basic (gratis) liefert nur US-Kurse -> standardmäßig nur US.
// US per Land (Nasdaq-Werte führt Twelve Data unter XNGS/XNMS/XNCM, nicht XNAS);
// OTC wird später über die Börsenliste aussortiert.
const US = { country: 'United States' };
const US_JOBS = [['stocks', US], ['etfs', US]];
const WORLD_JOBS = [
  ...US_JOBS,
  ...[['stocks', 'XETR'], ['etfs', 'XETR'], ['stocks', 'XWBO'], ['stocks', 'XLON'],
    ['stocks', 'XPAR'], ['stocks', 'XAMS'], ['stocks', 'XSWX'], ['stocks', 'XMIL'],
    ['stocks', 'XMAD'], ['stocks', 'XSTO'], ['stocks', 'XTSE']].map(([k, mic]) => [k, { mic_code: mic }]),
];

function toQuote(item) {
  if (!item || item.status === 'error') return null;
  const price = num(item.close);
  if (!(price > 0)) return null;
  const q = [
    price, num(item.change), num(item.percent_change),
    num(item.open), num(item.high), num(item.low), num(item.previous_close),
  ].map(round);
  q.push(String(item.name || ''));   // 8. Feld: Firmenname
  return q;
}

// Verlauf: neueste zuerst -> älteste zuerst, nur Schlusskurse
// Nur der jüngste Handelstag (Tagesverlauf); erst ab 2 Punkten, sonst der ganze Zeitraum
function toSeries(item) {
  if (!item || item.status === 'error' || !Array.isArray(item.values)) return null;
  const rows = item.values
    .map((v) => ({ d: String(v.datetime || '').slice(0, 10), c: num(v.close) }))
    .filter((r) => r.c > 0)
    .reverse();
  const lastDay = rows.length ? rows[rows.length - 1].d : '';
  const today = rows.filter((r) => r.d === lastDay);
  const pick = lastDay && today.length >= 2 ? today : rows;
  const closes = pick.map((r) => r.c);
  return closes.length >= 2 ? closes : null;
}

const SERIES = { interval: '15min', outputsize: '28' };

// Priorität beim Credit-Budget: Kurse > Charts > Verzeichnis
// (reserve = Minuten-Credits, dayReserve = Tages-Credits, die für Kurse frei bleiben)
const PRIO = {
  quote: { maxWaitMs: 4000, reserve: 0, dayReserve: 0 },
  series: { maxWaitMs: 1500, reserve: 2, dayReserve: 150 },
  directory: { maxWaitMs: 10 * 60 * 1000, reserve: 4, dayReserve: 100 },
};

export function createTwelveData({ apiKey, baseUrl, budget = null, directoryDelayMs = 0, markets = 'us' }) {
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY fehlt');
  const DIRECTORY_JOBS = markets === 'all' ? WORLD_JOBS : US_JOBS;

  async function get(path, params, { cost = 1, prio = 'quote', timeoutMs = 15000 } = {}) {
    if (budget) await budget.acquire(cost, PRIO[prio]);
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('apikey', apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
    return res.json();
  }

  async function batch(symbols) {
    const body = await get('/quote', { symbol: symbols.join(',') }, { cost: symbols.length });
    if (body?.status === 'error') {
      if (symbols.length === 1 && (body.code === 400 || body.code === 404)) return {};
      throw new Error(`Twelve Data: ${body.code} ${body.message}`);
    }
    const bySymbol = symbols.length === 1 ? { [symbols[0]]: body } : body;
    const out = {};
    for (const s of symbols) {
      const q = toQuote(bySymbol?.[s]);
      if (q) out[s] = q;
    }
    return out;
  }

  async function single(key) {
    const { symbol, mic } = splitKey(key);
    const body = await get('/quote', { symbol, mic_code: mic }, { cost: 1 });
    if (body?.status === 'error') {
      if (body.code === 400 || body.code === 404) return null;
      throw new Error(`Twelve Data: ${body.code} ${body.message}`);
    }
    return toQuote(body);
  }

  async function seriesBatch(symbols) {
    const body = await get('/time_series', { symbol: symbols.join(','), ...SERIES }, { cost: symbols.length, prio: 'series' });
    if (body?.status === 'error') {
      if (symbols.length === 1) return {};
      throw new Error(`Twelve Data: ${body.code} ${body.message}`);
    }
    const bySymbol = symbols.length === 1 ? { [symbols[0]]: body } : body;
    const out = {};
    for (const s of symbols) {
      const v = toSeries(bySymbol?.[s]);
      if (v) out[s] = v;
    }
    return out;
  }

  async function seriesSingle(key) {
    const { symbol, mic } = splitKey(key);
    const body = await get('/time_series', { symbol, mic_code: mic, ...SERIES }, { cost: 1, prio: 'series' });
    return body?.status === 'error' ? null : toSeries(body);
  }

  return {
    name: 'Twelve Data',

    // Kursverlauf für das Mini-Chart (wird länger gecacht als die Kurse)
    async fetchSeries(keys) {
      const plain = keys.filter((k) => !k.includes('@'));
      const out = {};
      const jobs = [];
      if (plain.length) jobs.push(seriesBatch(plain).then((m) => Object.assign(out, m)));
      for (const k of keys.filter((x) => x.includes('@'))) {
        jobs.push(seriesSingle(k).then((v) => { if (v) out[k] = v; }));
      }
      const results = await Promise.allSettled(jobs);
      const failed = results.filter((r) => r.status === 'rejected');
      // alles fehlgeschlagen (z. B. Budget) -> Fehler, damit nichts als "leer" gecacht wird
      if (failed.length === results.length && failed.length > 0) throw failed[0].reason;
      return out;
    },

    async fetchQuotes(keys) {
      const plain = keys.filter((k) => !k.includes('@'));
      const withMic = keys.filter((k) => k.includes('@'));
      const out = {};
      const jobs = [];
      if (plain.length) jobs.push(batch(plain).then((m) => Object.assign(out, m)));
      for (const k of withMic) {
        jobs.push(single(k).then((q) => { if (q) out[k] = q; }));
      }
      const results = await Promise.allSettled(jobs);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === results.length && failed.length > 0) throw failed[0].reason;
      return out;
    },

    // Verzeichnis für die Suche. Langsam (Abrufe mit Pause), läuft im Hintergrund.
    async loadDirectory() {
      const all = [];
      for (let i = 0; i < DIRECTORY_JOBS.length; i++) {
        const [kind, params] = DIRECTORY_JOBS[i];
        if (i > 0 && directoryDelayMs) await sleep(directoryDelayMs);
        try {
          const body = await get(`/${kind}`, params, { cost: 1, prio: 'directory', timeoutMs: 90000 });
          const mic = params.mic_code || '';
          for (const r of body?.data || []) {
            all.push({
              symbol: r.symbol,
              name: r.name,
              exchange: r.exchange,
              mic: r.mic_code || mic,
              country: r.country,
              type: kind === 'etfs' ? 'ETF' : r.type,
            });
          }
        } catch (err) {
          // eine Börse fehlt -> Rest trotzdem nutzen
          console.warn(`Verzeichnis ${kind} ${JSON.stringify(params)}: ${err.message}`);
        }
      }
      return all;
    },
  };
}

export { toSeries }; // für Tests
