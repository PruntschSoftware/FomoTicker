// EODHD (https://eodhd.com) – europäische (und weltweite) Börsen, Kurse 15–20 Min verzögert
//
//  Kurse:   GET {base}/real-time/SAP.XETRA?s=VOW3.F,OMV.VI&api_token=…&fmt=json
//           (mehrere Werte pro Anfrage, jeder Wert kostet 1 Call)
//  Chart:   GET {base}/intraday/SAP.XETRA?interval=5m&from=…   (1 Anfrage pro Wert)
//  Suche:   GET {base}/exchange-symbol-list/XETRA               (1 Anfrage pro Börse)
//
// Schlüssel im Backend: "SAP@XETR" (Symbol@MIC). Ohne "@" = US-Wert ("AAPL" -> "AAPL.US").

const round = (n) => Math.round(n * 10000) / 10000;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// MIC -> EODHD-Börsenkürzel
export const MIC_EODHD = {
  XETR: 'XETRA', XFRA: 'F', XSTU: 'STU', XMUN: 'MU', XBER: 'BE', XHAM: 'HM', XDUS: 'DU', XHAN: 'HA',
  XWBO: 'VI', XSWX: 'SW', XPAR: 'PA', XAMS: 'AS', XBRU: 'BR', XLIS: 'LS', BMEX: 'MC', XMAD: 'MC',
  XMIL: 'MI', XLON: 'LSE', XCSE: 'CO', XSTO: 'ST', XOSL: 'OL', XHEL: 'HE', XDUB: 'IR', XWAR: 'WAR',
  XPRA: 'PR', XBUD: 'BUD', ASEX: 'AT',
};
const EODHD_MIC = Object.fromEntries(Object.entries(MIC_EODHD).filter(([m]) => m !== 'XMAD').map(([m, c]) => [c, m]));
const COUNTRY = {
  XETR: 'Germany', XFRA: 'Germany', XSTU: 'Germany', XMUN: 'Germany', XBER: 'Germany', XHAM: 'Germany',
  XDUS: 'Germany', XHAN: 'Germany', XWBO: 'Austria', XSWX: 'Switzerland', XPAR: 'France', XAMS: 'Netherlands',
  XBRU: 'Belgium', XLIS: 'Portugal', BMEX: 'Spain', XMIL: 'Italy', XLON: 'United Kingdom', XCSE: 'Denmark',
  XSTO: 'Sweden', XOSL: 'Norway', XHEL: 'Finland', XDUB: 'Ireland', XWAR: 'Poland', XPRA: 'Czech Republic',
  XBUD: 'Hungary', ASEX: 'Greece',
};

/** "SAP@XETR" -> "SAP.XETRA", "AAPL" -> "AAPL.US", unbekannte Börse -> null */
export function toTicker(key) {
  const [sym, mic] = String(key).split('@');
  if (!mic) return `${sym}.US`;
  const ex = MIC_EODHD[mic];
  return ex ? `${sym}.${ex}` : null;
}

export function realtimeToQuote(r) {
  const c = num(r?.close);
  if (!(c > 0)) return null; // "NA" = keine Daten
  const pc = num(r.previousClose);
  const d = r.change != null && r.change !== 'NA' ? num(r.change) : pc > 0 ? c - pc : 0;
  const dp = r.change_p != null && r.change_p !== 'NA' ? num(r.change_p) : pc > 0 ? (d / pc) * 100 : 0;
  const o = num(r.open) || c;
  return [round(c), round(d), round(dp), round(o), round(num(r.high) || c), round(num(r.low) || c), round(pc), '', 0, 0, ''];
}

/** Intraday-Bars -> Schlusskurse des letzten Handelstags (nach Börsenzeit des Werts) */
export function intradayToSeries(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const pts = rows
    .map((b) => ({ t: num(b.timestamp) * 1000, c: num(b.close), off: num(b.gmtoffset) }))
    .filter((b) => b.t > 0 && b.c > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) return null;
  // Handelstag in Europa: UTC-Datum reicht (Handel ~7–22 Uhr UTC)
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const lastDay = day(pts[pts.length - 1].t);
  let vals = pts.filter((p) => day(p.t) === lastDay).map((p) => p.c);
  // höchstens ~40 Punkte für die Uhr
  if (vals.length > 40) {
    const step = vals.length / 40;
    const out = [];
    for (let i = 0; i < 40; i++) out.push(vals[Math.floor(i * step)]);
    out[39] = vals[vals.length - 1];
    vals = out;
  }
  return vals.length >= 2 ? vals : null;
}

