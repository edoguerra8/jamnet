# DOCUMENTO DI PROGETTO — JAMNET
Versione 2.1 — 11 giugno 2026
Sostituisce ogni versione precedente.

---

## 1. VISIONE

JamNet è un sito di scoperta musicale. L'utente sceglie un'area del mondo e un periodo, preme play e ascolta un flusso di brani che non si ripete mai e che pesca in profondità dal repertorio musicale mondiale: dalle field recording degli anni '50 alle uscite di oggi.

Nessun algoritmo sui gusti personali: la scoperta è uguale per tutti. La qualità del flusso è garantita da una curatela strutturale (pesca pesata, dizionario di tradizioni, contesto culturale), non dalla profilazione dell'utente.

L'elemento-firma è la bussola: in modalità Rotta l'ago tiene una direzione; in modalità Vortice gira libero. (Nomi da confermare — alternative: Viaggio/Salto, Course/Whirl.)

Lingua interfaccia: inglese (da confermare).

---

## 2. SORGENTI DATI E AUDIO

| Ruolo | Servizio | Note |
|---|---|---|
| Enciclopedia | **MusicBrainz** | Artisti per paese, registrazioni, anno di PRIMA pubblicazione della registrazione, tag, link Wikipedia. Max 1 req/s, User-Agent "JamNet/1.0". |
| Scoperta artisti (integrata) | **Wikidata** | Fonte **complementare** a MusicBrainz (non sostitutiva). Endpoint SPARQL pubblico (`query.wikidata.org/sparql`), nessuna chiave. Per ogni paese ISO trova musicisti (P27 + occupazione P106) e gruppi (P495), con il MusicBrainz ID (P434) quando presente. Pausa ≥2 s tra le query, User-Agent "JamNet/1.0". Recupera artisti che la ricerca per area di MusicBrainz non ranka o non ha: dove MB è povero il guadagno è grande (test: Bolivia +189 artisti, Laos +7 solo-Wikidata). |
| Segnale di rilevanza/tag (integrata) | **Last.fm** | Fonte di **segnale**, non enciclopedica. API key in `.env.local` come `LASTFM_API_KEY` (read-only: lo shared secret serve solo per scritture autenticate, qui non usate). `artist.getInfo` (per MBID o per nome con autocorrect) → ascoltatori/play reali e tag d'uso. Il segnale **modula** la `relevance` esistente (MB o Wikidata) con un fattore log-scalato e limitato — `clamp(log10(listeners+10)/3, 0.5, 2.0)` — così chi ha pubblico reale emerge di più e gli artisti senza ascolti vengono smorzati, senza che una megastar saturi la pesca. I tag riempiono le tracce prive di tag MB. Limite ~5 req/s: lo script sta a ~4 (250 ms), User-Agent "JamNet/1.0". Scoperta nuovi artisti via `geo.getTopArtists`/`tag.getTopArtists`: stage **opzionale** dietro `--lastfm-discover` (stesso trattamento duplicati di Wikidata). |
| Scoperta artisti correlati (integrata) | **Spotify (Web API)** | Fonte di **scoperta** per far emergere nomi minori vicini ad artisti già noti. Credenziali in `.env.local` come `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`. Autenticazione **Client Credentials Flow** (nessun login utente: client_id/secret → access token ~1 h, rinnovato in automatico). Approccio **a semi**: lo stage parte dagli artisti del catalogo a `relevance` più alta (`--spotify-seeds=N`, default 200) e usa `artists/{id}/related-artists` per trovare correlati non ancora presenti — non gira sull'intero catalogo (i correlati di artisti oscuri sono spesso già noti o ridondanti, e moltiplicherebbero le chiamate). Stesso trattamento anti-duplicati di Wikidata (id sintetico `sp:<spotifyId>` + nome+paese) e integrazione delle sessioni precedenti via checkpoint (`spotifyDone[seedId]`). Rate limit a finestra mobile: ~5 req/s (200 ms), rispetto dell'header `Retry-After` sui 429. **⚠ Vincoli Spotify 2024–2025** (vedi nota sotto): l'auth funziona, ma gli endpoint dati richiedono che il **proprietario dell'app abbia Spotify Premium attivo** e `related-artists` è **deprecato** per le app create dopo il 27/11/2024; lo stage rileva il 403, lo segnala e prosegue senza bloccare la pipeline. Flag: `--spotify-test` (dry run), `--spotify-only`, `--skip-spotify`, `--spotify-seeds=N`. |
| Contesto culturale | **Wikipedia (via MusicBrainz)** | 2 righe di descrizione per artista, salvate in catalogo dallo script. |
| Riproduzione principale | **YouTube** | IFrame Player API. Abbinamento brano→video fatto dallo script, mai in diretta. Quota Data API: ~100 ricerche/giorno; lo script lavora a lotti con punto di ripresa. Limite noto: il player si ferma a schermo bloccato su mobile (restrizione YouTube, da comunicare con onestà all'utente). |
| Riserva | **iTunes Search API** | Anteprima 30–90s, copertine, itunes_track_id (= ID Apple Music: prepara l'integrazione futura). |

**Apple Music (futuro):** integrazione via MusicKit JS come servizio collegato sopra l'account JamNet. Richiede Apple Developer (99$/anno) e abbonamento dell'utente. Nessun conflitto con il login email. Salvare sempre itunes_track_id e ISRC. Risolverà anche l'ascolto in background su mobile per gli abbonati.

**Artisti da Wikidata e schema:** la tabella `artists` ha `mb_artist_id` come chiave primaria (text, non nullo). Gli artisti trovati su Wikidata **con** P434 usano il MusicBrainz ID reale, così si fondono con le righe MB (deduplica) e ne vengono caricate anche le registrazioni. Gli artisti **solo Wikidata** (senza P434) usano una chiave sintetica `wd:<QID>` (es. `wd:Q1340`): nessuna modifica allo schema, provenienza esplicita, `relevance` derivata dai sitelink Wikipedia. Restano senza tracce MB finché non emergono altrove (es. iTunes) — coperti dal flusso solo quando diventano riproducibili.

**Last.fm e relevance:** lo stage Last.fm gira **dopo** MusicBrainz e Wikidata, sull'intero catalogo (anche i nuovi artisti). Per ogni artista: `relevance_finale = round(relevance_base × clamp(log10(listeners+10)/3, 0.5, 2.0))`, da cui si ricalcola il `weight` di tutte le sue tracce (`weightFromRelevance`, unico punto di verità). Idempotente: il checkpoint (`lastfmDone[id]`) garantisce un solo passaggio per artista, così i rilanci non ricompongono il fattore sulla relevance già modulata. Gli artisti solo-Wikidata (`wd:…`) vengono cercati per nome con autocorrect. Esempi misurati (dry run `--lastfm-test`, base = recording-count MB): Fela Kuti weight 48→90 (×1.89, 484k ascoltatori), Tinariwen 32→59 (×1.85), Ali Farka Touré 24→44 (×1.82), Cesária Évora 46→81 (×1.78); chi è già al massimo (Caetano Veloso, Nusrat Fateh Ali Khan) resta a 100.

**Spotify e scoperta correlati:** lo stage Spotify gira **dopo** Last.fm (così i semi sono ordinati sulla relevance già modulata), come fonte di scoperta accanto a Wikidata. Autenticazione Client Credentials Flow (solo client_id/secret, in `.env.local` come `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`). Dai semi a relevance più alta (default 200, `--spotify-seeds=N`) prende i correlati via `related-artists` e inserisce quelli nuovi con id sintetico `sp:<spotifyId>` e `relevance` derivata dai follower (`log10(followers+10)×15`, scala comparabile a Wikidata e alla scoperta Last.fm); paese e macro-area ereditati dal seme (scena vicina). Gli artisti **solo Spotify** non hanno tracce MB, esattamente come i solo-Wikidata: restano coperti dal flusso quando diventano riproducibili altrove (es. iTunes). Idempotente: il checkpoint `spotifyDone[seedId]` salta i semi già trattati nelle sessioni precedenti.

**⚠ Vincoli operativi Spotify (stato attuale, 2026-06-14):** l'autenticazione Client Credentials **funziona** (token rilasciato, verificato con `--spotify-test`), ma **ogni endpoint dati** (`search`, `artists`, `related-artists`) risponde **403 — "Active premium subscription required for the owner of the app"**: dal 2025 Spotify richiede che il proprietario dell'app (l'account che ha generato le credenziali) abbia un **abbonamento Premium attivo**, altrimenti la Web API è inaccessibile via Client Credentials. In più, `related-artists` (e `recommendations`, `audio-features`) è stato **deprecato il 27/11/2024** per le app create dopo quella data: anche con Premium attivo, una app nuova potrebbe non poterlo usare. Lo stage è implementato e pronto, gestisce il 403 senza interrompere la pipeline, ma **non può scoprire artisti finché il blocco persiste**. Sblocco: (1) attivare Premium sull'account proprietario dell'app; (2) se `related-artists` resta inaccessibile, ripiegare sul **grafo di collaborazioni** (album del seme → artisti in feat./`appears_on`), che usa endpoint non deprecati per ottenere lo stesso effetto "nomi minori vicini al noto". Il test su campione non ha potuto riportare artisti nuovi: bloccato a monte dal 403, non dalla logica dello stage.

**Regola architetturale:** il frontend non chiama MAI MusicBrainz/YouTube Data API/iTunes/Last.fm/Spotify durante l'ascolto. Tutto pesca dal catalogo Supabase costruito dallo script offline.

---

## 3. ARCHITETTURA

### 3.1 Catalogo (Supabase)

Tabella `tracks`:
- id (uuid), mb_recording_id (univoco, anti-duplicati)
- title, artist_name, artist_mb_id
- country (ISO 3166), macro_area (una delle 11), year (prima pubblicazione, da MusicBrainz)
- youtube_video_id, itunes_track_id, itunes_preview_url, artwork_url, isrc (tutti annullabili)
- tags (array generi/tradizioni)
- weight (numero: rilevanza dell'artista, vedi 3.3)
- created_at

Tabella `artists`:
- mb_artist_id (univoco), name, country, macro_area
- bio_short (2 righe da Wikipedia, lingua dell'interfaccia)
- relevance (numero di registrazioni/collegamenti su MusicBrainz — o sitelink Wikidata — modulato dal segnale di ascolti Last.fm; base del peso)

Tabella `match_reports`: track_id, motivo (wrong_video | wrong_metadata), note, created_at — alimentata dal tasto "segnala" nel flusso.

Un brano è riproducibile se ha youtube_video_id o itunes_preview_url; gli altri restano "da risolvere" e lo script li ritenta.

### 3.2 Script di catalogazione (`scripts/build-catalog.js`)

Eseguito a mano, incrementale, rilanciabile.
1. Legge `data/regions.json` (macro-area → paesi ISO → generi/tradizioni seed; per la diaspora vale il paese di ORIGINE dell'artista quando MusicBrainz lo distingue).
2. MusicBrainz: artisti per paese e periodo, registrazioni con first release date e tag, indicatori di rilevanza, link Wikipedia → bio_short.
3. YouTube: ricerca "artista titolo", salva l'ID solo se incorporabile; rispetta la quota e segna il punto di ripresa.
4. iTunes: track_id, preview, artwork; filtri qualità (scarta karaoke, tribute, cover version, lullaby, meditation, made famous by).
5. Wikidata: artisti complementari per paese (vedi sez. 2).
6. Last.fm: per ogni artista in catalogo, `artist.getInfo` → modula la `relevance` e ricalcola il `weight` delle tracce; backfill tag dove mancano (vedi sez. 2). Flag: `--lastfm-test` (dry run before/after), `--lastfm-only`, `--skip-lastfm`, `--lastfm-discover` (scoperta opzionale).
7. Spotify: scoperta artisti correlati dai semi a relevance più alta via `related-artists` (vedi sez. 2). Flag: `--spotify-test` (dry run), `--spotify-only`, `--skip-spotify`, `--spotify-seeds=N`. Soggetto ai vincoli Premium/deprecazione documentati in sez. 2: lo stage rileva il 403 e prosegue senza bloccare.
8. Scrive su Supabase; log finale per area e decennio.

Obiettivo prima esecuzione: nessuna area sotto ~200 brani riproducibili.

### 3.3 Motore di scoperta (frontend)

- Query a Supabase: macro_aree + decenni (+ eventuale paese, vedi 4.2), esclusi gli ID di sessione.
- **Pesca pesata**: probabilità proporzionale a `weight` — gli artisti più rilevanti emergono più spesso, le profondità oscure affiorano comunque. Uguale per tutti: zero personalizzazione.
- **Due modalità**:
  - **Rotta** (default): il brano successivo resta vicino al precedente (stessa area o confinante, epoca simile) e il flusso si sposta gradualmente, come un DJ set; l'utente riorienta con la bussola. Ago: fermo, oscilla solo al cambio direzione.
  - **Vortice**: pesca da tutto il mondo e ogni epoca selezionata, salti liberi. Ago: gira durante ogni ricerca.
- Coda di prefetch da 10, ricarica sotto i 3; mai due brani consecutivi dello stesso artista.
- Riproduzione: YouTube incorporato (la copertina resta il visual principale); fallback automatico anteprima iTunes con etichetta "anteprima".
- Anti-ripetizione: ID di sessione tenuti lato client, esclusi da ogni query.

---

## 4. INTERFACCIA E LINGUAGGIO VISIVO

### 4.1 Linguaggio visivo (vincolante per ogni fase)

Stile: minimalismo caldo, alla Anthropic. Regole:
- **Colori**: fondo avorio caldo (es. #FAF9F5; superfici #F0EEE6), testo quasi-nero caldo (es. #1F1E1D), UN solo accento terracotta (es. #C96442 / #CC785C) usato con parsimonia: pulsante play, selezioni attive, ago della bussola, cuore attivo. Nessun gradiente acceso, nessun neon, nessun tema scuro per ora.
- **Tipografia**: titoli in serif elegante (es. Lora o Source Serif 4), corpo e UI in sans-serif pulito (es. Inter). Gerarchia netta, poche taglie.
- **Spazio**: margini e respiri generosi; UNA sola azione primaria per schermata; niente schermate affollate.
- **Forme**: angoli arrotondati morbidi (8–12px), bordi sottili (1px, tono caldo), ombre quasi assenti.
- **Movimento**: solo animazioni funzionali (ago della bussola, dissolvenza tra brani, feedback di tocco), 200–300ms, mai decorative.
- **Microtesti**: sobri, caldi, brevi. Niente punti esclamativi, niente gergo tech.
- **Mappa**: zone in tinte piatte della palette; zona selezionata = riempimento terracotta; etichette leggibili; forme semplici, niente confini nazionali.

### 4.2 Home
1. **Mappa del mondo SVG toccabile** (elemento centrale): 11 macro-aree selezionabili (multiple), comode al tocco su telefono. Chip "Whole world" sotto, default attivo.
2. **Bottoni decennio**: 1950s → 2020s, selezione multipla, default tutti.
3. **Selettore modalità**: Rotta / Vortice (due opzioni, una attiva; copy e icona dell'ago coerenti).
4. **Play grande e centrale.**
5. **Destinazione del giorno**: una riga discreta sopra il play ("Today the compass points to: Ethiopia, 1970s") — toccandola si impostano i filtri e parte il flusso. Editoriale, uguale per tutti, generata da una rotazione curata (lista in `data/daily.json`, ciclica, modificabile a mano).

Niente barra di ricerca, niente preset, niente suggerimenti testuali.

### 4.3 Flusso
Un brano alla volta: copertina grande, titolo, artista, **paese + macro-area**, anno. Controlli: play/pausa, salta, cuore, condividi, segnala.
- Tocco sulla **macro-area** → filtro su quell'area. Tocco sul **paese** → il flusso si restringe a quel paese (la mappa resta a macro-aree, il motore sa scendere di livello).
- Tocco sull'**anno** → filtri centrati su quel decennio.
- Tocco su **artista** → si apre la scheda con bio_short (2 righe di contesto culturale) e link "ascolta altro di questo artista" (avvia flusso filtrato sull'artista).
- **Condividi**: ogni brano ha un link che apre JamNet direttamente su quel brano.
- **Segnala**: "abbinamento sbagliato" → scrive in match_reports.
- **Bussola** (angolo): pannello con mappa compatta, decenni, selettore modalità.

---

## 5. ACCOUNT, LIBRERIA E PLAYLIST

### 5.1 Account
Magic link via email (Supabase Auth). Tabella `profiles`.

### 5.2 Libreria
- **Cronologia**: ogni brano proposto viene registrato (anche senza login: in locale; con login: su server, tabella `history`). Pagina "Recently played" nella Libreria: il brano sentito ieri si ritrova sempre.
- **Like** → tabella `likes`; il brano entra automaticamente nelle **playlist automatiche** per macro-area e, dove i tag lo permettono, per genere/tradizione (si creano da sole alla prima occorrenza).
- **Compilation personali** a nome libero.

### 5.3 Gestione playlist
- Spostare/copiare brani dalle automatiche alle personali e tra personali.
- Riordino (pulsanti su/giù o maniglia grande), rimozione, rinomina/eliminazione delle personali (le automatiche si nascondono, non si eliminano).
- Ogni playlist è riproducibile in sequenza con il player del flusso e ha un **link di condivisione** (sola lettura per chi lo apre).

Tabelle: `playlists` (id, user_id, name, type: auto_area | auto_genre | custom), `playlist_tracks` (playlist_id, track_id, position), `history` (user_id, track_id, played_at), `likes`.

---

## 6. FASI DI ESECUZIONE

Tre prompt sequenziali. Dopo ogni fase il sito è funzionante e provabile. Ogni prompt richiama la sezione 4.1 (linguaggio visivo).

### ✅ FASE 1 — Completata (2026-06-11)

Realizzato:
- `data/regions.json`: mappa completa dei paesi ISO → 11 macro-aree + genre_seeds + musicbrainz_countries
- `data/schema.sql`: SQL pronto per Supabase (tracks, artists, match_reports, history, likes, playlists, playlist_tracks + RLS)
- `scripts/build-catalog.js`: script incrementale MusicBrainz + YouTube + iTunes, rilanciabile, log per area e decennio
- `lib/supabase.ts`: client Supabase (browser anon + server service role)
- `app/api/discover/route.ts`: query Supabase con pesca pesata (weight), modalità Rotta/Vortice, esclusione ID sessione
- `app/api/report/route.ts`: scrive in match_reports
- `lib/history.ts`: cronologia locale (localStorage, max 500 voci)
- `lib/types.ts`: Track aggiornato con youtubeVideoId, country, macroArea, tags, weight
- `app/flow/FlowContent.tsx`: YouTube IFrame + fallback anteprima iTunes (etichettata "preview"), tasto segnala, cronologia, prefetch 10, anti-consecutivo stesso artista, modalità Rotta (default)
- Home: controlli esistenti collegati al nuovo motore senza modifiche grafiche

Prossimo: lanciare `node scripts/build-catalog.js` (o `npm run build-catalog`) per popolare il catalogo, poi ascoltare 15–20 minuti.

### Prerequisiti (a mano, una volta sola)
1. **Supabase**: progetto gratuito su supabase.com; URL, anon key e service role key in `.env.local`.
2. **YouTube Data API**: su console.cloud.google.com → progetto → abilita "YouTube Data API v3" → chiave API → `.env.local` come YOUTUBE_API_KEY (solo script, mai browser).
3. **Last.fm**: account su last.fm/api → crea un'applicazione → API key → `.env.local` come LASTFM_API_KEY (read-only; shared secret non necessario). Già configurata.

---

### PROMPT 1 — Motore e catalogo

> Leggi PROGETTO.md (sezioni 2, 3 e 4.3). Ricostruisci il motore di scoperta:
> 1. Crea `data/regions.json`: macro-area → paesi ISO → generi seed per tutte le 11 aree (8–15 paesi e 5–10 generi per area dove sensato), versione ragionata e curata.
> 2. Tabelle Supabase come da sez. 3.1 e 5.3 (tracks, artists, match_reports; predisponi anche history, likes, playlists, playlist_tracks): dammi lo SQL da incollare nell'editor di Supabase.
> 3. `scripts/build-catalog.js` come da sez. 3.2: MusicBrainz (1 req/s, User-Agent "JamNet/1.0", rilevanza artisti e bio_short da Wikipedia), abbinamento YouTube con gestione quota e punto di ripresa, fallback iTunes con filtri qualità, scrittura incrementale, log per area e decennio. Dammi il comando per lanciarlo.
> 4. Frontend: il flusso pesca da Supabase come da sez. 3.3 (pesca pesata su weight, modalità Rotta/Vortice — per ora attivabili da una variabile, l'interruttore UI arriva in Fase 2 —, prefetch 10, esclusione ID sessione, mai due brani consecutivi dello stesso artista). Riproduzione YouTube incorporata + fallback anteprima iTunes etichettata.
> 5. Aggiungi nel flusso i tasti "segnala abbinamento sbagliato" (scrive in match_reports) e registra la cronologia in locale.
> 6. Non rifare la grafica della Home: collega i controlli esistenti al nuovo motore.
> Chiavi in `.env.local`. A fine lavoro aggiorna PROGETTO.md segnando la Fase 1 completata.

Verifica: lanciare lo script, primo lotto in catalogo, ascoltare 15–20 minuti: niente ripetizioni, aree rispettate, fallback anteprima funzionante.

---

### ✅ FASE 2 — Completata (2026-06-11)

Realizzato:
- **Linguaggio visivo 4.1 su tutto il sito**: palette aggiornata (avorio #FAF9F5, superfici #F0EEE6, ink #1F1E1D, terracotta #C96442), titoli in Lora, UI in Inter, tema scuro rimosso, angoli 8–12px, animazioni solo funzionali 200–300ms
- `components/WorldMap.tsx`: mappa SVG toccabile a 11 macro-aree (selezione multipla, forme semplici arrotondate, tinte piatte della palette, zona selezionata in terracotta, etichette con alone, niente confini nazionali; aree piccole con zona di tocco allargata)
- Home (sez. 4.2): mappa centrale + chip "Whole world" (default), bottoni decennio 1950s–2020s multipli (default tutti), selettore Rotta/Vortice ("Course"/"Whirl"), play grande centrale, riga "Today the compass points to: …"
- `data/daily.json` + `lib/daily.ts`: 30 destinazioni curate (paese + decennio), rotazione ciclica per giorno UTC, uguale per tutti; il tocco imposta i filtri e avvia il flusso
- Flusso (sez. 4.3): paese e macro-area toccabili separatamente (paese → restringe al paese via nuovo filtro `country`), anno → decennio, scheda artista con bio_short (`/api/artist`) e "Listen to more by this artist" (flusso filtrato sull'artista), condividi con link diretto (`/flow?track=<id>`, Web Share + copia link), segnala, controlli espliciti play/pausa · salta · cuore · condividi · segnala, etichetta "preview" sul fallback iTunes
- Bussola: ago fermo in Rotta che oscilla al cambio direzione, rotante durante la ricerca in Vortice; pannello (angolo in alto) con mappa compatta, decenni e modalità
- API: `discover` accetta `decades[]` (anche non contigui), `country`, `artistMbId`/`artistName`, `mode`; nuove route `GET /api/track?id=` (link di condivisione) e `GET /api/artist` (bio_short)
- Eliminati: RangeSlider, slider periodo, ogni residuo di ricerca/preset/tema scuro

Nota: i filtri del flusso ora viaggiano per decenni (`?decades=1970,1990`) invece di `yearFrom/yearTo`.

### PROMPT 2 — Interfaccia e linguaggio visivo

> Leggi PROGETTO.md (sezione 4, tutta — la 4.1 è vincolante). Ricostruisci Home, Flusso e bussola secondo il linguaggio visivo e i layout descritti:
> 1. Applica la palette, la tipografia e le regole della sez. 4.1 a tutto il sito.
> 2. Home: mappa SVG toccabile (11 aree, selezione multipla, chip Whole world), bottoni decennio, selettore modalità Rotta/Vortice, play centrale, riga "destinazione del giorno" (crea anche `data/daily.json` con 30 destinazioni curate e la rotazione giornaliera).
> 3. Flusso: scheda brano come da 4.3 (paese e macro-area toccabili separatamente, anno toccabile, scheda artista con bio_short e "ascolta altro di questo artista", condividi con link diretto al brano, segnala).
> 4. Bussola: pannello con mappa compatta, decenni e modalità; ago fermo/oscillante in Rotta, rotante in Vortice.
> 5. Elimina ogni residuo di barra di ricerca, slider e preset.
> A fine lavoro aggiorna PROGETTO.md segnando la Fase 2 completata.

Verifica: usare il sito solo da telefono; ogni zona della mappa selezionabile al primo tocco; lo stile deve risultare caldo, sobrio, coerente in ogni schermata.

---

### PROMPT 3 — Account, libreria e playlist

> Leggi PROGETTO.md (sezione 5). Implementa:
> 1. Login magic link (Supabase Auth) + profiles. Al login, la cronologia locale si fonde con quella server.
> 2. Cuore nel flusso; likes, playlist automatiche per area/genere (creazione automatica alla prima occorrenza), compilation personali.
> 3. Pagina Libreria: Recently played, playlist automatiche, compilation; spostare/copiare brani tra playlist, riordino su/giù, rimozione, rinomina/eliminazione (automatiche solo nascondibili).
> 4. Riproduzione in sequenza delle playlist con il player esistente; link di condivisione in sola lettura per ogni playlist.
> 5. Utente non loggato che tocca il cuore: invito sobrio al login; dopo il login il like viene applicato.
> Stile come da sez. 4.1. A fine lavoro aggiorna PROGETTO.md segnando la Fase 3 completata.

Verifica: like a 5–6 brani di aree diverse → playlist automatiche corrette; creare una compilation, spostarci due brani, riordinarli, riprodurla, condividerla; ritrovare in Recently played un brano ascoltato senza like.

---

## 7. DECISIONI PRESE

| Tema | Decisione |
|---|---|
| Nome | JamNet |
| Firma | Bussola (Rotta: ago fermo; Vortice: ago che gira) |
| Modalità di flusso | Rotta (deriva graduale, default) / Vortice (salti liberi) — nomi da confermare |
| Qualità del flusso | Pesca pesata sulla rilevanza degli artisti; zero personalizzazione |
| Contesto | Bio di 2 righe per artista (Wikipedia via MusicBrainz), scheda toccabile |
| Riproduzione | YouTube principale + anteprima iTunes di riserva; limite background mobile accettato e comunicato |
| Geografia | Mappa toccabile a 11 macro-aree; paese sempre visibile e toccabile per restringere; diaspora = paese d'origine |
| Periodo | Bottoni decennio multipli (1950s–2020s) |
| Ricerca testuale | Eliminata; in cambio: cronologia sempre disponibile |
| Ritorno quotidiano | Destinazione del giorno, editoriale e uguale per tutti |
| Condivisione | Link diretto per ogni brano e ogni playlist |
| Account | Magic link email |
| Libreria | Cronologia + like → playlist automatiche + compilation personali modificabili |
| Stile | Minimalismo caldo (sez. 4.1, vincolante) |
| Apple Music | Futuro, via MusicKit; itunes_track_id e ISRC salvati fin da ora |
| Lingua UI | Inglese (da confermare) |
