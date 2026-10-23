// Finnhub (https://finnhub.io) – Free-Plan: 60 Anfragen/Minute, nur US
//
//  Kurse:   GET {base}/quote?symbol=AAPL          (1 Anfrage pro Symbol)
//  Suche:   GET {base}/stock/symbol?exchange=US   (ganze US-Liste, 1 Anfrage)
//  Auth:    Header X-Finnhub-Token
//
// Keine Tagescharts im Free-Plan, keine Vor-/Nachbörse.

const round = (n) => Math.round(n * 10000) / 10000;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const MIC_OK = new Set(['XNAS', 'XNYS', 'ARCX', 'XASE', 'BATS', 'XNGS', 'XNMS', 'XNCM']);

export function finnhubToQuote(b) {
  const c = num(b?.c);
  if (!(c > 0)) return null; // unbekanntes Symbol -> alles 0
  const pc = num(b.pc);
  const d = b.d != null ? num(b.d) : pc > 0 ? c - pc : 0;
  const dp = b.dp != null ? num(b.dp) : pc > 0 ? (d / pc) * 100 : 0;
  return [round(c), round(d), round(dp), round(num(b.o)), round(num(b.h)), round(num(b.l)), round(pc), '', 0, 0, ''];
}

export function createFinnhub({ apiKey, baseUrl, budget = null }) {
  const configured = Boolean(apiKey);
  const base = String(baseUrl || '').replace(/\/+$/, '');

  async function get(path, params, { prio = 'quote', timeoutMs = 15000 } = {}) {
    if (budget) {
      const p = { quote: { maxWaitMs: 3000 }, directory: { maxWaitMs: 60000, reserve: 10 } }[prio];
      await budget.acquire(1, p);
    }
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'X-Finnhub-Token': apiKey }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
    return res.json();
  }

  return {
    name: 'Finnhub',
    configured,
    extendedHours: false,

    async fetchQuotes(keys) {
      const syms = keys.filter((k) => !String(k).includes('@'));
      const results = await Promise.allSettled(syms.map((s) => get('/quote', { symbol: s })));
      const out = {};
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const q = finnhubToQuote(r.value);
        if (q) out[syms[i]] = q;
      });
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length && failed.length === results.length) throw failed[0].reason;
      return out;
    },

    async loadDirectory() {
      const list = await get('/stock/symbol', { exchange: 'US' }, { prio: 'directory', timeoutMs: 90000 });
      const out = [];
      for (const a of Array.isArray(list) ? list : []) {
        if (!a.symbol || !a.description || !MIC_OK.has(a.mic)) continue;
        if (a.type !== 'Common Stock' && a.type !== 'ETP') continue;
        out.push({
          symbol: a.symbol,
          name: a.description,
          exchange: a.mic,
          mic: a.mic,
          country: 'United States',
          type: a.type === 'ETP' ? 'ETF' : 'Common Stock',
        });
      }
      return out;
    },
  };
}
