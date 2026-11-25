# Piano di blindatura del tavolo (25 novembre 2026)

Questo piano parte dalle 14 partite simulate (rapporto: `production/qa/evidence/playtest-2026-11-25/report/index.html`). Lo hanno preparato sette specialisti, ognuno sulla sua area, tutti in sola lettura:

- motore e decisioni (gameplay-programmer);
- layout e clic (ui-programmer);
- UX con il metodo Impeccable (ux-designer);
- controlli automatici (qa-lead);
- accessibilità (accessibility-specialist);
- regole e facilità di gioco (game-designer);
- testi e traduzioni (localization-lead).

Nessun file del gioco è stato modificato.

Scopo: correggere i 10 problemi trovati e i circa 40 emersi dall'analisi, e soprattutto fare in modo che non tornino. Ogni regola qui sotto vale anche per l'interfaccia futura di Blighted Reach.

---

## 1. Cosa abbiamo capito

**Tre cause spiegano quasi tutto.**

1. **Il motore non descrive le sue domande.** Una decisione porta solo il nome della carta, l'effetto e un insieme di dati senza struttura (`src/game/engine/types.ts:499`). Il tavolo tira a indovinare le risposte, provando una lista fissa di nomi di campi (`decide.ts`). Disegna sempre la stessa barra: "carta · effetto", "Scegli" acceso e "Rinuncia". Da qui vengono:
   - la battaglia ferma su "battle";
   - "Scegli" acceso con niente da scegliere;
   - la finestra dei Veggenti;
   - gli eventi della campagna dove "Rinuncia" in realtà sceglie la prima opzione.
2. **Una regola CSS fa catturare i clic a tutto lo stage.** La regola `.tbl.has-3d .tbl-stage > * { pointer-events: auto }` (`table.css:439`) vince su ogni `pointer-events: none` delle regioni. Così catturano i clic anche dove sono vuote: la regione dei rivali, la fascia in alto, la colonna delle ambizioni e l'ingrandimento delle carte. Da qui vengono i 97 clic bloccati sulla mappa e l'ingrandimento della Corte che "resta attaccato".
3. **Le facce delle carte azione non esistono.** `faceOf` (`cardface.ts:26`) conosce solo le carte della Corte, Lore e Leader. Per le carte azione mostra l'id ("construction-1", troncato in "constructi 1"). Questo vale per i Veggenti, per l'ingrandimento e anche per le etichette del lettore di schermo.

**Altre cause:**
- La telecamera inquadra la mappa sull'intera finestra, non sulla parte libera, e porta in vista solo il sistema che ha il focus. Per questo i sistemi accesi finiscono sotto la mano.
- L'ingrandimento si apre quando una carta riceve il focus, e il tavolo rimette il focus sulla carta dopo ogni ridisegno.
- La faccia di Canto di Libertà ritaglia il disegno da un punto fisso (`tools/cards/extract-art.mjs:30`). Quel ritaglio include la nota inglese stampata.
- **Il CI non lancia nessun test nel browser.** `deploy.yml` pubblica `main` dopo il solo controllo dei tipi e i test unitari. Per questo i problemi di interfaccia non vengono mai fermati prima del sito.

**Regole:** nessuna violazione trovata. Il controllo attuale però conta solo i pezzi, non la legalità delle mosse. Abbiamo anche trovato una lacuna di regola vera, con Sensori Predittivi: per il regolamento (`arcs-rules-library.txt:430`) l'attaccante sceglie i dadi **dopo** la reazione del difensore. Il motore invece riusa quelli scelti prima.

---

## 2. Il contratto delle decisioni

Ogni domanda che il gioco fa al giocatore, oggi e nella campagna, deve rispettare queste regole. Se una domanda ne viola una non si pubblica, e un test lo verifica.

