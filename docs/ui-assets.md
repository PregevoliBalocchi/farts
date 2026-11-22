# Pictures for the table screen

The table screen draws with whatever it finds in `assets/ui/`. That folder is
**git-ignored**: nothing in it is ever committed, so every machine that builds
or deploys the site has to fill it once. Without it the game still runs, with
our own schematic board, shapes and glyphs.

Owner's decision (2026-11): the invite-only beta may use the publisher's
development kit and the board picture. The site is not open to the public.
The pictures still stay out of the repository.

## 1. The development kit

```
npm run assets:kit
```

`tools/fetch-kit.mjs` downloads the publisher's development kit, and copies the
pictures the screen uses into `assets/ui/` under the names the code reads
(`node tools/fetch-kit.mjs <kit.zip>` installs from a zip already downloaded).

| Folder | What | Used for |
|---|---|---|
| `icon/` | resource and dice icons | resource icons everywhere in the interface (`icon.<name>`) |
| `token/` | resource, ambition and initiative tokens | reserved for the panels |
| `dice/` | dice faces | reserved for battles |
| `piece/` | ships, agents, flagships, cities, starports per seat | the 3D pieces |

Seats map to the kit's colours in this order: 0 yellow, 1 blue, 2 red, 3 white
(`--seat-N` in `src/ui/table/table.css` and `SEAT_PAINT` in `pieces3d.ts`
follow the same order).

The 3D pieces are cut from the piece pictures at load time
(`src/ui/table/kitpieces.ts`): the picture's outline becomes a wooden piece of
that shape. Ships, agents and flagships stand; a damaged ship lies down.
Cities and starports are tiles lying on their slot, with the kit's "back"
picture when damaged.

## 2. The board picture

The kit has no board. Put the picture of the map alone (no player boards, no
card areas) at:

```
assets/ui/map/board.png
```

It is passed by hand between the two of us, like the other private files.

`src/ui/table/board.default.json` (committed: numbers only) says where each
system and each building slot is on that picture, for a 1470×1010 crop. For a
different picture, write your own `assets/ui/map/board.json` in the same
format; it wins over the default:

```json
{
  "width": 1470,
  "height": 1010,
  "systems": {
    "c1-gate": { "x": 770, "y": 300 },
    "c1-p1": { "x": 655, "y": 150, "slots": [{ "x": 618, "y": 128 }, { "x": 683, "y": 100 }] }
  }
}
```

`x`, `y` are pixels of the picture; `slots` are the centres of the building
triangles, in slot order. Opening the table with `?debug=calibrate` asks for a
click on each system in turn and gives the system positions to paste; the
slots are added by hand.

## 3. Before a deploy

Everything in `assets/ui/` goes into `dist-online/`. Before
`npm run deploy:online`, on the machine that deploys:

1. `npm run assets:kit`
2. copy `board.png` into `assets/ui/map/`

Otherwise the published site shows the schematic board and our own shapes.

## The map on screen

The 3D map fills the whole window and the interface is drawn in front of it.
Drag pans, the wheel zooms towards the pointer (zooming in leans the camera
towards the pieces, zooming out looks straight down on the whole map), a
double click goes back to the starting view. `?map=2d` shows the flat board.
