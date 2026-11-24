"""Puts the campaign Fate sets into data/content.json and their pictures in place.

    python tools/cards/install-fates.py <transcription.jsonl> [<arcsfates folder>]

The transcription is one JSON object per line, one per picture of the card
reference's Fate pages (catalogue.json order, Court and "Other" pages left out):
`i` (picture index), `set` (1-24), `no` (number printed on the card), `kind`,
`name`, `text`, and when printed `crisis`, `resource`, `keys`, `act`, `target`,
`grand`, `final`, `side`, `tokens`.

Writes campaign.fates (one entry per Fate: tier, name, tagline, path, the
objective of each Act, and its card and piece counts with the pieces' sides)
and campaign.fateCards: ONE entry per physical card (one copy each: the counts
match the set dividers on the punchboard). A two-sided card keeps its other
side in `back`: every Setup card has its Objective on the back ("Flip this
card over"), and some ability cards are two-sided too. With the picture
folder, copies each side to assets/cards/fates/<id>.jpg and <id>-back.jpg
(local only, like the other campaign pictures).
"""
import io, json, os, shutil, sys

SRC = sys.argv[1]
RAW = sys.argv[2] if len(sys.argv) > 2 else None
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
CONTENT = os.path.join(ROOT, 'data', 'content.json')

cards = [json.loads(l) for l in io.open(SRC, encoding='utf-8') if l.strip()]
cards.sort(key=lambda c: c['i'])


def fate_id(n):
    """Set number 1-24 -> fate-a-01 … fate-c-08 (8 Fates per tier)."""
    return f"fate-{'abc'[(n - 1) // 8]}-{(n - 1) % 8 + 1:02d}"


# Each Fate set's cards and pieces, as printed on its divider (docs/rules/
# Arcs_Campaign_Punchboard.pdf), and its pieces with their two sides where they
# have two (from the cards that use them).
DIVIDERS = {
    1: (26, [('sponsored', 1, None)]),
    2: (27, [('commonwealth-ambition', 1, None)]),
    3: (27, [('war-profiteer', 1, None)]),
    4: (26, []),
    5: (21, [('golem', 4, ['sleeping', 'awake'])]),
    6: (25, []),
    7: (21, []),
    8: (31, [('ideal', 5, ['zeal', 'wisdom'])]),
    9: (11, [('clue', 6, ['check', 'x']), ('portal', 1, None), ('pilgrim', 6, None)]),
    10: (12, [('banner', 8, None)]),
    11: (12, [('hammer', 6, ['hammer-fragment', 'broken-world'])]),
    12: (12, [('rumor', 4, ['face-down', 'face-up'])]),
    13: (13, []),
    14: (12, [('witness', 4, ['spyglass', 'psionic'])]),
    15: (11, [('ceasefire', 6, ['peace', 'war'])]),
    16: (19, [('seat', 6, None), ('court', 6, None)]),
    17: (3, []),
    18: (5, [('bunker', 9, None)]),
    19: (4, []),
    20: (4, [('ambition-edenguard', 1, None)]),
    21: (4, [('ambition-blightkin', 1, None)]),
    22: (6, [('passage', 6, None)]),
    23: (5, [('conspiracy', 8, ['face-down', 'face-up'])]),
    24: (5, []),
}
ACT_NO = {'I': 1, 'II': 2, 'III': 3}
FIELDS = ('act', 'name', 'subtitle', 'resource', 'keys', 'order', 'policy', 'number', 'pips', 'zeal', 'wisdom',
          'cluster', 'target', 'grand', 'final', 'tokens', 'whenDrawn', 'sameAs', 'crisis', 'text', 'note')
