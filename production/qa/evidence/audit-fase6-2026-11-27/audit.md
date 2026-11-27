# Audit del tavolo, verifica finale della Fase 6 (27 novembre 2026)

Target: schermata del tavolo (`src/ui/table/`, build `dist-single`, `?view=table`, 3 giocatori con Leader e Lore), misurata a 1920×1080 e 1366×768. Confronto con l'audit del 25 novembre (10/20). Schermate: `production/qa/evidence/audit-fase6-2026-11-27/`.

## Audit Health Score

| # | Dimensione | Punteggio | Prima | Problema principale |
|---|-----------|-------|------|-------------|
| 1 | Accessibilità | 3 | 2 | A 1366 alcuni numeri delle fasce avversarie e dei mazzi scendono sotto gli 11 px (fino a 7,8 px) |
| 2 | Prestazioni | 3 | 3 | Ogni azione ridisegna ancora tutto il palco (778 nodi, circa 55 ms) |
| 3 | Theming | 2 | 1 | DESIGN.md e 44 token, usati 1040 volte; restano 489 colori a mano (204 diversi) |
| 4 | Responsive | 3 | 2 | Testo "Grande" automatico sotto l'85%; restano 4 controlli sotto i 24 px |
| 5 | Integrità dell'implementazione | 2 | 2 | CSS ancora a strati: 49 regole `.tbl-stage.tbl-stage`, 8 `!important`, 17 blocchi "base-fixes" |
| **Totale** | | **13/20** | **10/20** | **Accettabile, in crescita: nessun problema bloccante** |

## Verdetto sull'integrità dell'implementazione

**Superato con riserva.** Il sistema è coerente e ora è anche scritto:
- DESIGN.md ("Gilt in the Void") fissa colori, scala tipografica, regole d'oro e bagliore;
- la mappa della campagna è progettata (`design/ux/campaign-table-layout.md`, approvata il 25 novembre);
- le regioni sono calcolate in un solo punto (`layout.ts`), le decisioni le descrive il motore, le facce delle carte azione esistono.

Le riserve:
- **Il CSS cresce ancora per sovrapposizione.** I doppi prefissi sono scesi da 82 a 49, ma `table.css` è passato da 2083 a 2191 righe e i blocchi di correzione in coda sono 17.
- **Gli spazi della campagna non sono ancora nella geometria.** Il documento dice che ogni spazio "nasce in `layout.ts`", ma lì non c'è ancora nessuna regione della campagna. Non blocca il gioco base.

Riscontri del detector sul codice (355): 352 avvisi di design system (287 colori, 40 corpi di testo, 24 raggi fuori dai token), 3 strisce laterali, 1 curva con rimbalzo. Sono reali e sono qui sotto. Il detector sulla pagina renderizzata (`detect <url>`, servita su localhost) non trova nulla a 1920×1080 e a 1366×768; il primo tentativo da file:// era andato in timeout. Le misure di testo, bersagli e struttura riportate qui sono fatte con Playwright.

## Sintesi

- Punteggio: **13/20 (Accettabile)**, era 10/20.
- Problemi: **P0: 0 · P1: 1 · P2: 6 · P3: 1**
- I più importanti:
  1. Numeri piccoli nelle fasce degli avversari e sui mazzi a 1366.
  2. Colori ancora per metà scritti a mano.
  3. CSS a strati.
  4. Spazi della campagna non ancora in `layout.ts`.
- Risolti dal 25 novembre: contrasto dei tipi d'azione sulle carte (ora inchiostro scuro), landmark e regioni (8), `aria-modal` e focus intrappolato nelle finestre, ordine delle frecce sulla mappa, movimento ridotto del sistema, palette per daltonici, sistema di design scritto.

## Riscontri dettagliati per gravità

### [P1] Numeri piccoli nelle fasce degli avversari e sui mazzi a 1366
- **Dove:** a 1366×768: bonus degli edifici "+2/+3" nelle plance in miniatura degli avversari (7,8 px), Potere nelle fasce (10 px), conteggi dei mazzi (9,8 px), "Nessuna carta" (9,9 px), etichette del draft "Leader"/"Lore" e "nessuna carta" (9,2 px). A 1920 restano 4 testi sotto gli 11 px.
- **Categoria:** Accessibilità / Responsive
- **Impatto:** sono valori di gioco: il bonus di una città avversaria e il suo Potere si leggono a fatica sui portatili. Prima erano 34 testi sotto gli 11 px a 1366, ora sono 21 (di cui 4 titoli delle carte della Corte, che sono faccia di carta e possono scendere).
- **Standard:** WCAG 1.4.4; Caption-Floor Rule di DESIGN.md (13 px sul palco).
- **Cosa fare:** portare `.plus`, `.pow`, `.num` delle fasce e `.dr-label`/`.dr-none` sulla scala `--fs-*` con un minimo di 12 px sullo schermo a 1366; nelle plance in miniatura, dove non c'è spazio, mostrare il valore solo nella plancia aperta.
- **Comando:** `/impeccable typeset`

### [P2] Colori ancora per metà scritti a mano
- **Dove:** `table.css`: 489 esadecimali (204 diversi) e 118 `rgba()`, contro 44 token definiti e 1040 usi di `var(--…)`.
- **Categoria:** Theming
- **Impatto:** le fazioni della campagna (Impero, Rovina, Stati Liberi) e i titoli andranno aggiunti come token; finché metà dei colori è a mano, cambiare l'aspetto resta costoso.
- **Cosa fare:** sostituire per componente i valori a mano con i token di DESIGN.md, partendo da oro e superfici.
- **Comando:** `/impeccable polish`

