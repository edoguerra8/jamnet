# DOCUMENTO DI PROGETTO — JAMNET
Versione 2.2 — 15 giugno 2026
Sostituisce ogni versione precedente.

---

## 1. VISIONE

JamNet è un sito di scoperta musicale. L'utente sceglie un'area del mondo e un periodo, preme play e ascolta un flusso di brani che non si ripete mai e che pesca in profondità dal repertorio musicale mondiale: dalle field recording degli anni '50 alle uscite di oggi.

Nessun algoritmo sui gusti personali: la scoperta è uguale per tutti. La qualità del flusso è garantita da una curatela strutturale (pesca pesata, dizionario di tradizioni, contesto culturale), non dalla profilazione dell'utente.

L'elemento-firma è la bussola: in modalità **Course** l'ago tiene una direzione; in modalità **Whirl** gira libero.

Lingua interfaccia: inglese.

---

## 2. SORGENTI DATI E AUDIO

| Ruolo | Servizio | Note |
|---|---|---|
| Enciclopedia | **MusicBrainz** | Artisti per paese, registrazioni, anno di PRIMA pubblicazione della registrazione, tag, link Wikipedia. Max 1 req/s, User-Agent "JamNet/1.0". |
| Scoperta artisti (integrata) | **Wikidata** | Fonte **complementare** a MusicBrainz (non sostitutiva). Endpoint SPARQL pubblico (`query.wikidata.org/sparql`), nessuna chiave. Per ogni paese ISO trova musicisti (P27 + occupazione P106) e gruppi (P495), con il MusicBrainz ID (P434) quando presente. Pausa ≥2 s tra le query, User-Agent "JamNet/1.0". Recupera artisti che la ricerca per area di MusicBrainz non ranka o non ha: dove MB è povero il guadagno è grande (test: Bolivia +189 artisti, Laos +7 solo-Wikidata). |
| Segnale di rilevanza/tag (integrata) | **Last.fm** | Fonte di **segnale**, non enciclopedica. API key in `.env.local` come `LASTFM_API_KEY` (read-only: lo shared secret serve solo per scritture autenticate, qui non usate). `artist.getInfo` (per MBID o per nome con autocorrect) → ascoltatori/play reali e tag d'uso. Il segnale **modula** la `relevance` esistente (MB o Wikidata) con un fattore log-scalato e limitato — `clamp(log10(listeners+10)/3, 0.5, 2.0)` — così chi ha pubblico reale emerge di più e gli artisti senza ascolti vengono smorzati, senza che una megastar saturi la pesca. I tag riempiono le tracce prive di tag MB. Limite ~5 req/s: lo script sta a ~4 (250 ms), User-Agent "JamNet/1.0". Scoperta nuovi artisti via `geo.getTopArtists`/`tag.getTopArtists`: stage **opzionale** dietro `--lastfm-discover` (stesso trattamento duplicati di Wikidata). |
| Scoperta artisti correlati (integrata) | **Spotify (Web API)** | Fonte di **scoperta** per far emergere nomi minori vicini ad artisti già noti. Credenziali in `.env.local` come `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`. Autenticazione **Client Credentials Flow** (nessun login utente: client_id/secret → access token ~1 h, rinnovato in automatico). Approccio **a semi**: lo stage parte dagli artisti del catalogo a `relevance` più alta (`--spotify-seeds=N`, default 200) e usa `artists/{id}/related-artists` per trovare correlati non ancora presenti — non gira sull'intero catalogo (i correlati di artisti oscuri sono spesso già noti o ridondanti, e moltiplicherebbero le chiamate). Stesso trattamento anti-duplicati di Wikidata (id sintetico `sp:<spotifyId>` + nome+paese) e integrazione delle sessioni precedenti via checkpoint (`spotifyDone[seedId]`). Rate limit a finestra mobile: ~5 req/s (200 ms), rispetto dell'header `Retry-After` sui 429. **⚠ Vincoli Spotify 2024–2025** (vedi nota sotto): l'auth funziona, ma gli endpoint dati richiedono che il **proprietario dell'app abbia Spotify Premium attivo** e `related-artists` è **deprecato** per le app create dopo il 27/11/2024; lo stage rileva il 403, lo segnala e prosegue senza bloccare la pipeline. Flag: `--spotify-test` (dry run), `--spotify-only`, `--skip-spotify`, `--spotify-seeds=N`. |
| Riempimento buchi (integrata) | **Discogs** | Fonte di **riempimento** per le uscite indipendenti/locali (vinili, cassette, piccole etichette) che MusicBrainz non ha. Token personale in `.env.local` come `DISCOGS_TOKEN`. Per le **aree sotto soglia** (sez. 3.2) interroga `database/search` per **paese + anno** (decennio per decennio); la ricerca dà solo "Artista – Album", quindi per i veri titoli dei brani e per i nomi artista puliti scarica il **dettaglio della release** (`releases/{id}`). Niente `mb_recording_id`: chiavi sintetiche `dg:<artist_id>` (artisti) e `dg:<release_id>:<position>` (brani), coerenti con la convenzione `wd:`/`sp:`/`lf:`. **Anti-duplicati: match stretto su titolo+artista+anno** normalizzati (vedi nota sotto). Rate limit **60 req/min** (token autenticato): lo script sta a ~1 req/1.1 s, rispetto dell'header `Retry-After` sui 429, User-Agent "JamNet/1.0". Flag: `--discogs-test=Paese:decennio` (dry run), `--discogs-only`, `--skip-discogs`. |
| Field recording / tradizione (integrata) | **Smithsonian Folkways** | Fonte di **scoperta** di esecutori di tradizione e field recording per paese, coerente con la visione (sez. 1: "dalle field recording degli anni '50"). Chiave api.data.gov in `.env.local` come `FOLKWAYS_API_KEY`. Usa la **Smithsonian Open Access API** (`api.si.edu/openaccess`, unit `CFCHFOLKLIFE` = Folkways + archivi Ralph Rinzler), interrogata per `unit_code:CFCHFOLKLIFE AND "<paese>"` (filtro inline in `q`, non in `fq`). **Niente audio diretto:** questi record sono metadati a livello di album, per lo più ad accesso ristretto e **senza link audio** — Folkways **non** offre quindi un fallback tipo `itunes_preview_url`; gli esecutori scoperti vanno **verificati a valle su YouTube/iTunes** come ogni altra fonte. Estrae i **nomi degli esecutori** (ruoli `performer`/`artist`; scarta recorder/field worker/producer = etnomusicologi, non l'entità musicale) **filtrati per geografia del record** (geoLocation/place che corrisponde davvero al paese, così la ricerca full-text non attribuisce per errore artisti di altri paesi). Risolve il nome su MusicBrainz (match esatto normalizzato): se trovato usa l'MBID reale e carica le sue registrazioni (tracce verificabili); altrimenti l'artista resta **solo-Folkways** con id sintetico `fw:<slug>`, coerente con `wd:`/`sp:`/`dg:`. Anti-duplicati come Wikidata: dedup per `mb_artist_id` e nome+paese (le tracce MB-linked dedupano per `mb_recording_id`). Pausa ~500 ms tra le chiamate, User-Agent "JamNet/1.0". Flag: `--folkways-test=Paese1,Paese2` (dry run), `--folkways-only`, `--skip-folkways`. |
| Contesto culturale | **Wikipedia (via MusicBrainz)** | 2 righe di descrizione per artista, salvate in catalogo dallo script. |
| Riproduzione | **Apple Music via MusicKit JS** | Integrazione nativa su Safari/dispositivi Apple. Autorizzazione utente al primo accesso (popup Apple). Account senza Premium: anteprime 30s, stesso catalogo, stessa navigazione. Abbonati Premium: brano integrale. Abbinamento tramite `apple_music_id` (ISRC → Apple Music API, storefront IT). Riproduzione integrale affidabile **solo su Safari** (Mac/iPhone/iPad): Chrome/Firefox presentano problemi CORS/DRM/EME incompatibili con la DRM di Apple — decisione confermata dopo verifica tecnica (thread forum Apple Developer, 2025). |
| Metadati e anteprima fallback | **iTunes Search API** | Copertine, itunes_track_id, itunes_preview_url, isrc. Usata dallo script per matching e come riserva display per brani senza apple_music_id. |

**Architettura audio: Apple-only (da 2026-06-15):** JamNet usa Apple Music via MusicKit JS come unica fonte audio. Il sito è accessibile e funzionante **solo da Safari su dispositivi Apple** (Mac, iPhone, iPad). Da Chrome, Firefox, Android, Windows: messaggio sobrio che invita ad aprire JamNet da Safari su dispositivo Apple — coerente con sez. 4.1, nessun gergo tecnico. Autorizzazione MusicKit richiesta in landing page prima di ogni interazione. Richiede account Apple Developer (99$/anno, già sottoscritto). ISRC e itunes_track_id salvati fin dalla Fase 1: base per il matching apple_music_id.

**Storefront Apple Music:** fisso **IT** (Italia) — scelta semplice per la versione personale/di prova, non dinamica per utente.

**Artisti da Wikidata e schema:** la tabella `artists` ha `mb_artist_id` come chiave primaria (text, non nullo). Gli artisti trovati su Wikidata **con** P434 usano il MusicBrainz ID reale, così si fondono con le righe MB (deduplica) e ne vengono caricate anche le registrazioni. Gli artisti **solo Wikidata** (senza P434) usano una chiave sintetica `wd:<QID>` (es. `wd:Q1340`): nessuna modifica allo schema, provenienza esplicita, `relevance` derivata dai sitelink Wikipedia. Restano senza tracce MB finché non emergono altrove (es. iTunes) — coperti dal flusso solo quando diventano riproducibili.

**Last.fm e relevance:** lo stage Last.fm gira **dopo** MusicBrainz e Wikidata, sull'intero catalogo (anche i nuovi artisti). Per ogni artista: `relevance_finale = round(relevance_base × clamp(log10(listeners+10)/3, 0.5, 2.0))`, da cui si ricalcola il `weight` di tutte le sue tracce (`weightFromRelevance`, unico punto di verità). Idempotente: il checkpoint (`lastfmDone[id]`) garantisce un solo passaggio per artista, così i rilanci non ricompongono il fattore sulla relevance già modulata. Gli artisti solo-Wikidata (`wd:…`) vengono cercati per nome con autocorrect. Esempi misurati (dry run `--lastfm-test`, base = recording-count MB): Fela Kuti weight 48→90 (×1.89, 484k ascoltatori), Tinariwen 32→59 (×1.85), Ali Farka Touré 24→44 (×1.82), Cesária Évora 46→81 (×1.78); chi è già al massimo (Caetano Veloso, Nusrat Fateh Ali Khan) resta a 100.

**Spotify e scoperta correlati:** lo stage Spotify gira **dopo** Last.fm (così i semi sono ordinati sulla relevance già modulata), come fonte di scoperta accanto a Wikidata. Autenticazione Client Credentials Flow (solo client_id/secret, in `.env.local` come `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`). Dai semi a relevance più alta (default 200, `--spotify-seeds=N`) prende i correlati via `related-artists` e inserisce quelli nuovi con id sintetico `sp:<spotifyId>` e `relevance` derivata dai follower (`log10(followers+10)×15`, scala comparabile a Wikidata e alla scoperta Last.fm); paese e macro-area ereditati dal seme (scena vicina). Gli artisti **solo Spotify** non hanno tracce MB, esattamente come i solo-Wikidata: restano coperti dal flusso quando diventano riproducibili altrove (es. iTunes). Idempotente: il checkpoint `spotifyDone[seedId]` salta i semi già trattati nelle sessioni precedenti.

**⚠ Vincoli operativi Spotify (stato attuale, 2026-06-14):** l'autenticazione Client Credentials **funziona** (token rilasciato, verificato con `--spotify-test`), ma **ogni endpoint dati** (`search`, `artists`, `related-artists`) risponde **403 — "Active premium subscription required for the owner of the app"**: dal 2025 Spotify richiede che il proprietario dell'app (l'account che ha generato le credenziali) abbia un **abbonamento Premium attivo**, altrimenti la Web API è inaccessibile via Client Credentials. In più, `related-artists` (e `recommendations`, `audio-features`) è stato **deprecato il 27/11/2024** per le app create dopo quella data: anche con Premium attivo, una app nuova potrebbe non poterlo usare. Lo stage è implementato e pronto, gestisce il 403 senza interrompere la pipeline, ma **non può scoprire artisti finché il blocco persiste**. Sblocco: (1) attivare Premium sull'account proprietario dell'app; (2) se `related-artists` resta inaccessibile, ripiegare sul **grafo di collaborazioni** (album del seme → artisti in feat./`appears_on`), che usa endpoint non deprecati per ottenere lo stesso effetto "nomi minori vicini al noto". Il test su campione non ha potuto riportare artisti nuovi: bloccato a monte dal 403, non dalla logica dello stage.

**Discogs e riempimento buchi:** lo stage Discogs gira **per ultimo** (dopo MusicBrainz, Wikidata, Last.fm e Spotify), perché agisce solo dove serve: calcola i brani riproducibili per area e interviene **solo sulle aree sotto la soglia** di ~200 (sez. 3.2). Per ciascun paese dell'area e per ogni decennio cerca le release Discogs di quel paese/anno, ne scarica il dettaglio (titoli brani + artisti puliti) e inserisce i nuovi. **Schema e provenienza:** artisti con id sintetico `dg:<discogs_artist_id>` (`relevance` proxy dal numero di brani trovati, poi modulabile da Last.fm); brani con `mb_recording_id = dg:<release_id>:<position>` (la colonna è `text unique` nullable, le chiavi sintetiche convivono con i veri MBID). Tag dai *style*/*genre* Discogs; le compilation ("Various") vengono scartate. Riproducibilità tentata come per gli altri stage: YouTube se resta quota, altrimenti anteprima iTunes. Budget per run (`DG_DETAILS_PER_RUN`, default 800 dettagli) e checkpoint per `area::paese::decennio`, così i rilanci riprendono senza rifare il lavoro.

**Anti-duplicati Discogs (decisione presa):** i brani Discogs non hanno `mb_recording_id`, quindi non si può usare la chiave anti-duplicati standard. Scelta concordata: **match stretto su titolo+artista+anno** normalizzati (minuscolo, senza diacritici, solo alfanumerici), confrontati contro l'intero catalogo (`loadExistingTrackKeys`) e contro i brani già aggiunti nello stesso run. Gli artisti seguono lo stesso trattamento di Wikidata/Spotify: dedup per `dg:<id>` e per nome+paese. **Compromesso noto:** l'anno Discogs è quello della **stampa**, l'anno MusicBrainz è quello di **prima pubblicazione**; con il match stretto lo stesso brano con anni diversi nelle due fonti **non viene fuso** e può quindi entrare una seconda volta. Accettato in cambio di zero falsi-merge tra brani omonimi di anni diversi. (L'alternativa più tollerante — titolo+artista senza anno — resta disponibile cambiando `trackContentKey`.)

**Folkways e field recording (decisione presa):** lo stage Folkways gira **dopo Wikidata e prima di Last.fm** (così il segnale modula anche i nuovi artisti, e Spotify può usarli come semi), accanto a Wikidata/Spotify come fonte di scoperta. La chiave (api.data.gov) è in `.env.local` come `FOLKWAYS_API_KEY`; il dry-run `--folkways-test` la legge anche da variabile d'ambiente. **Verifica fatta sull'API reale, non sull'assunto di partenza:** la Smithsonian Open Access API espone Folkways come catalogo d'archivio a livello di album, senza streaming — quindi **Folkways è una fonte di scoperta artisti, non di tracce né di audio**; il famoso catalogo streaming commerciale (folkways.si.edu) resta un'integrazione futura (stile MusicKit), non questa API. Gli esecutori scoperti che **non** si risolvono su MusicBrainz restano solo-Folkways senza tracce, esattamente come i solo-Wikidata/Spotify: coperti dal flusso quando diventano riproducibili altrove. **Precisione:** la ricerca full-text di SI pesca anche record che citano un paese di sfuggita, perciò si filtrano gli esecutori per la geografia strutturata del record (`geoLocation`/`place`), con confronto di paese tollerante (gestisce "United States of America" vs "United States", evita falsi positivi come "Mali" in "Somalia"). Test su due aree di forte tradizione field-recording (`--folkways-test=Mali,Indonesia`, 2026-06-14): **Mali** 12 record → 4 esecutori (griot mande oscuri, tutti solo-Folkways: profondità d'archivio che MB non ha); **Indonesia** 57 record → 124 ensemble distinti (gamelan balinesi), 11/20 del campione risolti su MusicBrainz → tracce verificabili.

