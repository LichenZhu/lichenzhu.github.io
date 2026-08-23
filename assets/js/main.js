/* Lichen Zhu — homepage behaviour.
   Progressive enhancement only: every piece of content is readable with JS off.
   The publication cards are the one place that matters — their .pub-detail
   blocks render inline when this file never runs, and are hidden (by the `js`
   class set in <head>) only so this script can lift them into the modal. */
(function () {
  'use strict';

  /* --- Mobile navigation ------------------------------------------------ */
  var toggle = document.querySelector('.nav-toggle');
  var navList = document.getElementById('nav-list');

  if (toggle && navList) {
    toggle.addEventListener('click', function () {
      var open = navList.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    // Close after tapping a link (same-page anchors would otherwise leave it open).
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

  /* --- Hairline under the header once the page scrolls ------------------ */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- Publication modal ------------------------------------------------
     One <dialog> serves every card. On open we assemble its contents from
     the card itself — teaser, badges, title — and append a clone of the
     card's .pub-detail. Nothing is duplicated in the markup.
     -------------------------------------------------------------------- */
  var modal = document.getElementById('pub-modal');
  var modalBody = document.getElementById('pub-modal-body');
  var supportsDialog = modal && typeof modal.showModal === 'function';

  if (supportsDialog && modalBody) {
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

    // The close button, and clicks that land on the backdrop rather than the
    // dialog's own content (those report the <dialog> itself as the target).
    modal.addEventListener('click', function (e) {
      if (e.target.closest('.pub-modal-close') || e.target === modal) {
        modal.close();
      }
    });

    modal.addEventListener('close', function () {
      if (lastOpener) { lastOpener.focus(); lastOpener = null; }
    });
  }

  /* --- Reveal earlier news ---------------------------------------------- */
  var newsToggle = document.querySelector('.news-toggle');
  if (newsToggle) {
    var moreItems = document.querySelectorAll('.news-more');
    newsToggle.addEventListener('click', function () {
      var expanded = newsToggle.getAttribute('aria-expanded') === 'true';
      Array.prototype.forEach.call(moreItems, function (li) {
        li.hidden = expanded;
      });
      newsToggle.setAttribute('aria-expanded', String(!expanded));
      newsToggle.querySelector('.news-toggle-label').textContent =
        expanded ? 'Show earlier news' : 'Show fewer';
    });
  }

  /* --- Highlight the section currently in view -------------------------- */
  var sectionLinks = Array.prototype.filter.call(
    document.querySelectorAll('.nav-list a[href^="#"]'),
    function (a) { return document.querySelector(a.getAttribute('href')); }
  );

  if (sectionLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    var targets = sectionLinks.map(function (a) {
      var el = document.querySelector(a.getAttribute('href'));
      byId[el.id] = a;
      return el;
    });

    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { visible.add(entry.target.id); }
        else { visible.delete(entry.target.id); }
      });

      // The topmost visible section wins.
      var current = targets.filter(function (el) { return visible.has(el.id); })[0];
      sectionLinks.forEach(function (a) { a.classList.remove('is-active'); });
      if (current && byId[current.id]) { byId[current.id].classList.add('is-active'); }
    }, { rootMargin: '-25% 0px -60% 0px', threshold: 0 });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* --- Footer year ------------------------------------------------------ */
  var year = document.getElementById('year');
  if (year) { year.textContent = String(new Date().getFullYear()); }
})();
