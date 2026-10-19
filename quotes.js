// Kurs-Cache: Alle Uhren teilen sich einen Abruf pro Symbol und Cache-Fenster.
// Das spart API-Credits beim Datenanbieter – entscheidend für die Kosten.

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-:/]{0,19}$/;

export function parseSymbols(raw, max) {
  const seen = new Set();
  for (const part of String(raw || '').toUpperCase().split(/[,;\s]+/)) {
    if (part && SYMBOL_RE.test(part)) seen.add(part);
    if (seen.size >= max) break;
  }
  return [...seen];
}

export function createQuoteCache({ provider, cacheSeconds, maxEntries = 5000 }) {
  const cache = new Map();    // symbol -> { at, quote | null }
  const inflight = new Map(); // symbol -> Promise<map>

  function fetchBatch(symbols) {
    const promise = provider
      .fetchQuotes(symbols)
      .then((map) => {
        const at = Date.now();
        if (cache.size > maxEntries) cache.clear();
        for (const s of symbols) cache.set(s, { at, quote: map[s] || null });
        return map;
      })
      .finally(() => {
        for (const s of symbols) if (inflight.get(s) === promise) inflight.delete(s);
      });
    for (const s of symbols) inflight.set(s, promise);
    return promise;
  }

  return {
    source: provider.name,

    /** Liefert { SYMBOL: [...] }. Bei Anbieterfehler: alte Werte, sonst Exception. */
    async get(symbols) {
      const now = Date.now();
      const result = {};
      const stale = [];
      for (const s of symbols) {
        const hit = cache.get(s);
        if (hit && now - hit.at < cacheSeconds * 1000) {
          if (hit.quote) result[s] = hit.quote;
        } else {
          stale.push(s);
        }
      }
      if (stale.length === 0) return result;

      const toFetch = stale.filter((s) => !inflight.has(s));
      if (toFetch.length) fetchBatch(toFetch).catch(() => {});
      const waits = new Map(stale.map((s) => [s, inflight.get(s)]));

      let failures = 0;
      let lastError;
      for (const s of stale) {
        try {
          const map = await waits.get(s);
          if (map[s]) result[s] = map[s];
        } catch (err) {
          lastError = err;
          const old = cache.get(s);
          if (old?.quote) result[s] = old.quote;
          else failures++;
        }
      }
      if (lastError && failures === stale.length && Object.keys(result).length === 0) throw lastError;
      return result;
    },
  };
}
