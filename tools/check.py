#!/usr/bin/env python3
"""Consistency checks for a hand-written, no-build-step site.

Five pages repeat their head, banner, sidebar and footer because nothing
assembles them. That is the one real cost of having no template engine, and it
has already bitten twice: the corner stamp was copied into all five and went
stale, and .subsection-title drifted away from .group-title until only one of
them had a hairline. This script is the cheap half of a template engine — it
cannot assemble the pages, but it can refuse to let them disagree.

    python3 tools/check.py

Exits non-zero if anything fails, so it can gate a commit.
"""
import collections
import html.parser
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# A page is an HTML file that wears the site's chrome. Search-engine
# verification files (google*.html, BingSiteAuth.xml and friends) are one line
# of text that happens to end in .html, and must not be held to page rules.
PAGES = sorted(p.name for p in ROOT.glob('*.html')
               if 'assets/css/style.css' in p.read_text())
SKIPPED = sorted(p.name for p in ROOT.glob('*.html') if p.name not in PAGES)
CONTENT = [p for p in PAGES if p != '404.html']
fails = []


def report(name, ok, detail=''):
    print(f'  {"PASS" if ok else "FAIL"}  {name}{("  " + detail) if detail else ""}')
    if not ok:
        fails.append(name)


def read(name):
    return (ROOT / name).read_text()


def strip_comments(s):
    return re.sub(r'<!--.*?-->', '', s, flags=re.S)


def block(s, start, end):
    i = s.find(start)
    if i < 0:
        return None
    j = s.find(end, i)
    return re.sub(r'\s+', ' ', s[i:j + len(end)]).strip()


# ── 1. the repeated blocks agree ─────────────────────────────────────────────
def shared_blocks():
    shapes = {
        'nav list':      ('<ul class="nav-list"', '</ul>'),
        'sidebar role':  ('<p class="sidebar-role">', '</p>'),
        'sidebar links': ('<div class="sidebar-links">', '</div>'),
        'footer links':  ('<p class="footer-links">', '</p>'),
    }
    for label, (a, b) in shapes.items():
        seen = collections.defaultdict(list)
        for f in PAGES:
            t = block(read(f), a, b)
            if t is None:
                continue
            # the only differences that are meant to exist
            t = t.replace(' aria-current="page"', '')
            t = re.sub(r'href="/(?=[a-z])', 'href="', t)   # 404 uses absolute paths
            t = t.replace('href="/"', 'href="index.html"')
            seen[t].append(f)
        report(f'{label} identical across pages', len(seen) <= 1,
               '' if len(seen) <= 1 else ' vs '.join('+'.join(v) for v in seen.values()))


# ── 2. links resolve ─────────────────────────────────────────────────────────
def links():
    missing = []
    for f in PAGES:
        s = strip_comments(read(f))
        for h in re.findall(r'(?:href|src)="([^"#][^"]*)"', s):
            if h.startswith(('http', 'mailto:', '#', 'data:')):
                continue
            rel = h.lstrip('/').split('#')[0].split('?')[0]
            if rel and not (ROOT / rel).exists():
                missing.append(f'{f}:{h}')
    report('every local link resolves', not missing, ', '.join(missing[:4]))


# ── 3. the house rules ───────────────────────────────────────────────────────
def house_rules():
    dots, holes, straight = [], [], []
    for f in PAGES:
        # scripts hold JSON-LD, where ASCII apostrophes are deliberate
        visible = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', strip_comments(read(f)), flags=re.S)
        body = re.sub(r'<[^>]+>', ' ', visible)
        if '·' in body:
            dots.append(f)
        if re.search(r'XXXX|YOUR_|/REPO\b|\bTODO\b|lorem ipsum', strip_comments(read(f)), re.I):
            holes.append(f)
        if re.search(r"[A-Za-z]'[A-Za-z]", body):
            straight.append(f)
    report('no middle dots as separators', not dots, ', '.join(dots))
    report('no placeholders left', not holes, ', '.join(holes))
    report('apostrophes are curly in prose', not straight, ', '.join(straight))


