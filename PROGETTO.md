# DOCUMENTO DI PROGETTO — JAMNET
Versione 1.2 — 10 giugno 2026
Proprietario: Edo. Questo documento è la memoria del progetto: va incollato all'inizio di ogni sessione di lavoro con Claude (o caricato in Claude Code). Ogni decisione presa qui è definitiva salvo modifica esplicita di Edo.

---

## 1. VISIONE

Un sito per scoprire musica nuova, di ogni luogo e di ogni epoca, con la semplicità d'uso e l'estetica di prodotti come quelli di Apple e Anthropic: massima funzionalità nascosta sotto un'interfaccia minimale. Non è una piattaforma di ascolto: è un motore di scoperta che si appoggia ad Apple Music. L'utente scopre brani tramite anteprime e con un solo gesto li salva in playlist reali sul proprio account Apple Music.

Principi non negoziabili:
- **Solo la musica parla.** Nessun numero di ascolti, nessun badge di popolarità, nessuna classifica visibile. Un artista sconosciuto del Mali del 1972 ha la stessa dignità visiva di una star mondiale.
- **Zero attrito nel caso comune.** Le azioni frequenti (ascolta, avanti, salva) richiedono un solo tocco. La complessità (gestione playlist, orientamento della scoperta) è accessibile ma mai invadente.
- **Nessun limite alla scoperta.** Ogni genere, paese, decennio. Il sistema non deve mai chiudere l'utente in una bolla.

## 2. CONCEPT: L'IBRIDO

### Schermata d'ingresso (Home)
Quasi vuota. Al centro: una barra di input testuale. L'utente può scriverci qualsiasi cosa: un artista, un brano, "desert blues 70s", "music for rain", un paese, un decennio. Sotto la barra: tre suggerimenti discreti che cambiano a ogni visita (esempi: "From Bamako, 1972" / "Similar to what you saved last week" / "Somewhere unexpected"). Più un pulsante play essenziale: toccandolo senza scrivere nulla si entra nel flusso con proposte libere.

Qualsiasi azione (testo inviato, suggerimento toccato, play) porta alla stessa destinazione: il Flusso.

### Il Flusso (Player)
Un brano alla volta, a schermo pieno: copertina grande, titolo, artista, luogo e anno. L'anteprima audio (~30 secondi) parte al tocco (vincolo iOS: il primo brano richiede sempre un tocco; i successivi possono concatenarsi).

Gesti:
- **Swipe verso l'alto** → brano successivo.
- **Tocco sul cuore** → salva nella playlist attiva (feedback visivo immediato, il flusso non si interrompe).
- **Tocco prolungato sul cuore** → si apre il selettore playlist: scegli dove salvare, crea una nuova playlist, vedi quelle esistenti. Tutto sincronizzato con Apple Music.
- **Tocco su artista/luogo/anno** → il flusso si riorienta su quella direzione ("more from here", "more from this era", "more like this artist").
- **Icona bussola (angolo, discreta)** → pannello con i controlli di direzione del flusso e la possibilità di inserire un nuovo input testuale senza tornare alla Home. La bussola è l'elemento-firma del sito: quando il flusso cerca nuovi brani, l'ago oscilla e poi si assesta sulla nuova direzione trovata. Piccola, semplice, mai invadente.

### Gestione playlist
Sezione raggiungibile dalla Home (icona discreta). Elenca le playlist create dal sito, permette di crearne, rinominarle, vedere i brani salvati, rimuoverli. Ogni modifica si riflette su Apple Music. Integrazione massima: la playlist sul sito e quella su Apple Music sono la stessa cosa.

### Aspetto sociale (FASE FUTURA, non MVP)
Già deciso nel design ma da costruire solo dopo che tutto il resto funziona alla perfezione: profili per gli amici, ognuno collega il proprio Apple Music, condivisione di brani ("ti mando questo brano, ti appare nel flusso segnalato") e visibilità delle playlist degli amici. Niente feed, niente like, niente commenti.

