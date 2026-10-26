# Aktien Ticker – Backend

Liefert der Garmin-App die Kurse (ein Abruf je Symbol und Minute, geteilt zwischen allen Uhren)
und kann später ein Abo verwalten. **Standard: kostenlos** – Bezahlen ist aus, bis
`PAYWALL_ENABLED=true` gesetzt wird.

## Endpunkte
| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/v1/register` | Uhr registriert sich, bekommt Token + Code |
| GET | `/v1/quotes?s=AAPL,MSFT` | Kurse (`Authorization: Bearer <token>`) |
| GET | `/health` | Healthcheck für Railway |
| GET/POST | `/`, `/activate`, `/success` | Aktivierungsseite (nur mit Paywall) |
| POST | `/stripe/webhook` | Stripe-Events (nur mit Paywall) |

## Deploy auf Railway
1. Repo verbinden, Postgres hinzufügen.
2. Variablen aus `.env.example` setzen (für den Gratis-Start reichen `DATABASE_URL`,
   `PUBLIC_URL`, `DISPLAY_URL`, `PROVIDERS` und die Schlüssel der Anbieter, siehe `.env.example`).
3. `/health` muss `{"ok":true}` liefern.

`PROVIDERS=mock` liefert Spieldaten – praktisch für den Simulator.

## Datenanbieter

Jeder Anbieter ist eine Datei (`alpaca.js`, `eodhd.js`, `twelvedata.js`, `finnhub.js`, `mock.js`) und ein
Eintrag in `REGISTRY` (`providers.js`). Ein Anbieter liefert, was er kann: `fetchQuotes` (Kurse,
optional mit Vor-/Nachbörse), `fetchSeries` (Tageschart), `loadDirectory` (Suche).
`PROVIDERS=alpaca,eodhd,twelvedata` verteilt jeden Wert an den ersten Anbieter, der ihn kann
(`supports(key)`): US-Aktien an Alpaca, `SAP@XETR` an EODHD. Fällt einer aus, springt der
nächste ein. Fehlen die Schlüssel eines Anbieters, wird er übersprungen. Jeder Anbieter hat sein eigenes Limit.

Die Uhr bekommt Vor-/Nachbörse als `x: { KEY: [kurs, prozent, "pre"|"post"] }`.

## Später: Abo einschalten
`PAYWALL_ENABLED=true` plus Stripe-Variablen. Beim ersten Start damit bekommen alle
bisherigen Nutzer einmalig `TRIAL_DAYS` (Standard 7) Testtage. Nichts davon passiert automatisch.
