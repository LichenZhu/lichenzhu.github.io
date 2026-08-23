/* Lichen Zhu — homepage behaviour.
   Progressive enhancement only: every piece of content is readable with JS off. */
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