# ── 4. document structure ────────────────────────────────────────────────────
def structure():
    bad_parse, bad_h1, skips = [], [], []
    for f in PAGES:
        s = read(f)
        try:
            html.parser.HTMLParser(convert_charrefs=True).feed(s)
        except Exception:
            bad_parse.append(f)
        hs = [int(m) for m in re.findall(r'<h([1-6])[\s>]', strip_comments(s))]
        if hs.count(1) != 1:
            bad_h1.append(f'{f}({hs.count(1)})')
        for a, b in zip(hs, hs[1:]):
            if b > a + 1:
                skips.append(f'{f}:h{a}->h{b}')
    report('every page parses', not bad_parse, ', '.join(bad_parse))
    report('exactly one <h1> per page', not bad_h1, ', '.join(bad_h1))
    report('no heading levels skipped', not skips, ', '.join(sorted(set(skips))))


# ── 5. stylesheet ────────────────────────────────────────────────────────────
def stylesheet():
    css = (ROOT / 'assets/css/style.css').read_text()
    report('braces balance', css.count('{') == css.count('}'),
           f"{css.count('{')} open, {css.count('}')} close")

    bare = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    bare = re.sub(r'@font-face\s*\{[^{}]*\}', '', bare)   # format('woff2') is not a class
    used = set()
    for f in PAGES:
        for m in re.findall(r'class="([^"]*)"', read(f)):
            used.update(m.split())
    js = (ROOT / 'assets/js/main.js').read_text()
    used.update(re.findall(r"['\"]\.?([a-z][a-z0-9-]{2,})['\"]", js))
    declared = set(re.findall(r'\.([a-zA-Z][\w-]+)', bare))
    known_spare = {'badge--award', 'entry--notease', 'news-more', 'news-toggle',
                   'chev', 'news-toggle-label', 'mono', 'is-in', 'is-open',
                   'is-scrolled', 'reveal', 'js', 'author-me', 'sep'}
    orphans = sorted(c for c in declared - used
                     if not c.startswith(('is-', 'js', 'has-')) and c not in known_spare)
    report('no orphaned CSS classes', not orphans, ', '.join(orphans))


# ── 6. assets ────────────────────────────────────────────────────────────────
def assets():
    referenced = set()
    for f in PAGES:
        for h in re.findall(r'(?:href|src)="([^"]*)"', read(f)):
            referenced.add(h.lstrip('/').split('#')[0].split('?')[0])
    css = (ROOT / 'assets/css/style.css').read_text()
    for u in re.findall(r'url\(([^)]+)\)', css):
        referenced.add('assets/' + u.strip('\'"').replace('../', ''))
    unused = []
    for p in sorted((ROOT / 'assets').rglob('*')):
        if p.is_dir() or p.name.startswith('.'):
            continue
        rel = str(p.relative_to(ROOT))
        if rel in referenced:
            continue
        # the gallery's -lg files are reached from the thumbnails' href
        if rel.endswith('-lg.webp') and rel.replace('-lg.webp', '.webp') in referenced:
            continue
        unused.append(rel)
    report('no unreferenced assets', not unused, ', '.join(unused[:5]))


# ── 7. dates ─────────────────────────────────────────────────────────────────
def dates():
    r = subprocess.run([sys.executable, str(ROOT / 'tools/stamp.py'), '--check'],
                       cwd=ROOT, capture_output=True, text=True)
    report('stamps, CV date and sitemap in sync', r.returncode == 0,
           '' if r.returncode == 0 else 'run tools/stamp.py')


print(f'checking {len(PAGES)} pages'
      + (f'  (skipping {", ".join(SKIPPED)})' if SKIPPED else '') + '\n')
shared_blocks(); links(); house_rules(); structure(); stylesheet(); assets(); dates()
print()
if fails:
    print(f'{len(fails)} check(s) failed')
    sys.exit(1)
print('all checks passed')