### [P2] CSS a strati di correzioni
- **Dove:** `table.css`: 49 regole `.tbl-stage.tbl-stage`, 8 `!important`, 17 blocchi "base-fixes #…" che ridefiniscono componenti già stilati sopra.
- **Categoria:** Integrità dell'implementazione
- **Impatto:** ogni ritocco rischia di romperne un altro; i test e2e e le partite simulate in CI fanno da rete, ma il costo di ogni modifica resta alto.
- **Cosa fare:** fondere le regole per componente, una sezione ciascuno, senza doppi prefissi.
- **Comando:** `/impeccable polish`

### [P2] Spazi della campagna non ancora nella geometria
- **Dove:** `src/ui/table/layout.ts` (`REGIONS`) rispetto a `design/ux/campaign-table-layout.md` §3-§5.
- **Categoria:** Integrità dell'implementazione
- **Impatto:** il progetto c'è, ma le regioni (Fato e ammiraglia, Consiglio, libretto, finestra di fase) non esistono ancora: una modifica al gioco base può occupare quegli spazi senza che nessun test se ne accorga.
- **Cosa fare:** creare le regioni vuote in `layout.ts` e un test che controlli che restino libere nel gioco base.
- **Comando:** `/impeccable layout`

### [P2] Controlli sotto i 24 px
- **Dove:** a 1366: "Evidenzia per qualche secondo" (71×14), i filtri "Tipo"/"Risorsa" della Corte personale (39×20), i blocchi Trofei/Prigionieri (37×23). I 16 tasti dei sistemi da 1×1 px sono i comandi da tastiera della mappa 3D, nascosti di proposito: non contano.
- **Categoria:** Responsive / Accessibilità
- **Standard:** WCAG 2.5.8
- **Cosa fare:** area cliccabile di almeno 24 px sullo schermo, anche con padding invisibile.
- **Comando:** `/impeccable adapt`

### [P2] Ridisegno completo a ogni azione
- **Dove:** `table.ts` (`stage.innerHTML = …`): 778 nodi, circa 55 ms per ridisegno a 1366 (erano 706 e 48 ms).
- **Categoria:** Prestazioni
- **Impatto:** oggi accettabile; con i pannelli della campagna i nodi possono raddoppiare.
- **Cosa fare:** ridisegnare solo le regioni cambiate (`data-region`).
- **Comando:** `/impeccable optimize`

### [P2] Nessun supporto al controller
- **Dove:** tutto il tavolo; regola del progetto `.claude/rules/ui-code.md` ("keyboard/mouse AND gamepad"), voce A11 del piano.
- **Categoria:** Accessibilità
- **Impatto:** chi gioca col controller non può giocare. Tastiera e mouse sono completi.
- **Cosa fare:** mappare il controller sui comandi da tastiera che già esistono (frecce sulla mappa, Invio, Esc, Z).
- **Comando:** `/impeccable harden`

### [P3] Rimbalzo dei dadi e strisce laterali
- **Dove:** `table.css:1251` (`cubic-bezier(.2,.9,.3,1.2)` sui dadi della battaglia); strisce su un lato a `table.css:994` (posto nel draft), `:1662` e `:2173` (insegna del turno).
- **Categoria:** Integrità dell'implementazione
- **Cosa fare:** uscita morbida senza rimbalzo; colore del giocatore come bordo intero o segnalino.
- **Comando:** `/impeccable polish`

## Problemi ricorrenti

- **Il palco fisso rimpicciolito** resta la causa dei testi piccoli: ogni numero delle fasce va pensato "a 1366 vale il 71%".
- **Le correzioni si aggiungono in coda** invece di cambiare la regola del componente: è scritto in DESIGN.md ("Don't fix a style by appending a more specific override"), ma il CSS vecchio non è ancora stato fuso.

## Cosa funziona bene

- 58 controlli visibili, 0 senza nome; 8 regioni con nome; 2 regioni `status`/`aria-live`; tutte le immagini hanno `alt`; lingua dichiarata.
- Finestre modali con focus intrappolato, Esc a livelli, focus che torna a chi ha aperto; frecce che saltano prima ai sistemi validi.
- DESIGN.md e il progetto della campagna esistono e sono rispettati nei nuovi pezzi (finestre, insegna del turno, schermata finale).
- La CI ora lancia i test nel browser e 4 partite simulate prima di ogni pubblicazione.

## Azioni consigliate

1. **[P1] `/impeccable typeset`**: numeri delle fasce avversarie, dei mazzi e del draft a 12 px sullo schermo a 1366.
2. **[P2] `/impeccable layout`**: le regioni vuote della campagna in `layout.ts`, con un test che le tenga libere.
3. **[P2] `/impeccable adapt`**: area di clic di 24 px per "Evidenzia", i filtri della Corte, Trofei e Prigionieri.
4. **[P2] `/impeccable harden`**: il controller (A11).
5. **[P2] `/impeccable optimize`**: ridisegno per regione.
6. **[P2] `/impeccable polish`**: token al posto dei colori a mano e CSS fuso per componente; via rimbalzo e strisce.
