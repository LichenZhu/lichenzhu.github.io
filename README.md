# lichenzhu.github.io

Personal academic homepage. Plain static HTML, CSS, and a small amount of
vanilla JavaScript — no build step, no dependencies, no framework.

```
index.html                  homepage — about, selected publications, recent news
publications.html           full publication list
news.html                   full news archive, grouped by year
experience.html             education, experience, honours
404.html                    not-found page (GitHub Pages serves it automatically)
robots.txt                  crawler rules; blocks the named AI training bots
sitemap.xml                 two URLs; bump <lastmod> when you publish changes
assets/
  css/style.css             all styling (one file, sectioned + commented)
  js/main.js                mobile nav, publication modal, news toggle, scroll-spy
  images/logos/             Duke / XJTLU / Liverpool marks
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

Three typefaces, three jobs, no overlap — all variable, all **self-hosted**
from `assets/fonts/`, about 120 KB of latin subsets between them:

- **Display** — EB Garamond. The name, page titles, section titles, and the CEI
  unit name in the banner. The choice is institutional, not decorative: Duke's
  own wordmark is set in Garamond LT 3, and EB Garamond is the Garamond in
  Duke's brand palette (it is what `brand.duke.edu` serves as its web serif),
  so the unit name beside the wordmark is drawn in the same letterforms as the
  mark. A Garamond's x-height runs ~15% shorter than a grotesque at the same
  em, which is why `--t-display` / `--t-subhead` exist as separate steps.
- **Sans** — Inter. Prose, UI, and every paper title.
- **Mono** — JetBrains Mono, for everything that is *data*: venue badges, news
  dates, timeline ranges, tags, the corner stamp. That
  split is the main reason the page reads as technical rather than decorative,
  so keep it — if you add a new piece of metadata, add its selector to the
  `.mono` rule group in section 2.

The files are Google's own woff2 subsets with Google's own `unicode-range`
values, served from this origin instead. Three reasons, in order of weight: a
stylesheet from another host is a render blocker on infrastructure this site
does not control, and costs a DNS lookup and a TLS handshake with two extra
hosts before a glyph arrives; Google Fonts logs the visitor's IP, and a reader
of an academic page should not be announced to an ad company for it; and a
`preload` only helps for same-origin files, which is why `inter-latin` and
`eb-garamond-latin` are preloaded in every head.

`latin-ext` is shipped but never fetched — no page needs a glyph from it yet,
and `unicode-range` means the browser will only pull it if one appears. Every
stack still degrades to system faces, so deleting `assets/fonts/` and the
`@font-face` block leaves a working, if plainer, site.

**The type scale is closed.** `--t-micro` through `--t-display`, and `--lh-*` /
`--tr-*` for line height and tracking, are declared in section 1 and every rule
picks from them. They replaced 31 ad-hoc font sizes and 12 line heights that had
accumulated one iteration at a time. If a new size seems necessary, the scale is
probably wrong — change the token, not the rule.

**Inline links are coloured, not underlined.** A paragraph of prose with four
underlined names in it reads as fencing, so `.prose a` carries the link colour
plus `font-weight: 500`, and the underline appears only on `:hover` /
`:focus-visible`.

For that to work the colour has to be a *link* blue, not a dark navy. Duke Blue
`#012169` is only a 1.77:1 luminance step from body grey, so an unlined link set
in it just reads as slightly darker text — which is exactly what happened the
first time. `--accent-ink` on the light theme is therefore `#0f62c9`: same hue
family as the banner, 5.8:1 on white, and unmistakably a link. For scale,
jonbarron.info uses `#1772d0` unlined and yueqianlin.com uses `#39c`.

Strict WCAG 1.4.1 wants 3:1 between link and surrounding text before colour may
carry the distinction alone, and on this palette that is unreachable in either
theme — body copy is mid-grey, and no blue clears 3:1 against it while still
clearing 4.5:1 against the page. The weight and the hover/focus underline are
the second cue. Don't drop either.

Section headings on the homepage are the title followed by a hairline that runs
to the right edge, with an optional link ("All news →") pinned to the far end.
Inner pages use a `.page-head` (large title + lede) instead, and `.group-title`
for the bands within.

**Education cards** carry three lines in three voices, so the stack cannot
collapse into one grey block: the institution in the display serif
(`.edu-org`, 20px, `--ink`), its school in the UI face (`.edu-school`, 13px,
`--muted`), and the degree below it (`.edu-degree`, 14px, `--body`, weight
500). Organisation names in the Experience timeline (`.tl-org`) use the same
serif — proper nouns of institutions get the institutional voice, while paper
titles stay in the UI face.

