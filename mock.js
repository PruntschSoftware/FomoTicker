// Spieldaten für lokale Tests und den Garmin-Simulator (QUOTE_PROVIDER=mock).
// Symbole, die mit "ZZ" beginnen, gelten als unbekannt.

import { usSession } from './market.js';

function seed(symbol) {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function createMock() {
  return {
    name: 'Testdaten',
    configured: true,
    extendedHours: true,
    mics: new Set(['XETR', 'XWBO']),
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
          (MOCK_DIRECTORY.find((d) => d[0] === symbol.split('@')[0]) || [])[1] || '',
          0, 0, '',
        ];
        const sess = usSession();
        if (!symbol.includes('@') && (sess === 'pre' || sess === 'post')) {
          const ep = (((s >> 3) + minute) % 300 - 150) / 100;
          out[symbol][8] = r(price * (1 + ep / 100));
          out[symbol][9] = r(ep);
          out[symbol][10] = sess;
        }
      }
      return out;
    },

    // Zufallspfad (deterministisch je Symbol und Viertelstunde) von Vortag zu aktuellem Kurs
    async fetchSeries(symbols) {
      const quotes = await this.fetchQuotes(symbols);
      const out = {};
      for (const s of Object.keys(quotes)) {
        const [price, , , , , , prev] = quotes[s];
        let h = seed(s) + Math.floor(Date.now() / 900000);
        const n = 28;
        const vals = [];
        let drift = 0;
        for (let i = 0; i < n; i++) {
          h = (h * 1103515245 + 12345) >>> 0;
          drift += ((h % 1000) / 1000 - 0.5) * 0.006;
          const t = i / (n - 1);
          vals.push(Math.round((prev + (price - prev) * t) * (1 + drift * Math.sin(Math.PI * t)) * 100) / 100);
        }
        vals[n - 1] = price;
        out[s] = vals;
      }
      return out;
    },

    async loadDirectory() {
      return MOCK_DIRECTORY.map(([symbol, name, mic, type = 'Common Stock']) => ({
        symbol, name, mic, exchange: mic, type,
        country: { XNAS: 'United States', XNYS: 'United States', ARCX: 'United States', XETR: 'Germany', XWBO: 'Austria' }[mic],
      }));
    },
  };
}

const MOCK_DIRECTORY = [
  ['AAPL', 'Apple Inc', 'XNAS'], ['MSFT', 'Microsoft Corporation', 'XNAS'],
  ['NVDA', 'NVIDIA Corporation', 'XNAS'], ['AMZN', 'Amazon.com Inc', 'XNAS'],
  ['TSLA', 'Tesla Inc', 'XNAS'], ['GOOGL', 'Alphabet Inc Class A', 'XNAS'],
  ['META', 'Meta Platforms Inc', 'XNAS'], ['AMD', 'Advanced Micro Devices Inc', 'XNAS'],
  ['KO', 'The Coca-Cola Company', 'XNYS'], ['BRK.B', 'Berkshire Hathaway Inc Class B', 'XNYS'],
  ['SPY', 'SPDR S&P 500 ETF Trust', 'ARCX', 'ETF'],
  ['SAP', 'SAP SE', 'XETR'], ['SIE', 'Siemens AG', 'XETR'], ['ALV', 'Allianz SE', 'XETR'],
  ['EUNL', 'iShares Core MSCI World UCITS ETF', 'XETR', 'ETF'],
  ['APC', 'Apple Inc', 'XETR'],
  ['VOE', 'voestalpine AG', 'XWBO'], ['OMV', 'OMV AG', 'XWBO'], ['EBS', 'Erste Group Bank AG', 'XWBO'],
];