1. **La domanda è scritta per intero**, con un verbo e un oggetto, nella prima riga della barra. Per esempio: "Veggenti: scegli una carta da prendere a un rivale". Mai solo il nome della carta.
2. **Le opzioni sono le cose stesse:** le carte con la loro faccia, i giocatori con colore e simbolo, i sistemi accesi sulla mappa, le risorse e le ambizioni con i simboli ufficiali. Il testo è solo una didascalia.
3. **La conseguenza si vede prima del clic.** I passi irreversibili (passare, dichiarare, tirare, finire il turno) lo dicono.
4. **Nessun pulsante morto.** Se non c'è niente da fare, una riga spiega perché e c'è un solo pulsante "Continua".
5. **I pulsanti dicono cosa succede.** Per esempio "Non usare i Veggenti" o "Chiudi, scegli dopo". Mai "Scegli", "Rinuncia" o "Indietro" generici.
6. **Una domanda alla volta, al massimo 4 opzioni visibili.** Le scelte grandi diventano passi (rivale → carta → carta). La finestra sta sempre nello schermo.
7. **Il contesto resta in vista:** la mano del rivale, i dadi, la classifica delle ambizioni.
8. **Lo stato è sempre visibile:** un'insegna del turno, con chi gioca, la fase e la carta guidata, uguale su ogni schermo.
9. **Quello che ti fanno gli altri ti viene detto:** sulla mappa mentre succede, e in un riepilogo quando torna il tuo turno.
10. **Uscite chiare:** "Annulla" finché non si rivelano informazioni nascoste. "Rimanda" è sempre diverso da "rifiuta".
11. **Un solo glossario**, con i termini del regolamento italiano. Un "?" accanto alla domanda ricorda la regola in quel momento.
12. **Niente dati grezzi:** niente id, nomi interni, JSON o testo inglese di ripiego. Un testo mancante fa fallire un test.
13. **Il contratto è verificato** da un test per ogni tipo di decisione.

---

## 3. Decisioni che servono a te prima di partire

| # | Decisione | Proposta |
|---|---|---|
| A | **Descrizione delle decisioni nel motore** (`decisionSpec`). Ogni effetto di carta dichiara la sua domanda, se si può rifiutare e i passi della risposta, ciascuno con i valori legali. Il tavolo le disegna tutte con un solo componente. | Sì. È la base di quasi tutto il resto e regge la campagna. È il lavoro più grande (L). |
| B | **Sensori Predittivi:** la raccolta dei dadi diventa una fase vera della battaglia. L'attaccante sceglie i dadi dopo la reazione, come dice il regolamento. | Sì. Corregge anche la regola. |
| C | **CI con i test nel browser:** i test end-to-end e una partita simulata breve per configurazione girano su ogni PR, e il deploy parte solo se passano. Il deploy diventa più lento (circa 10-12 minuti). | Sì. |
| D | **Antichi Possedimenti:** lo spazio della risorsa va disegnato sulla carta, come al tavolo vero, non sulla plancia. | Sì. |
| E | **Ingrandimento delle carte:** non cattura mai il mouse. Nelle file (Corte, mano) si apre sopra o sotto la fila, non sulle carte vicine. Si chiude al clic o quando si apre un menu. Non si apre più col focus all'apertura di una finestra. | Sì. |
| F | **Colori dei giocatori:** il simbolo del seggio va affiancato al colore su bande, agenti e pezzi. Aggiungere un'opzione di colori per daltonici, come chiedono le regole del progetto. | Sì, senza cambiare i colori ufficiali di base. |
| G | **Schermata finale** con la classifica, il Potere per capitolo e lo spareggio. | Sì. |

---

## 4. Fasi di lavoro

Le fasi vanno in quest'ordine. Ogni correzione segue la stessa procedura:
1. scrivere prima il test o il controllo;
2. vederlo fallire su `main`;
3. correggere;
4. vederlo passare;
5. annullare la correzione una volta in locale per confermare che il test torna rosso.

Le prove "prima" e "dopo" vanno in `production/qa/evidence/hardening-2026-11-xx/<problema>/`.

### Fase 0: la rete di sicurezza (qa-lead, qa-tester, devops-engineer)
1. Salvare in git il simulatore (`tools/playtest/sim.mjs`). Le funzioni comuni vanno in `tools/playtest/lib.mjs`. Il simulatore registra solo osservazioni; i verdetti li dà un nuovo test, `tests/integration/playthrough.spec.ts`.
2. **Registro dei pezzi** nel motore (`pieceLedger(state)`), con un test unitario. Conta navi 15, agenti 10, città 5 e spazioporti 5 per giocatore ovunque si trovino: Oltraggio, trofei, prigionieri, pezzi tolti dal gioco. Così spariscono i falsi allarmi di oggi.
3. **Partite ripetibili:**
   - un generatore casuale deterministico;
   - attesa sui cambi di stato invece di pause fisse;
   - un seme salvato per ogni configurazione (`seeds.json`), scelto in modo che arrivi a una battaglia, una scelta di carta e un acquisto in Corte;
   - lo stesso seme deve dare le stesse mosse.
