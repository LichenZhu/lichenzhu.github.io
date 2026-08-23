# lichenzhu.github.io

Personal academic homepage. Plain static HTML, CSS, and a small amount of
vanilla JavaScript — no build step, no dependencies, no framework.

```
index.html                  homepage (sticky sidebar + scrolling content)
publications.html           full publication list
404.html                    not-found page (GitHub Pages serves it automatically)
robots.txt                  crawler rules; blocks the named AI training bots
sitemap.xml                 two URLs; bump <lastmod> when you publish changes
assets/
  css/style.css             all styling (one file, sectioned + commented)
  js/main.js                mobile nav, publication modal, news toggle, scroll-spy
  images/profile/           profile photo
  images/publications/      teaser figures
  files/Lichen_Zhu_CV.pdf   CV
  favicon.svg
.nojekyll                   serve files verbatim, skip Jekyll processing
```

## Local preview

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Use a server rather than opening the file
directly, so relative asset paths behave exactly as they will once deployed.

## Design system

Dark-first. `assets/css/style.css` declares the complete dark palette as custom
properties on `:root`; the light theme is a single
`@media (prefers-color-scheme: light)` block that overrides those properties and
nothing else. To retune either theme, edit token values — no rule below section 1
of the stylesheet needs to change. There is no manual toggle; the site follows
the reader's system setting.

Two typefaces, both from the system stack, no web-font requests:

- **Sans** for everything that is prose or a heading.
- **Mono** for everything that is *data* — venue badges, news dates, timeline
  ranges, section indices, tags, the file-type chip. That split is the main
  reason the page reads as technical rather than decorative, so keep it: if you
  add a new piece of metadata, give it the `mono` class.

Section headings are `01 / About` — a mono index, the title, then a hairline
that runs to the right edge. Numbers are hand-written in the markup, so renumber
them if you reorder sections.

Three effects carry the rest:

- **`.backdrop`** — a fixed dot grid plus one accent bloom, masked to fade out
  below the fold. Purely decorative, `aria-hidden`, `pointer-events: none`.
- **Cursor-tracked card glow** — each `.pub-card` has a fill bloom (`::before`)
  and a 1px gradient border (`::after`), both centred on `--mx` / `--my`, which
  `main.js` writes on pointer move (one write per frame, hover-capable pointers
  only). With JS off they fall back to the card centre.
- **Scroll reveal** — `main.js` adds `.reveal` to a fixed selector list and an
  IntersectionObserver adds `.is-in`. The hidden state is gated behind the `js`
  class *and* backed by a sweep that un-hides anything still invisible on
  screen after load, so content can never be stranded at `opacity: 0`.

All three are disabled under `prefers-reduced-motion: reduce`.

## How the homepage is laid out

Two columns inside `<div class="layout">`:

- **`<aside class="sidebar">`** — photo, name, affiliation, contact links, CV
  button. It is `position: sticky`, so it stays put while the right column
  scrolls. Below 820px it becomes a normal block above the content; below 720px
  it goes fully single-column.
- **`<main>`** — About, Selected Publications, News, Education & Experience.

Everything personal lives in the sidebar or the footer, so the scrolling column
is nothing but substance.

## Editing content

Every section is wrapped in a banner comment, and the ones you will touch often
contain a boxed `TO ADD A ...` note with the exact block to copy.

| What | Where |
| --- | --- |
| Name, affiliation, photo | `index.html` → `SIDEBAR` |
| Download CV button | `index.html` → `SIDEBAR`, the `<a class="btn">` |
| Email / GitHub / LinkedIn / Scholar links | `index.html` → `<div class="sidebar-links">` and the footer |
| Biography | `index.html` → `ABOUT` |
| Research interest tags | `index.html` → `<ul class="tags">` |
| Selected publications (cards) | `index.html` → `SELECTED PUBLICATIONS` |
| News | `index.html` → `NEWS`, add a `<li>` at the top |
| All publications | `publications.html`, grouped by status |
| Education / experience / awards | `index.html` → `EDUCATION · EXPERIENCE · HONOURS` |
| Profile photo | replace `assets/images/profile/lichen-zhu.jpg` (square) |
| CV | replace `assets/files/Lichen_Zhu_CV.pdf` (keep the filename) |

### Publication cards

A homepage card has two halves:

- the **face** — teaser, badge, title, short venue. Always visible.
- the **detail** — `<div class="pub-detail">`: authors, full venue, summary,
  links. `main.js` lifts it into the shared `<dialog id="pub-modal">` on click.

With JavaScript off the detail simply renders inline underneath the face, so no
content is ever unreachable. That is why `<head>` sets a `js` class on
`<html>` before first paint — the CSS hides `.pub-detail` only when scripting is
actually available.

`publications.html` uses the older `.entry` list layout instead: full width, no
modal, everything on the page at once.

### Conventions

- **Your name in an author list** goes in `<span class="author-me">L. Zhu</span>`
  so it renders darker and bolder than the co-authors.
- **Badges** come in three flavours: `badge` (accent, for accepted venues),
  `badge badge--muted` (grey, for under review / preprints), and
  `badge badge--award` (for Oral, Spotlight, Best Paper).
- **Missing links are fine.** Delete any `Paper` / `Code` / `Project` / `Demo`
  link you don't have along with its `<span class="sep">·</span>`.
- **No teaser image?** On a card, delete the whole `<div class="pub-thumb">`. In
  a `publications.html` entry, add `entry--notease` to the `<article>` and delete
  the `<figure>`.
- **Older news** is hidden behind the "Show earlier news" button: give the `<li>`
  `class="news-more"` and the `hidden` attribute.
- **Teaser figures** are 16:10. The ones currently in
  `assets/images/publications/` are labelled `FIGURE PLACEHOLDER` — swap in real
  PNG/JPG figures and update the `src` and `alt`. On the dark theme they are
  dimmed and bottom-faded into the card so a white-plate diagram does not sit
  there as a bright rectangle; that treatment is switched off in light mode.
- **The favicon** (`assets/favicon.svg`) is a Z built from two accent bars and a
  white diagonal — three shapes, so it survives 16px in a browser tab. The same
  mark is inlined in each page's `.nav-brand`; if you change one, change both.

## Crawlers and structured data

- `robots.txt` allows search engines and disallows the named generative-AI
  crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended, Bytespider, …).
- Each page carries `<meta name="robots" content="index, follow, noai, noimageai">`
  for agents that read markup rather than `robots.txt`.
- `index.html` ends with a JSON-LD `@graph`: a `Person`, a `WebSite`, and one
  `ScholarlyArticle` per selected paper. **Mirror any change you make to the
  publication cards there**, or search engines will see a stale list.

## Before you publish — things to check

- [ ] **News dates** were inferred from the CV; verify each one.
- [ ] **Google Scholar link** is commented out in the sidebar and footer of both
      pages — uncomment it and paste your profile URL.
- [ ] **Teaser figures** are placeholders.
- [ ] **Author names** use the abbreviated CV form (`Y. Lin`). Expand them to
      full names if you prefer.
- [ ] **`sitemap.xml`** `<lastmod>` dates.

## Deploying

The repository is served by GitHub Pages, so pushing to the default branch
publishes the site:

```sh
git add -A
git commit -m "Update site"
git push
```

Live at <https://lichenzhu.github.io/> within a minute or so. If Pages is not
enabled yet: repository **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)`**.
