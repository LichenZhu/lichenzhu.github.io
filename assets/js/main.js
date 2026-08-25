/* Lichen Zhu — homepage behaviour.

   Progressive enhancement only. Nothing here is required to read the page:
   the publication detail blocks render inline without it, and the reveal
   animation is gated behind the `js` class set in <head> so no element can
   ever be stranded at opacity 0. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Mobile navigation ------------------------------------------------ */
  var toggle = document.querySelector('.nav-toggle');
  var navList = document.getElementById('nav-list');

  if (toggle && navList) {
    toggle.addEventListener('click', function () {
      var open = navList.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    navList.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        navList.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navList.classList.contains('is-open')) {
        navList.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* --- Header goes translucent once the page scrolls -------------------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- Cursor-tracked glow on the publication cards ---------------------
     The card's ::before (fill bloom) and ::after (1px gradient border) are
     both centred on --mx / --my. We only write them while the pointer is
     over a card, and only on devices that actually have a hover pointer.
     -------------------------------------------------------------------- */
  var grid = document.querySelector('.pub-grid');
  if (grid && window.matchMedia('(hover: hover)').matches && !reduceMotion) {
    var pending = null;

    grid.addEventListener('pointermove', function (e) {
      var card = e.target.closest('.pub-card');
      if (!card) { return; }

      // One write per frame; pointermove fires far faster than we repaint.
      if (pending) { return; }
      pending = requestAnimationFrame(function () {
        pending = null;
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    }, { passive: true });
  }

  /* --- Publication modal ------------------------------------------------
     One <dialog> serves every card. Its contents are assembled from the card
     itself — teaser, badges, title — plus a clone of that card's .pub-detail,
     so nothing is duplicated in the markup.
     -------------------------------------------------------------------- */
  var modal = document.getElementById('pub-modal');
  var modalBody = document.getElementById('pub-modal-body');

  if (modal && modalBody && typeof modal.showModal === 'function') {
    var lastOpener = null;

    var fill = function (card) {
      var thumb = card.querySelector('.pub-thumb img');
      var badges = card.querySelector('.badges');
      var opener = card.querySelector('.pub-open');
      var detail = card.querySelector('.pub-detail');

      modalBody.textContent = '';

      if (thumb) {
        var figure = document.createElement('figure');
        figure.className = 'pub-modal-figure';
        var img = document.createElement('img');
        img.src = thumb.currentSrc || thumb.src;
        img.alt = thumb.alt;
        img.className = thumb.className;   // carries any figure modifier
        figure.appendChild(img);
        modalBody.appendChild(figure);
      }

      if (badges) { modalBody.appendChild(badges.cloneNode(true)); }

      var title = document.createElement('h2');
      title.className = 'pub-modal-title';
      title.id = 'pub-modal-title';
      title.textContent = opener ? opener.textContent.trim().replace(/\s+/g, ' ') : '';
      modalBody.appendChild(title);

      if (detail) { modalBody.appendChild(detail.cloneNode(true)); }
    };

    document.addEventListener('click', function (e) {
      var opener = e.target.closest('.pub-open');
      if (!opener) { return; }
      var card = opener.closest('.pub-card');
      if (!card) { return; }

      lastOpener = opener;
      fill(card);
      modal.showModal();
      modalBody.scrollTop = 0;
    });

    // Close button, plus clicks that land on the backdrop rather than the
    // dialog's content (those report the <dialog> itself as the target).
    modal.addEventListener('click', function (e) {
      if (e.target.closest('.pub-modal-close') || e.target === modal) {
        modal.close();
      }
    });

    modal.addEventListener('close', function () {
      if (lastOpener) { lastOpener.focus(); lastOpener = null; }
    });
  }

  /* --- Photo viewer -----------------------------------------------------
     Each tile is already a link to the full image, so with scripting off the
     gallery still works — a click just navigates to the file. Here the click
     is intercepted and the same <dialog> pattern the publications use takes
     over, which brings the focus trap, Escape and scroll lock with it.
     -------------------------------------------------------------------- */
  var photoModal = document.getElementById('photo-modal');
  var photoImg = document.getElementById('photo-modal-img');

  if (photoModal && photoImg && typeof photoModal.showModal === 'function') {
    var lastTile = null;

    document.addEventListener('click', function (e) {
      var link = e.target.closest('.gallery a');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) { return; }
      e.preventDefault();

      var thumb = link.querySelector('img');
      lastTile = link;
      photoImg.src = link.getAttribute('href');
      photoImg.alt = thumb ? thumb.alt : '';
      photoModal.showModal();
    });

    photoModal.addEventListener('click', function (e) {
      // The dialog box is the image; anything else is the backdrop.
      if (e.target.closest('.pub-modal-close') || e.target === photoModal) {
        photoModal.close();
      }
    });

    photoModal.addEventListener('close', function () {
      // Drop the full-size image so it is not held in memory between views.
      photoImg.removeAttribute('src');
      if (lastTile) { lastTile.focus(); lastTile = null; }
    });
  }

  /* --- BibTeX copy button -----------------------------------------------
     The <details> already opens, closes and takes keyboard focus on its own;
     this only adds the convenience on top. The click is delegated rather than
     bound per button, because the modal clones a card's .pub-detail — and a
     cloned node does not carry its listeners, so a bound handler would leave
     the button dead inside the dialog.
     -------------------------------------------------------------------- */
  var canCopy = navigator.clipboard && window.isSecureContext;

  if (canCopy) {
    Array.prototype.forEach.call(document.querySelectorAll('.bibtex pre'), function (pre) {
      var panel = document.createElement('div');
      panel.className = 'bibtex-panel';
      pre.parentNode.insertBefore(panel, pre);
      panel.appendChild(pre);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bibtex-copy';
      btn.textContent = 'Copy';
      panel.appendChild(btn);
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.bibtex-copy');
      if (!btn) { return; }
      var pre = btn.parentNode.querySelector('pre');
      if (!pre) { return; }

      navigator.clipboard.writeText(pre.textContent).then(function () {
        btn.textContent = 'Copied';
        clearTimeout(btn._reset);
        btn._reset = setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
      }, function () {
        // Denied or unavailable: the <pre> is still selectable text.
        btn.textContent = 'Select it';
      });
    });
  }

  /* --- Reveal earlier news ---------------------------------------------- */
  var newsToggle = document.querySelector('.news-toggle');
  if (newsToggle) {
    var moreItems = document.querySelectorAll('.news-more');
    newsToggle.addEventListener('click', function () {
      var expanded = newsToggle.getAttribute('aria-expanded') === 'true';
      Array.prototype.forEach.call(moreItems, function (li) { li.hidden = expanded; });
      newsToggle.setAttribute('aria-expanded', String(!expanded));
      newsToggle.querySelector('.news-toggle-label').textContent =
        expanded ? 'Show earlier news' : 'Show fewer';
    });
  }

  /* --- Scroll reveal ----------------------------------------------------
     Classes are applied from here rather than in the markup, so the HTML
     stays free of presentation hooks. Cards in a grid stagger by index.
     -------------------------------------------------------------------- */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var revealed = document.querySelectorAll(
      '.sidebar > *, .page-head, .section-head, .prose, .tags, ' +
      '.pub-card, .news-list, .news-toggle, .subsection, .entry-list > li'
    );

    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });

    Array.prototype.forEach.call(revealed, function (el) {
      el.classList.add('reveal');

      // Stagger siblings that sit in the same grid or stack.
      var peers = el.parentElement ? el.parentElement.children : null;
      if (peers && peers.length > 1 && el.matches('.pub-card, .sidebar > *')) {
        var i = Array.prototype.indexOf.call(peers, el);
        el.style.transitionDelay = Math.min(i, 5) * 70 + 'ms';
      }

      revealObserver.observe(el);
    });

    // Safety net. An element that is on screen but still hidden means the
    // observer never delivered — throttled tab, restored scroll position,
    // print/screenshot rendering. Content must never be stranded invisible,
    // so sweep once the page has settled and again on resize.
    var sweep = function () {
      var stuck = document.querySelectorAll('.reveal:not(.is-in)');
      Array.prototype.forEach.call(stuck, function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-in');
        }
      });
    };
    window.addEventListener('load', function () { setTimeout(sweep, 600); });
    window.addEventListener('resize', sweep, { passive: true });
    setTimeout(sweep, 2500);
  }

  /* --- Footer year ------------------------------------------------------ */
  var year = document.getElementById('year');
  if (year) { year.textContent = String(new Date().getFullYear()); }
})();
