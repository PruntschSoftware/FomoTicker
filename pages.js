// Schlichte, mobilfreundliche HTML-Seiten für die Aktivierung.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(cfg, title, body) {
  const links = [
    cfg.legal.imprintUrl && `<a href="${esc(cfg.legal.imprintUrl)}">Impressum</a>`,
    cfg.legal.privacyUrl && `<a href="${esc(cfg.legal.privacyUrl)}">Datenschutz</a>`,
    cfg.legal.termsUrl && `<a href="${esc(cfg.legal.termsUrl)}">AGB &amp; Widerruf</a>`,
  ].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – ${esc(cfg.appName)}</title>
<style>
  :root { --bg:#0e1116; --card:#171b22; --text:#e8ecf1; --muted:#8b95a3; --accent:#2ecc71; --err:#ff6b5b; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px 16px;
         background:var(--bg); color:var(--text); font:16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  main { width:100%; max-width:420px; background:var(--card); border-radius:16px; padding:28px 24px; }
  h1 { margin:0 0 6px; font-size:22px; }
  p { margin:0 0 16px; color:var(--muted); }
  .price { color:var(--accent); font-weight:600; }
  label { display:block; font-size:14px; color:var(--muted); margin-bottom:6px; }
  input { width:100%; padding:14px; font-size:24px; letter-spacing:.3em; text-align:center; text-transform:uppercase;
          border-radius:10px; border:1px solid #2a313c; background:#0e1116; color:var(--text); }
  button, .btn { display:block; width:100%; margin-top:14px; padding:14px; border:0; border-radius:10px; text-align:center;
          background:var(--accent); color:#06210f; font-weight:700; font-size:16px; text-decoration:none; cursor:pointer; }
  .btn.secondary { background:#2a313c; color:var(--text); }
  .msg { padding:12px 14px; border-radius:10px; margin-bottom:16px; background:#2a1716; color:var(--err); }
  .ok { background:#12261a; color:var(--accent); }
  footer { margin-top:20px; font-size:13px; color:var(--muted); text-align:center; }
  footer a { color:var(--muted); }
</style>
</head>
<body><main>${body}${links ? `<footer>${links}</footer>` : ''}</main></body>
</html>`;
}

export function activatePage(cfg, { code = '', error = '' } = {}) {
  return layout(cfg, 'Aktivieren', `
    <h1>${esc(cfg.appName)} aktivieren</h1>
    <p>Gib den Code ein, den deine Uhr anzeigt. Abo: <span class="price">${esc(cfg.priceLabel)}</span>, jederzeit kündbar.</p>
    ${error ? `<div class="msg">${esc(error)}</div>` : ''}
    <form method="post" action="/activate">
      <label for="code">Code von der Uhr</label>
      <input id="code" name="code" value="${esc(code)}" maxlength="6" autocomplete="off" autocapitalize="characters" required>
      <button type="submit">Weiter zur Zahlung</button>
    </form>
    ${cfg.stripe.portalUrl ? `<a class="btn secondary" href="${esc(cfg.stripe.portalUrl)}">Abo verwalten / kündigen</a>` : ''}
  `);
}

export function freePage(cfg) {
  return layout(cfg, 'Kostenlos', `
    <h1>${esc(cfg.appName)}</h1>
    <div class="msg ok">Die App ist aktuell kostenlos – du musst nichts aktivieren.</div>
    <p>Installiere sie im Connect IQ Store und stelle deine Symbole in der Garmin-Connect-App ein.</p>
  `);
}

export function alreadyActivePage(cfg) {
  return layout(cfg, 'Bereits aktiv', `
    <h1>Schon aktiv ✓</h1>
    <div class="msg ok">Für diese Uhr läuft bereits ein Abo.</div>
    ${cfg.stripe.portalUrl ? `<a class="btn secondary" href="${esc(cfg.stripe.portalUrl)}">Abo verwalten / kündigen</a>` : ''}
  `);
}

export function successPage(cfg) {
  return layout(cfg, 'Danke', `
    <h1>Danke! 🎉</h1>
    <div class="msg ok">Dein Abo ist aktiv.</div>
    <p>Öffne die App auf der Uhr erneut – die Kurse erscheinen beim nächsten Abruf.</p>
  `);
}

export function errorPage(cfg, message) {
  return layout(cfg, 'Fehler', `
    <h1>Hoppla</h1>
    <div class="msg">${esc(message)}</div>
    <a class="btn secondary" href="/">Zurück</a>
  `);
}

// ---- Watchlist ---------------------------------------------------------------

export function watchlistCodePage(cfg, { code = '', error = '' } = {}) {
  return layout(cfg, 'Watchlist', `
    <h1>Watchlist bearbeiten</h1>
    <p>Gib den Code ein, den deine Uhr unter <b>Menü → Aktien wählen</b> zeigt.</p>
    ${error ? `<div class="msg">${esc(error)}</div>` : ''}
    <form method="get" action="/w" onsubmit="event.preventDefault();var c=this.code.value.trim().toUpperCase();if(c.length===6)location.href='/w/'+c;">
      <label for="code">Code von der Uhr</label>
      <input id="code" name="code" value="${esc(code)}" maxlength="6" autocomplete="off" autocapitalize="characters" required autofocus>
      <button type="submit">Weiter</button>
    </form>
  `);
}

export function watchlistPage(cfg, { code, max }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0e13">
<title>Watchlist – ${esc(cfg.appName)}</title>
<style>
  :root {
    --bg:#0b0e13; --panel:#141922; --panel2:#1b212c; --line:#262e3b;
    --text:#eef2f6; --muted:#8a94a6; --faint:#5b6577;
    --up:#2ee59d; --down:#ff5f6d; --accent:#2ee59d; --focus:#5aa9ff;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { margin:0; background:var(--bg); color:var(--text);
    font:16px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:20px 16px calc(28px + env(safe-area-inset-bottom)); }
  header { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin:4px 0 18px; }
  h1 { font-size:24px; margin:0; letter-spacing:-.01em; }
  .code { font:600 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--muted);
    background:var(--panel); border:1px solid var(--line); padding:6px 8px; border-radius:8px; letter-spacing:.12em; }

  .search { position:relative; }
  .field { display:flex; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line);
    border-radius:14px; padding:0 14px; transition:border-color .15s; }
  .field:focus-within { border-color:var(--focus); }
  .field svg { flex:none; color:var(--muted); }
  #q { flex:1; min-width:0; border:0; outline:0; background:transparent; color:var(--text);
    font-size:17px; padding:15px 0; }
  #q::placeholder { color:var(--faint); }
  .hint { font-size:13px; color:var(--faint); margin:8px 2px 0; min-height:18px; }

  .results { list-style:none; overflow-x:hidden; margin:8px 0 0; padding:6px; background:var(--panel); border:1px solid var(--line);
    border-radius:14px; display:none; max-height:56vh; overflow:auto; }
  .results.open { display:block; }
  .res { display:flex; align-items:center; gap:12px; padding:10px; border-radius:10px; cursor:pointer; }
  .res[aria-selected="true"], .res:hover { background:var(--panel2); }
  .res .sym { font-weight:700; min-width:64px; font-variant-numeric:tabular-nums; }
  .res .meta { flex:1; min-width:0; }
  .res .name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .res .sub { font-size:12.5px; color:var(--muted); }
  .res mark { background:none; color:var(--accent); }
  .res .add { flex:none; width:30px; height:30px; border-radius:50%; display:grid; place-items:center;
    background:var(--panel2); color:var(--accent); font-size:20px; line-height:1; }
  .res.in .add { color:var(--muted); }
  .empty { padding:12px; color:var(--muted); font-size:14px; }

  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:28px 2px 10px;
    display:flex; justify-content:space-between; }
  .list { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:minmax(0,1fr); gap:8px; }
  .item { display:flex; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line);
    border-radius:14px; padding:10px 10px 10px 8px; touch-action:none; user-select:none; }
  .item.drag { opacity:.92; border-color:var(--focus); box-shadow:0 10px 30px rgba(0,0,0,.45); position:relative; z-index:2; }
  .grip { flex:none; width:28px; height:40px; display:grid; place-items:center; color:var(--faint); cursor:grab; }
  .item .meta { flex:1; min-width:0; }
  .item .sym { font-weight:700; }
  .item .name { font-size:13.5px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .icon { flex:none; width:38px; height:38px; border:0; border-radius:10px; background:transparent; color:var(--muted);
    display:grid; place-items:center; cursor:pointer; }
  .icon:hover { background:var(--panel2); color:var(--text); }
  .icon:disabled { opacity:.25; cursor:default; }
  .placeholder { border:1px dashed var(--line); border-radius:14px; padding:22px; text-align:center; color:var(--faint); }

  .toast { position:fixed; left:50%; bottom:calc(20px + env(safe-area-inset-bottom)); transform:translateX(-50%) translateY(20px);
    background:var(--panel2); border:1px solid var(--line); color:var(--text); padding:10px 16px; border-radius:999px;
    font-size:14px; opacity:0; transition:.2s; pointer-events:none; white-space:nowrap; }
  .toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
  .toast.ok b { color:var(--up); } .toast.err b { color:var(--down); }
  .foot { margin-top:22px; font-size:13px; color:var(--faint); text-align:center; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Watchlist</h1>
    <span class="code" title="Code deiner Uhr">${esc(code)}</span>
  </header>

  <div class="search">
    <label class="field" for="q">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="Aktie oder ETF suchen …" autocomplete="off" autocorrect="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-controls="results" aria-autocomplete="list">
    </label>
    <ul id="results" class="results" role="listbox"></ul>
    <div id="hint" class="hint">Name oder Kürzel – z. B. Apple, SAP, MSCI World</div>
  </div>

  <h2><span>Auf deiner Uhr</span><span id="count"></span></h2>
  <ul id="list" class="list"></ul>
  <div class="foot">Änderungen werden sofort gespeichert. Die Uhr übernimmt sie beim nächsten Aktualisieren.</div>
</div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>

<script>
(() => {
  const CODE = ${JSON.stringify(code)};
  const MAX = ${Number(max) || 10};
  const $ = (id) => document.getElementById(id);
  const q = $('q'), results = $('results'), list = $('list'), hint = $('hint'), count = $('count'), toast = $('toast');
  let items = [];
  let hits = [];
  let sel = -1;
  let seq = 0;
  let timer;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mark = (text, query) => {
    const t = esc(text); const w = query.trim().split(/\\s+/).filter(Boolean).map((x) => x.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'));
    return w.length ? t.replace(new RegExp('(' + w.join('|') + ')', 'ig'), '<mark>$1</mark>') : t;
  };
  const exLabel = (r) => [r.exchange, r.country].filter(Boolean).join(' · ');

  function showToast(html, kind) {
    toast.className = 'toast show ' + (kind || '');
    toast.innerHTML = html;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => { toast.className = 'toast'; }, 1800);
  }

  async function save() {
    try {
      const r = await fetch('/api/watchlist/' + CODE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      if (!r.ok) throw new Error(r.status);
      showToast('<b>✓</b> Gespeichert', 'ok');
    } catch {
      showToast('<b>!</b> Speichern fehlgeschlagen', 'err');
    }
  }

  function renderList() {
    count.textContent = items.length + ' / ' + MAX;
    if (!items.length) {
      list.innerHTML = '<li class="placeholder">Noch leer – such oben nach deinen Werten.</li>';
      return;
    }
    list.innerHTML = items.map((it, i) => \`
      <li class="item" data-i="\${i}">
        <span class="grip" aria-hidden="true"><svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></svg></span>
        <div class="meta"><div class="sym">\${esc(it.s)}</div><div class="name">\${esc(it.n || '')}\${it.x ? ' · ' + esc(it.x) : ''}</div></div>
        <button class="icon" data-act="up" aria-label="Nach oben" \${i === 0 ? 'disabled' : ''}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 15 6-6 6 6"/></svg></button>
        <button class="icon" data-act="down" aria-label="Nach unten" \${i === items.length - 1 ? 'disabled' : ''}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></button>
        <button class="icon" data-act="del" aria-label="Entfernen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>\`).join('');
  }

  function renderResults() {
    const open = q.value.trim().length > 0;
    results.classList.toggle('open', open);
    q.setAttribute('aria-expanded', String(open));
    if (!open) return;
    if (!hits.length) { results.innerHTML = '<li class="empty">Keine Treffer</li>'; return; }
    const keys = new Set(items.map((x) => x.k));
    results.innerHTML = hits.map((r, i) => \`
      <li class="res\${keys.has(r.key) ? ' in' : ''}" role="option" id="opt\${i}" aria-selected="\${i === sel}" data-i="\${i}">
        <span class="sym">\${mark(r.symbol, q.value)}</span>
        <span class="meta"><div class="name">\${mark(r.name, q.value)}</div><div class="sub">\${esc(exLabel(r))}\${r.type && /etf/i.test(r.type) ? ' · ETF' : ''}</div></span>
        <span class="add" aria-hidden="true">\${keys.has(r.key) ? '✓' : '+'}</span>
      </li>\`).join('');
    if (sel >= 0) q.setAttribute('aria-activedescendant', 'opt' + sel); else q.removeAttribute('aria-activedescendant');
  }

  async function search() {
    const term = q.value.trim();
    const my = ++seq;
    if (!term) { hits = []; sel = -1; renderResults(); hint.textContent = 'Name oder Kürzel – z. B. Apple, SAP, MSCI World'; return; }
    try {
      const r = await fetch('/api/search?q=' + encodeURIComponent(term));
      const data = await r.json();
      if (my !== seq) return;
      hits = data.results || [];
      sel = hits.length ? 0 : -1;
      hint.textContent = data.ready ? '' : 'Verzeichnis wird gerade geladen – Ergebnisse folgen in Kürze.';
      renderResults();
    } catch { if (my === seq) hint.textContent = 'Suche gerade nicht erreichbar.'; }
  }

  function add(r) {
    if (items.some((x) => x.k === r.key)) { showToast(esc(r.symbol) + ' ist schon drin'); return; }
    if (items.length >= MAX) { showToast('<b>!</b> Maximal ' + MAX + ' Werte', 'err'); return; }
    items.push({ k: r.key, s: r.symbol, n: r.name, x: r.exchange });
    renderList(); renderResults(); save();
    q.value = ''; hits = []; sel = -1; renderResults(); q.focus();
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 120); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; renderResults(); }
    else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); sel = (sel - 1 + hits.length) % hits.length; renderResults(); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); add(hits[sel]); }
    else if (e.key === 'Escape') { q.value = ''; search(); }
  });
  results.addEventListener('mousedown', (e) => e.preventDefault());
  results.addEventListener('click', (e) => { const li = e.target.closest('.res'); if (li) add(hits[+li.dataset.i]); });

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('.item').dataset.i;
    if (b.dataset.act === 'del') { const [r] = items.splice(i, 1); showToast(esc(r.s) + ' entfernt'); }
    if (b.dataset.act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (b.dataset.act === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    renderList(); save();
  });

  // Ziehen zum Sortieren (Maus + Touch) über den Griff
  let drag = null;
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip'); if (!grip) return;
    const li = grip.closest('.item');
    drag = { li, from: +li.dataset.i, y0: e.clientY, h: li.offsetHeight + 8 };
    li.classList.add('drag'); li.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    drag.li.style.transform = 'translateY(' + dy + 'px)';
    drag.to = Math.max(0, Math.min(items.length - 1, drag.from + Math.round(dy / drag.h)));
  });
  const end = () => {
    if (!drag) return;
    const { from, to } = drag; drag.li.style.transform = ''; drag = null;
    if (to !== undefined && to !== from) { const [m] = items.splice(from, 1); items.splice(to, 0, m); renderList(); save(); }
    else renderList();
  };
  list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);

  fetch('/api/watchlist/' + CODE).then((r) => r.json()).then((d) => { items = d.items || []; renderList(); })
    .catch(() => { renderList(); showToast('<b>!</b> Laden fehlgeschlagen', 'err'); });
  renderList();
})();
</script>
</body>
</html>`;
}
