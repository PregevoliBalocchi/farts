Method: dual-agent (A: revisione del design · B: detector)

# Critique del tavolo, verifica finale della Fase 6 (27 novembre 2026)

Target: `src/ui/table` (build `dist-single`, 3 giocatori con Leader e Lore, seed 3), a 1920×1080 e 1366×768, in italiano e in inglese. Battaglia e punteggio visti sulle schermate del 25 novembre (non raggiunti dal vivo).

## Design Health Score

| # | Euristica | Punteggio | Problema principale |
|---|-----------|-------|-----------|
| 1 | Visibilità dello stato | 3 | L'istruzione del turno è troncata ("3 azioni: scegline una o cl…") a 1366 e a 1920, in italiano e in inglese |
| 2 | Corrispondenza col mondo reale | 3 | Ripara, Tassa, Influenza, Guida, Razzia spiegati solo dal "?" |
| 3 | Controllo e libertà | 3 | "Annulla mossa" e "Fine turno" sempre visibili |
| 4 | Coerenza | 3 | Il nome del sistema ("Portale 2") resta sulla mappa dopo la scelta da tastiera |
| 5 | Prevenzione degli errori | 3 | Le azioni disattivate dicono perché ("Niente danni") |
| 6 | Riconoscere invece di ricordare | 2 | Fasce avversarie e riserva fatte di icone senza etichetta; la carta guida sta in un piccolo riquadro "GUIDA" |
| 7 | Flessibilità ed efficienza | 2 | La tastiera funziona sulla mappa; nessuna scorciatoia visibile per fine turno e annulla |
| 8 | Estetica e minimalismo | 2 | Circa 10 regioni competono per l'attenzione; la periferia è rumorosa |
| 9 | Recupero dagli errori | 2 | Solo il motivo delle azioni disattivate; nessun errore provato a fondo |
| 10 | Aiuto e documentazione | 3 | "?", registro, promemoria di regola |
| **Totale** | | **26/40** | **Accettabile** (era 23/40 il 25 novembre; obiettivo del piano: 30) |

## Specificità del design

**Revisione:** specifico, non generico. Cornici dorate, colonna delle Ambizioni, facce ufficiali, mappa 3D e colori dei seggi sono di questo gioco e seguono DESIGN.md. Il limite non è l'identità ma la densità e la leggibilità a 1366.

**Detector:** sul codice 355 riscontri, 352 avvisi di design system (287 colori, 40 corpi di testo, 24 raggi) e 3 strisce laterali: `table.css:1662` è un filo di 1 px su una maniglia, falso positivo; `:994` (posto nel draft) e `:2173` (insegna del turno) sono strisce del colore del seggio, volute ma fuori dalle regole. Sulla pagina servita su localhost: 0 riscontri a 1920 e a 1366. Nessun overlay nel browser (il sotto-agente non poteva iniettare script).

## Impressione generale

Il tavolo sembra il gioco ufficiale e la barra dei comandi è chiara. Il problema più grande è sempre lo stesso del 25 novembre: la frase che dice cosa fare adesso è tagliata, e a 1366 tutto il testo di contorno è piccolo.

## Cosa funziona

- Identità: cornici e arte ufficiale danno l'atmosfera senza immagini inventate.
- Barra dei comandi: pochi pulsanti, un solo primario dorato, le azioni disattivate dicono perché, posizioni fisse.
- Punteggio e battaglia: la sequenza Dadi, Tiro, Poteri, Colpi, Razzia e la spiegazione dei pareggi sono chiare.

## Problemi prioritari

- **[P1] Istruzione del turno troncata.** È l'unica riga che dice cosa fare adesso e il nuovo giocatore la legge per ultima. Era già P1 il 25 novembre. **Fare:** due righe o un'altezza minima sotto la mano, con il numero di azioni per primo e il resto che va a capo. **Comando:** `/impeccable clarify`.
- **[P1] Leggibilità a 1366×768.** Il palco è al 71%: GUIDA, contatori delle fasce, insegna del turno e anteprima della guida scendono intorno ai 9 px (l'audit misura 21 testi sotto gli 11 px). **Fare:** una regola per gli schermi piccoli (colonna delle Ambizioni chiusa alla sua linguetta, anteprima spostata), non un ingrandimento generale. **Comando:** `/impeccable adapt`.
- **[P2] Draft con 8 carte in una sola scelta.** 4 Leader e 4 Lore insieme. **Fare:** prima il Leader, poi la Lore. **Comando:** `/impeccable distill`.
- **[P2] Cose sopra la mappa.** Il nome del sistema scelto da tastiera resta sopra "Scarti azioni" e "Mazzo Corte"; l'insegna del turno copre pianeti e numeri di settore. **Fare:** chiudere il nome quando si sceglie l'azione; spostare l'insegna fuori dalla mappa. **Comando:** `/impeccable polish`.
- **[P3] Icone senza etichetta** nelle fasce avversarie e nella riserva. **Fare:** etichetta al primo uso o legenda. **Comando:** `/impeccable clarify`.

## Persone

- **Chi gioca per la prima volta:** l'istruzione tagliata in basso; la carta guida ridotta a "GUIDA"; Ripara/Tassa/Influenza non spiegati; 8 carte al draft.
- **Tastiera e vista bassa:** la mappa da tastiera funziona; a 1366 il testo di contorno è sotto la soglia.
- **Giocatore esperto:** niente scorciatoie per fine turno e annulla.
- **Chi conosce il gioco fisico:** riconosce plance e carte; trova ridondanti i contatori doppi (riserva e fasce).

## Osservazioni minori

- Gli anelli dei colpi in battaglia sono azzurri: è il colore del seggio attaccante, quindi corretto, ma ricorda la vecchia palette.
- Il draft in inglese non è stato fotografato; battaglia e punteggio dal vivo nemmeno.

## Domande

1. A 1366 serve un layout suo invece di rimpicciolire tutto al 71%?
2. Il draft deve mostrare tutte le 8 carte insieme, o Leader e Lore in due passi?
3. Quali aggiunte nostre (GUIDA, contatori doppi) servono davvero a chi conosce il gioco fisico?