**The institution marks are links** to each university, so `.tl-mark` is an
`<a>` rather than a `<span>`. The images keep `alt=""` — the institution is
named in the heading right beside them — which means the link has no text of
its own, so each one carries an `aria-label`. Drop that and you have three
nameless links. The accent border belongs on the mark's own `:hover` and
`:focus-visible` for the same reason it was taken off the card's hover: accent
means interactive here, and now the mark actually is.

**Colour on that page carries meaning, it is not decoration.** Gold
(`--award`) marks a distinction wherever one appears — the honours bullets and
`.edu-honour` on "First Class Honours" — and the accent marks what is ongoing:
`.tl-when--now` on the current role, matching the accent dot the timeline
already puts beside it. Don't spend either colour on anything else here.

**Duke.** The header *is* the institutional banner: Duke navy, wordmark and CEI
name on the left, navigation on the right, one bar. It stays navy in both themes
because it is institutional livery rather than page chrome, so every colour
inside `.site-header` is written against navy directly instead of against a
token. The wordmark file is navy on transparent — the same navy as the bar — so
it is flipped to white with `brightness(0) invert(1)`: that flattens every opaque
pixel to black then lifts it to white, leaving the alpha channel and therefore
the letterforms untouched. No white variant of the asset is needed.

`--duke` is Duke Blue, `#012169`. It is far too dark to carry an
accent on a near-black page, so on the dark theme it stays as the deep plate —
the nav mark, the right end of the top bar — and the working accent is a bright
derivative. On the light theme Duke Blue *is* the accent directly. The 3px
`.duke-bar` fixed across the top of every page is the one piece of unambiguous
university branding; everything else is derived colour.

**Two voices.** `About` stays measured — it is what a prospective advisor or a
reader of your papers lands on. `Outside the Lab` is the one section written
loosely, and it is the only one that should be. Do not let the register bleed
between them.

**No call-to-action buttons.** The CV is a plain link in the sidebar rail,
alongside Email and GitHub — not a download button. This follows what the
best academic homepages actually do: Jon Barron's is `Email / CV / Bio /
Scholar / Twitter / Github` as slash-separated text with no button anywhere,
and Karpathy's is a bare icon row. A gradient CTA is a landing-page device;
on a researcher's page it reads as selling something. If you ever do add a
button, save it for an action that warrants one — booking a meeting, say.

Four effects carry the rest:


- **`.backdrop`** — a fixed dot grid plus one accent bloom, masked to fade out
  below the fold. Purely decorative, `aria-hidden`, `pointer-events: none`.
- **Cursor-tracked card glow** — each `.pub-card` has a fill bloom (`::before`)
  and a 1px gradient border (`::after`), both centred on `--mx` / `--my`, which
  `main.js` writes on pointer move (one write per frame, hover-capable pointers
  only). With JS off they fall back to the card centre.
- **The column divider** — a sticky sidebar cannot carry a full-height border,
  so the rule between the two columns is drawn as `.layout::before`.
- **Scroll reveal** — `main.js` adds `.reveal` to a fixed selector list and an
  IntersectionObserver adds `.is-in`. The hidden state is gated behind the `js`
  class *and* backed by a sweep that un-hides anything still invisible on
  screen after load, so content can never be stranded at `opacity: 0`.

All three are disabled under `prefers-reduced-motion: reduce`.

## Pages, not scroll anchors

The top nav has three items — About, Publications, Experience. `news.html` is
deliberately not among them; it is reached from the homepage's "All news →"
link, and the CV from the sidebar rail. Nothing in the nav is a `#` link. Each
page is a complete document — there is no build step and no templating, so the
shared shell is **physically duplicated in every page**:

- `<head>` (only title / description / canonical / og differ)
- the header and its nav list, with `aria-current="page"` on the current item
- the whole `<aside class="sidebar">`
- the footer

**If you change any of those, change them in all four pages.** The sidebar and
the nav list are the two that will bite you. A quick check after editing:

```sh
grep -c 'sidebar-links' index.html publications.html news.html experience.html
```

The homepage is deliberately the fullest page: about, the four selected
publication cards, and the five most recent news items, each with a link
through to the page that holds the rest. When you add a news item, put it on
`news.html` and mirror it into the homepage's `NEWS` section if it belongs in
the recent five.

## How the homepage is laid out

Two columns inside `<div class="layout">`:

- **`<aside class="sidebar">`** — photo, name, affiliation, contact links, CV
  button. It is `position: sticky`, so it stays put while the right column
  scrolls. Below 820px it becomes a normal block above the content; below 720px
  it goes fully single-column.
