// Twelve Data: GET /quote?symbol=AAPL,MSFT&apikey=...
// Mehrere Symbole -> { "AAPL": {...}, "MSFT": {...} }, ein Symbol -> {...}
// Zahlen kommen als Strings. Je Symbol wird 1 API-Credit verbraucht.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => Math.round(n * 10000) / 10000;

export function createTwelveData({ apiKey, baseUrl }) {
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY fehlt');

  return {
    name: 'Twelve Data',

    async fetchQuotes(symbols) {
      const url = new URL('/quote', baseUrl);
      url.searchParams.set('symbol', symbols.join(','));
      url.searchParams.set('apikey', apiKey);

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
      const body = await res.json();

      // Fehler für die ganze Anfrage (Limit, Key ungültig ...) – "Symbol unbekannt"
      // bei einem einzelnen Symbol ist dagegen kein Fehler, nur keine Daten.
      if (body && body.status === 'error') {
        const symbolNotFound = symbols.length === 1 && (body.code === 400 || body.code === 404);
        if (!symbolNotFound) throw new Error(`Twelve Data: ${body.code} ${body.message}`);
        return {};
      }

      const bySymbol = symbols.length === 1 ? { [symbols[0]]: body } : body;
      const out = {};
      for (const symbol of symbols) {
        const item = bySymbol?.[symbol];
        if (!item || item.status === 'error') continue;
        const price = num(item.close);
        if (!(price > 0)) continue;
        out[symbol] = [
          price,
          num(item.change),
          num(item.percent_change),
          num(item.open),
          num(item.high),
          num(item.low),
          num(item.previous_close),
        ].map(round);
      }
      return out;
    },
  };
}
