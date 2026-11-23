"""Installs downloaded card pictures under the ids the game uses.

    python tools/cards/install-source.py assets/cards/source/arcsfates

Matches each picture name in catalogue.json (fetch-source.py) to a card name
in data/content.json and copies it to assets/cards/<group>/<card id>.<ext>,
replacing the older picture of that id (kept in git history). Then run
npm run assets:art and python tools/cards/cut-leaders.py.
"""
import json, os, re, shutil, sys, difflib, io
RAW = sys.argv[1]            # the folder fetch-source.py filled (with catalogue.json)
ROOT = sys.argv[2] if len(sys.argv) > 2 else '.'
cat = json.load(io.open(os.path.join(RAW, 'catalogue.json'), encoding='utf-8'))
d = json.load(io.open(os.path.join(ROOT, 'data/content.json'), encoding='utf-8'))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
groups = [
    ('leaders', 'Base/0b-Leader.html', d['leaders'], 'leaders'),
    ('lore', 'Base/1-Lore.html', d['loreCards'], 'lore'),
    ('court', 'Base/2-Court.html', [c for c in d['courtCards'] if not c['id'].startswith('court-cc')], 'court'),
    ('court-campaign', 'Campaign/0-Court.html', [c for c in d['courtCards'] if c['id'].startswith('court-cc')], 'court-campaign'),
]
done = 0
for label, page, cards, folder in groups:
    names = {norm(c['name']): c['id'] for c in cards if c.get('name')}
    used = set()
    for im in cat['images']:
        if im['page'] != page: continue
        key = norm(im['name'])
        if key not in names:
            close = difflib.get_close_matches(key, [k for k in names if names[k] not in used], 1, 0.8)
            if not close:
                print('no card for', label, im['name']); continue
            print('fuzzy', im['name'], '->', close[0]); key = close[0]
        cid = names[key]; used.add(cid); im['id'] = cid
        out = os.path.join(ROOT, 'assets/cards', folder)
        os.makedirs(out, exist_ok=True)
        for ext in ('.png', '.jpg', '.jpeg', '.webp'):
            old = os.path.join(out, cid + ext)
            if os.path.exists(old): os.remove(old)
        shutil.copyfile(os.path.join(RAW, im['file']), os.path.join(out, cid + os.path.splitext(im['file'])[1].lower()))
        done += 1
    print(label, 'installed', len(used), 'of', len(cards), 'missing', sorted(set(names.values()) - used))
json.dump(cat, io.open(os.path.join(RAW, 'catalogue.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('installed', done)
