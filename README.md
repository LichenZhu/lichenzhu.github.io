# lichenzhu.github.io

Personal academic homepage. Plain static HTML, CSS, and a small amount of
vanilla JavaScript — no build step, no dependencies, no framework.

```
index.html                  homepage
publications.html           full publication list
assets/
  css/style.css             all styling (one file, sectioned + commented)
  js/main.js                mobile nav, news toggle, scroll-spy
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

## Editing content

Every section in `index.html` is wrapped in a banner comment, and the ones you
will touch often contain a boxed `TO ADD A ...` note with the exact block to
copy. In short:

| What | Where |
| --- | --- |
| Name, position, intro paragraph | `index.html` → `HERO` section |
| Research interest tags | `index.html` → `<ul class="tags">` |
| Email / GitHub / LinkedIn / Scholar / CV links | `index.html` → `<div class="hero-links">` and the footer |
| Biography | `index.html` → `ABOUT` section |
| Featured projects (3) | `index.html` → `FEATURED RESEARCH`, copy one `<li>` |
| News | `index.html` → `NEWS`, add a `<li>` at the top |
| Selected publications | `index.html` → `SELECTED PUBLICATIONS` |
| All publications | `publications.html`, grouped by status |
| Education / experience / awards | `index.html` → `EDUCATION & EXPERIENCE` |
| Profile photo | replace `assets/images/profile/lichen-zhu.jpg` (square) |
| CV | replace `assets/files/Lichen_Zhu_CV.pdf` (keep the filename) |

A few conventions worth knowing:

- **Your name in an author list** goes in `<span class="author-me">L. Zhu</span>`
  so it renders darker and bolder than the co-authors.
- **Badges** come in three flavours: `badge` (accent, for accepted venues),
  `badge badge--muted` (grey, for under review / preprints), and
  `badge badge--award` (for Oral, Spotlight, Best Paper).
- **Missing links are fine.** Delete any `Paper` / `Code` / `Project` / `Demo`
  link you don't have along with its `<span class="sep">·</span>` — the row just
  gets shorter. An entry with no links at all needs no `entry-links` block.
- **No teaser image?** Add `entry--notease` to the `<article>` and delete the
  `<figure>`; the entry goes full width and still lines up. The homepage
  publication list uses this on purpose, so it doesn't repeat the figures
  already shown in Featured Research.
- **Older news** is hidden behind the "Show earlier news" button: give the `<li>`
  `class="news-more"` and the `hidden` attribute.
- **Teaser figures** are 16:10. The ones currently in
  `assets/images/publications/` are labelled `FIGURE PLACEHOLDER` — swap in real
  PNG/JPG figures and update the `src` and `alt`.

## Before you publish — things to check

- [ ] **News dates** were inferred from the CV; verify each one.
- [ ] **Google Scholar link** is commented out in the hero and footer of both
      pages — uncomment it and paste your profile URL.
- [ ] **Teaser figures** are placeholders.
- [ ] **Author names** use the abbreviated CV form (`Y. Lin`). Expand them to
      full names if you prefer.

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