- **`<main>`** — About, Selected Publications, Recent News. The inner pages use
  the same two-column layout, with a `.page-head` in place of numbered sections.

Everything personal lives in the sidebar or the footer, so the scrolling column
is nothing but substance.

## Editing content

Every section is wrapped in a banner comment, and the ones you will touch often
contain a boxed `TO ADD A ...` note with the exact block to copy.

| What | Where |
| --- | --- |
| Name, affiliation, photo | `index.html` → `SIDEBAR` |
| Email / GitHub / LinkedIn / Scholar / CV links | `index.html` → `<div class="sidebar-links">` and the footer |
| Biography | `index.html` → `ABOUT` |
| Research interest tags | `index.html` → `<ul class="tags">` |
| Selected publications (cards) | `index.html` → `SELECTED PUBLICATIONS` |
| Recent news (5 on the homepage) | `index.html` → `NEWS`, add a `<li>` at the top |
| Hobbies / personal voice | `experience.html` → `OUTSIDE THE LAB` |
| Institution logos | `assets/images/logos/`, shown in `experience.html` |
| Education entries | `experience.html` → `EDUCATION CARDS` |
| All publications | `publications.html`, grouped by status |
| All news | `news.html`, grouped by year |
| Education / experience / awards | `experience.html` |
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
  `badge badge--muted` (grey, for preprints and arXiv), and
  `badge badge--award` (for Oral, Spotlight, Best Paper).
- **BibTeX** goes in a `<details class="bibtex">` *inside* the `.pub-links` /
  `.entry-links` row — closed it is one more pill, open it takes a row of its
  own. It needs no JavaScript; `main.js` only adds the copy button, and it does
  so through a delegated click handler because the modal clones a card's
  `.pub-detail` and a cloned node does not carry its listeners.

  **Paste the text from `arxiv.org/bibtex/<id>`, do not write it by hand.** Only
  the two arXiv papers carry a block, because those are the only two with an
  authoritative entry to copy; a citation someone pastes into a paper must not
  be something this site guessed. Add the rest when the proceedings appear.
- **Missing links are fine.** Delete any `Paper` / `Code` / `Project` / `Demo`
  pill you don't have; the row is a flex container, so nothing else moves.
- **No teaser image?** On a card, delete the whole `<div class="pub-thumb">`. In
  a `publications.html` entry, add `entry--notease` to the `<article>` and delete
  the `<figure>`.
- **Older news** is hidden behind the "Show earlier news" button: give the `<li>`
  `class="news-more"` and the `hidden` attribute.
- **Outside the Lab** runs full width: prose, then the `.interests` row, then
  the `.gallery`. **The interest icons are inline SVG** — no icon font, no extra
  request, `stroke="currentColor"` so both themes are handled for free, and
  `stroke-width="1.7"` to match the sidebar set. Draw a new one at 24×24 and
  check it at 15px before shipping: the first basketball had arcs so shallow it
  read as a crosshair at that size.
- **The gallery keeps two files per photo.** `<name>.webp` is a 440px thumbnail,
  lazy-loaded, and `<name>-lg.webp` is the 1200px version fetched only when a
  photo is opened — 160 KB on the page instead of 1.1 MB. Tiles are square with
  `object-fit: cover` because the set mixes landscape and portrait.
- **Each tile is a real `<a>` to the full image**, so with scripting off a click
  simply opens the file. `main.js` intercepts it and reuses the same `<dialog>`
  pattern as the publication modal, which brings the focus trap, Escape and
  scroll lock along for free. To add a photo, drop both sizes in
  `assets/images/life/gallery/` and add one `<li>`.
- **Strip the EXIF.** Every photo here went through a fresh pixel buffer, so no
  camera data and no GPS ships. Phone photos carry coordinates.
- **A news item on `news.html` can carry a photo.** The homepage feed stays text
  only. Add a `<figure class="news-photo">` as the
  *third* child of the `<li>` — it is pinned to grid column 2 so it lands under
  the sentence, not under the date. Photos are normalised by height rather than
  cropped to a shared ratio, so landscape and portrait shots can sit in the same
  feed without anyone losing their head. The `<figcaption>` is a place, set in
  mono like every other piece of data. Run new photos through
  `assets/images/life/` at ≤900px on the long edge, quality 82, **and strip the
  EXIF** — phone photos carry GPS coordinates.
