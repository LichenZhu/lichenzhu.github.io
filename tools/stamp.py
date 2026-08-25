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
ROOT = pathlib.Path(__file__).resolve().parent.parent


def git(*args):
    out = subprocess.run(('git',) + args, cwd=ROOT, capture_output=True, text=True)
    return out.stdout.strip() if out.returncode == 0 else ''


def date_for(name):
    dirty = git('status', '--porcelain', '--', name)
    if dirty:
        return datetime.date.today().isoformat()
    return git('log', '-1', '--format=%cs', '--', name) or datetime.date.today().isoformat()


def main():
    check = '--check' in sys.argv
    drift = 0
    for path in sorted(ROOT.glob('*.html')):
        text = path.read_text()
        found = STAMP.search(text)
        if not found:
            print(f'{path.name:20} no stamp')
            continue
        want = date_for(path.name)
        new = f'<time datetime="{want}">{want}</time>'
        if found.group(0) == new:
            print(f'{path.name:20} {want}')
            continue
        drift += 1
        if check:
            print(f'{path.name:20} {want}  (file says {found.group(0)[16:26]})')
        else:
            path.write_text(STAMP.sub(new, text))
            print(f'{path.name:20} {want}  updated')
    if check and drift:
        sys.exit(1)


if __name__ == '__main__':
    main()