**Regola architetturale:** il frontend non chiama MAI MusicBrainz/YouTube Data API/iTunes/Last.fm/Spotify/Discogs/Folkways durante l'ascolto. Tutto pesca dal catalogo Supabase costruito dallo script offline. MusicKit JS e Apple Music API sono l'unica eccezione autorizzata (riproduzione e salvataggio playlist): la chiamata avviene dal browser dell'utente con il suo token Apple, non tramite le nostre chiavi.

---

## 3. ARCHITETTURA

### 3.1 Catalogo (Supabase)

Tabella `tracks`:
- id (uuid), mb_recording_id (univoco, anti-duplicati)
- title, artist_name, artist_mb_id
- country (ISO 3166), macro_area (una delle 11), year (prima pubblicazione, da MusicBrainz)
- apple_music_id (annullabile) — popolato dal matching ISRC via Apple Music API (storefront IT)
- youtube_video_id (annullabile, **non più popolato**: campo conservato nello schema, rimozione definitiva in fase di pulizia)
- itunes_track_id, itunes_preview_url, artwork_url, isrc (tutti annullabili)
- tags (array generi/tradizioni)
- weight (numero: rilevanza dell'artista, vedi 3.3)
- is_new_release (boolean, default false) — impostato dal job settimanale nuove uscite
- created_at

Un brano è riproducibile se ha `apple_music_id`; in assenza, fallback a `itunes_preview_url` (anteprima 30s con etichetta "preview"). Gli altri restano "da risolvere" e lo script li ritenta.

Tabella `artists`:
- mb_artist_id (univoco), name, country, macro_area
- bio_short (2 righe da Wikipedia, lingua dell'interfaccia)
- relevance (numero di registrazioni/collegamenti su MusicBrainz — o sitelink Wikidata — modulato dal segnale di ascolti Last.fm; base del peso)

Tabella `match_reports`: track_id, motivo (wrong_video | wrong_metadata), note, created_at — alimentata dal tasto "segnala" nel flusso.

### 3.2 Script di catalogazione (`scripts/build-catalog.js`)

Eseguito a mano, incrementale, rilanciabile.
1. Legge `data/regions.json` (macro-area → paesi ISO → generi/tradizioni seed; per la diaspora vale il paese di ORIGINE dell'artista quando MusicBrainz lo distingue).
2. MusicBrainz: artisti per paese e periodo, registrazioni con first release date e tag, indicatori di rilevanza, link Wikipedia → bio_short.
3. ~~YouTube~~: **stage rimosso**. La quota da 100 ricerche/giorno è eliminata. Il campo `youtube_video_id` resta nello schema ma non viene più popolato.
4. iTunes: track_id, preview, artwork, isrc; filtri qualità (scarta karaoke, tribute, cover version, lullaby, meditation, made famous by).
4b. **Apple Music matching**: per ogni traccia con ISRC, query Apple Music API (storefront IT) → popola `apple_music_id`. Tracce senza match restano "da risolvere". Senza il vincolo YouTube, questi run sono più rapidi e rilanciabili liberamente.
5. Wikidata: artisti complementari per paese (vedi sez. 2).
6. Folkways: scoperta di esecutori di tradizione/field recording per paese via Smithsonian Open Access API; risolve i nomi su MusicBrainz (→ tracce verificabili) o li tiene come solo-Folkways `fw:<slug>` (vedi sez. 2). Niente audio diretto: verifica a valle YouTube/iTunes. Flag: `--folkways-test=Paese1,Paese2` (dry run), `--folkways-only`, `--skip-folkways`.
7. Last.fm: per ogni artista in catalogo, `artist.getInfo` → modula la `relevance` e ricalcola il `weight` delle tracce; backfill tag dove mancano (vedi sez. 2). Flag: `--lastfm-test` (dry run before/after), `--lastfm-only`, `--skip-lastfm`, `--lastfm-discover` (scoperta opzionale).
8. Spotify: scoperta artisti correlati dai semi a relevance più alta via `related-artists` (vedi sez. 2). Flag: `--spotify-test` (dry run), `--spotify-only`, `--skip-spotify`, `--spotify-seeds=N`. Soggetto ai vincoli Premium/deprecazione documentati in sez. 2: lo stage rileva il 403 e prosegue senza bloccare.
9. Discogs: per le **aree sotto soglia** (~200 brani riproducibili), cerca release per paese+anno (decennio per decennio), scarica i dettagli e inserisce artisti/brani nuovi con dedup stretto titolo+artista+anno (vedi sez. 2). Flag: `--discogs-test=Paese:decennio` (dry run), `--discogs-only`, `--skip-discogs`.
10. Scrive su Supabase; log finale per area e decennio (con conteggio artisti per provenienza: MusicBrainz vs Wikidata/Folkways/Spotify/Last.fm/Discogs-only).

Obiettivo prima esecuzione completa: nessuna area sotto ~200 brani riproducibili (con `apple_music_id`).

**Script separato — nuove uscite settimanali (`scripts/new-releases.js`):** interroga MusicBrainz per release recenti per area/genere, aggiunge al catalogo, imposta `is_new_release = true`. Frequenza: settimanale, tutte le aree. Alimenta l'etichetta "New release" nell'interfaccia.

### 3.3 Motore di scoperta (frontend)

- Query a Supabase: macro_aree + decenni (+ eventuale paese, vedi 4.2), esclusi gli ID di sessione.
- **Pesca pesata**: probabilità proporzionale a `weight` — gli artisti più rilevanti emergono più spesso, le profondità oscure affiorano comunque. Uguale per tutti: zero personalizzazione.
- **Logica di varietà in sequenza**: su ogni nuova pesca si controlla che il brano candidato non condivida `tags` (genere/tradizione) con nessuno degli **ultimi 8 brani** della sessione. Se il candidato non supera il controllo si ripesca; se dopo N tentativi non si trova un brano sufficientemente diverso, il vincolo si rilassa e si torna alla pesca pesata standard — il flusso non si blocca mai. Si applica a entrambe le modalità.
- **Due modalità**:
  - **Course** (ex-Rotta, default): il brano successivo resta vicino al precedente (stessa area o confinante, epoca simile) e il flusso si sposta gradualmente, come un DJ set; l'utente riorienta con la bussola. Ago: fermo, oscilla solo al cambio direzione.
  - **Whirl** (ex-Vortice): pesca da tutto il mondo e ogni epoca selezionata, salti liberi. Ago: gira durante ogni ricerca.
- Coda di prefetch da 10, ricarica sotto i 3; mai due brani consecutivi dello stesso artista.
- Riproduzione: **Apple Music via MusicKit JS** (anteprima 30s o integrale secondo abbonamento); fallback automatico `itunes_preview_url` con etichetta "preview" se `apple_music_id` assente.
- Anti-ripetizione: ID di sessione tenuti lato client, esclusi da ogni query.

---

## 4. INTERFACCIA E LINGUAGGIO VISIVO

### 4.0 Browser non compatibili
Da Chrome, Firefox, Android, Windows: schermata unica, sobria. Nessun gergo tecnico, nessuna funzione bloccata. Messaggio essenziale: JamNet funziona su Safari su dispositivi Apple. Stile coerente con 4.1 (avorio, terracotta, Lora/Inter).

### 4.1 Linguaggio visivo (vincolante per ogni fase)

Stile: minimalismo caldo, alla Anthropic. Regole:
- **Colori**: fondo avorio caldo (es. #FAF9F5; superfici #F0EEE6), testo quasi-nero caldo (es. #1F1E1D), UN solo accento terracotta (es. #C96442 / #CC785C) usato con parsimonia: pulsante play, selezioni attive, ago della bussola, cuore attivo. Nessun gradiente acceso, nessun neon, nessun tema scuro per ora.
- **Tipografia**: titoli in serif elegante (es. Lora o Source Serif 4), corpo e UI in sans-serif pulito (es. Inter). Gerarchia netta, poche taglie.
- **Spazio**: margini e respiri generosi; UNA sola azione primaria per schermata; niente schermate affollate.
- **Forme**: angoli arrotondati morbidi (8–12px), bordi sottili (1px, tono caldo), ombre quasi assenti.
- **Movimento**: solo animazioni funzionali (ago della bussola, dissolvenza tra brani, feedback di tocco), 200–300ms, mai decorative.
- **Microtesti**: sobri, caldi, brevi. Niente punti esclamativi, niente gergo tech.
- **Mappa**: zone in tinte piatte della palette; zona selezionata = riempimento terracotta; etichette leggibili; forme semplici, niente confini nazionali.

### 4.1b Landing page (NUOVA — primo schermo, prima della Home)
- **Illustrazione**: pittogramma stile cartello stradale/segnaletica — figura semplice seduta (anche a gambe incrociate) che ascolta un grammofono. Stile: sagoma in terracotta su fondo avorio (o viceversa), linee morbide coerenti con 4.1. Realizzata come SVG.
- **Tagline**: frase breve, sobria, in inglese, senza punti esclamativi. Opzioni (scegliere in esecuzione): "Discover music from everywhere, every era." / "The world's music, one song at a time." / "Every place. Every decade. One song away."
- **Bottone unico**: "Connect Apple Music" (terracotta) → avvia autorizzazione MusicKit (popup Apple). Dopo l'autorizzazione → Home.

### 4.2 Home
1. **Mappa del mondo SVG toccabile** (elemento centrale): 11 macro-aree selezionabili (multiple), comode al tocco su telefono. Chip "Whole world" sotto, default attivo.
2. **Bottoni decennio**: 1950s → 2020s + **Now** (nuove uscite), selezione multipla, default tutti. "Now" è collegato al job settimanale nuove uscite (sez. 3.2).
3. **Selettore modalità**: Course / Whirl (due opzioni, una attiva; copy e icona dell'ago coerenti).
4. **Play grande e centrale.**
5. **Destinazione del giorno**: una riga discreta sopra il play ("Today the compass points to: Ethiopia, 1970s") — toccandola si impostano i filtri e parte il flusso. Editoriale, uguale per tutti, generata da una rotazione curata (lista in `data/daily.json`, ciclica, modificabile a mano).

Niente barra di ricerca, niente preset, niente suggerimenti testuali.

### 4.3 Flusso
Un brano alla volta: copertina grande, titolo, artista, **paese + macro-area**, anno. Se `is_new_release = true`: etichetta **"New release"** sobria, posizionata vicino all'anno. Controlli: play/pausa, salta, cuore, condividi, segnala.
- Tocco sulla **macro-area** → filtro su quell'area. Tocco sul **paese** → il flusso si restringe a quel paese (la mappa resta a macro-aree, il motore sa scendere di livello).
- Tocco sull'**anno** → filtri centrati su quel decennio.
- Tocco su **artista** → si apre la scheda con bio_short (2 righe di contesto culturale) e link "ascolta altro di questo artista" (avvia flusso filtrato sull'artista).
- **Condividi**: ogni brano ha un link che apre JamNet direttamente su quel brano.
- **Segnala**: "abbinamento sbagliato" → scrive in match_reports.
- **Bussola** (angolo): pannello con mappa compatta, decenni, selettore modalità Course/Whirl.

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
- **Nessun limite numerico** per compilation (verificato: non necessario né per Supabase né per la libreria Apple Music).
- Ogni playlist è riproducibile in sequenza con il player del flusso.
- **Schermata di condivisione** (accessibile da compilation e playlist automatiche di genere):
  - Campo nota opzionale ("Add a note").
  - **Bottone primario "Save to Apple Music"** (terracotta): crea o aggiorna una playlist nella libreria Apple Music dell'utente via `apple_music_id`. Dopo il tap → "Saved". Se matching parziale (alcuni brani senza `apple_music_id`) → riga aggiuntiva "X of Y songs saved to Apple Music".
  - **Bottone secondario "Share"** (outline): apre Share Sheet nativo Safari/iOS (`navigator.share`) con link diretto alla playlist + nota dell'utente.
  - Nessun "feed" interno — condivisione solo verso app esterne.

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

---

## 8. STATO AL 15 GIUGNO 2026 — AGGIORNAMENTO SERA

### 8.1 Variabili d'ambiente — stato
| Variabile | Stato | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ OK | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ OK | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⚠️ **MANCANTE** | Serve per Phase 3 (auth/likes browser-side). Recuperare da Supabase Dashboard → Project Settings → API → "anon public". Aggiungere a `.env.local` e alle variabili della piattaforma di hosting. |
| `YOUTUBE_API_KEY` | 🚫 **NON PIÙ NECESSARIA** | Stage YouTube rimosso (sez. 3.2). La variabile può essere lasciata vuota o rimossa. |
| `APPLE_MUSIC_DEVELOPER_TOKEN` | ✅ OK | JWT generato il 15/06/2026, scade ~15/12/2026. Per rinnovarlo: `node scripts/generate-apple-token.js`. |
| `APPLE_MUSIC_TEAM_ID` | ✅ OK | `2C9S6USRY8` |
| `APPLE_MUSIC_KEY_ID` | ✅ OK | `4LFR8HX5RH` (chiave `JamNet MusicKit`, Media ID `media.jamnet.musickit`) |
| `APPLE_MUSIC_PRIVATE_KEY` | ✅ OK | Chiave privata .p8 in `.env.local`. Backup fisico: `AuthKey_4LFR8HX5RH.p8`. |
| `LASTFM_API_KEY` | ✅ OK | |
| `SPOTIFY_CLIENT_ID` | ✅ OK | Stage bloccato da 403 Premium (documentato in sez. 2) |
| `SPOTIFY_CLIENT_SECRET` | ✅ OK | Stage bloccato da 403 Premium (documentato in sez. 2) |
| `DISCOGS_TOKEN` | ✅ OK | |
| `FOLKWAYS_API_KEY` | ✅ OK | |

### 8.2 Stato del catalogo (checkpoint scripts/.checkpoint.json, 2026-06-11)
- **Stage MusicBrainz**: completato su 6/11 aree: West Africa, North Africa, Middle East, South Asia, East Asia, Southeast Asia. Mancano: **Latin America, Caribbean, Europe, North America, Oceania**.
- **Stage Last.fm**: 265 artisti arricchiti (solo sulle 6 aree già processate da MB). Da rieseguire dopo il completamento delle aree mancanti.
- **Stage Wikidata**: non ancora eseguito per nessuna area.
- **Stage Folkways**: non ancora eseguito per nessuna area.
- **Stage Spotify**: non eseguito (bloccato da 403 Premium, documentato in sez. 2).
- **Stage Discogs**: non ancora eseguito per nessuna area.
- **Quota YouTube**: al termine dell'ultimo run è stata azzerata (pronta per il prossimo run).

### 8.3 Correzioni applicate (2026-06-14)
- **`lib/supabase.ts`**: il browser client Supabase era inizializzato a livello di modulo con `NEXT_PUBLIC_SUPABASE_ANON_KEY` assente, causando un crash al build ("supabaseKey is required"). Corretto: `supabase = createClient(...)` → `createBrowserClient()` (factory lazy). Il build ora passa. Il client browser non è ancora usato (Phase 3), ma è pronto.

### ✅ PROMPT 3 — Completato (2026-06-15)

Realizzato:
- `lib/types.ts`: `Track` aggiornato con `appleMusId`, `isNewRelease`; `FlowMode` aggiornato a `course`/`whirl` (aliases `rotta`/`vortice` mantenuti); `HistoryEntry` aggiornato
- `lib/tracks.ts`: `TRACK_COLUMNS` e `dbRowToTrack` aggiornati con i nuovi campi
- `app/api/discover/route.ts`: filtro riproduzione → `apple_music_id OR itunes_preview_url`; varietà 8 brani (check tags, 6 tentativi, fallback pesca pesata); gestione decade `'now'` → `is_new_release = true`; supporto `course`/`whirl`
- `scripts/build-catalog.js`: aggiunta `appleSearch(isrc)` (Apple Music Catalog API, storefront IT, 400ms); `fetchRecordingsForArtist` include `isrcs` da MB; `processRecordings()` usa iTunes → ISRC → `appleSearch` (YouTube rimosso); Discogs idem; `runAppleMusicStage()` post-processing su tracce con ISRC; flag `--apple-only`, `--skip-apple`
- `scripts/new-releases.js`: nuovo script settimanale, `is_new_release = true`, scadenza automatica dopo 90 giorni

**Da fare (manuale, una volta sola):**
1. Eseguire in Supabase SQL Editor:
   ```sql
   ALTER TABLE tracks ADD COLUMN IF NOT EXISTS apple_music_id text;
   ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_new_release boolean DEFAULT false;
   CREATE INDEX IF NOT EXISTS idx_tracks_apple_music_id ON tracks (apple_music_id) WHERE apple_music_id IS NOT NULL;
   CREATE INDEX IF NOT EXISTS idx_tracks_is_new_release ON tracks (is_new_release) WHERE is_new_release = true;
   ```
2. Completare le aree mancanti: `node scripts/build-catalog.js`
3. Apple Music matching retroattivo sulle 6 aree già completate: `node scripts/build-catalog.js --apple-only`

> **Vecchio testo PROMPT 3** (conservato per riferimento):
> Leggi PROGETTO.md (sezioni 2 e 3). Obiettivo: catalogo completo e Apple Music come fonte audio.
> 1. **Aree mancanti**: esegui lo stage MusicBrainz per Latin America, Caribbean, Europe, North America, Oceania.
> 2. **Tutti gli stage**: esegui Wikidata, Folkways, Discogs anche sulle 6 aree già completate (West Africa, North Africa, Middle East, South Asia, East Asia, Southeast Asia).
> 3. **Apple Music matching (step 4b)**: per ogni traccia con ISRC, query Apple Music API (storefront IT) → popola `apple_music_id`. Aggiungere prima il campo alla tabella `tracks` su Supabase se assente.
> 4. **Logica di varietà**: implementa la finestra degli ultimi 8 brani con check sui `tags` nell'API `/discover` (con fallback alla pesca pesata se nessun candidato supera il controllo dopo N tentativi).
> 5. **Script nuove uscite** (`scripts/new-releases.js`): interroga MusicBrainz per release recenti per area/genere, aggiunge al catalogo con `is_new_release = true`. Frequenza: settimanale, tutte le aree.
> 6. **Ampiezza catalogo**: valuta se ampliare le query per genere/tag oltre i seed iniziali per avere un catalogo "colossale" — coordinare con Claude Code in esecuzione.
> A fine lavoro aggiorna PROGETTO.md segnando la Fase 3 completata.

Verifica: almeno 200 brani con `apple_music_id` per ogni macro-area; log di varietà mostra che la finestra funziona; script nuove uscite gira su campione senza errori.

---

### PROMPT 4 — Interfacce: landing page, condivisione, copy

> Leggi PROGETTO.md (sezioni 4 e 5.3). Obiettivo: interfaccia allineata alla nuova architettura Apple-only.
> 1. **Pagina browser non compatibili** (sez. 4.0): schermata sobria per Chrome/Firefox/Android/Windows, stile 4.1.
> 2. **Landing page** (sez. 4.1b): illustrazione SVG pittogramma (seduto con grammofono, terracotta su avorio), tagline (scegliere tra le opzioni in sez. 4.1b), bottone "Connect Apple Music" → autorizzazione MusicKit → Home.
> 3. **Home** (sez. 4.2): aggiungere opzione "Now" ai bottoni decennio, collegata a `is_new_release`.
> 4. **Flusso** (sez. 4.3): aggiungere etichetta "New release" per i brani con `is_new_release = true`.
> 5. **Schermata condivisione** (sez. 5.3): "Save to Apple Music" (crea/aggiorna playlist via MusicKit) + "Share" (Share Sheet nativo), campo nota, feedback parziale "X of Y songs".
> 6. **Copy/microtesti**: revisione di tutti i testi per coerenza con 4.1 (sobrietà, niente gergo, niente esclamativi).
> Stile come da sez. 4.1. A fine lavoro aggiorna PROGETTO.md segnando la Fase 4 completata.

Verifica: landing page su Safari iOS (autorizzazione Apple, poi Home); decade "Now" filtra correttamente; "New release" appare nel flusso; "Save to Apple Music" crea una playlist nella libreria Apple Music; schermata browser incompatibile su Chrome.

---

### PROMPT 5 — Account, libreria e playlist

> Leggi PROGETTO.md (sezione 5). Implementa:
> 1. Login magic link (Supabase Auth) + profiles. Al login, la cronologia locale si fonde con quella server.
> 2. Cuore nel flusso; likes, playlist automatiche per area/genere (creazione automatica alla prima occorrenza), compilation personali.
> 3. Pagina Libreria: Recently played, playlist automatiche, compilation; spostare/copiare brani tra playlist, riordino su/giù, rimozione, rinomina/eliminazione (automatiche solo nascondibili).
> 4. Riproduzione in sequenza delle playlist con il player esistente; link di condivisione in sola lettura per ogni playlist.
> 5. Utente non loggato che tocca il cuore: invito sobrio al login; dopo il login il like viene applicato.
> Stile come da sez. 4.1. A fine lavoro aggiorna PROGETTO.md segnando la Fase 5 completata.

Verifica: like a 5–6 brani di aree diverse → playlist automatiche corrette; creare una compilation, spostarci due brani, riordinarli, riprodurla, condividerla; ritrovare in Recently played un brano ascoltato senza like.

---

### PROMPT 6 — Pulizia file finale

> Leggi PROGETTO.md (sezione 3.1 e 3.2). Pulizia a cose stabili:
> 1. Rimuovi `youtube_video_id` dallo schema Supabase e da tutto il codice frontend/backend (verificare che non sia referenziato da nessuna query/tipo).
> 2. Rimuovi lo stage YouTube da `build-catalog.js` (il codice commentato/disattivato).
> 3. Riordino generale dei file: rimuovi variabili d'ambiente YouTube non più usate, aggiorna i tipi TypeScript.
> A fine lavoro aggiorna PROGETTO.md segnando la Fase 6 completata e aggiorna la sez. 8 con lo stato finale.

Verifica: build senza errori TypeScript; grep `youtube_video_id` su tutto il progetto → zero risultati nel codice attivo.

---

## 7. DECISIONI PRESE

| Tema | Decisione |
|---|---|
| Nome | JamNet |
| Firma | Bussola (Course: ago fermo; Whirl: ago che gira) |
| Modalità di flusso | **Course** (deriva graduale, default) / **Whirl** (salti liberi) — nomi definitivi confermati |
| Qualità del flusso | Pesca pesata sulla rilevanza degli artisti; finestra varietà 8 brani (check tags, fallback pesca pesata); zero personalizzazione |
| Contesto | Bio di 2 righe per artista (Wikipedia via MusicBrainz), scheda toccabile |
| Riproduzione | **Apple Music via MusicKit JS** — anteprima 30s (account senza Premium) o integrale (abbonati Premium); fallback `itunes_preview_url` con etichetta "preview" |
| Browser target | **Solo Safari su dispositivi Apple** (Mac/iPhone/iPad). Da altri browser: messaggio sobrio di reindirizzamento, nessuna funzione disponibile |
| Storefront Apple Music | Fisso **IT** (Italia) |
| Accesso Apple Music | Autorizzazione MusicKit richiesta in landing page (popup Apple) prima di qualsiasi interazione |
| Geografia | Mappa toccabile a 11 macro-aree; paese sempre visibile e toccabile per restringere; diaspora = paese d'origine |
| Periodo | Bottoni decennio multipli (1950s–2020s + Now) |
| Nuove uscite | Etichetta "New release" nel flusso; job settimanale `scripts/new-releases.js`; selezionabili con il decade "Now" |
| Ricerca testuale | Eliminata; in cambio: cronologia sempre disponibile |
| Ritorno quotidiano | Destinazione del giorno, editoriale e uguale per tutti |
| Condivisione brano | Link diretto per ogni brano |
| Condivisione playlist | "Save to Apple Music" (crea playlist nella libreria utente) + "Share" (Share Sheet nativo Safari/iOS); campo nota opzionale |
| Compilation | Nessun limite numerico |
| Account | Magic link email |
| Libreria | Cronologia + like → playlist automatiche + compilation personali modificabili |
| Stile | Minimalismo caldo (sez. 4.1, vincolante) |
| Landing page | Pittogramma SVG (seduto con grammofono, terracotta su avorio) + tagline + "Connect Apple Music" |
| Lingua UI | Inglese |