- **Teaser figures** live in `assets/images/publications/` and come in two
  kinds. Real figures exported from the papers are `.webp` at ~1500px on the
  long edge, quality 90 — WebP because these are dense diagrams whose text has
  to stay sharp, and a PNG of the same figure runs six times larger. The rest
  are 16:10 SVGs drawn for this site, sharing a palette declared inline in each
  file: `#8892a0` for structure, `#3d8bf0` for the highlighted path, `#d98b6a`
  for the failure case.

  **Every figure sits on a white plate in both themes** (`--fig-bg`,
  `--fig-line`). A paper figure arrives with a white ground and dark text
  printed onto it, and often photographs inside — there is nothing to key out
  and no `invert()` that survives. Rather than let half the grid go white and
  half stay transparent, they all get the same plate. It also hides the
  letterboxing, since a 2.8:1 figure and a 1.2:1 figure blend into a ground the
  same colour as their own. Drop a new figure in at any aspect ratio;
  `object-fit: contain` handles the rest.

  A paper with no figure worth showing can carry its university mark instead:
  `class="fig-mark"` on the `<img>`, which adds the extra padding a logo needs
  so it reads as a mark rather than a block. `publications.html` does this for
  the undergraduate dissertation.
- **The favicon** (`assets/favicon.svg`) is a Z built from two accent bars and a
  white diagonal — three shapes, so it survives 16px in a browser tab. The same
  mark is inlined in each page's `.nav-brand`; if you change one, change both.

## Institution logos

`assets/images/logos/` holds the three real marks:

| File | Source | Notes |
| --- | --- | --- |
| `duke.png` | Duke wordmark, navy `#012169` | transparent PNG, cropped to the ink and downscaled to 720px |
| `xjtlu.png` | XJTLU shield | supplied as a white-background JPEG, cropped to the mark, downscaled to 360px |
| `liverpool.svg` | <https://www.liverpool.ac.uk/logo-size-test/> `full-colour.svg` | **`width`/`height` were added to the root `<svg>`** |

That last point matters. The file Liverpool serves declares only a `viewBox`,
and with no intrinsic dimensions its width collapses to nothing under
height-based sizing — the chip renders empty. If you ever re-download it, add
`width="566.9" height="144.7"` to the `<svg>` element again.

The three marks have wildly different proportions — a 2.3:1 wordmark, a 0.8:1
shield, a 3.9:1 lockup. They are handled like this:

- Each sits in a **white chip** (`.tl-mark`) of uniform height. All three are
  dark-on-light artwork, and a white chip is the only treatment that carries
  every one of them without recolouring somebody's trademark. On the dark theme
  the chip is held just under full brightness so it does not glare.
- Education is a **card grid**, not timeline rows. Each card carries its own
  logo row, so a 94px Duke chip and a 230px XJTLU + Liverpool pair never have to
  line up with each other — which is exactly what went wrong when they were rows.
- Marks are normalised by **height, not by box**. Wordmarks get 30px; add
  `tl-mark--tall` for a portrait mark like the XJTLU shield and it gets 42px, so
  every chip carries the same optical weight.

Logos use `alt=""` on purpose: the organisation name is in the heading directly
beneath, so alt text would just make a screen reader say it twice. The one in
`.duke-bar` is the exception — it carries `alt="Duke University"`, because there
is no adjacent text naming it.

**No middle dots.** `·` is not used as a separator anywhere. Where one piece of
metadata sits beside another — a place beside a date range, a review status
beside a venue — they are separate elements with space between them
(`.tl-place` / `.tl-when`, or two `.badge`s), not one string glued with
punctuation. Keep it that way when you add entries.

## The corner stamp

Every page carries an "Updated YYYY-MM-DD" badge — pinned bottom-right on
desktop, and in the flow above the footer on a phone, where a fixed pill would
sit on top of the content.

There is no build step, so the date is written into each page. It used to be one
value copied into all five, which meant it said the same thing everywhere and
was wrong the moment a single page changed. `tools/stamp.py` reads the real date
out of git instead — the last commit that touched that file, or today if the
file has uncommitted changes, since that is the date the edit in progress will
land on:

```sh
python3 tools/stamp.py          # rewrite the stamps, the CV date and the sitemap
python3 tools/stamp.py --check  # report drift, change nothing, exit 1 if any
```

It maintains two other dates from the same source. The `Aug 2026` beside the
**Curriculum Vitae** link comes from the PDF's own git history — a CV with no
date on it could be three years old, which is why `tridao.me` prints "CV
(updated 01/2026)". And every `<lastmod>` in `sitemap.xml` is set from the page
its `<loc>` points at, so the three dates on this site can no longer disagree
with each other.

The script is a convenience, not a dependency: the site is complete without ever
running it. Run it as the last thing before a commit.

