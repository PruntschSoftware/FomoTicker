// Gemeinsames für die deutschen Handelsplätze (Lang & Schwarz, Tradegate)
//
// Schlüssel im Backend: "<KÜRZEL>@<ISIN>.<PLATZ>", z. B. "SAP@DE0007164600.LS" oder
// "NVDA@US67066G1040.TG". Die Uhr zeigt nur den Teil vor "@" (das Kürzel), die Kurse
// werden über die ISIN geholt. LS = Lang & Schwarz Exchange, TG = Tradegate.

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
export const EU_KEY_RE = /^([A-Z0-9][A-Z0-9.\-]{0,11})@([A-Z]{2}[A-Z0-9]{9}[0-9])\.(LS|TG)$/;

export const VENUES = {
  LS: { id: 'LS', name: 'L&S Exchange', short: 'L&S', currency: 'EUR' },
  TG: { id: 'TG', name: 'Tradegate', short: 'Tradegate', currency: 'EUR' },
};

/** "SAP@DE0007164600.LS" -> { label: "SAP", isin: "DE0007164600", venue: "LS" } */
export function parseEuKey(key) {
  const m = EU_KEY_RE.exec(String(key || ''));
  return m ? { label: m[1], isin: m[2], venue: m[3] } : null;
}

export const euKey = (label, isin, venue) => `${cleanLabel(label)}@${isin}.${venue}`;

/** Kürzel für die Uhr: nur A–Z, 0–9, Punkt, Bindestrich, max. 12 Zeichen */
export function cleanLabel(s) {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').replace(/^[.\-]+/, '').slice(0, 12);
  return t || 'X';
}

/** Zahl aus "203,90", "25.769,00", 203.9, "-0,10", "./." */
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/\s|&nbsp;| |€|\$|%/g, '');
  if (!s || s === './.' || s === '-') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const round = (n, d = 4) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const KEEP_UPPER = new Set(['AG', 'SE', 'SA', 'NV', 'PLC', 'ETF', 'MSCI', 'S&P', 'USA', 'US', 'UK', 'EU', 'ESG', 'DAX',
  'BMW', 'SAP', 'BASF', 'RWE', 'EON', 'E.ON', 'MTU', 'HSBC', 'ING', 'UBS', 'AMD', 'IBM', 'ASML', 'TSMC', 'NVIDIA', 'KGAA',
  'ADR', 'UCITS', 'ACC', 'DIST', 'II', 'III', 'IV']);

/** Namen der Handelsplätze lesbar machen: "SIEMENS ENERGY AG NA O.N." -> "Siemens Energy AG" */
export function cleanName(raw) {
  let s = String(raw || '').split(/\s{2,}/)[0].trim();
  // typische Zusätze der Börsen-Kurznamen weg
  s = s.replace(/\b(NA|INH|VZO|STAMM|O\.N\.?|DL-?,?\d*|EO-?,?\d*|SF-?,?\d*|LS-?,?\d*|CD-?,?\d*|HD-?,?\d*|YN-?,?\d*|REG\.?S?\.?)(?=\s|$)/g, '')
    .replace(/\s+-,?\d+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const word = (w) => {
    if (KEEP_UPPER.has(w) || /\d/.test(w) || w.length <= 2) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  };
  // "HEALTH.AG" -> "Health.AG": Teile mit Punkt einzeln behandeln
  return s.split(' ').map((w) => w.split('.').map(word).join('.')).join(' ') || String(raw || '').trim();
}

/** Ersatz-Kürzel aus dem Namen, wenn OpenFIGI nichts liefert */
export function labelFromName(name) {
  const w = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return cleanLabel((w[0] || 'X').slice(0, 8));
}

/** GET mit Zeitlimit; wirft bei HTTP-Fehler */
export async function httpGet(url, { timeoutMs = 8000, accept = 'application/json', fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, {
    headers: {
      Accept: accept,
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; StockTicker/1.0; +https://fomoticker-production.up.railway.app)',
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${new URL(url).host}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

/** Arbeit mit höchstens `limit` gleichzeitigen Abrufen */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const n = i++;
      try { out[n] = { ok: true, value: await fn(items[n], n) }; } catch (err) { out[n] = { ok: false, error: err }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Kursliste (aufsteigend nach Zeit, [[ms, preis], …]) auf 5-Minuten-Schritte verdichten */
export function toFiveMinutes(points) {
  const out = [];
  let bucket = null;
  for (const [t, p] of points) {
    if (!(p > 0)) continue;
    const b = Math.floor(t / 300000);
    if (b === bucket) out[out.length - 1] = p;
    else { out.push(p); bucket = b; }
  }
  return out;
}
