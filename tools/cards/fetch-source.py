"""Downloads every card picture of a public card reference site, with a catalogue.

    python tools/cards/fetch-source.py assets/cards/source/arcsfates

Walks the pages linked from the site index and saves each picture under the
same path, plus catalogue.json: for every picture its page, the heading it
sits under, its name on the site and its file. The folder is git-ignored
(assets/cards/source/); install-source.py then copies the pictures the table
shows under the game ids.
"""
import re, io, os, json, sys, time, urllib.request, urllib.parse, html
B = 'https://cmckenz87.github.io/ArcsFates/'
OUT = sys.argv[1]
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    for k in range(3):
        try:
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:
            err = e; time.sleep(1.5)
    raise err
idx = get(B).decode('utf-8')
pages = ['index.html']
for h in re.findall(r'href="([^"#]+\.html)"', idx):
    h = urllib.parse.unquote(h)
    if h not in pages and not h.startswith('http'): pages.append(h)
cat = []; seen = {}
for pg in pages:
    url = B + urllib.parse.quote(pg)
    try: s = get(url).decode('utf-8')
    except Exception as e:
        print('PAGE FAIL', pg, e); continue
    body = s[s.find('md-content'):]
    title = html.unescape(re.search(r'<title>([^<]*)', s).group(1)).strip()
    # section headings in order, to tag each image with the heading above it
    toks = re.findall(r'<h([1-4])[^>]*>(.*?)</h\1>|<img([^>]+)>', body, flags=re.S)
    head = ''
    n = 0
    for lvl, htxt, img in toks:
        if lvl:
            head = html.unescape(re.sub(r'<[^>]+>', '', htxt)).replace('¶', '').strip(); continue
        src = re.search(r'src="([^"]+)"', img); alt = re.search(r'alt="([^"]*)"', img)
        if not src: continue
        src = html.unescape(src.group(1))
        if src.startswith('http') or 'assets/' in src and 'favicon' in src: continue
        full = urllib.parse.urljoin(url, urllib.parse.quote(src))
        rel = urllib.parse.unquote(full[len(B):])
        if not full.startswith(B): continue
        local = os.path.join(OUT, rel.replace('/', os.sep))
        if rel not in seen:
            os.makedirs(os.path.dirname(local), exist_ok=True)
            if not os.path.exists(local):
                try: io.open(local, 'wb').write(get(full))
                except Exception as e:
                    print('IMG FAIL', rel, e); continue
            seen[rel] = True
        cat.append({'page': pg, 'pageTitle': title, 'section': head, 'name': html.unescape(alt.group(1)) if alt else '', 'file': rel})
        n += 1
    print(pg, n, flush=True)
json.dump({'source': B, 'fetched': time.strftime('%Y-%m-%d'), 'images': cat}, io.open(os.path.join(OUT, 'catalogue.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('total', len(cat), 'files', len(seen))
