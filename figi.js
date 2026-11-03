// Kürzel zu einer ISIN über OpenFIGI (gratis, ohne Schlüssel: 25 Anfragen/Minute à 10 Werte)
//
// US-ISIN -> US-Kürzel (NVDA), sonst Xetra (SAP, EUNL), sonst Frankfurt. Ergebnisse werden
// dauerhaft gemerkt (Speicher + Postgres), eine ISIN wird also nur einmal nachgeschlagen.

const URL_MAPPING = 'https://api.openfigi.com/v3/mapping';

export function createFigi({ fetchImpl = fetch, store = null, apiKey = '', log = console } = {}) {
  const known = new Map(); // isin -> { ticker, name, exch } | null
  let blockedUntil = 0;
  let loaded = null;

  async function load() {
    if (!store || loaded) return loaded;
    loaded = store.load('figi', 3650 * 86400).then((rows) => {
      for (const r of rows) if (!known.has(r.key)) known.set(r.key, r.value);
    }).catch((err) => log.warn?.('FIGI laden:', err.message));
    return loaded;
  }

  async function ask(jobs) {
    if (Date.now() < blockedUntil) throw new Error('OpenFIGI pausiert (Limit)');
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-OPENFIGI-APIKEY'] = apiKey;
    const res = await fetchImpl(URL_MAPPING, {
      method: 'POST', headers, body: JSON.stringify(jobs), signal: AbortSignal.timeout(6000),
    });
    if (res.status === 429) { blockedUntil = Date.now() + 60000; throw new Error('OpenFIGI Limit'); }
    if (!res.ok) throw new Error(`OpenFIGI HTTP ${res.status}`);
    return res.json();
  }

  /** { ISIN: { ticker, name, exch } } für alle ISINs, die sich auflösen lassen */
  async function tickers(isins) {
    await load();
    const want = [...new Set(isins)].filter((i) => !known.has(i));
    const save = [];
    for (const exchFor of [(i) => (i.startsWith('US') ? 'US' : 'GY'), () => 'GR']) {
      const todo = want.filter((i) => !known.get(i));
      for (let n = 0; n < todo.length; n += 10) {
        const chunk = todo.slice(n, n + 10);
        let body;
        try {
          body = await ask(chunk.map((i) => ({ idType: 'ID_ISIN', idValue: i, exchCode: exchFor(i) })));
        } catch (err) {
          log.warn?.('OpenFIGI:', err.message);
          return pick(isins);
        }
        chunk.forEach((isin, k) => {
          const d = body?.[k]?.data?.[0];
          if (d?.ticker) {
            const v = { ticker: String(d.ticker).toUpperCase(), name: String(d.name || ''), exch: d.exchCode || '' };
            known.set(isin, v);
            save.push({ key: isin, at: Date.now(), value: v });
          }
        });
      }
    }
    for (const i of want) if (!known.has(i)) known.set(i, null);
    if (store && save.length) store.save('figi', save).catch(() => {});
    return pick(isins);
  }

  const pick = (isins) => Object.fromEntries(isins.filter((i) => known.get(i)).map((i) => [i, known.get(i)]));

  return { tickers, get: (isin) => known.get(isin) || null };
}