4. **Controlli a ogni passo:**
   - nessun bersaglio acceso coperto: si controllano 5 punti, non solo il centro;
   - ogni bersaglio acceso dentro lo schermo per intero;
   - ogni decisione ha una domanda e almeno una risposta viva;
   - niente id o nomi interni, nemmeno in `aria-label` e `title`;
   - bersagli di almeno 24×24 px;
   - nessun errore nella pagina;
   - schermi allineati.
5. **Controlli di regola dopo ogni mossa** (game-designer):
   - chi ha l'iniziativa (5.3);
   - legalità di superare, copiare e cambiare (5.2.2);
   - mani di 6 carte a inizio capitolo e conteggio costante delle carte;
   - segnalini ambizione (3 in tutto, il più alto preso per primo, uno girato a fine capitolo);
   - Potere ricalcolato dopo il punteggio;
   - pulizia di trofei e prigionieri;
   - Corte sempre piena;
   - fine partita a 27/30/33 o al capitolo 5;
   - Oltraggio;
   - ordine dei turni.
6. **Nuovo job CI** con gli e2e esistenti, la partita simulata breve (7 configurazioni da 80 passi, 1366×768, più una in inglese) e il controllo delle facce delle carte. `deploy.yml` dipende da questo job.
7. Scrivere **prima** i 10 controlli che falliscono, uno per problema.

### Fase 1: il motore e le decisioni (gameplay-programmer, con revisione del lead-programmer)
1. **D2, scelta vuota:**
   - quando una scelta facoltativa non ha risposte legali, il motore la risolve da solo invece di chiederla (per esempio Canto di Libertà senza città);
   - come rete di sicurezza, il tavolo mostra "Nessuna scelta possibile" e un solo "Continua".
   - Da verificare con le FAQ: Canto di Libertà controlla "una città che controlli" (`base.ts:448`).
2. **D0, `decisionSpec`** (decisione A), con un test che verifica che ogni tipo di decisione abbia la sua descrizione.
3. **D3, Veggenti in due passi:** prima il rivale, poi la sua mano mostrata come carte e lo scambio. "Non scambiare" sempre presente.
4. **D1, Sensori Predittivi:** la fase "raccogli i dadi" con il selettore dei dadi della battaglia e "Tira i dadi" (decisione B).
5. **D4, eventi della campagna:** le descrizioni dichiarano che non si possono rifiutare, così "Rinuncia" non sceglie più a caso. Mancano anche i testi in italiano.
6. **Altre decisioni a rischio, da coprire con la descrizione:**
   - court-27 e court-28 (stesso difetto della scelta vuota);
   - court-30 (secondo passo che non si può rispondere);
   - leader-08 (tutti i sottoinsiemi della Corte);
   - il limite di 800 tentativi di `decide.ts`, che può far sparire opzioni;
   - leader-01 (domanda generica).
7. **Test di regola mancanti** (game-designer):
   - non si può prendere l'iniziativa se la si ha già, e la carta usata per prenderla va scartata;
   - "Ambizioni limitate";
   - gli 1 non dichiarano e i 7 dichiarano qualsiasi ambizione;
   - bonus Potere delle città (+2/+5);
   - si gira il segnalino più basso;
   - soglie di fine partita e fine al capitolo 5;
   - mani di 6 carte;
   - Oltraggio da una città distrutta fuori battaglia;
   - il difensore prende come trofei le navi d'attacco distrutte;
   - la seconda ridistribuzione a 2 giocatori va rifiutata.