## 3. DECISIONI PRESE

| Tema | Decisione |
|---|---|
| Concept | C — Ibrido (filtri geografici/temporali + flusso immersivo). Barra testuale eliminata. |
| Budget | Apple Developer Program confermato (99$/anno) — pagamento rinviato all'inizio della Fase 3: le Fasi 1-2 sono interamente gratuite (anteprime via iTunes Search API). Verificato: non esiste prova gratuita o sandbox per MusicKit |
| Dominio | Nessuno per ora: indirizzo gratuito .vercel.app |
| Tema visivo | Automatico col sistema (chiaro/scuro), stile Claude |
| Lingua interfaccia | Inglese |
| Dispositivo primario | iPhone (design mobile-first assoluto) |
| Computer di lavoro | Mac |
| Popolarità | Nessuna distinzione visibile popolare/oscuro; pescaggio deliberato in profondità di catalogo |
| Salvataggio | Tocco singolo → playlist attiva; tocco lungo → scelta/creazione playlist |
| Home | Chip area geografica (multi-select) + range slider 1950–2026 + pulsante play grande. Nessuna barra testuale. |
| Flusso — luogo | Tocco sul luogo del brano → filtra per quell'area geografica |
| Flusso — anno | Tocco sull'anno → centra il range sul decennio |
| Bussola | Il pannello mostra chip geografici + slider temporale (non più testo libero) |
| Anti-ripetizione | ID brani visti salvati in sessionStorage; esclusi dalle fetch successive per tutta la sessione |
| Social | Rimandato a dopo l'MVP completo |
| Nome del sito | **JamNet** |
| Metafora guida | La bussola: icona-firma, ago che oscilla durante la ricerca e si assesta sulla direzione trovata |
| Linguaggio visivo | Ispirato ad Anthropic/Claude: dettagli curati al massimo (vedi sezione 7) |

## 4. ARCHITETTURA TECNICA

Edo non programma: Claude scrive il 100% del codice, Edo esegue setup guidati e prende decisioni di prodotto. Strumento di lavoro consigliato: **Claude Code** su Mac.

Componenti:
- **Frontend + backend**: applicazione Next.js (React), ospitata su **Vercel** (piano gratuito).
- **Database**: **Supabase** (piano gratuito) — servirà davvero dalla fase social; nell'MVP uso minimo (preferenze, cache).
- **Apple Music**: **MusicKit JS** per login utente, anteprime e creazione/gestione playlist. Richiede Apple Developer Program: si genera una chiave privata e un developer token. La ricerca catalogo e i metadati passano dall'**Apple Music API**.
- **Motore di scoperta**: combinazione di Apple Music API (catalogo, charts ignorate di proposito), **ListenBrainz/MusicBrainz** (relazioni tra artisti, aree geografiche, date) e **Last.fm API** (similar artists, tag). Tutte gratuite. La logica anti-mainstream vive nel nostro codice: dalle liste di candidati si pesca anche e soprattutto in profondità.
- **Interpretazione della barra di ricerca**: per input liberi tipo "music for rain" si valuterà in Fase 2 se basta una logica a regole + tag Last.fm o se integrare una chiamata all'API di Claude (costo minimo, da decidere allora).
- **Versionamento**: GitHub (gratuito), collegato a Vercel per il deploy automatico.

Vincoli tecnici noti (onestà preventiva):
- Su iPhone l'audio non può partire da solo alla prima apertura: serve sempre un tocco iniziale. Dopo, la concatenazione funziona.
- Le anteprime sono ~30 secondi (limite Apple, uguale per tutti).
- Le API di raccomandazione hanno un bias verso il popolare: lo si contrasta nel codice, e si affina nel tempo. Non sarà perfetto al giorno uno.
- Il token Apple Music va rinnovato periodicamente (max 6 mesi): processo semplice, andrà messo in calendario.