**Every publication entry has an `id`** (`memory-compression`, `absent-answer`,
`semantic-unit-aggregation`, `keyframe-sampling`, `stylevar`, `credit-risk`), so
a single paper can be linked to directly: `publications.html#absent-answer`.
Keep the id when you edit an entry — an id that changes is a link that breaks.

## Crawlers and structured data

- `robots.txt` follows one rule: **block training, allow reading.** Blocking a
  crawler that builds a training corpus costs nothing, because nobody finds a
  person through a training set. Blocking a crawler that fetches this page
  because a reader asked an assistant about it costs the whole point of the
  page. They are separate crawlers with separate names, so `ChatGPT-User`,
  `OAI-SearchBot`, `Claude-User`, `Claude-SearchBot`, `PerplexityBot`,
  `Perplexity-User` and `Gemini-Deep-Research` are named as allowed, while
  `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`,
  `Bytespider` and the rest stay blocked.

  Two things to keep in mind when editing it. **Do not name `Applebot`** — it is
  already covered by the wildcard, and a parser that matches on prefix rather
  than on the longest name would let `Applebot-Extended` through on Applebot's
  rule. That exact bug was in the file for one commit. And **a blocklist is
  always one name behind** whatever launched last week; anything unnamed is
  allowed by `User-agent: *`.
- Each page carries `<meta name="robots" content="index, follow, noai, noimageai">`
  for agents that read markup rather than `robots.txt`.
- `index.html` ends with a JSON-LD `@graph`: a `Person`, a `WebSite`, and one
  `ScholarlyArticle` per selected paper. **Mirror any change you make to the
  publication cards there**, or search engines will see a stale list.

## Before you publish — things to check

- [ ] **News dates** were inferred from the CV; verify each one.
- [ ] **Author names** use the abbreviated CV form (`Y. Lin`). Expand them to
      full names if you prefer.
- [ ] **`sitemap.xml`** needs a new `<url>` for any page you add. The
      `<lastmod>` dates are handled by `tools/stamp.py`.
- [ ] **Corner stamps** — run `python3 tools/stamp.py` before committing.

## Keeping the five pages honest

There is no template engine, so the head, banner, sidebar and footer are
repeated in every page. That is the one real cost of having no build step, and
it has bitten twice: the corner stamp was copied into all five and went stale,
and `.subsection-title` drifted away from `.group-title` until only one of them
still had its hairline.

`tools/check.py` is the cheap half of a template engine. It cannot assemble the
pages, but it refuses to let them disagree:

```sh
python3 tools/check.py
```

It checks that the four repeated blocks are identical once `aria-current` and
404's absolute paths are normalised away; that every local link resolves and no
asset is unreferenced; that no middle dot, placeholder or straight apostrophe
has crept into visible prose; that every page parses, has exactly one `<h1>`
and skips no heading level; that the stylesheet's braces balance and no class
is declared without being used; and that the stamps, the CV date and the
sitemap all agree. It exits non-zero, so it can gate a commit.

The first run found that `404.html` had no `nav-toggle` — which meant that
below 720px, where `.nav-list` is `display: none` until the toggle opens it,
the error page had no navigation at all.

## Files that are not deployed

`_source/` holds the full-resolution originals — the photographs off the phone,
the figures exported from the papers, and in `_source/papers/` the arXiv PDFs
the rest were cut out of. It is git-ignored; the web-ready derivatives under
`assets/images/` are what ship. Keep it if you might re-crop or re-export,
delete it if you have the originals elsewhere.

To pull a figure out of a paper: `pdftoppm -r 400 -f <page> -l <page> -png
paper.pdf out` renders the page, then crop to the figure and save it as WebP at
about 1500px on the long edge, quality 90.

## If the site stops loading

`https://lichenzhu.github.io/` returning **"Site not found · GitHub Pages"** —
GitHub's own 404, about 9 KB, not the `404.html` in this repo — means Pages is
not serving the repository at all. It is not a content problem, and nothing in
here will fix it.

The usual cause is that the repository was made **private**. Pages is disabled
when that happens, and **making the repository public again does not turn it
back on**. Re-select the source by hand:

1. `https://github.com/LichenZhu/lichenzhu.github.io/settings/pages`
2. **Build and deployment → Source**: *Deploy from a branch*
3. **Branch**: `main`, folder `/ (root)` → **Save**
4. Give it a minute or two; the page then shows the live URL with a green tick.

To tell the two kinds of failure apart:

```sh
curl -sI https://lichenzhu.github.io/ | head -1     # 200 = Pages is running
curl -s  https://lichenzhu.github.io/ | grep -c 'Site not found'   # 1 = Pages is off
```

A 404 from *our* `404.html` is a broken link. "Site not found" is Pages itself.

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
