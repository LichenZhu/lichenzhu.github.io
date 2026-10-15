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

Fields per paper, in data/publications.json:

    id            anchor on publications.html, e.g. #absent-answer
    group         peer | preprint | thesis — which band it files under
    badges        [{cls, text}]; cls is badge | badge badge--muted |
                  badge badge--award
    title_html    may contain an <a> when there is somewhere to go
    authors_html  inner HTML, so <sup>*</sup>, .author-me and .author-note
                  all survive
    venue_html    the long form, used on the entry and inside the modal
    venue_short   the short form for the card face; selected papers only
    summary_entry one or two sentences for the list
    summary_card  the card/modal version, if it differs; falls back to
                  summary_entry
    figure        {src, alt, w, h, cls}
    links         [{label, href}]
    bibtex        verbatim from arxiv.org/bibtex/<id>, or null
    selected      whether it appears on the homepage
"""
import json
import pathlib
import re
import sys
import textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'publications.json'

GROUPS = [('peer', 'Peer-Reviewed'), ('preprint', 'Preprints'), ('thesis', 'Theses')]
BEGIN = '<!-- GENERATED: %s — from data/publications.json via tools/build_pubs.py -->'
END = '<!-- /GENERATED: %s -->'


def wrap(text, width, indent):
    """Reflow one paragraph to the file's column width."""
    return textwrap.fill(text, width=width,
                         initial_indent=indent, subsequent_indent=indent)


def img_tag(fig, indent):
    cls = f'class="{fig["cls"]}" ' if fig.get('cls') else ''
    alt = wrap(fig['alt'], 110, '')
    return (f'{indent}<img {cls}src="{fig["src"]}"\n'
            f'{indent}     alt="{alt}"\n'
            f'{indent}     loading="lazy" width="{fig["w"]}" height="{fig["h"]}">')


def badges(p, indent):
    inner = ''.join(f'<span class="{b["cls"]}">{b["text"]}</span>' for b in p['badges'])
    return f'{indent}<p class="badges">{inner}</p>'


def bibtex_block(p, indent, cls):
    if not p.get('bibtex'):
        return ''
    return (f'\n{indent}  <details class="bibtex">\n'
            f'{indent}    <summary>BibTeX</summary>\n'
            f'{indent}    <pre>{p["bibtex"]}</pre>\n'
            f'{indent}  </details>')


def links_block(p, indent, cls):
    if not p.get('links') and not p.get('bibtex'):
        return ''
    out = [f'{indent}<div class="{cls}">']
    for l in p['links']:
        out.append(f'{indent}  <a href="{l["href"]}">{l["label"]}</a>')
    body = '\n'.join(out) + bibtex_block(p, indent, cls) + f'\n{indent}</div>'
    return body


def render_entries(papers):
    """The grouped list on publications.html."""
    out = []
    for key, heading in GROUPS:
        group = [p for p in papers if p['group'] == key]
        if not group:
            continue
        out.append(f'  <section class="group" aria-labelledby="g-{key}">')
        out.append(f'    <h2 class="group-title" id="g-{key}">{heading}</h2>')
        out.append('    <ul class="entry-list">')
        for p in group:
            out.append('')
            out.append('      <li>')
            out.append(f'        <article class="entry" id="{p["id"]}">')
            if p.get('figure'):
                out.append('          <figure class="entry-figure">')
                out.append(img_tag(p['figure'], '            '))
                out.append('          </figure>')
            out.append('          <div class="entry-body">')
            out.append(badges(p, '            '))
            out.append('            <h3 class="entry-title">')
            out.append(wrap(p['title_html'], 92, '              '))
            out.append('            </h3>')
            out.append('            <p class="entry-authors">')
            out.append(wrap(p['authors_html'], 96, '              '))
            out.append('            </p>')
            out.append('            <p class="entry-venue">')
            out.append(wrap(p['venue_html'], 96, '              '))
            out.append('            </p>')
            out.append('            <p class="entry-summary">')
            out.append(wrap(p['summary_entry'], 88, '              '))
            out.append('            </p>')
            lb = links_block(p, '            ', 'entry-links')
            if lb:
                out.append(lb)
            out.append('          </div>')
            out.append('        </article>')
            out.append('      </li>')
        out.append('')
        out.append('    </ul>')
        out.append('  </section>')
        out.append('')
    return '\n'.join(out).rstrip('\n')


def render_cards(papers, selected_order):
    """The card grid on index.html."""
    by_id = {p['id']: p for p in papers}
    out = []
    for pid in selected_order:
        p = by_id[pid]
        out.append('')
        out.append('    <article class="pub-card">')
        if p.get('figure'):
            out.append('      <div class="pub-thumb">')
            out.append(img_tag(p['figure'], '        '))
            out.append('      </div>')
        out.append('      <div class="pub-body">')
        out.append(badges(p, '        '))
        out.append('        <h3 class="pub-title">')
        out.append('          <button class="pub-open" type="button">')
        out.append(wrap(re.sub(r'</?a[^>]*>', '', p['title_html']), 76, '            '))
        out.append('          </button>')
        out.append('        </h3>')
        out.append(f'        <p class="pub-venue">{p["venue_short"]}</p>')
        out.append('        <p class="pub-hint">Details '
                   '<span class="arrow" aria-hidden="true">&rarr;</span></p>')
        out.append('      </div>')
        out.append('')
        out.append('      <div class="pub-detail">')
        out.append('        <p class="pub-authors">')
        out.append(wrap(p['authors_html'], 94, '          '))
        out.append('        </p>')
        out.append('        <p class="pub-venue">')
        out.append(wrap(p['venue_html'], 94, '          '))
        out.append('        </p>')
        out.append('        <p class="pub-summary">')
        out.append(wrap(p.get('summary_card') or p['summary_entry'], 86, '          '))
        out.append('        </p>')
        lb = links_block(p, '        ', 'pub-links')
        if lb:
            out.append(lb)
        out.append('      </div>')
        out.append('    </article>')
    out.append('')
    return '\n'.join(out)


def splice(path, name, body, check):
    text = path.read_text()
    begin, end = BEGIN % name, END % name
    if begin not in text:
        print(f'  {path.name}: no "{name}" markers — add them first')
        return 1
    i = text.index(begin) + len(begin)
    j = text.index(end)
    if text[i:j].strip('\n') == body.strip('\n'):
        print(f'  {path.name:20} {name:10} up to date')
        return 0
    if check:
        print(f'  {path.name:20} {name:10} STALE — run tools/build_pubs.py')
        return 1
    path.write_text(text[:i] + '\n' + body.strip('\n') + '\n' + text[j:])
    print(f'  {path.name:20} {name:10} rewritten')
    return 0


def main():
    check = '--check' in sys.argv
    data = json.loads(DATA.read_text())
    papers = data['papers']
    drift = 0
    drift += splice(ROOT / 'publications.html', 'publication-entries',
                    render_entries(papers), check)
    drift += splice(ROOT / 'index.html', 'selected-publications',
                    render_cards(papers, data['selected_order']), check)
    if drift and check:
        sys.exit(1)


if __name__ == '__main__':
    main()
