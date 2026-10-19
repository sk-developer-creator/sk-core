'use strict';

/**
 * SK CORE — the only script on the public page.
 * Two jobs: theme switching and the mobile navigation menu. Nothing else:
 * all content is static HTML generated at build time, so the page works
 * with JavaScript disabled (only the menu button and theme switch need it).
 */

(function () {
  var THEME_KEY = 'sk-core-theme';
  var root = document.documentElement;

  /* ------------------------------------------------------------ theme ---- */

  var themeButton = document.querySelector('[data-theme-toggle]');
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');

  function currentTheme() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyThemeLabel(theme) {
    if (!themeButton) return;
    var next = theme === 'light' ? 'dark' : 'light';
    themeButton.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    themeButton.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    themeButton.setAttribute('title', 'Switch to ' + next + ' theme');
  }

  function setTheme(theme, persist) {
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    applyThemeLabel(theme);
    if (themeColorMeta) {
      var isLight = theme === 'light';
      var value = isLight
        ? themeColorMeta.getAttribute('data-theme-color-light')
        : themeColorMeta.getAttribute('data-theme-color-dark');
      if (value) themeColorMeta.setAttribute('content', value);
    }
    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, theme);
      } catch (error) {
        /* Private mode or storage disabled: the theme still applies for this page view. */
      }
    }
  }

  if (themeButton) {
    setTheme(currentTheme(), false);
    themeButton.addEventListener('click', function () {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light', true);
    });
  }

  /* -------------------------------------------------------- mobile nav ---- */

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
    setMenu(false);

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
      if (window.innerWidth > 720 && isMenuOpen()) setMenu(false);
    });
  }
})();
