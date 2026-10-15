#!/usr/bin/env python3
"""Render the publication markup on both pages from one pool.

Every paper used to be written twice — once as a card in index.html and once
as an entry in publications.html — with the title, authors, venue, summary,
figure, links and BibTeX duplicated between them. That is the same duplication
that has already produced bugs on this site, and it gets worse with every
paper. `data/publications.json` is the single copy now; this writes it into
both pages, between markers, leaving everything outside them alone.

    python3 tools/build_pubs.py            # rewrite the generated regions
    python3 tools/build_pubs.py --check    # report drift, change nothing

It is not a build step for the *site*: what ships is still plain static HTML
with no runtime JavaScript, and a visitor never needs this to have run. It is
a build step for the *author*, and tools/check.py fails if the pages and the
pool disagree, so a forgotten run is a caught error rather than a silent one.

The pool holds data, not markup — every tag below is produced here, so the
JSON stays something you can read and edit without counting angle brackets.
The two exceptions are `bibtex`, which is a verbatim code block and has to be,
and `figure.cls`, which is an escape hatch for the one figure that is a
university mark rather than a teaser.

    id            anchor on publications.html, e.g. #absent-answer
    group         peer | preprint | thesis — which band it files under
    badges        [{text, kind}]; kind omitted = accepted venue (accent),
                  "muted" = preprint or arXiv, "award" = Oral, Spotlight…
    title         plain text
    url           optional; the title becomes a link when present
    authors       [{name, me, equal}]; `me` gets .author-me, `equal` gets an
                  asterisk, and the "* equal contribution" note appears by
                  itself as soon as any author carries one
    venue         {name, detail} — rendered as <em>name</em>, detail
    venue_card    optional short form for the card face; defaults to `venue`
    summary       one or two sentences for the list
    summary_card  the card/modal version where it differs; defaults to summary
    figure        {src, alt, w, h, cls}
    links         [{label, href}]
    bibtex        verbatim from arxiv.org/bibtex/<id>, or absent
    selected      whether it also appears on the homepage
"""
import json
import pathlib
import sys
import textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'publications.json'

GROUPS = [('peer', 'Peer-Reviewed'), ('preprint', 'Preprints'), ('thesis', 'Theses')]
BADGE_CLASS = {None: 'badge', 'muted': 'badge badge--muted', 'award': 'badge badge--award'}
EQUAL_NOTE = '* equal contribution'
BEGIN = '<!-- GENERATED: %s — from data/publications.json via tools/build_pubs.py -->'
END = '<!-- /GENERATED: %s -->'

# Column at which each reflowed paragraph wraps. They differ because the two
# layouts sit at different indents and the file reads better at ~100 columns.
COLS = {'title': 92, 'authors': 96, 'venue': 96, 'summary': 88, 'alt': 110,
        'card_title': 76, 'card_authors': 94, 'card_venue': 94, 'card_summary': 86}


# ── pieces ───────────────────────────────────────────────────────────────────

def fill(text, col, indent=''):
    """Reflow one paragraph.

    break_on_hyphens is off because a line break inside a hyphenated word is
    folded back to a space by the browser: "inference-reuse" wrapped at the
    hyphen renders as "inference- reuse". break_long_words is off for the same
    reason applied to URLs.
    """
    return textwrap.fill(text, width=col, initial_indent=indent,
                         subsequent_indent=indent,
                         break_on_hyphens=False, break_long_words=False)


def para(lines, indent, tag, text, col):
    """<tag>…</tag> with the text reflowed under it."""
    lines.append(f'{indent}<{tag}>')
    lines.append(fill(text, col, indent + '  '))
    lines.append(f'{indent}</{tag.split()[0]}>')


def title_html(p, link=True):
    return f'<a href="{p["url"]}">{p["title"]}</a>' if link and p.get('url') else p['title']


def authors_html(p):
    out = []
    for a in p['authors']:
        name = f'<span class="author-me">{a["name"]}</span>' if a.get('me') else a['name']
        out.append(('<sup>*</sup>' if a.get('equal') else '') + name)
    html = ', '.join(out)
    if any(a.get('equal') for a in p['authors']):
        html += f' <span class="author-note">{EQUAL_NOTE}</span>'
    return html


def venue_html(p, card=False):
    v = (p.get('venue_card') if card else None) or p['venue']
    return f'<em>{v["name"]}</em>' + (f', {v["detail"]}' if v.get('detail') else '')


def badges_html(p, indent):
    inner = ''.join(f'<span class="{BADGE_CLASS[b.get("kind")]}">{b["text"]}</span>'
                    for b in p['badges'])
    return f'{indent}<p class="badges">{inner}</p>'


