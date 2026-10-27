// Live-Dashboard für die Nutzungsstatistik (nur Summen). Lädt /api/stats jede Minute neu.
// Der Schlüssel kommt aus dem Link (?k=…) und wird nur an /api/stats weitergereicht.

export function statsPage({ appName = 'StockTicker' } = {}) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${appName} Statistik</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: Kopfzeile mit Live-Status, Kennzahlen-Leiste, Verlauf, dann Verteilungen im Raster */
:root {
  --bg: #f4f6f5; --panel: #ffffff; --line: #dfe5e2; --fg: #16201c; --muted: #5d6b65;
  --up: #11895a; --up-soft: rgba(17,137,90,.14); --down: #c8434f; --accent: #11895a;
  --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0b0f0d; --panel: #121815; --line: #223029; --fg: #e8efeb; --muted: #8fa39a;
    --up: #2ee59d; --up-soft: rgba(46,229,157,.14); --down: #ff5f6d; --accent: #2ee59d; color-scheme: dark; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 var(--sans); }
.wrap { max-width: 1120px; margin: 0 auto; padding-block: 28px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 20px; }
header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; }
h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
.live { font: 13px var(--mono); color: var(--muted); display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--up); box-shadow: 0 0 0 4px var(--up-soft); }
.dot.err { background: var(--down); box-shadow: none; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.kpi { background: var(--panel); padding: 14px 16px; display: grid; gap: 2px; }
.kpi .v { font: 500 28px/1.1 var(--mono); font-variant-numeric: tabular-nums; }
.kpi .l { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.kpi .s { font: 12px var(--mono); color: var(--muted); }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; }
h2 { margin: 0 0 12px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
.chart { width: 100%; height: 220px; display: block; }
.chart text { fill: var(--muted); font: 11px var(--mono); }
.bars { display: grid; gap: 8px; }
.bar { display: grid; grid-template-columns: minmax(0, 1fr) 46px; gap: 10px; align-items: center; }
.bar .name { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; min-width: 0; }
.bar .name span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .track { grid-column: 1 / -1; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-top: -4px; }
.bar .fill { height: 100%; background: var(--accent); border-radius: 3px; }
.bar .n { font: 13px var(--mono); text-align: right; font-variant-numeric: tabular-nums; }
.note { font-size: 13px; color: var(--muted); margin: 10px 0 0; }
.empty { color: var(--muted); font-size: 14px; }
dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 14px; }
dt { color: var(--muted); } dd { margin: 0; font-family: var(--mono); text-align: right; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${appName} · Nutzung</h1>
    <div class="live"><span class="dot" id="dot"></span><span id="status">lädt …</span></div>
  </header>

  <div class="kpis" id="kpis"></div>

  <section>
    <h2>Aktive echte Uhren pro Tag (UTC)</h2>
    <svg class="chart" id="chart" viewBox="0 0 800 220" role="img" aria-label="Aktive Uhren pro Tag"></svg>
    <p class="note" id="chartNote"></p>
  </section>

  <div class="grid">
    <section><h2>Uhrmodelle (aktiv 7 Tage)</h2><div class="bars" id="models"></div></section>
    <section><h2>Sprache (aktiv 30 Tage)</h2><div class="bars" id="langs"></div></section>
    <section><h2>Beliebteste Aktien</h2><div class="bars" id="syms"></div><p class="note" id="symNote"></p></section>
    <section><h2>App-Version (aktiv 30 Tage)</h2><div class="bars" id="vers"></div></section>
    <section><h2>Zusammensetzung</h2><dl id="mix"></dl></section>
  </div>
</div>
<script>
const key = new URLSearchParams(location.search).get('k') || '';
const LANG = { en: 'Englisch', de: 'Deutsch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', nl: 'Niederländisch',
  pl: 'Polnisch', pt: 'Portugiesisch', sv: 'Schwedisch', da: 'Dänisch', nb: 'Norwegisch', fi: 'Finnisch', cs: 'Tschechisch',
  hu: 'Ungarisch', ru: 'Russisch', ja: 'Japanisch', zh: 'Chinesisch', ko: 'Koreanisch', tr: 'Türkisch', el: 'Griechisch',
  hr: 'Kroatisch', sk: 'Slowakisch', sl: 'Slowenisch', ro: 'Rumänisch', uk: 'Ukrainisch', '?': 'unbekannt (App < 1.7)' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bars(el, rows, label = (k) => k) {
  if (!rows.length) { el.innerHTML = '<p class="empty">Noch keine Daten.</p>'; return; }
  const max = Math.max(...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  el.innerHTML = rows.map((r) => '<div class="bar"><div class="name"><span>' + esc(label(r.k)) + '</span><span>'
    + Math.round((r.n / total) * 100) + ' %</span></div><div class="n">' + r.n + '</div>'
    + '<div class="track"><div class="fill" style="width:' + (r.n / max) * 100 + '%"></div></div></div>').join('');
}

function chart(rows) {
  const svg = document.getElementById('chart');
  const W = Math.max(280, Math.round(svg.clientWidth || 800)), H = 220, L = 34, R = 10, T = 12, B = 26;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  if (!rows.length) { svg.innerHTML = ''; return; }
  const max = Math.max(1, ...rows.map((r) => r.active_real));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const x = (i) => L + (rows.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (rows.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  let g = '';
  for (let v = 0; v <= top; v += step) {
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"/>'
      + '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
  }
  const pts = rows.map((r, i) => x(i) + ',' + y(r.active_real)).join(' ');
  const area = x(0) + ',' + y(0) + ' ' + pts + ' ' + x(rows.length - 1) + ',' + y(0);
  const every = Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(W / 90))));
  const labels = rows.map((r, i) => (i % every === 0 || i === rows.length - 1)
    ? '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + r.day.slice(5).split('-').reverse().join('.') + '</text>' : '').join('');
  const last = rows[rows.length - 1];
  svg.innerHTML = g + '<polygon points="' + area + '" fill="var(--up-soft)"/>'
    + '<polyline points="' + pts + '" fill="none" stroke="var(--up)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>'
    + '<circle cx="' + x(rows.length - 1) + '" cy="' + y(last.active_real) + '" r="4" fill="var(--up)"/>' + labels;
  document.getElementById('chartNote').textContent = rows.length < 2
    ? 'Der Verlauf startet heute und füllt sich ab jetzt Tag für Tag.'
    : 'Heute bisher: ' + last.active_real + ' aktive Uhren, ' + last.new_real + ' neu.';
}

async function load() {
  const dot = document.getElementById('dot'), status = document.getElementById('status');
  try {
    const r = await fetch('/api/stats?k=' + encodeURIComponent(key), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'Schlüssel ungültig' : 'HTTP ' + r.status);
    const s = await r.json();
    const d = s.devices;
    document.getElementById('kpis').innerHTML = [
      ['Gerade aktiv', d.active_1h, 'in der letzten Stunde'],
      ['Aktiv 24 h', d.active_1d, 'echte Uhren'],
      ['Aktiv 7 Tage', d.active_7d, '30 Tage ' + d.active_30d],
      ['Echte Uhren', d.real, 'registriert gesamt'],
      ['Neu', d.new_7d, 'in 7 Tagen · heute ' + d.new_1d],
      ['Web-Watchlist', d.with_watchlist, 'Uhren nutzen sie'],
    ].map(([l, v, sub]) => '<div class="kpi"><span class="l">' + l + '</span><span class="v">' + v + '</span><span class="s">' + esc(sub) + '</span></div>').join('');
    last = s.daily || [];
    chart(last);
    bars(document.getElementById('models'), s.models);
    bars(document.getElementById('langs'), s.languages, (k) => LANG[k] || k);
    bars(document.getElementById('syms'), s.symbols);
    bars(document.getElementById('vers'), s.versions);
    document.getElementById('symNote').textContent = 'Gezählt seit 27.10., 15:35 – bisher ' + s.symbolsKnown + ' von ' + d.active_30d + ' aktiven Uhren. Jede Uhr kommt dazu, sobald sie die App öffnet.';
    document.getElementById('mix').innerHTML = [
      ['Registriert gesamt', d.total], ['davon echt', d.real], ['Simulator / Entwickler', d.dev], ['Test-Zugang', d.test],
      ['Ohne Modell (App < 1.5)', d.unknown], ['Nie Kurse geladen', d.never_loaded],
      ['Kursquelle', s.backend.source], ['Beobachtete Aktien (10 min)', s.backend.watched ?? '–'],
    ].map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    dot.className = 'dot';
    status.textContent = 'live · ' + new Date(s.at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    dot.className = 'dot err';
    status.textContent = 'Fehler: ' + e.message;
  }
}
let last = null;
load();
setInterval(load, 60000);
window.addEventListener('resize', () => { if (last) chart(last); });
</script>
</body>
</html>`;
}
