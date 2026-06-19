# JamNet

Sito di scoperta musicale mondiale. Scegli un'area del mondo e un periodo, premi play e
ascolti un flusso di brani che non si ripete mai — dalle field recording degli anni '50 alle
uscite di oggi. Nessuna personalizzazione: la scoperta è uguale per tutti.

L'elemento-firma è la **bussola**: in modalità *Course* l'ago tiene una direzione, in *Whirl* gira libero.

> Visione, decisioni e fasi complete in [PROGETTO.md](PROGETTO.md).

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind CSS v4**
- **Supabase** (Postgres) — catalogo di tracce e artisti
- **Apple Music via MusicKit JS** — unica fonte audio (Safari su dispositivi Apple)
- **framer-motion** — animazioni funzionali

## Architettura audio (Apple-only)

JamNet riproduce tramite Apple Music. La riproduzione integrale richiede **Safari su Mac/iPhone/iPad**.
Da altri browser viene mostrata una schermata sobria che invita ad aprire il sito su Safari.
I brani con `apple_music_id` suonano integrali (o anteprima 30s senza abbonamento); in assenza,
fallback all'anteprima `itunes_preview_url` con etichetta "preview".

## Struttura del progetto

```
app/                  Route (App Router)
  page.tsx            Home: mappa, decenni, modalità, play
  flow/               Il flusso di ascolto (FlowContent + componenti)
  library/            Libreria: playlist di genere, compilation
  api/                discover · track · artist · report
components/
  ui/                 CompassIcon, HeartButton
  map/                WorldMap (SVG 11 macro-aree)
  controls/           DecadeButtons, ModeSelector
  library/            PlaylistCover
  flow/               Sotto-componenti del flusso
lib/
  types.ts            Modello dati (Track, Compilation, …)
  geo.ts              Helper geografici (countryName)
  daily.ts            Destinazione del giorno
  db/                 Client Supabase + mapping righe→Track
  storage/            Persistenza locale (history, saved)
  player/             Integrazione MusicKit
data/                 regions.json, daily.json, schema.sql
scripts/              build-catalog.js, new-releases.js, generate-apple-token.js
```

## Sviluppo

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # build di produzione
npx tsc --noEmit     # typecheck
```

Le variabili d'ambiente vanno in `.env.local` (vedi PROGETTO.md sez. 8.1). Le chiavi pubbliche
richieste dal browser hanno prefisso `NEXT_PUBLIC_` (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN`).

## Catalogo

```bash
npm run build-catalog            # build incrementale, rilanciabile
node scripts/build-catalog.js --artwork-only   # solo backfill copertine
node scripts/new-releases.js     # nuove uscite settimanali (is_new_release)
```

Lo schema Supabase è in [data/schema.sql](data/schema.sql).