## 5. TABELLA DI MARCIA

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Progettazione e documento di progetto | ✅ COMPLETATA |
| 1 | Setup: account GitHub, Vercel, Supabase, installazione Claude Code su Mac — tutto gratuito | ⬜ Prossima |
| 2 | Il Flusso: sito online con Home, barra, flusso di scoperta e anteprime (senza login) — gratuito, anteprime via iTunes Search API | ⬜ |
| 3 | Apple Music: iscrizione Apple Developer (99$/anno), login, salvataggio reale, gestione playlist completa | ⬜ |
| 4 | Rifinitura: estetica finale, transizioni, dettagli da uso quotidiano reale | ⬜ |
| 5 | Social: profili amici, collegamento dei loro account, condivisione | ⬜ |

A fine fase si aggiorna lo stato in questa tabella e si annota qualsiasi decisione nuova nella sezione 3.

## 6. METODO DI LAVORO E RISPARMIO CREDITI

1. **Ogni sessione inizia con questo documento.** In Claude Code: tenerlo nella cartella del progetto come `PROGETTO.md` (verrà letto automaticamente se richiamato). In chat: incollarlo come primo messaggio con scritto "Riprendiamo dalla Fase X".
2. **Una fase (o sotto-obiettivo) per sessione.** Obiettivi chiari riducono gli scambi.
3. **Messaggi lunghi e completi.** Meglio un messaggio con dieci risposte/decisioni che dieci messaggi brevi. Vale per entrambi.
4. **Claude Code per costruire, la chat per decidere.** Claude Code scrive, corregge e pubblica i file da solo: elimina gli errori di copia-incolla che bruciano crediti. La chat resta per le decisioni di prodotto e design.
5. **Aggiornare questo documento a ogni fine sessione**: stato fasi, decisioni nuove, problemi aperti. È la garanzia di non ripartire mai da zero.

## 7. LINGUAGGIO VISIVO — "JAMNET"

Riferimento dichiarato: l'estetica di Anthropic/Claude. Tradotta in scelte concrete e vincolanti:

**Colori.** Tema chiaro: fondo avorio caldo (non bianco puro), testo quasi-nero caldo. Tema scuro: fondo grigio-bruno profondo (non nero puro), testo avorio. Un solo colore d'accento, usato con parsimonia (radar, cuore attivo, link): un arancio terracotta caldo, nella famiglia cromatica di Claude. Nessun gradiente vistoso, nessun colore decorativo gratuito. Il colore vero della schermata lo portano le copertine degli album.

**Tipografia.** Coppia serif + sans, alla Claude: serif elegante per i titoli e i nomi dei brani (calore, carattere editoriale), sans pulito per interfaccia e metadati. Gerarchia netta: pochi pesi, pochi corpi, mai testo superfluo.

**Spazio e composizione.** Aria generosa. Una sola cosa importante per schermata. Margini ampi e costanti. Niente bordi e ombre pesanti: separazione tramite spazio e tono.

**La bussola.** Elemento-firma e unico tocco "giocoso" concesso: icona circolare minimale con ago sottile che oscilla quando il sistema cerca e si assesta quando trova la nuova direzione. Presente nell'icona del sito, nel pannello di orientamento e come stato di caricamento (al posto del solito spinner). Disegnata in stile line-art sottile, coerente con il resto.

**Movimento.** Transizioni brevi e morbide (200–300 ms), mai gratuite: ogni animazione comunica qualcosa (brano che scorre via, cuore che conferma, radar che cerca). Rispetto dell'impostazione di sistema "riduci movimento".

**Micro-dettagli.** Feedback aptico leggero sui gesti chiave (iPhone), stati di caricamento curati (mai schermate vuote brusche), gestione elegante degli errori in una riga di testo, icone coerenti in un'unica famiglia. La cura dei dettagli non è una fase finale: è un criterio di accettazione di ogni fase.

---
*Fine documento. Prossimo passo: Fase 1 (setup). Richiede circa un'ora, con Mac a portata di mano e carta di credito per l'iscrizione Apple Developer.*