export function createEodhd({ apiKey, baseUrl, exchanges = 'XETRA,F,STU,MU,VI,SW,PA,AS,MI,LSE', budget = null }) {
  const configured = Boolean(apiKey);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const dirExchanges = String(exchanges).split(/[\s,;]+/).filter(Boolean).map((e) => e.toUpperCase());

  async function get(path, params, { prio = 'quote', credits = 1, timeoutMs = 20000 } = {}) {
    if (budget) {
      const p = { quote: { maxWaitMs: 3000 }, series: { maxWaitMs: 1500, reserve: 20 }, directory: { maxWaitMs: 60000, reserve: 40 } }[prio];
      await budget.acquire(credits, p);
    }
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    url.searchParams.set('api_token', apiKey);
    url.searchParams.set('fmt', 'json');
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`EODHD HTTP ${res.status}`);
    return res.json();
  }

  // Europa (und alles mit bekannter Börse); US nur, wenn kein anderer Anbieter davor steht
  const supports = (key) => toTicker(key) != null;

  return {
    name: 'EODHD',
    configured,
    extendedHours: false,
    supports,
    // MICs fürs Suchverzeichnis
    mics: new Set(dirExchanges.map((e) => EODHD_MIC[e]).filter(Boolean)),
    maxBatch: 15,

    async fetchQuotes(keys) {
      const map = new Map();
      for (const k of keys) {
        const t = toTicker(k);
        if (t) map.set(t.toUpperCase(), k);
      }
      const tickers = [...map.keys()];
      if (tickers.length === 0) return {};
      const out = {};
      for (let i = 0; i < tickers.length; i += 15) {
        const chunk = tickers.slice(i, i + 15);
        const body = await get(`/real-time/${encodeURIComponent(chunk[0])}`,
          { s: chunk.length > 1 ? chunk.slice(1).join(',') : null }, { credits: chunk.length });
        for (const r of Array.isArray(body) ? body : [body]) {
          const key = map.get(String(r?.code || '').toUpperCase());
          const q = key && realtimeToQuote(r);
          if (q) out[key] = q;
        }
      }
      return out;
    },

    async fetchSeries(keys) {
      const from = Math.floor(Date.now() / 1000) - 4 * 86400;
      const jobs = keys.map((k) => [k, toTicker(k)]).filter(([, t]) => t);
      const results = await Promise.allSettled(jobs.map(([, t]) =>
        get(`/intraday/${encodeURIComponent(t)}`, { interval: '5m', from }, { prio: 'series', credits: 5 })));
      const out = {};
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const v = intradayToSeries(r.value);
        if (v) out[jobs[i][0]] = v;
      });
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length && failed.length === results.length) throw failed[0].reason;
      return out;
    },

    async loadDirectory() {
      const out = [];
      for (const ex of dirExchanges) {
        const mic = EODHD_MIC[ex];
        if (!mic) continue;
        let list = [];
        try {
          list = await get(`/exchange-symbol-list/${ex}`, {}, { prio: 'directory', timeoutMs: 90000 });
        } catch {
          continue; // eine Börse fehlt -> die anderen trotzdem laden
        }
        for (const a of Array.isArray(list) ? list : []) {
          if (!a.Code || !a.Name) continue;
          if (!/^(Common Stock|ETF|Preferred Stock)$/i.test(a.Type || '')) continue;
          out.push({
            symbol: a.Code, name: a.Name, exchange: ex, mic,
            country: COUNTRY[mic] || a.Country || '', type: /ETF/i.test(a.Type) ? 'ETF' : 'Common Stock',
            isin: a.Isin || '',
          });
        }
      }
      return out;
    },
  };
}

