// Watchlist-Seite (am Handy): suchen, Handelsplatz wählen, sortieren – mit Logos und Live-Kursen.
// Sprache: Browser (Accept-Language), sonst Sprache der Uhr (ab App 1.7); de, en, fr, es, it.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const T = {
  de: {
    title: 'Watchlist', codeTitle: 'Code deiner Uhr', search: 'Aktie oder ETF suchen …',
    hint: 'Name, Kürzel, ISIN oder WKN – z. B. Apple, SAP, MSCI World',
    loadingDir: 'Verzeichnis wird gerade geladen – Ergebnisse folgen in Kürze.', offline: 'Suche gerade nicht erreichbar.',
    none: 'Keine Treffer', onWatch: 'Auf deiner Uhr', empty: 'Noch leer – such oben nach deinen Werten.',
    saved: 'Gespeichert', saveFail: 'Speichern fehlgeschlagen', loadFail: 'Laden fehlgeschlagen',
    already: 'ist schon drin', max: 'Maximal $1 Werte', removed: 'entfernt', added: 'hinzugefügt',
    foot: 'Änderungen werden sofort gespeichert. Die Uhr übernimmt sie beim nächsten Aktualisieren.',
    up: 'Nach oben', down: 'Nach unten', del: 'Entfernen', venue: 'Handelsplatz', moreEu: 'Deutsche Handelsplätze',
    searchingEu: 'Suche bei L&S und Tradegate …', noQuote: 'kein Kurs', realtime: 'Echtzeit',
    venueHelp: 'US-Börse: Kurse in US-Dollar über Alpaca. L&S und Tradegate: Kurse in Euro, wie bei deinem Broker.',
    codeIntro: 'Gib den Code ein, den deine Uhr zeigt (ganz unten in der Liste: „+ Aktien wählen“).',
    codeLabel: 'Code von der Uhr', next: 'Weiter', notFound: 'Code nicht gefunden. Bitte auf der Uhr prüfen.',
  },
  en: {
    title: 'Watchlist', codeTitle: 'Your watch code', search: 'Search stocks or ETFs …',
    hint: 'Name, ticker, ISIN or WKN – e.g. Apple, SAP, MSCI World',
    loadingDir: 'Loading the directory – results will follow shortly.', offline: 'Search is not reachable right now.',
    none: 'No results', onWatch: 'On your watch', empty: 'Empty – search above for your stocks.',
    saved: 'Saved', saveFail: 'Saving failed', loadFail: 'Loading failed',
    already: 'is already in', max: 'At most $1 stocks', removed: 'removed', added: 'added',
    foot: 'Changes are saved right away. Your watch picks them up on its next refresh.',
    up: 'Move up', down: 'Move down', del: 'Remove', venue: 'Exchange', moreEu: 'German exchanges',
    searchingEu: 'Searching L&S and Tradegate …', noQuote: 'no price', realtime: 'real-time',
    venueHelp: 'US exchange: prices in US dollars via Alpaca. L&S and Tradegate: prices in euros, as at your broker.',
    codeIntro: 'Enter the code shown on your watch (at the end of the list: “+ Choose stocks”).',
    codeLabel: 'Code from your watch', next: 'Continue', notFound: 'Code not found. Please check your watch.',
  },
  fr: {
    title: 'Watchlist', codeTitle: 'Code de votre montre', search: 'Rechercher une action ou un ETF …',
    hint: 'Nom, symbole, ISIN ou WKN – p. ex. Apple, SAP, MSCI World',
    loadingDir: 'Chargement de l’annuaire – les résultats arrivent.', offline: 'Recherche indisponible pour le moment.',
    none: 'Aucun résultat', onWatch: 'Sur votre montre', empty: 'Vide – recherchez vos valeurs ci-dessus.',
    saved: 'Enregistré', saveFail: 'Échec de l’enregistrement', loadFail: 'Échec du chargement',
    already: 'est déjà dans la liste', max: '$1 valeurs maximum', removed: 'supprimé', added: 'ajouté',
    foot: 'Les modifications sont enregistrées aussitôt. La montre les reprend à la prochaine actualisation.',
    up: 'Monter', down: 'Descendre', del: 'Supprimer', venue: 'Place', moreEu: 'Places allemandes',
    searchingEu: 'Recherche chez L&S et Tradegate …', noQuote: 'pas de cours', realtime: 'temps réel',
    venueHelp: 'Bourse US : cours en dollars via Alpaca. L&S et Tradegate : cours en euros, comme chez votre courtier.',
    codeIntro: 'Saisissez le code affiché sur la montre (en bas de la liste : « + Choisir les actions »).',
    codeLabel: 'Code de la montre', next: 'Continuer', notFound: 'Code introuvable. Vérifiez sur la montre.',
  },
  es: {
    title: 'Watchlist', codeTitle: 'Código de tu reloj', search: 'Buscar acciones o ETF …',
    hint: 'Nombre, símbolo, ISIN o WKN – p. ej. Apple, SAP, MSCI World',
    loadingDir: 'Cargando el directorio – los resultados llegarán enseguida.', offline: 'La búsqueda no está disponible ahora.',
    none: 'Sin resultados', onWatch: 'En tu reloj', empty: 'Vacía – busca arriba tus valores.',
    saved: 'Guardado', saveFail: 'Error al guardar', loadFail: 'Error al cargar',
    already: 'ya está en la lista', max: 'Máximo $1 valores', removed: 'eliminado', added: 'añadido',
    foot: 'Los cambios se guardan al momento. El reloj los carga en la siguiente actualización.',
    up: 'Subir', down: 'Bajar', del: 'Eliminar', venue: 'Mercado', moreEu: 'Mercados alemanes',
    searchingEu: 'Buscando en L&S y Tradegate …', noQuote: 'sin precio', realtime: 'tiempo real',
    venueHelp: 'Bolsa de EE. UU.: precios en dólares vía Alpaca. L&S y Tradegate: precios en euros, como en tu bróker.',
    codeIntro: 'Introduce el código que muestra el reloj (al final de la lista: «+ Elegir acciones»).',
    codeLabel: 'Código del reloj', next: 'Continuar', notFound: 'Código no encontrado. Compruébalo en el reloj.',
  },
  it: {
    title: 'Watchlist', codeTitle: 'Codice dell’orologio', search: 'Cerca azioni o ETF …',
    hint: 'Nome, simbolo, ISIN o WKN – es. Apple, SAP, MSCI World',
    loadingDir: 'Caricamento dell’elenco – i risultati arrivano a breve.', offline: 'Ricerca al momento non disponibile.',
    none: 'Nessun risultato', onWatch: 'Sul tuo orologio', empty: 'Vuota – cerca sopra i tuoi titoli.',
    saved: 'Salvato', saveFail: 'Salvataggio non riuscito', loadFail: 'Caricamento non riuscito',
    already: 'è già presente', max: 'Massimo $1 titoli', removed: 'rimosso', added: 'aggiunto',
    foot: 'Le modifiche vengono salvate subito. L’orologio le carica al prossimo aggiornamento.',
    up: 'Su', down: 'Giù', del: 'Rimuovi', venue: 'Mercato', moreEu: 'Mercati tedeschi',
    searchingEu: 'Ricerca su L&S e Tradegate …', noQuote: 'nessun prezzo', realtime: 'tempo reale',
    venueHelp: 'Borsa USA: prezzi in dollari tramite Alpaca. L&S e Tradegate: prezzi in euro, come dal tuo broker.',
    codeIntro: 'Inserisci il codice mostrato sull’orologio (in fondo alla lista: «+ Scegli titoli»).',
    codeLabel: 'Codice dell’orologio', next: 'Continua', notFound: 'Codice non trovato. Controlla l’orologio.',
  },
};