fates, out, seen = {}, [], {}
for c in cards:
    fid = fate_id(c['set'])
    if c['kind'] == 'fate':
        fates[fid] = {k: c[k] for k in ('name', 'tagline', 'path', 'complexity', 'flagship') if k in c}
        fates[fid]['pic'] = c['i']
        continue
    cid = f"{fid}-{c['no']:02d}"
    # An Objective is the back of the Setup card with the same number.
    side = 'back' if c['kind'] == 'objective' else c.get('side', 'front')
    key = (cid, side)
    if key in seen:  # the same card shown twice on the reference pages
        continue
    seen[key] = c['i']
    if side == 'back':  # two-sided card: the back joins its front
        front = next(x for x in out if x['id'] == cid)
        front['back'] = {'kind': c['kind'], **{k: c[k] for k in FIELDS if k in c and k != 'act'}}
        front['picBack'] = c['i']
        continue
    card = {'id': cid, 'fate': fid, 'no': c['no'], 'kind': c['kind']}
    for k in FIELDS:
        if k in c:
            card[k] = c[k]
    card['pic'] = c['i']
    out.append(card)

d = json.load(io.open(CONTENT, encoding='utf-8'))
camp = d['campaign']
by_id = {f['id']: f for f in camp['fates']}
for fid, info in fates.items():
    f = by_id.setdefault(fid, {'id': fid})
    f['tier'] = fid[5].upper()
    f.update({k: v for k, v in info.items() if k != 'pic'})
    acts = f.setdefault('acts', {})
    n = int(fid[-2:]) + 8 * 'abc'.index(fid[5])
    cards_n, pieces = DIVIDERS[n]
    f['cardCount'] = cards_n
    f['pieces'] = [{'id': p, 'count': k, **({'sides': sides} if sides else {})} for p, k, sides in pieces]
    for c in out:
        if c['fate'] != fid or c['kind'] != 'setup':
            continue
        o = c['back']
        a = acts.setdefault(c['act'], {})
        a['objectiveCard'] = c['id']
        if 'target' in o:
            a['objectiveTarget'] = o['target']
        if o.get('grand'):
            a['grandAmbitions'] = len(o['grand'])
        if o.get('final'):
            a['finalObjective'] = True
camp['fates'] = sorted(by_id.values(), key=lambda f: f['id'])
pics = {c['id']: (c.pop('pic'), c.pop('picBack', None)) for c in out}
fate_pics = {fid: info['pic'] for fid, info in fates.items()}
camp['fateCards'] = out
camp['_fateCardsComment'] = ('Fate set cards (24 sets), transcribed 2026-11-24 from the card reference pictures '
                             '(assets/cards/source/arcsfates). One entry per physical card (one copy each), id <fate>-<printed number>; '
                             'a two-sided card has its other side in `back` (every Setup card has its Objective on the back). '
                             'Steward 15 (Navy Reprisal) is the corrected card (FAQ 7).')
io.open(CONTENT, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print(len(fates), 'Fates,', len(out), 'cards')

if RAW:
    cat = json.load(io.open(os.path.join(RAW, 'catalogue.json'), encoding='utf-8'))
    ims = [x for x in cat['images'] if x['page'].startswith('Campaign/') and not x['page'].startswith('Campaign/0')]
    dest = os.path.join(ROOT, 'assets', 'cards', 'fates')
    os.makedirs(dest, exist_ok=True)
    n = 0
    wanted = set()
    for cid, (front, back) in list(pics.items()) + [(f, (p, None)) for f, p in fate_pics.items()]:
        wanted.add(cid + '.jpg')
        if back is not None:
            wanted.add(cid + '-back.jpg')
    for old in os.listdir(dest):  # pictures of an earlier install under ids that no longer exist
        if old.endswith('.jpg') and old not in wanted:
            os.remove(os.path.join(dest, old))
    for cid, (front, back) in list(pics.items()) + [(f, (p, None)) for f, p in fate_pics.items()]:
        for i, suffix in ((front, ''), (back, '-back')):
            if i is None:
                continue
            shutil.copyfile(os.path.join(RAW, ims[i]['file']), os.path.join(dest, cid + suffix + '.jpg'))
            n += 1
    print(n, 'pictures in assets/cards/fates')
