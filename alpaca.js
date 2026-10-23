// Alpaca Market Data (https://alpaca.markets) – Basic-Plan gratis, Feed "iex"
//
//  Kurse:   GET {data}/v2/stocks/snapshots?symbols=AAPL,MSFT&feed=iex   (1 Anfrage für alle)
//  Chart:   GET {data}/v2/stocks/bars?symbols=…&timeframe=15Min&start=…&feed=iex
//  Suche:   GET {trading}/v2/assets?status=active&asset_class=us_equity
//  Auth:    Header APCA-API-KEY-ID / APCA-API-SECRET-KEY
//
// Nur US-Werte (Schlüssel ohne "@"). Vor-/Nachbörse: letzter Trade außerhalb 9:30–16:00.

import { nyDay, nyMinute, usSession } from './market.js';

const round = (n) => Math.round(n * 10000) / 10000;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Börsenkürzel von Alpaca -> MIC (wie im restlichen Backend)
const EXCHANGE_MIC = { NASDAQ: 'XNAS', NYSE: 'XNYS', ARCA: 'ARCX', AMEX: 'XASE', BATS: 'BATS' };

const REG_OPEN = 9 * 60 + 30;
const REG_CLOSE = 16 * 60;

/**
 * Snapshot -> Kurs-Array. `now` für Tests.
 * Regulär: letzter Trade gegen Vortag. Außerhalb: Schlusskurs des letzten Handelstags,
 * dazu der letzte Trade danach als Vor-/Nachbörse.
 */
export function snapshotToQuote(snap, now = Date.now()) {
  if (!snap) return null;
  const db = snap.dailyBar;
  const pdb = snap.prevDailyBar;
  const lt = snap.latestTrade;
  const ltP = num(lt?.p);
  const ltT = lt?.t ? Date.parse(lt.t) : 0;
  if (!db && !(ltP > 0)) return null;

  const today = nyDay(now);
  const session = usSession(now);
  const dbDay = db?.t ? nyDay(Date.parse(db.t)) : '';

  let price;
  let prev;
  let o;
  let h;
  let l;
  if (session === 'regular' && dbDay === today) {
    // Handel läuft: letzter Trade, Tageswerte aus dem heutigen Tagesbalken
    price = ltP > 0 ? ltP : num(db.c);
    prev = num(pdb?.c);
    o = num(db.o);
    h = Math.max(num(db.h), price);
    l = num(db.l) > 0 ? Math.min(num(db.l), price) : price;
  } else if (session === 'regular') {
    // Eröffnung, aber noch kein Tagesbalken: Vortag = letzter Tagesbalken
    price = ltP > 0 ? ltP : num(db?.c);
    prev = num(db?.c);
    o = price;
    h = price;
    l = price;
  } else {
    // Vor-/Nachbörse oder geschlossen: letzter regulärer Handelstag
    price = num(db?.c);
    prev = num(pdb?.c);
    o = num(db?.o);
    h = num(db?.h);
    l = num(db?.l);
  }
  if (!(price > 0)) return null;
  const change = prev > 0 ? price - prev : 0;
  const pct = prev > 0 ? (change / prev) * 100 : 0;

  // Vor-/Nachbörse: letzter Trade nach dem Schluss des Tagesbalkens bzw. vor der Eröffnung
  let extPrice = 0;
  let extPct = 0;
  let extSession = '';
  if (session !== 'regular' && ltP > 0 && ltT > 0 && dbDay) {
    const tDay = nyDay(ltT);
    const tMin = nyMinute(ltT);
    const afterClose = tDay > dbDay || (tDay === dbDay && tMin >= REG_CLOSE);
    if (afterClose && price > 0) {
      extPrice = ltP;
      extPct = ((ltP - price) / price) * 100;
      extSession = tDay === today && tMin < REG_OPEN ? 'pre' : 'post';
    }
  }
  return [
    round(price), round(change), round(pct), round(o), round(h), round(l), round(prev),
    '', round(extPrice), round(extPct), extSession,
  ];
}

/** Bars (aufsteigend) -> Schlusskurse des letzten Handelstags, nur 9:30–16:00. */
export function barsToSeries(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  const rows = bars
    .map((b) => ({ t: Date.parse(b.t), c: num(b.c) }))
    .filter((r) => r.c > 0 && r.t > 0)
    .filter((r) => {
      const m = nyMinute(r.t);
      return m >= REG_OPEN && m < REG_CLOSE;
    })
    .sort((a, b) => a.t - b.t);
  if (rows.length === 0) return null;
  const lastDay = nyDay(rows[rows.length - 1].t);
  const day = rows.filter((r) => nyDay(r.t) === lastDay).map((r) => r.c);
  return day.length >= 2 ? day : null;
}

export function createAlpaca({ keyId, secretKey, dataUrl, tradingUrl, feed = 'iex', budget = null }) {
  const configured = Boolean(keyId && secretKey);

  async function get(base, path, params, { prio = 'quote', timeoutMs = 15000 } = {}) {
    if (budget) {
      const p = { quote: { maxWaitMs: 3000 }, series: { maxWaitMs: 1500, reserve: 20 }, directory: { maxWaitMs: 60000, reserve: 40 } }[prio];
      await budget.acquire(1, p);
    }
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secretKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Alpaca HTTP ${res.status} ${text.slice(0, 120)}`);
    }
    return res.json();
  }

  const usOnly = (keys) => keys.filter((k) => !String(k).includes('@'));

  return {
    name: 'Alpaca (IEX)',
    configured,
    extendedHours: true,

    async fetchQuotes(keys) {
      const syms = usOnly(keys);
      if (syms.length === 0) return {};
      const body = await get(dataUrl, '/v2/stocks/snapshots', { symbols: syms.join(','), feed });
      const snaps = body?.snapshots || body || {};
      const out = {};
      for (const s of syms) {
        const q = snapshotToQuote(snaps[s]);
        if (q) out[s] = q;
      }
      return out;
    },

    async fetchSeries(keys) {
      const syms = usOnly(keys);
      if (syms.length === 0) return {};
      // 4 Tage zurück reicht über Wochenende/Feiertag; danach nur der letzte Handelstag
      const start = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
      const all = {};
      let pageToken;
      for (let page = 0; page < 5; page++) {
        const body = await get(dataUrl, '/v2/stocks/bars', {
          symbols: syms.join(','), timeframe: '15Min', start, feed, limit: 10000, adjustment: 'raw', page_token: pageToken,
        }, { prio: 'series' });
        for (const [s, bars] of Object.entries(body?.bars || {})) {
          (all[s] ||= []).push(...bars);
        }
        pageToken = body?.next_page_token;
        if (!pageToken) break;
      }
      const out = {};
      for (const s of syms) {
        const v = barsToSeries(all[s]);
        if (v) out[s] = v;
      }
      return out;
    },

    async loadDirectory() {
      const list = await get(tradingUrl, '/v2/assets', { status: 'active', asset_class: 'us_equity' },
        { prio: 'directory', timeoutMs: 90000 });
      const out = [];
      for (const a of Array.isArray(list) ? list : []) {
        const mic = EXCHANGE_MIC[a.exchange];
        if (!mic || !a.symbol || !a.name) continue;
        out.push({
          symbol: a.symbol,
          name: a.name,
          exchange: a.exchange,
          mic,
          country: 'United States',
          type: /\bETF\b|\bFund\b/i.test(a.name) ? 'ETF' : 'Common Stock',
        });
      }
      return out;
    },
  };
}