/** Sprache: zuerst die des Browsers (Accept-Language), sonst die der Uhr, sonst Englisch */
export function pickLang(deviceLang, acceptLanguage) {
  for (const part of String(acceptLanguage || '').split(',')) {
    const l = part.trim().slice(0, 2).toLowerCase();
    if (T[l]) return l;
  }
  const d = String(deviceLang || '').toLowerCase().slice(0, 2);
  return T[d] ? d : 'en';
}

const CSS = `
:root{--bg:#0b0e13;--panel:#141922;--panel2:#1b212c;--line:#262e3b;--text:#eef2f6;--muted:#8a94a6;--faint:#5b6577;
--up:#2ee59d;--down:#ff5f6d;--accent:#2ee59d;--focus:#5aa9ff;--chip:#202734}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:600px;margin:0 auto;padding:20px 16px calc(28px + env(safe-area-inset-bottom))}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 18px}
.brand{display:flex;align-items:center;gap:10px}
.brand .dot{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#2ee59d,#1e7a57);display:grid;place-items:center}
h1{font-size:23px;margin:0;letter-spacing:-.01em}
.code{font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);background:var(--panel);border:1px solid var(--line);padding:7px 9px;border-radius:8px;letter-spacing:.12em}
.search{position:relative}
.field{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:0 14px;transition:border-color .15s}
.field:focus-within{border-color:var(--focus)}
.field svg{flex:none;color:var(--muted)}
#q{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font-size:17px;padding:15px 0}
#q::placeholder{color:var(--faint)}
.hint{font-size:13px;color:var(--faint);margin:8px 2px 0;min-height:18px}
.results{list-style:none;margin:8px 0 0;padding:6px;background:var(--panel);border:1px solid var(--line);border-radius:14px;display:none;max-height:62vh;overflow:auto;overflow-x:hidden}
.results.open{display:block}
.res{display:flex;align-items:center;gap:12px;padding:9px 8px;border-radius:10px;cursor:pointer}
.res[aria-selected="true"],.res:hover{background:var(--panel2)}
.res .meta{flex:1;min-width:0}
.res .top{display:flex;gap:8px;align-items:baseline;min-width:0}
.res .sym{font-weight:700;flex:none}
.res .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);min-width:0}
.res .sub{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.res mark{background:none;color:var(--accent)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.chip{border:1px solid var(--line);background:var(--chip);color:var(--text);border-radius:999px;padding:4px 10px;font-size:12.5px;cursor:pointer;line-height:1.3}
.chip:hover{border-color:var(--accent)}
.chip.in{color:var(--accent);border-color:#1e7a57}
.sep{padding:10px 8px 4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}
.empty{padding:12px;color:var(--muted);font-size:14px}
.logo{flex:none;width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;overflow:hidden;font-weight:700;color:#0b0e13;font-size:15px}
.logo img{width:100%;height:100%;object-fit:contain}
.logo.ph{background:var(--panel2);color:var(--muted)}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:28px 2px 10px;display:flex;justify-content:space-between}
.list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.item{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 8px 10px 6px;touch-action:pan-y;user-select:none}
.item.drag{opacity:.95;border-color:var(--focus);box-shadow:0 10px 30px rgba(0,0,0,.45);position:relative;z-index:2}
.grip{flex:none;width:22px;height:44px;display:grid;place-items:center;color:var(--faint);cursor:grab;touch-action:none}
.item .meta{flex:1;min-width:0}
.item .sym{font-weight:700;display:flex;align-items:baseline;gap:8px;white-space:nowrap;min-width:0}
.item .vrow{margin-top:3px;display:flex;min-width:0}
.item .name{font-size:13px;font-weight:400;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.venue{appearance:none;-webkit-appearance:none;border:1px solid var(--line);background-color:var(--chip);color:var(--muted);border-radius:999px;padding:2px 9px;font-size:11.5px;white-space:nowrap;font-weight:500;flex:none;max-width:100%}
select.venue{padding-right:20px;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 10px) 50%,calc(100% - 6px) 50%;background-size:4px 4px;background-repeat:no-repeat;cursor:pointer}
.px{flex:none;text-align:right;min-width:74px;font-variant-numeric:tabular-nums}
.px .p{font-weight:650}
.px .c{font-size:12.5px}
.px .c.up{color:var(--up)}.px .c.down{color:var(--down)}.px .c.na{color:var(--faint)}
.spark{flex:none;width:54px;height:26px}
.acts{display:flex;flex:none}
.icon{flex:none;width:34px;height:38px;border:0;border-radius:10px;background:transparent;color:var(--muted);display:grid;place-items:center;cursor:pointer}
.icon:hover{background:var(--panel2);color:var(--text)}
.icon:disabled{opacity:.25;cursor:default}
.placeholder{border:1px dashed var(--line);border-radius:14px;padding:22px;text-align:center;color:var(--faint)}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(20px);background:var(--panel2);border:1px solid var(--line);color:var(--text);padding:10px 16px;border-radius:999px;font-size:14px;opacity:0;transition:.2s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.ok b{color:var(--up)}.toast.err b{color:var(--down)}
.foot{margin-top:22px;font-size:13px;color:var(--faint);text-align:center}
.help{margin-top:8px;font-size:12.5px;color:var(--faint);text-align:center}
@media (max-width:480px){.spark{display:none}.res .sub{font-size:12px}.item{gap:8px;padding:9px 6px 9px 4px}.grip{width:16px}.item .logo{width:32px;height:32px;border-radius:9px;font-size:13px}.acts [data-act=up]{display:none}.icon{width:30px}.px{min-width:66px}.item .sym{flex-direction:column;align-items:flex-start;gap:0}.item .name{font-size:12.5px;max-width:100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

// Läuft im Browser. Wird als Quelltext eingebettet (kein Escaping nötig).
function client(CFG) {
  const { CODE, MAX, L } = CFG;
  const $ = (id) => document.getElementById(id);
  const q = $('q'), results = $('results'), list = $('list'), hint = $('hint'), count = $('count'), toast = $('toast');
  const VENUE = { US: 'USA · $', LS: 'L&S · €', TG: 'Tradegate · €' };
  let items = [];
  let usHits = [], euHits = [], hits = [];
  let sel = -1, seq = 0, timer, euTimer;
  let prices = {};
  let pricesLoaded = false;
  let euPending = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mark = (text, query) => {
    const t = esc(text); const w = query.trim().split(/\s+/).filter(Boolean).map(re);
    return w.length ? t.replace(new RegExp('(' + w.join('|') + ')', 'ig'), '<mark>$1</mark>') : t;
  };
  const fmt = (n, cur) => {
    if (!(n > 0)) return '–';
    const s = n.toLocaleString(document.documentElement.lang, { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });
    return cur === 'EUR' ? s + ' €' : '$' + s;
  };
  const venueOf = (k) => (/\.(LS|TG)$/.test(k) ? k.slice(-2) : (k.includes('@') ? 'EX' : 'US'));
  const keyFor = (it, v) => (v === 'US' ? it.us || it.s : `${it.s}@${it.i}.${v}`);

  function logoHtml(src, label) {
    const letter = esc(String(label || '?').charAt(0));
    if (!src) return `<span class="logo ph">${letter}</span>`;
    return `<span class="logo"><img src="${esc(src)}" alt="" loading="lazy" data-l="${letter}"></span>`;
  }
  const logoFor = (it) => (it.i ? '/logo/i/' + it.i : (!it.k.includes('@') ? '/logo/s/' + encodeURIComponent(it.s) : ''));
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.parentElement?.classList.contains('logo')) return;
    // Fallback: zuerst Symbol-Logo (US), sonst Anfangsbuchstabe
    const alt = img.dataset.alt;
    if (alt && img.src.indexOf(alt) < 0) { img.src = alt; return; }
    const box = img.parentElement; box.classList.add('ph'); box.textContent = img.dataset.l || '?';
  }, true);

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
      const d = await r.json();
      if (Array.isArray(d.items)) items = d.items;
      showToast('<b>✓</b> ' + esc(L.saved), 'ok');
    } catch {
      showToast('<b>!</b> ' + esc(L.saveFail), 'err');
    }
    loadPrices();
  }

  function spark(points, up) {
    if (!points || points.length < 2) return '';
    const w = 54, h = 26, n = points.length - 1;
    const pts = points.map((v, i) => (i / n * w).toFixed(1) + ',' + (h - 2 - v / 100 * (h - 4)).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function renderList() {
    count.textContent = items.length + ' / ' + MAX;
    if (!items.length) { list.innerHTML = `<li class="placeholder">${esc(L.empty)}</li>`; return; }
    list.innerHTML = items.map((it, i) => {
      const v = venueOf(it.k);
      const vs = (it.vs && it.vs.length ? it.vs : [v]);
      const venue = vs.length > 1
        ? `<select class="venue" data-i="${i}" aria-label="${esc(L.venue)}">${vs.map((x) => `<option value="${x}"${x === v ? ' selected' : ''}>${esc(VENUE[x] || x)}</option>`).join('')}</select>`
        : `<span class="venue">${esc(VENUE[v] || it.x || v)}</span>`;
      const pr = prices[it.k];
      const c = pr ? pr.c : null;
      const cls = c == null ? 'na' : c >= 0 ? 'up' : 'down';
      const px = pr
        ? `<div class="p">${fmt(pr.p, pr.cur)}</div><div class="c ${cls}">${c >= 0 ? '+' : ''}${c.toFixed(2).replace('.', (1.5).toLocaleString(document.documentElement.lang).charAt(1))} %</div>`
        : `<div class="c na">${pricesLoaded ? esc(L.noQuote) : ''}</div>`;
      return `<li class="item" data-i="${i}">
        <span class="grip" aria-hidden="true"><svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor"><circle cx="3" cy="4" r="1.6"/><circle cx="9" cy="4" r="1.6"/><circle cx="3" cy="10" r="1.6"/><circle cx="9" cy="10" r="1.6"/><circle cx="3" cy="16" r="1.6"/><circle cx="9" cy="16" r="1.6"/></svg></span>
        ${logoHtml(logoFor(it), it.s)}
        <div class="meta"><div class="sym">${esc(it.s)}<span class="name">${esc(it.n || '')}</span></div><div class="vrow">${venue}</div></div>
        ${pr ? spark(pr.sp, (c || 0) >= 0) : ''}
        <div class="px">${px}</div>
        <div class="acts">
          <button class="icon" data-act="up" aria-label="${esc(L.up)}" ${i === 0 ? 'disabled' : ''}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 15 6-6 6 6"/></svg></button>
          <button class="icon" data-act="del" aria-label="${esc(L.del)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
      </li>`;
    }).join('');
  }

  // US-Treffer + deutsche Handelsplätze zusammenführen (gleiche Firma: US-Kürzel = Treffer)
  function merge() {
    const out = usHits.map((r) => ({ ...r, venues: r.venues.slice() }));
    const extra = [];
    for (const e of euHits) {
      const same = e.us && out.find((r) => r.symbol === e.us && !r.key.includes('@'));
      if (same) {
        same.isin = e.isin;
        for (const v of e.venues) if (!same.venues.some((x) => x.v === v.v)) same.venues.push({ v: v.v, key: `${same.symbol}@${e.isin}.${v.v}` });
      } else extra.push({ ...e, eu: true });
    }
    return out.concat(extra);
  }

  function inList(key) { return items.some((x) => x.k === key); }

  function renderResults() {
    const open = q.value.trim().length > 0;
    results.classList.toggle('open', open);
    q.setAttribute('aria-expanded', String(open));
    if (!open) return;
    hits = merge();
    if (!hits.length) { results.innerHTML = `<li class="empty">${esc(euPending ? L.searchingEu : L.none)}</li>`; return; }
    let sepShown = false;
    results.innerHTML = hits.map((r, i) => {
      const sep = r.eu && !sepShown && i > 0 ? (sepShown = true, `<li class="sep">${esc(L.moreEu)}</li>`) : '';
      const sub = [r.isin, r.exchange && !r.eu ? r.exchange : '', /etf/i.test(r.type || '') ? 'ETF' : ''].filter(Boolean).join(' · ');
      const chips = r.venues.map((v) => `<button class="chip${inList(v.key) ? ' in' : ''}" data-i="${i}" data-v="${v.v}">${inList(v.key) ? '✓ ' : '+ '}${esc(VENUE[v.v] || r.exchange || v.v)}</button>`).join('');
      const alt = !r.key.includes('@') || r.us ? '/logo/s/' + encodeURIComponent(r.us || r.symbol) : '';
      const src = r.isin ? '/logo/i/' + r.isin : r.logo;
      const logo = logoHtml(src, r.symbol).replace('<img ', `<img data-alt="${esc(alt)}" `);
      return `${sep}<li class="res" role="option" id="opt${i}" aria-selected="${i === sel}" data-i="${i}">
        ${logo}
        <span class="meta"><div class="top"><span class="sym">${mark(r.symbol, q.value)}</span><span class="name">${mark(r.name, q.value)}</span></div>
        <div class="sub">${esc(sub)}</div><div class="chips">${chips}</div></span></li>`;
    }).join('') + (euPending ? `<li class="empty">${esc(L.searchingEu)}</li>` : '');
    if (sel >= 0) q.setAttribute('aria-activedescendant', 'opt' + sel); else q.removeAttribute('aria-activedescendant');
  }

  async function search() {
    const term = q.value.trim();
    const my = ++seq;
    clearTimeout(euTimer);
    if (!term) { usHits = []; euHits = []; sel = -1; euPending = false; renderResults(); hint.textContent = L.hint; return; }
    try {
      const r = await fetch('/api/search?q=' + encodeURIComponent(term));
      const data = await r.json();
      if (my !== seq) return;
      usHits = data.results || [];
      sel = usHits.length ? 0 : -1;
      hint.textContent = data.ready ? '' : L.loadingDir;
    } catch { if (my === seq) hint.textContent = L.offline; }
    euHits = [];
    euPending = term.length >= 2;
    renderResults();
    if (!euPending) return;
    euTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/search?scope=eu&q=' + encodeURIComponent(term));
        const data = await r.json();
        if (my !== seq) return;
        euHits = data.results || [];
      } catch { /* nur US */ }
      if (my !== seq) return;
      euPending = false;
      if (sel < 0 && merge().length) sel = 0;
      renderResults();
    }, 250);
  }

  function add(r, v) {
    const venue = r.venues.find((x) => x.v === v) || r.venues[0];
    if (inList(venue.key)) { showToast(esc(r.symbol) + ' ' + esc(L.already)); return; }
    if (items.length >= MAX) { showToast('<b>!</b> ' + esc(L.max.replace('$1', MAX)), 'err'); return; }
    const vs = r.venues.map((x) => x.v);
    const it = { k: venue.key, s: r.symbol, n: r.name, x: VENUE[venue.v] || r.exchange || '', vs };
    if (r.isin) it.i = r.isin;
    if (vs.includes('US')) it.us = r.symbol;
    items.push(it);
    renderList(); save();
    showToast('<b>✓</b> ' + esc(r.symbol) + ' ' + esc(L.added), 'ok');
    q.value = ''; usHits = []; euHits = []; sel = -1; renderResults(); q.focus();
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 150); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; renderResults(); }
    else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); sel = (sel - 1 + hits.length) % hits.length; renderResults(); }
    else if (e.key === 'Enter' && sel >= 0 && hits[sel]) { e.preventDefault(); add(hits[sel]); }
    else if (e.key === 'Escape') { q.value = ''; search(); }
  });
  results.addEventListener('mousedown', (e) => e.preventDefault());
  results.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) { add(hits[+chip.dataset.i], chip.dataset.v); return; }
    const li = e.target.closest('.res'); if (li) add(hits[+li.dataset.i]);
  });

  list.addEventListener('change', (e) => {
    const s = e.target.closest('select.venue'); if (!s) return;
    const it = items[+s.dataset.i];
    const key = keyFor(it, s.value);
    if (items.some((x, j) => x.k === key && j !== +s.dataset.i)) { showToast(esc(it.s) + ' ' + esc(L.already)); renderList(); return; }
    it.k = key; it.x = VENUE[s.value] || '';
    renderList(); save();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('.item').dataset.i;
    if (b.dataset.act === 'del') { const [r] = items.splice(i, 1); showToast(esc(r.s) + ' ' + esc(L.removed)); }
    if (b.dataset.act === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
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

  // Live-Kurse (gemeinsamer Cache des Servers), jede Minute
  async function loadPrices() {
    if (!items.length) return;
    try {
      const r = await fetch('/api/prices?k=' + encodeURIComponent(items.map((x) => x.k).join(',')));
      const d = await r.json();
      prices = d.q || {};
      pricesLoaded = true;
      if (!drag) renderList();
    } catch { /* später nochmal */ }
  }
  setInterval(() => { if (!document.hidden) loadPrices(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPrices(); });

  fetch('/api/watchlist/' + CODE).then((r) => r.json()).then((d) => { items = d.items || []; renderList(); loadPrices(); })
    .catch(() => { renderList(); showToast('<b>!</b> ' + esc(L.loadFail), 'err'); });
  renderList();
}

export function watchlistPage(cfg, { code, max, lang = 'en' }) {
  const L = T[lang] || T.en;
  const data = JSON.stringify({ CODE: code, MAX: Number(max) || 10, L }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0e13">
<title>${esc(L.title)} – ${esc(cfg.appName)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="dot"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06210f" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/></svg></span><h1>${esc(L.title)}</h1></div>
    <span class="code" title="${esc(L.codeTitle)}">${esc(code)}</span>
  </header>
  <div class="search">
    <label class="field" for="q">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="${esc(L.search)}" autocomplete="off" autocorrect="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-controls="results" aria-autocomplete="list">
    </label>
    <ul id="results" class="results" role="listbox"></ul>
    <div id="hint" class="hint">${esc(L.hint)}</div>
  </div>
  <h2><span>${esc(L.onWatch)}</span><span id="count"></span></h2>
  <ul id="list" class="list"></ul>
  <div class="foot">${esc(L.foot)}</div>
  <div class="help">${esc(L.venueHelp)}</div>
</div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script>(${client.toString()})(${data});</script>
</body>
</html>`;
}
