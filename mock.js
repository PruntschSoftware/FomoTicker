// Spieldaten für lokale Tests und den Garmin-Simulator (QUOTE_PROVIDER=mock).
// Symbole, die mit "ZZ" beginnen, gelten als unbekannt.

function seed(symbol) {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function createMock() {
  return {
    name: 'Testdaten',
    async fetchQuotes(symbols) {
      const out = {};
      const minute = Math.floor(Date.now() / 60000);
      for (const symbol of symbols) {
        if (symbol.startsWith('ZZ')) continue;
        const s = seed(symbol);
        const prev = 20 + (s % 480) + (s % 100) / 100;
        const pct = (((s + minute) % 700) - 350) / 100;
        const price = prev * (1 + pct / 100);
        const r = (n) => Math.round(n * 100) / 100;
        out[symbol] = [
          r(price), r(price - prev), r(pct),
          r(prev * 1.002), r(Math.max(price, prev) * 1.01), r(Math.min(price, prev) * 0.99), r(prev),
        ];
      }
      return out;
    },
  };
}