def figure_html(p, indent):
    f = p['figure']
    cls = f'class="{f["cls"]}" ' if f.get('cls') else ''
    alt = fill(f['alt'], COLS['alt'])
    return (f'{indent}<img {cls}src="{f["src"]}"\n'
            f'{indent}     alt="{alt}"\n'
            f'{indent}     loading="lazy" width="{f["w"]}" height="{f["h"]}">')


def links_html(p, indent, cls):
    if not p.get('links') and not p.get('bibtex'):
        return None
    out = [f'{indent}<div class="{cls}">']
    out += [f'{indent}  <a href="{l["href"]}">{l["label"]}</a>' for l in p.get('links', [])]
    if p.get('bibtex'):
        out += [f'{indent}  <details class="bibtex">',
                f'{indent}    <summary>BibTeX</summary>',
                f'{indent}    <pre>{p["bibtex"]}</pre>',
                f'{indent}  </details>']
    out.append(f'{indent}</div>')
    return '\n'.join(out)


# ── the two layouts ──────────────────────────────────────────────────────────

def render_entries(papers):
    out = []
    for key, heading in GROUPS:
        group = [p for p in papers if p['group'] == key]
        if not group:
            continue
        out += [f'  <section class="group" aria-labelledby="g-{key}">',
                f'    <h2 class="group-title" id="g-{key}">{heading}</h2>',
                '    <ul class="entry-list">']
        for p in group:
            out += ['', '      <li>', f'        <article class="entry" id="{p["id"]}">']
            if p.get('figure'):
                out += ['          <figure class="entry-figure">',
                        figure_html(p, '            '),
                        '          </figure>']
            out.append('          <div class="entry-body">')
            out.append(badges_html(p, '            '))
            para(out, '            ', 'h3 class="entry-title"', title_html(p), COLS['title'])
            para(out, '            ', 'p class="entry-authors"', authors_html(p), COLS['authors'])
            para(out, '            ', 'p class="entry-venue"', venue_html(p), COLS['venue'])
            para(out, '            ', 'p class="entry-summary"', p['summary'], COLS['summary'])
            links = links_html(p, '            ', 'entry-links')
            if links:
                out.append(links)
            out += ['          </div>', '        </article>', '      </li>']
        out += ['', '    </ul>', '  </section>', '']
    return '\n'.join(out).rstrip('\n')


def render_cards(papers, selected_order):
    by_id = {p['id']: p for p in papers}
    out = []
    for pid in selected_order:
        p = by_id[pid]
        out += ['', '    <article class="pub-card">']
        if p.get('figure'):
            out += ['      <div class="pub-thumb">', figure_html(p, '        '),
                    '      </div>']
        out.append('      <div class="pub-body">')
        out.append(badges_html(p, '        '))
        out += ['        <h3 class="pub-title">', '          <button class="pub-open" type="button">']
        out.append(fill(title_html(p, link=False), COLS['card_title'], '            '))
        out += ['          </button>', '        </h3>']
        out.append(f'        <p class="pub-venue">{venue_html(p, card=True)}</p>')
        out.append('        <p class="pub-hint">Details '
                   '<span class="arrow" aria-hidden="true">&rarr;</span></p>')
        out += ['      </div>', '', '      <div class="pub-detail">']
        para(out, '        ', 'p class="pub-authors"', authors_html(p), COLS['card_authors'])
        para(out, '        ', 'p class="pub-venue"', venue_html(p), COLS['card_venue'])
        para(out, '        ', 'p class="pub-summary"',
             p.get('summary_card') or p['summary'], COLS['card_summary'])
        links = links_html(p, '        ', 'pub-links')
        if links:
            out.append(links)
        out += ['      </div>', '    </article>']
    out.append('')
    return '\n'.join(out)


# ── splice ───────────────────────────────────────────────────────────────────

def splice(path, name, body, check):
    text = path.read_text()
    begin, end = BEGIN % name, END % name
    if begin not in text:
        print(f'  {path.name}: no "{name}" markers — add them first')
        return 1
    i, j = text.index(begin) + len(begin), text.index(end)
    if text[i:j].strip('\n') == body.strip('\n'):
        print(f'  {path.name:20} {name:22} up to date')
        return 0
    if check:
        print(f'  {path.name:20} {name:22} STALE — run tools/build_pubs.py')
        return 1
    path.write_text(text[:i] + '\n' + body.strip('\n') + '\n' + text[j:])
    print(f'  {path.name:20} {name:22} rewritten')
    return 0


def main():
    check = '--check' in sys.argv
    data = json.loads(DATA.read_text())
    drift = splice(ROOT / 'publications.html', 'publication-entries',
                   render_entries(data['papers']), check)
    drift += splice(ROOT / 'index.html', 'selected-publications',
                    render_cards(data['papers'], data['selected_order']), check)
    if drift and check:
        sys.exit(1)


if __name__ == '__main__':
    main()
