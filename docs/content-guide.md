# Guida ai contenuti

Il motore non contiene nessun dato del gioco: tutto viene da `data/content.json`,
che scrivi tu partendo da `data/content.example.json` (valori inventati).
`data/content.json` e le cartelle `assets/cards/`, `assets/map/` sono in
`.gitignore`: restano solo sul tuo computer.

Dopo ogni modifica:

```powershell
npm run check:content
```

Segnala riferimenti rotti (sistemi inesistenti, semi sconosciuti, mazzo troppo
piccolo per la mano, carte di setup mancanti per 2/3/4 giocatori…) e prova il
setup di ogni carta di setup.

## Campi

| Campo | Cosa contiene |
|---|---|
| `handSize`, `chapters` | Carte in mano a inizio capitolo; numero di capitoli. |
| `powerToWin` | Soglia di potere per fine partita anticipata, per numero di giocatori (`"2"`, `"3"`, `"4"`). |
| `resourceCap` | Risorse massime tenute da un giocatore. |
| `agentsPerPlayer`, `shipsPerPlayer`, `citiesPerPlayer`, `starportsPerPlayer` | Riserva iniziale. |
| `courtSize` | Carte corte scoperte, per numero di giocatori. |
| `suits` | `{ "idSeme": ["tax", "repair", …] }` — azioni che ogni seme concede. Azioni: `tax build repair move battle secure influence`. |
| `actionCards` | `{ id, suit, number, pips, minPlayers? }`. Le carte solo-4-giocatori hanno `"minPlayers": 4`. |
| `courtCards` | `{ id, kind: "faction" \| "decree", resource?, effect? }`. `effect` è un id: l'effetto lo scrivo io nel registro. |
| `declareByNumber` | Numero carta → ambizione dichiarata (`wealth captives trophies relics psionics`). |
| `ambitionMetrics` | Cosa conta ogni ambizione: `{ kind: "resources", resources: [...] }`, `{ kind: "captives" }`, `{ kind: "trophies" }`. |
| `ambitionMarkers` | Dal più alto al più basso: `{ id, sides: [{ first, second }, …] }`. |
| `markerSideByChapter` | Capitolo → indice del lato del marker (default 0). |
| `maxDeclarationsPerRound` | Dichiarazioni massime per round. |
| `ties`, `gameEndTieBreak` | Regole di parità (vedi `design/gdd/core-loop.md` §4). |
| `twoPlayerAmbitionBoxes` | 2 giocatori: risorsa → riquadro ambizione dove va al setup (conta come terzo giocatore). |
| `resourceActions` | Risorsa → azione che paga nel prelude (`"any"` = qualsiasi azione del seme corrente). |
| `rivalTax` | `{ allowed, effect: "none" \| "takeCaptive" }`. |
| `dice` | `skirmish`, `assault`, `raid`: lista di facce, ognuna con i conteggi `hit selfHit buildingHit key intercept`. |
| `map.systems` | `{ id, cluster, kind: "gate" \| "planet", resource?, pos? }`. `pos` = coordinate in pixel sull'immagine della mappa. |
| `map.links` | Coppie `["sistemaA", "sistemaB"]` collegati. |
| `map.exclusions` | Per numero di giocatori: `{ clusters?, systems?, links? }` fuori gioco. |
| `setupCards` | `{ id, playerCount, seats: [[{ system, ships?, building? }], …], exclusions? }` — un elenco di piazzamenti per posto. |

Gli `id` sono liberi: scegli tu nomi brevi senza spazi.

## Asset (per la UI, più avanti)

| Cosa | Percorso |
|---|---|
| Carte azione | `assets/cards/action/<id>.png` |
| Carte corte | `assets/cards/court/<id>.png` |
| Immagine mappa | `assets/map/board.png` (le `pos` dei sistemi si riferiscono a questa) |

## Come passarmi i dati

Va bene qualsiasi formato: JSON già pronto, un foglio di calcolo, un elenco
scritto a mano o foto delle tue carte. Converto io nel formato sopra. Per le
carte `decree` dimmi l'effetto con parole tue: lo trasformo in codice nel
registro degli effetti.
