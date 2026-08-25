#!/usr/bin/env python3
"""Rewrite each page's corner stamp with the date that page last changed.

The stamp used to be one hand-maintained date copied into all five pages, which
meant it was the same everywhere and wrong as soon as one page was edited. This
reads the date out of git instead: the last commit that touched the file, or
today if the file has changes that are not committed yet — because that is the
date the edit in progress will land on.

This is not a build step. The site is complete without it; run it before you
commit so the stamps do not drift.

    python3 tools/stamp.py            # rewrite
    python3 tools/stamp.py --check    # report drift, change nothing
"""
import datetime
import pathlib
import re
import subprocess
import sys

STAMP = re.compile(r'<time datetime="\d{4}-\d\d-\d\d">\d{4}-\d\d-\d\d</time>')
CVDATE = re.compile(r'<span class="cv-date">[^<]*</span>')
CV = 'assets/files/Lichen_Zhu_CV.pdf'
ROOT = pathlib.Path(__file__).resolve().parent.parent


def git(*args):
    out = subprocess.run(('git',) + args, cwd=ROOT, capture_output=True, text=True)
    return out.stdout.strip() if out.returncode == 0 else ''


def date_for(name):
    dirty = git('status', '--porcelain', '--', name)
    if dirty:
        return datetime.date.today().isoformat()
    return git('log', '-1', '--format=%cs', '--', name) or datetime.date.today().isoformat()


def cv_label():
    """Month and year the CV PDF last changed, e.g. "Aug 2026"."""
    iso = date_for(CV)
    return datetime.date.fromisoformat(iso).strftime('%b %Y')


def main():
    check = '--check' in sys.argv
    drift = 0
    cv = cv_label()
    for path in sorted(ROOT.glob('*.html')):
        text = path.read_text()
        found = STAMP.search(text)
        if not found:
            print(f'{path.name:20} no stamp')
            continue
        want = date_for(path.name)
        new = f'<time datetime="{want}">{want}</time>'
        want_cv = f'<span class="cv-date">{cv}</span>'

        stamp_ok = found.group(0) == new
        cv_ok = CVDATE.search(text) is None or CVDATE.search(text).group(0) == want_cv
        if stamp_ok and cv_ok:
            print(f'{path.name:20} {want}   cv {cv}')
            continue
        drift += 1
        if check:
            note = [] if stamp_ok else [f'stamp says {found.group(0)[16:26]}']
            if not cv_ok:
                note.append(f'cv says {CVDATE.search(text).group(0)[24:-7]}')
            print(f'{path.name:20} {want}   cv {cv}  ({"; ".join(note)})')
        else:
            text = STAMP.sub(new, text)
            text = CVDATE.sub(want_cv, text)
            path.write_text(text)
            print(f'{path.name:20} {want}   cv {cv}  updated')
    drift += sitemap(check)
    if check and drift:
        sys.exit(1)


def sitemap(check):
    """Keep <lastmod> in step with the page each <loc> points at."""
    path = ROOT / 'sitemap.xml'
    if not path.exists():
        return 0
    text = path.read_text()
    out, drift = text, 0
    for block in re.findall(r'<url>.*?</url>', text, re.S):
        loc = re.search(r'<loc>([^<]+)</loc>', block)
        mod = re.search(r'<lastmod>([^<]+)</lastmod>', block)
        if not loc or not mod:
            continue
        page = loc.group(1).rstrip('/').rsplit('/', 1)[-1] or 'index.html'
        if not page.endswith('.html'):
            page = 'index.html'
        want = date_for(page)
        if mod.group(1) == want:
            print(f'{"sitemap " + page:20} {want}')
            continue
        drift += 1
        if check:
            print(f'{"sitemap " + page:20} {want}  (says {mod.group(1)})')
        else:
            out = out.replace(block, block.replace(mod.group(0), f'<lastmod>{want}</lastmod>'), 1)
            print(f'{"sitemap " + page:20} {want}  updated')
    if out != text and not check:
        path.write_text(out)
    return drift


if __name__ == '__main__':
    main()
