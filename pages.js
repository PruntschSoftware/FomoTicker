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
