// Tradegate (tradegatebsx.com) – Echtzeit-Kurse, gratis
//
//  Kurs:  GET /refresh.php?isin=<ISIN>
//         -> { bid, ask, last, delta (% zum Vortag), high, low, close (Vortag), avg, stueck, … }
//            Zahlen teils als "203,90", teils als 203.9; unbekannte ISIN -> leere Antwort
//
// Charts kommen von L&S (gleiche ISIN), weil Tradegate den Tagesverlauf nur als Bild hat.
// Keine offizielle API: Tradegate kann das Format jederzeit ändern.

import { httpGet, parseEuKey, pool, round, toNum } from './eu.js';

const BASE = 'https://www.tradegatebsx.com';

/** refresh.php-Antwort -> Kurs-Array (wie die anderen Anbieter) oder null */
export function refreshToQuote(r, name = '') {
  if (!r || typeof r !== 'object') return null;
  const last = toNum(r.last);
  const bid = toNum(r.bid);
  const ask = toNum(r.ask);
  const traded = toNum(r.avg) != null && last > 0;
  const price = traded ? last : (bid > 0 && ask > 0 ? (bid + ask) / 2 : last);
  if (!(price > 0)) return null;
  const prev = toNum(r.close) > 0 ? toNum(r.close) : price;
  const ch = price - prev;
  const high = Math.max(price, toNum(r.high) || price);
  const low = Math.min(price, toNum(r.low) || price);
  return [round(price), round(ch), round(prev > 0 ? (ch / prev) * 100 : 0, 2), round(prev), round(high), round(low),
    round(prev), name, 0, 0, ''];
}

export function createTradegate({ fetchImpl = fetch, budget = null, log = console, names = null } = {}) {
  async function quote(isin) {
    if (budget) await budget.acquire(1, { maxWaitMs: 3000 });
    const res = await httpGet(`${BASE}/refresh.php?isin=${isin}`, { fetchImpl, timeoutMs: 6000 });
    const text = (await res.text()).trim();
    if (!text) return null; // nicht bei Tradegate gelistet
    return JSON.parse(text);
  }

  const api = {
    name: 'Tradegate',
    configured: true,
    extendedHours: false,
    maxBatch: 10,
    supports: (key) => parseEuKey(key)?.venue === 'TG',
    quote,

    /** Wird die ISIN bei Tradegate gehandelt? (für die Suche) */
    async listed(isin) {
      try { return Boolean(refreshToQuote(await quote(isin))); } catch { return false; }
    },

    async fetchQuotes(keys) {
      const jobs = keys.map((k) => [k, parseEuKey(k)]).filter(([, p]) => p?.venue === 'TG');
      const res = await pool(jobs, 4, async ([, p]) => refreshToQuote(await quote(p.isin), (api.names || names)?.(p.isin) || ''));
      const out = {};
      res.forEach((r, i) => {
        if (r.ok && r.value) out[jobs[i][0]] = r.value;
        else if (!r.ok) log.warn?.(`Tradegate ${jobs[i][1].isin}: ${r.error.message}`);
      });
      if (jobs.length && !Object.keys(out).length && res.every((r) => !r.ok)) throw res[0].error;
      return out;
    },
  };
  return api;
}
