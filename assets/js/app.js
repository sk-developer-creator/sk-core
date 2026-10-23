'use strict';

(function () {
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

  var navToggle = document.querySelector('[data-nav-toggle]');
  var navPanel = document.querySelector('[data-nav-panel]');

  function isMenuOpen() {
    return !!navPanel && navPanel.getAttribute('data-open') === 'true';
  }

  function setMenu(open) {
    if (!navPanel || !navToggle) return;
    navPanel.setAttribute('data-open', open ? 'true' : 'false');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  if (navToggle && navPanel) {
    navToggle.addEventListener('click', function () {
      setMenu(!isMenuOpen());
    });

    navPanel.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isMenuOpen()) {
        setMenu(false);
        navToggle.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (!isMenuOpen()) return;
      if (navPanel.contains(event.target) || navToggle.contains(event.target)) return;
      setMenu(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 760 && isMenuOpen()) setMenu(false);
    });
  }

  var sectionLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
  var sectionEntries = [
    { id: 'home', label: 'Home' },
    { id: 'products', label: 'Products' },
    { id: 'about', label: 'About' },
    { id: 'contact', label: 'Contact' }
  ].map(function (item) {
    return { id: item.id, label: item.label, element: document.getElementById(item.id) };
  }).filter(function (item) { return !!item.element; });

  var header = document.querySelector('.site-header');
  var sectionLabel = document.querySelector('.brand-beam span');
  var sectionFrame = 0;
  var wheelNavigationLocked = false;
  var scrollTimer = 0;

  function activateSection(section) {
    if (!section) return;
    if (sectionLabel) {
      sectionLabel.textContent = section.id === 'home' ? 'SK CORE' : section.label;
      sectionLabel.parentElement.hidden = false;
    }
    sectionLinks.forEach(function (link) {
      if (link.getAttribute('href') === '#' + section.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function updateActiveSection() {
    sectionFrame = 0;
    if (!sectionEntries.length) return;

    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    var active = sectionEntries[0];
    var marker = headerHeight + window.innerHeight * 0.25;

    for (var i = 0; i < sectionEntries.length; i++) {
      if (sectionEntries[i].element.getBoundingClientRect().top <= marker) active = sectionEntries[i];
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      active = sectionEntries[sectionEntries.length - 1];
    }
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    activateSection(active);
  }

  function scheduleActiveSection() {
    if (!sectionFrame) sectionFrame = window.requestAnimationFrame(updateActiveSection);
  }

  function scrollToSection(target) {
    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    var from = window.scrollY;
    var to = Math.max(0, target.element.offsetTop - headerHeight);
    var start = Date.now();
    var rootStyle = document.documentElement.style;

    activateSection(target);
    window.history.replaceState(null, '', '#' + target.id);
    window.clearInterval(scrollTimer);
    rootStyle.scrollBehavior = 'auto';
    scrollTimer = window.setInterval(function () {
      var progress = Math.min(1, (Date.now() - start) / 600);
      var eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, from + (to - from) * eased);
      if (progress === 1) {
        window.clearInterval(scrollTimer);
        rootStyle.scrollBehavior = '';
      }
    }, 16);
  }

  function navigateOneSection(direction) {
    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    var activeIndex = 0;
    for (var i = 0; i < sectionEntries.length; i++) {
      if (sectionEntries[i].element.offsetTop <= window.scrollY + headerHeight + 2) activeIndex = i;
    }
    var nextIndex = Math.max(0, Math.min(sectionEntries.length - 1, activeIndex + direction));
    if (nextIndex === activeIndex) return;
    scrollToSection(sectionEntries[nextIndex]);
  }

  if (sectionEntries.length) {
    sectionLinks.forEach(function (link) {
      link.addEventListener('click', function (event) {
        var target = sectionEntries.find(function (section) {
          return link.getAttribute('href') === '#' + section.id;
        });
        if (!target) return;
        event.preventDefault();
        scrollToSection(target);
      });
    });

    window.addEventListener('scroll', scheduleActiveSection, { passive: true });
    window.addEventListener('resize', scheduleActiveSection, { passive: true });
    window.addEventListener('hashchange', scheduleActiveSection);
    window.addEventListener('wheel', function (event) {
      if (Math.abs(event.deltaY) < 10 || wheelNavigationLocked) return;
      event.preventDefault();
      wheelNavigationLocked = true;
      navigateOneSection(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(function () { wheelNavigationLocked = false; }, 950);
    }, { passive: false });

    var initialSection = sectionEntries.find(function (section) {
      return window.location.hash === '#' + section.id;
    });
    window.scrollTo(0, initialSection
      ? Math.max(0, initialSection.element.offsetTop - (header ? header.getBoundingClientRect().height : 0))
      : 0);
    updateActiveSection();
  }

  var revealElements = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealElements.forEach(function (element) { observer.observe(element); });
  } else {
    revealElements.forEach(function (element) { element.classList.add('is-visible'); });
  }

  document.querySelectorAll('.product-card').forEach(function (card) {
    card.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      var rect = card.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      var y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--ry', (x - 0.5) * 6 + 'deg');
      card.style.setProperty('--rx', (0.5 - y) * 5 + 'deg');
      card.style.setProperty('--mx', x * 100 + '%');
      card.style.setProperty('--my', y * 100 + '%');
    });
    card.addEventListener('pointerleave', function () {
      card.removeAttribute('style');
    });
  });
})();
