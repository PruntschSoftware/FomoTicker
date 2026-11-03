// Lang & Schwarz Exchange (ls-tc.de) – Echtzeit-Kurse (Mittelkurs aus Geld/Brief), gratis
//
//  Suche:   GET /_rpc/json/.lstc/instrument/search/main?q=<Name|ISIN|WKN>&localeId=2
//           -> [{ instrumentId, displayname, isin, wkn, categorySymbol: STK|ETF|…, link }]
//  Kurs:    Instrument-Seite (/de/aktie/<id>) enthält den aktuellen Geld-, Brief- und
//           Mittelkurs (wird auf der Seite danach per Push weiter aktualisiert)
//  Chart:   GET /_rpc/json/instrument/chart/dataForInstrument?instrumentId=<id>&marketId=1
//           &quotetype=mid&series=intraday&type=mini&localeId=2
//           -> Tagesverlauf im Minutentakt + Vortagesschluss (plotlines.previousDay)
//
// Keine offizielle API: L&S kann das Format jederzeit ändern. Abrufe werden gecacht
// (Kurse 60 s, Charts 15 min) und laufen höchstens zu viert parallel.

import { cleanName, httpGet, ISIN_RE, parseEuKey, pool, round, toFiveMinutes, toNum } from './eu.js';

const BASE = 'https://www.ls-tc.de';
const TYPES = new Set(['STK', 'ETF', 'ETC', 'FND']);

export function parseSearch(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && ISIN_RE.test(String(r.isin || '')) && TYPES.has(r.categorySymbol))
    .map((r) => ({
      isin: r.isin,
      id: Number(r.instrumentId || r.id),
      raw: String(r.displayname || ''),
      name: cleanName(r.displayname),
      wkn: String(r.wkn || ''),
      type: r.categorySymbol === 'STK' ? 'Common Stock' : 'ETF',
      link: String(r.link || ''),
    }))
    .filter((r) => r.id > 0);
}

/** Werte aus der Instrument-Seite: item="<id>@1" field="mid">203,8250< */
export function parsePage(html, id) {
  const out = {};
  const re = new RegExp(`item="${id}@1"\\s+field="(mid|bid|ask|midTime)"[^>]*>([^<]*)<`, 'g');
  for (const m of String(html).matchAll(re)) {
    if (out[m[1]] != null) continue;
    out[m[1]] = m[1] === 'midTime' ? m[2].trim() : toNum(m[2]);
  }
  return out;
}

/** Chart-Antwort -> { prev, pts: [[ms, preis], …] } */
export function parseChart(body) {
  const prev = toNum(body?.info?.plotlines?.find((p) => p.id === 'previousDay')?.value);
  const data = body?.series?.intraday?.data;
  const pts = Array.isArray(data)
    ? data.filter((d) => Array.isArray(d) && d[1] > 0).map((d) => [Number(d[0]), Number(d[1])]).sort((a, b) => a[0] - b[0])
    : [];
  return { prev: prev > 0 ? prev : null, pts };
}

export function buildQuote({ page = {}, chart = { prev: null, pts: [] }, name = '' }) {
  const last = chart.pts.length ? chart.pts[chart.pts.length - 1][1] : null;
  let price = page.mid > 0 ? page.mid : (page.bid > 0 && page.ask > 0 ? (page.bid + page.ask) / 2 : last);
  if (!(price > 0)) return null;
  const prev = chart.prev > 0 ? chart.prev : price;
  const vals = chart.pts.map((p) => p[1]).concat(price);
  const open = chart.pts.length ? chart.pts[0][1] : price;
  const ch = price - prev;
  return [round(price), round(ch), round(prev > 0 ? (ch / prev) * 100 : 0, 2), round(open),
    round(Math.max(...vals)), round(Math.min(...vals)), round(prev), name, 0, 0, ''];
}

