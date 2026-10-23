// Symbolverzeichnis für die Suche auf der Watchlist-Seite.
// Wird einmal täglich vom Datenanbieter geladen und lokal durchsucht – so kostet
// eine Suche (bzw. jeder Tastendruck) keine API-Credits.

// Börsen ohne Suffix: deren Symbole werden auf der Uhr und beim Kursabruf "nackt"
// verwendet (AAPL statt AAPL@XNAS).
export const US_MICS = new Set(['XNAS', 'XNYS', 'XASE', 'ARCX', 'BATS', 'XNMS', 'XNGS', 'XNCM']);

// Gewichtung für die Sortierung (bekannte Börsen zuerst)
const MIC_RANK = {
  XNAS: 10, XNYS: 10, ARCX: 8, XETR: 9, XWBO: 8, XLON: 7, XPAR: 7, XAMS: 7,
  XSWX: 7, XMIL: 6, XMAD: 6, XSTO: 6, XTSE: 6, XHKG: 5, XTKS: 5, XASX: 5,
};

const MIC_NAME = {
  XNAS: 'NASDAQ', XNYS: 'NYSE', ARCX: 'NYSE Arca', XASE: 'NYSE American', BATS: 'Cboe',
  XETR: 'Xetra', XFRA: 'Frankfurt', XWBO: 'Wien', XLON: 'London', XPAR: 'Paris', XAMS: 'Amsterdam',
  XSWX: 'SIX Swiss', XMIL: 'Mailand', XMAD: 'Madrid', XSTO: 'Stockholm', XTSE: 'Toronto',
};
const COUNTRY_DE = {
  'United States': 'USA', Germany: 'Deutschland', Austria: 'Österreich', 'United Kingdom': 'UK',
  France: 'Frankreich', Netherlands: 'Niederlande', Switzerland: 'Schweiz', Italy: 'Italien',
  Spain: 'Spanien', Sweden: 'Schweden', Canada: 'Kanada',
};

export function keyFor(symbol, mic) {
  const s = String(symbol || '').toUpperCase();
  return !mic || US_MICS.has(mic) ? s : `${s}@${mic}`;
}

export function splitKey(key) {
  const [symbol, mic] = String(key).split('@');
  return { symbol, mic: mic || null };
}

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9. ]+/g, ' ')
  .trim();

export function createDirectory({ loader, store = null, log = console, refreshHours = 24 }) {
  let entries = [];   // { key, symbol, name, exchange, mic, country, type, _s, _n }
  let loadedAt = 0;
  let loading = null;

  function build(raw) {
    const seen = new Set();
    const next = [];
    for (const r of raw) {
      if (!r?.symbol || !r?.name) continue;
      const key = keyFor(r.symbol, r.mic);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({
        key,
        symbol: String(r.symbol).toUpperCase(),
        name: String(r.name),
        exchange: MIC_NAME[r.mic] || r.exchange || r.mic || '',
        mic: r.mic || '',
        country: COUNTRY_DE[r.country] || r.country || '',
        type: r.type || '',
        _s: String(r.symbol).toLowerCase(),
        _n: norm(r.name),
        _r: (MIC_RANK[r.mic] || 1) + (/etf|fund/i.test(r.type || '') ? 0 : 1),
      });
    }
    return next;
  }

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const raw = await loader();
        const next = build(raw);
        if (next.length) {
          entries = next;
          loadedAt = Date.now();
          log.info?.(`Symbolverzeichnis geladen: ${next.length} Einträge`);
          if (store) {
            await store.save('directory', [{ key: 'all', at: loadedAt, value: raw }])
              .catch((err) => log.warn?.('Verzeichnis speichern:', err.message));
          }
        }
      } catch (err) {
        log.error?.('Symbolverzeichnis konnte nicht geladen werden:', err.message);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function ensureFresh() {
    if (!loadedAt || Date.now() - loadedAt > refreshHours * 3600 * 1000) refresh();
  }

  function score(e, q, words) {
    let s = 0;
    if (e._s === q) s = 1000;
    else if (e._s.startsWith(q)) s = 700 - (e._s.length - q.length) * 5;
    else if (e._n === q) s = 650;
    else if (e._n.startsWith(q)) s = 600;
    else if (words.every((w) => e._n.split(' ').some((p) => p.startsWith(w)))) s = 400;
    else if (q.length >= 3 && e._n.includes(q)) s = 200;
    else return 0;
    return s + e._r * 10;
  }

  /** Gespeichertes Verzeichnis laden; nur neu abrufen, wenn keins da oder zu alt. */
  async function init() {
    if (store) {
      try {
        const [row] = await store.load('directory', refreshHours * 3600 * 7);
        if (row?.value?.length) {
          entries = build(row.value);
          loadedAt = row.at;
          log.info?.(`Symbolverzeichnis aus Cache: ${entries.length} Einträge`);
        }
      } catch (err) {
        log.warn?.('Verzeichnis laden:', err.message);
      }
    }
    if (!loadedAt || Date.now() - loadedAt > refreshHours * 3600 * 1000) refresh();
  }

  return {
    init,
    refresh,
    get size() { return entries.length; },
    get loadedAt() { return loadedAt; },

    search(query, limit = 12) {
      ensureFresh();
      const q = norm(query);
      if (q.length < 1) return [];
      const words = q.split(' ').filter(Boolean);
      const hits = [];
      for (const e of entries) {
        const s = score(e, q, words);
        if (s > 0) hits.push([s, e]);
      }
      hits.sort((a, b) => b[0] - a[0] || a[1].symbol.length - b[1].symbol.length);
      return hits.slice(0, limit).map(([, e]) => ({
        key: e.key, symbol: e.symbol, name: e.name, exchange: e.exchange,
        mic: e.mic, country: e.country, type: e.type,
      }));
    },

    lookup(key) {
      return entries.find((e) => e.key === key) || null;
    },
  };
}
