Method: dual-agent (A: revisione del design · B: detector)

# Critique del tavolo dopo le correzioni P1 (27 novembre 2026, PR 75)

Target: `src/ui/table` (build `dist-single` con la PR 75), 3 giocatori con Leader e Lore, seed 3, 1920×1080 e 1366×768, it ed en. Questa volta il revisore ha seguito il flusso Muovi (origine e destinazione) invece del menu del sistema. Battaglia e punteggio non raggiunti.

## Design Health Score

| # | Euristica | Punteggio | Problema principale |
|---|-----------|-------|-----------|
| 1 | Visibilità dello stato | 3 | Istruzione e passi chiari ("Scegli dove vanno le navi"); "Fine turno" non dice perché è spento durante una mossa |
| 2 | Corrispondenza col mondo reale | 3 | "Riordino", "Guida" e il simbolo dei poteri non spiegati |
| 3 | Controllo e libertà | 3 | Annulla ovunque; nel Muovi non si torna all'origine |
| 4 | Coerenza | 2 | Anelli di destinazione azzurri (palette ritirata, uguale al seggio azzurro) contro anelli d'origine dorati; tre annulla diversi ("Annulla mossa", "Annulla", la X sulla carta) |
| 5 | Prevenzione degli errori | 2 | "Passa l'iniziativa" senza conferma accanto ad "Annulla mossa" |
| 6 | Riconoscere invece di ricordare | 2 | Triangoli degli agenti e pittogrammi senza etichetta |
| 7 | Flessibilità ed efficienza | 2 | Nessuna scorciatoia visibile |
| 8 | Estetica e minimalismo | 2 | Denso; molti numeri piccoli in plancia e fasce |
| 9 | Recupero dagli errori | 2 | Non provato |
| 10 | Aiuto e documentazione | 2 | "?" e suggerimenti; niente guida alla prima mossa |
| **Totale** | | **23/40** | **Accettabile** (primo giro di oggi 26/40, su un percorso diverso) |

## Specificità del design

Specifico: cornici, colonna delle Ambizioni, arte ufficiale. Unica deviazione: gli anelli di destinazione del Muovi sono azzurri, il colore ritirato da DESIGN.md e anche il colore del Giocatore 2.

**Detector:** sul codice gli stessi 355 riscontri (352 avvisi di design system, 3 strisce laterali: `table.css:1663` falso positivo, `:995` e `:2174` strisce del colore del seggio, volute). Sulla pagina: **NON VALUTATO** in questo giro (3 timeout di navigazione da 30 s con la CPU occupata dalle partite simulate); nel primo giro di oggi, con la stessa pagina servita su localhost, 0 riscontri a 1920 e a 1366.

## Cosa è cambiato

- L'istruzione del turno ora è intera: il revisore non la segnala più.
- I testi piccoli a 1366 restano segnalati "a occhio" (circa 8-9 px per nomi delle carte e "SCARTI AZIONI"): la misura dice che i nomi sono facce di carta (consentite) e che le etichette dei mazzi sono a 11,6 px.

## Problemi prioritari

- **[P1] Anelli di destinazione azzurri.** Violano la No-Teal Rule e si confondono col seggio azzurro; origine e destinazione si distinguono solo per colore. **Fare:** oro chiaro con forma diversa (tratteggio) o etichetta. **Comando:** `/impeccable polish`.
- **[P1] Barra dei comandi:** fino a 7 controlli dopo aver giocato una carta, tre annulla con nomi diversi, "Passa" senza conferma. **Fare:** un solo nome per annullare, "Fine turno" spento con motivo durante una mossa, conferma per "Passa". **Comando:** `/impeccable distill`, poi `/impeccable clarify`.
- **[P2] La mappa si sposta tra i passi del Muovi** (inquadra i sistemi accesi, PR 5): per chi gioca al tavolo fisico sembra un errore. **Fare:** spostare solo quando i sistemi accesi escono dalla parte libera. **Comando:** `/impeccable polish`.
- **[P2] Termini senza spiegazione:** "Riordino", "Guida", triangoli degli agenti. **Comando:** `/impeccable clarify`.

## Domande

1. La mappa deve restare ferma durante i passi di una carta, anche a costo di tagliarla?
2. Quali controlli sono nostri e non della versione digitale ufficiale (Passa accanto ad Annulla, la scheda di stato)?
