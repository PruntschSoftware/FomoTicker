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
   `PUBLIC_URL`, `DISPLAY_URL`, `QUOTE_PROVIDER`, `TWELVEDATA_API_KEY`).
3. `/health` muss `{"ok":true}` liefern.

`QUOTE_PROVIDER=mock` liefert Spieldaten – praktisch für den Simulator.

## Später: Abo einschalten
`PAYWALL_ENABLED=true` plus Stripe-Variablen. Beim ersten Start damit bekommen alle
bisherigen Nutzer einmalig `TRIAL_DAYS` (Standard 7) Testtage. Nichts davon passiert automatisch.
