// Cache zwischen Uhren und Datenanbieter.
//
//  - frisch (jünger als cacheSeconds): direkt aus dem Cache
//  - abgelaufen, aber jünger als staleSeconds: sofort den alten Wert liefern und im
//    Hintergrund nachladen ("stale-while-revalidate") – die Uhr wartet nie auf den Anbieter
//  - unbekannt: einmal abrufen (parallele Anfragen teilen sich denselben Abruf)
//  - Vorwärmer: was in den letzten warmWindowSeconds gefragt wurde, wird regelmäßig
//    gesammelt aufgefrischt
//  - optional dauerhaft in Postgres (übersteht Deploys/Neustarts)
//  - der Credit-Verbrauch wird zentral über ein Budget begrenzt (siehe createBudget)

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-:/]{0,19}(@[A-Z0-9]{3,5})?$/;

export function parseSymbols(raw, max) {
  const seen = new Set();
  for (const part of String(raw || '').toUpperCase().split(/[,;\s]+/)) {
    if (part && SYMBOL_RE.test(part)) seen.add(part);
    if (seen.size >= max) break;
  }
  return [...seen];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BudgetError extends Error {}

/**
 * Credit-Budget beim Datenanbieter: pro Minute (gleitendes Fenster) und pro Tag (UTC).
 * acquire(n) wartet höchstens maxWaitMs auf freie Minuten-Credits; reserve hält
 * Minuten-Credits, dayReserve Tages-Credits für dringende Abrufe (Kurse) frei.
 */
export function createBudget({ perMinute = 8, perDay = 0, now = () => Date.now() } = {}) {
  const spent = []; // [timestamp, credits]
  let day = '';
  let dayUsed = 0;
  const used = () => {
    const t = now() - 60000;
    while (spent.length && spent[0][0] <= t) spent.shift();
    return spent.reduce((a, [, c]) => a + c, 0);
  };
  const today = () => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { day = d; dayUsed = 0; }
    return dayUsed;
  };
  return {
    perMinute,
    perDay,
    available: () => (perMinute > 0 ? Math.max(0, perMinute - used()) : Infinity),
    dayLeft: () => (perDay > 0 ? Math.max(0, perDay - today()) : Infinity),
    stats: () => ({ minute: used(), day: today(), perMinute, perDay }),
    async acquire(n, { maxWaitMs = 0, reserve = 0, dayReserve = 0 } = {}) {
      if (perDay > 0 && today() + n > perDay - dayReserve) {
        throw new BudgetError('Tages-Budget erschöpft');
      }
      if (perMinute > 0) {
        if (n > perMinute) n = perMinute; // große Batches nicht für immer blockieren
        const deadline = now() + maxWaitMs;
        for (;;) {
          if (perMinute - used() - reserve >= n) break;
          if (now() >= deadline) throw new BudgetError('Credit-Budget erschöpft');
          await sleep(Math.min(1000, Math.max(50, deadline - now())));
        }
        spent.push([now(), n]);
      }
      if (perDay > 0) { today(); dayUsed += n; }
    },
  };
}