export function createLsx({ fetchImpl = fetch, budget = null, log = console } = {}) {
  const ids = new Map();     // isin -> { id, name, link } (aus der Suche, bleibt)
  const charts = new Map();  // id -> { at, value }  (kurz, damit Kurs + Chart nur 1x laden)
  const searches = new Map(); // suchbegriff -> { at, value }

  const get = async (path, opts = {}) => {
    if (budget) await budget.acquire(1, { maxWaitMs: opts.prio === 'quote' ? 3000 : 15000 });
    return httpGet(BASE + path, { fetchImpl, ...opts });
  };

  async function search(term) {
    const q = String(term || '').trim();
    if (q.length < 2) return [];
    const key = q.toLowerCase();
    const hit = searches.get(key);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
    const res = await get(`/_rpc/json/.lstc/instrument/search/main?q=${encodeURIComponent(q)}&localeId=2`, { timeoutMs: 5000 });
    const value = parseSearch(await res.json());
    for (const r of value) if (!ids.has(r.isin)) ids.set(r.isin, r);
    if (searches.size > 500) searches.clear();
    searches.set(key, { at: Date.now(), value });
    return value;
  }

  async function resolve(isin) {
    if (ids.has(isin)) return ids.get(isin);
    const hits = await search(isin);
    const r = hits.find((h) => h.isin === isin);
    if (!r) throw new Error(`L&S kennt ${isin} nicht`);
    ids.set(isin, r);
    return r;
  }

  async function chart(id) {
    const hit = charts.get(id);
    if (hit && Date.now() - hit.at < 50 * 1000) return hit.value;
    const res = await get(`/_rpc/json/instrument/chart/dataForInstrument?container=chart1&instrumentId=${id}`
      + '&marketId=1&quotetype=mid&series=intraday&type=mini&localeId=2', { prio: 'series' });
    const value = parseChart(await res.json());
    if (charts.size > 2000) charts.clear();
    charts.set(id, { at: Date.now(), value });
    return value;
  }

  async function page(inst) {
    const path = inst.link && inst.link.startsWith('/') ? inst.link : `/de/aktie/${inst.id}`;
    const res = await get(path, { prio: 'quote', accept: 'text/html', timeoutMs: 8000 });
    return parsePage(await res.text(), inst.id);
  }

  return {
    name: 'L&S Exchange',
    configured: true,
    extendedHours: false,
    maxBatch: 10,
    supports: (key) => parseEuKey(key)?.venue === 'LS',
    // Charts liefert L&S auch für Tradegate-Werte (gleiche ISIN, Mittelkurs)
    supportsSeries: (key) => Boolean(parseEuKey(key)),
    search,
    resolve,
    nameOf: (isin) => ids.get(isin)?.name || '',

    async fetchQuotes(keys) {
      const jobs = keys.map((k) => [k, parseEuKey(k)]).filter(([, p]) => p?.venue === 'LS');
      const res = await pool(jobs, 4, async ([, p]) => {
        const inst = await resolve(p.isin);
        const [pg, ch] = await Promise.all([page(inst), chart(inst.id).catch(() => undefined)]);
        return buildQuote({ page: pg, chart: ch, name: inst.name });
      });
      const out = {};
      res.forEach((r, i) => {
        if (r.ok && r.value) out[jobs[i][0]] = r.value;
        else if (!r.ok) log.warn?.(`L&S ${jobs[i][1].isin}: ${r.error.message}`);
      });
      if (jobs.length && !Object.keys(out).length && res.every((r) => !r.ok)) throw res[0].error;
      return out;
    },

    async fetchSeries(keys) {
      const jobs = keys.map((k) => [k, parseEuKey(k)]).filter(([, p]) => p);
      const res = await pool(jobs, 4, async ([, p]) => {
        const inst = await resolve(p.isin);
        const ch = await chart(inst.id);
        const v = toFiveMinutes(ch.pts);
        return v.length >= 2 ? v : null;
      });
      const out = {};
      res.forEach((r, i) => { if (r.ok && r.value) out[jobs[i][0]] = r.value; });
      return out;
    },
  };
}