### Fase 2: layout e clic (ui-programmer, con il passaggio Impeccable `layout` + `adapt`)
1. **Correzione alla radice dei clic:** togliere la regola di `table.css:439`, così ogni regione riceve i clic solo dove ha contenuto. Questo sistema insieme la regione dei rivali, la fascia in alto, la colonna delle ambizioni e l'ingrandimento.
2. **Regione dei rivali alta quanto le bande reali** (`layout.ts:72`). Regge anche più seggi nella campagna.
3. **`ensureVisibleSet`:** quando si accende un insieme di sistemi, la telecamera li inquadra tutti nella parte libera della mappa, allontanandosi se serve. Si muove solo quando l'insieme cambia, per non disturbare chi sposta la mappa a mano.
4. **Ingrandimento rifatto** (decisione E). La faccia ingrandita diventa un'immagine statica, non un pulsante.
5. **Finestre di scelta:** nessun ingrandimento automatico. Le liste hanno un'altezza massima e restano nello schermo, e i Veggenti non escono più dal bordo.
6. **Antichi Possedimenti** sulla carta (decisione D), mantenendo il trascinamento delle risorse.
7. **Area di clic minima:** una variabile `--hit` calcolata dalla scala dello stage, così ogni comando resta di almeno 24 px a qualsiasi risoluzione. Serve per Tipo, Risorsa, "Mostra tutta la Corte", "I miei pezzi" e la linguetta delle ambizioni.
8. **Altri punti con lo stesso difetto:**
   - suggerimenti che restano aperti sopra la mappa;
   - carte della propria Corte che salgono sopra la barra dei comandi;
   - la casella d'attesa a 300 px fissi.

### Fase 3: carte e testi (localization-lead, ui-programmer)
1. **Facce delle carte azione** in `faceOf`, nell'ingrandimento e nelle etichette. Le carte azione esistono già nel kit grafico.
2. **Traduzioni senza ripiego:**
   - nei test e in sviluppo una chiave mancante è un errore, invece di comparire come parola grezza (`i18n/index.ts:20`);
   - tutte le chiavi usate devono esistere in `it` e in `en`;
   - le etichette composte vanno costruite con modelli tradotti, non incollando parole.
3. **Ritaglio per carta** delle facce Vox, che parte sotto il testo stampato, con una sfumatura più ampia. Per prima Canto di Libertà; da controllare court-26, 27, 28, 30 e 31.
4. **"Crisis:"** va tradotto; i 15 Vox della campagna non hanno ancora il testo italiano.
5. **Test delle facce:** ogni carta resa in italiano e in inglese, senza testo che sborda, con il disegno sotto l'ultima riga di testo e una schermata salvata per carta.
6. **Un solo glossario:** "Riquadro" e "Casella ambizione" diventano un termine solo, preso dal regolamento.

### Fase 4: UX e facilità di gioco (ux-designer con Impeccable `critique` → `clarify` → `layout` → `polish`; game-designer per i contenuti di regola)
Il punteggio Impeccable di oggi è **19/40**, che vuol dire "da migliorare". L'obiettivo è almeno 30.
1. **Un componente per ogni tipo di scelta**, che rispetta il contratto: domanda intera nella prima riga della barra, opzioni come carte, giocatori, sistemi o simboli, e una riga di conseguenza.
2. **Togliere il vicolo cieco JSON** ("usa le opzioni avanzate", "Risposta (JSON)"). Non va mai mostrato a un giocatore.
3. **Insegna del turno** con il colore del seggio attivo, la fase e la carta guidata.
4. **"Mentre aspettavi":** il riepilogo di quello che i rivali ti hanno fatto (navi perse, risorse rubate, agenti catturati).
5. **Anteprime:**
   - sotto Supera, Copia e Cambia, cosa danno (per esempio "Copia: 1 azione, nessuna iniziativa");
   - sopra Dichiara, il 1° e il 2° posto previsti e il Potere in gioco;
   - prendere l'iniziativa, con il motivo quando non si può;
   - distruggere una città, con il costo dell'Oltraggio.
6. **Battaglia:** il risultato mostrato con le facce dei dadi raggruppate, l'ordine dei colpi e una vista per il difensore.
7. **Punteggio di fine capitolo** senza gergo ("1°: 9 Potere · 2°: 4"), con il motivo di ogni "+0" e la nota per 2 giocatori a dimensione normale.
8. **Schermata finale** (decisione G).
9. **Correzioni piccole:**
   - "nella colonna a destra" diventa "nella fila in alto" per la Corte;
   - il bagliore turchese diventa oro (`table.css:376, 597`);
   - la plancia del rivale si apre grande al passaggio del mouse.
10. **Promemoria di regola "?"** nei momenti in cui un nuovo giocatore si confonde: copiare o cambiare, prendere l'iniziativa, dichiarare, passare, l'intercettazione, l'ordine dei colpi, il limite dei raid, mettere al sicuro, la fine del capitolo, le regole a 2 giocatori.