export function createQuoteCache({
  provider,
  cacheSeconds,
  staleSeconds = 6 * 3600,
  method = 'fetchQuotes',
  kind = method,
  store = null,              // { load(kind) -> [{key, at, value}], save(kind, entries) }
  warmWindowSeconds = 600,
  maxBatch = 8,
  maxEntries = 5000,
  missSeconds = 120,         // "keine Daten" nur kurz merken
  isFresh = null,            // optional (key, at, now) -> bool, ersetzt cacheSeconds
  log = console,
}) {
  const fresh = (k, hit, now) => {
    if (!hit) return false;
    if (!hit.value) return now - hit.at < missSeconds * 1000;
    if (isFresh) return isFresh(k, hit.at, now);
    return now - hit.at < cacheSeconds * 1000;
  };
  const cache = new Map();    // key -> { at, value | null }
  const asked = new Map();    // key -> zuletzt von einer Uhr gefragt
  const inflight = new Map(); // key -> Promise<map>
  let timer = null;

  function remember(map, keys) {
    const at = Date.now();
    if (cache.size > maxEntries) {
      // älteste Hälfte verwerfen statt alles
      [...cache.entries()].sort((a, b) => a[1].at - b[1].at)
        .slice(0, Math.floor(maxEntries / 2)).forEach(([k]) => cache.delete(k));
    }
    const rows = [];
    for (const k of keys) {
      const value = map[k] || null;
      cache.set(k, { at, value });
      if (value) rows.push({ key: k, at, value });
    }
    if (store && rows.length) store.save(kind, rows).catch((err) => log.warn?.('Cache speichern:', err.message));
  }

  function fetchBatch(keys) {
    const promise = Promise.resolve(provider[method](keys))
      .then((map) => { remember(map, keys); return map; })
      .finally(() => {
        for (const k of keys) if (inflight.get(k) === promise) inflight.delete(k);
      });
    for (const k of keys) inflight.set(k, promise);
    return promise;
  }

  function refreshInBackground(keys) {
    const todo = keys.filter((k) => !inflight.has(k));
    for (let i = 0; i < todo.length; i += maxBatch) {
      fetchBatch(todo.slice(i, i + maxBatch)).catch(() => {});
    }
  }

  const api = {
    source: provider.name,

    /** Gespeicherte Werte aus Postgres laden (beim Start). */
    async load() {
      if (!store) return 0;
      const rows = await store.load(kind, staleSeconds);
      for (const r of rows) {
        const old = cache.get(r.key);
        if (!old || old.at < r.at) cache.set(r.key, { at: r.at, value: r.value });
      }
      return rows.length;
    },

    /** Liefert { KEY: value }. Bei Anbieterfehler: alte Werte, sonst Exception. */
    async get(keys) {
      const now = Date.now();
      const result = {};
      const missing = [];
      const stale = [];
      for (const k of keys) {
        asked.set(k, now);
        const hit = cache.get(k);
        const age = hit ? now - hit.at : Infinity;
        if (fresh(k, hit, now)) {
          if (hit.value) result[k] = hit.value;
        } else if (hit?.value && age < staleSeconds * 1000) {
          result[k] = hit.value;   // sofort liefern …
          stale.push(k);           // … und im Hintergrund erneuern
        } else {
          missing.push(k);
        }
      }
      if (stale.length) refreshInBackground(stale);
      if (missing.length === 0) return result;

      const toFetch = missing.filter((k) => !inflight.has(k));
      for (let i = 0; i < toFetch.length; i += maxBatch) {
        fetchBatch(toFetch.slice(i, i + maxBatch)).catch(() => {});
      }
      // Promises vorher festhalten: ein fertiger Abruf trägt sich aus "inflight" aus
      const waits = new Map(missing.map((k) => [k, inflight.get(k)]));
      let failures = 0;
      let lastError;
      for (const k of missing) {
        try {
          const map = await waits.get(k);
          if (map?.[k]) result[k] = map[k];
        } catch (err) {
          lastError = err;
          const old = cache.get(k);
          if (old?.value) result[k] = old.value;
          else failures++;
        }
      }
      if (lastError && failures === missing.length && Object.keys(result).length === 0) throw lastError;
      return result;
    },

    /** Kürzlich gefragte, abgelaufene Werte gesammelt auffrischen. */
    warm() {
      const now = Date.now();
      const due = [];
      for (const [k, t] of asked) {
        if (now - t > warmWindowSeconds * 1000) { asked.delete(k); continue; }
        const hit = cache.get(k);
        if (!fresh(k, hit, now)) due.push(k);
      }
      if (due.length) refreshInBackground(due);
      return due.length;
    },

    start(intervalSeconds = cacheSeconds) {
      if (timer || !(intervalSeconds > 0)) return;
      timer = setInterval(() => api.warm(), intervalSeconds * 1000);
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },

    stats() {
      return { entries: cache.size, watched: asked.size, inflight: inflight.size };
    },
  };
  return api;
}