### Fase 5: accessibilità (accessibility-specialist)
1. **Subito, sono lavori piccoli:**
   - nomi delle carte nelle etichette per il lettore di schermo, non id (A1);
   - area di clic (A4);
   - rispettare "riduci animazioni" del sistema anche nelle viste 3D (A7);
   - nome del sistema al posto dell'id (A12).
2. **Poi:**
   - ingrandimento da tastiera solo con un tasto, mai col focus d'apertura (A2);
   - sistemi selezionabili annunciati, con le frecce che saltano prima a quelli validi e la mappa che li inquadra (A3);
   - Esc chiude prima l'ingrandimento e i suggerimenti, e il focus torna a chi ha aperto il menu (A5).
3. **Poi ancora:**
   - un solo aiuto comune per le finestre, con focus intrappolato e `aria-modal` (A6);
   - segni che non usano solo il colore per "acceso" e per i seggi, e la tavolozza per daltonici (A9);
   - testi piccoli portati sulla scala tipografica, con un passo 1,5× (A8).
4. **Da pianificare:** il controller (A11), richiesto dalle regole del progetto. Il contrasto del testo sopra la mappa va misurato con le schermate (A10).

### Fase 6: verifica finale (qa-lead, Impeccable `audit` + `critique`)
1. **Partite lunghe di notte:**
   - 2, 3 e 4 giocatori, base e con Leader e Lore;
   - in italiano e in inglese, a 1366 e a 1920;
   - in più 1536 e 1280 per la partita a 4 con Leader e Lore;
   - 3 semi per configurazione.
   - Nessuna nuova categoria di problema deve comparire.
2. **Impeccable `audit` e `critique`** rilanciati: punteggio di almeno 30/40 e nessun problema bloccante.
3. **Prove "prima" e "dopo"** per tutti i 10 problemi del rapporto, e una schermata per ogni schermo toccato.
4. **Una tua partita di prova** online prima del rilascio.

---

## 5. Come dividerlo in PR

| PR | Contenuto | Specialisti | Peso |
|---|---|---|---|
| 1 | Fase 0: simulatore, registro dei pezzi, controlli che falliscono, job CI e deploy legato | qa-lead, devops-engineer | M |
| 2 | Correzione alla radice dei clic, regione dei rivali, ingrandimento, area di clic, liste con altezza massima | ui-programmer + Impeccable | M |
| 3 | D2 scelta vuota, D0 descrizione delle decisioni, componente unico delle scelte, via il JSON | gameplay-programmer, ui-programmer, ux-designer | L |
| 4 | D3 Veggenti, D1 Sensori Predittivi, D4 eventi, facce delle carte azione | gameplay-programmer, localization-lead | M |
| 5 | Sistemi accesi inquadrati, Antichi Possedimenti, ritaglio delle carte Vox, test delle facce, glossario | ui-programmer, localization-lead | M |
| 6 | Insegna del turno, "mentre aspettavi", anteprime, battaglia, punteggio, schermata finale, promemoria "?" | ux-designer + Impeccable, game-designer | L |
| 7 | Accessibilità A1–A10, tavolozza per daltonici | accessibility-specialist | M |
| 8 | Test di regola mancanti e controlli di regola nel simulatore | game-designer, qa-tester | M |

Le PR 2 e 8 non dipendono dalle altre e possono andare in parallelo alla 3. La 4 dipende dalla 3, la 6 dalla 3 e dalla 5. Ogni PR passa dalle verifiche (tipi, test unitari, e2e, partita simulata), dal merge e dal controllo del sito pubblicato, come facciamo sempre.

## 6. Rischi

- **D0 tocca tutte le decisioni.** La rete della Fase 0 e i test esistenti sui poteri delle carte devono restare verdi.
- **La fase dei dadi** (D1) cambia la battaglia, l'annullamento e la sincronia online. Serve un e2e online con due schermi.
- **La telecamera che si muove da sola** può dare fastidio. Si muove solo quando cambia l'insieme dei sistemi accesi e mai mentre si trascina la mappa.
- **Il CI più lento** ritarda il deploy di circa 10 minuti.
- **Le parti della campagna** (Vox della campagna, eventi) non hanno ancora tutte le immagini sorgente. Le verifiche visive restano parziali finché non ci sono.
