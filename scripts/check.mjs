/**
 * SK CORE verification.
 *
 * Validates the configuration and the built site in dist/. No third-party
 * packages and no browser needed: everything is checked from the actual files.
 * Run with: npm run check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

function read(file) {
  return fs.readFileSync(path.join(DIST, file), 'utf8');
}

function exists(relative) {
  return fs.existsSync(path.join(DIST, relative));
}

/* --------------------------------------------------------------- contrast */

function parseHex(value) {
  const hex = value.trim().replace('#', '');
  if (!/^[0-9a-f]{3}$/i.test(hex) && !/^[0-9a-f]{6}$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function parseRgba(value) {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

function over(foreground, background) {
  const alpha = foreground[3] === undefined ? 1 : foreground[3];
  return [0, 1, 2].map((i) => Math.round(foreground[i] * alpha + background[i] * (1 - alpha)));
}

/** Pulls a theme block's custom properties out of the stylesheet.
 *  Requires the selector to be followed by `{`, so mentions inside comments
 *  (for example the header comment) are not mistaken for the rule itself. */
function themeTokens(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{`).exec(css);
  if (!match) return {};
  const open = css.indexOf('{', match.index);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const tokens = {};
  for (const token of body.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)) {
    tokens[token[1]] = token[2].trim();
  }
  return tokens;
}

/* -------------------------------------------------------------- run checks */

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const site = config.site || {};
const products = config.products || [];
const origin = String(site.origin || '').replace(/\/+$/, '');

section('Configuration');
check('site.brand is set', typeof site.brand === 'string' && site.brand.length > 0);
check('site.origin is an https origin', /^https:\/\/[a-z0-9.-]+$/i.test(origin), origin);
check('site.origin is not a placeholder or loopback', !/example\.com|localhost|127\.0\.0\.1|\.local\b/i.test(origin), origin);
check('site.title and site.description are set', !!site.title && !!site.description);
check('title length is reasonable (<= 70)', String(site.title || '').length <= 70, `${String(site.title || '').length} chars`);
check('description length is reasonable (<= 165)', String(site.description || '').length <= 165, `${String(site.description || '').length} chars`);
check('at least one product is configured', products.length >= 1);

const ids = products.map((p) => p.id);
check('product ids are unique', new Set(ids).size === ids.length);
check('product ids are url-safe', ids.every((id) => /^[a-z0-9-]+$/.test(String(id))));
check('every product has name, tagline, description, icon and status', products.every((p) => p.name && p.tagline && p.description && p.icon && p.status));
check('every product status is known', products.every((p) => ['available', 'coming-soon'].includes(p.status)));

for (const product of products) {
  const href = product.href;
  if (href === null || href === undefined || href === '') {
    check(`${product.name}: no URL configured, so urlNote explains it`, typeof product.urlNote === 'string' && product.urlNote.length > 20);
  } else {
    check(`${product.name}: URL is https`, /^https:\/\//i.test(href), String(href));
    check(`${product.name}: URL is not a placeholder`, !/example\.com|localhost|127\.0\.0\.1|TODO|your-|placeholder/i.test(href), String(href));
    check(`${product.name}: URL has no trailing slash or whitespace`, href === href.trim() && !href.endsWith('/'), String(href));
  }
}

check('SK MAIL is not part of this catalog', !JSON.stringify(config).toLowerCase().includes('sk mail'));

section('Build output');
const requiredFiles = [
  'index.html', '404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest',
  'assets/css/styles.css', 'assets/js/app.js', 'assets/favicon.svg',
  'assets/icons/icon-32.png', 'assets/icons/icon-180.png', 'assets/icons/icon-192.png',
  'assets/icons/icon-512.png', 'assets/og/og-image.png',
];
for (const file of requiredFiles) check(`dist/${file} exists`, exists(file));

const buildInfo = fs.statSync(path.join(DIST, 'index.html'));
const configInfo = fs.statSync(path.join(ROOT, 'site.config.json'));
check('dist is newer than site.config.json (run npm run build if this fails)', buildInfo.mtimeMs >= configInfo.mtimeMs);

const index = exists('index.html') ? read('index.html') : '';
const notFound = exists('404.html') ? read('404.html') : '';

section('Metadata and SEO');
check('index has lang attribute', /<html lang="[a-z-]+"/i.test(index));
check('exactly one h1 per page', (index.match(/<h1[\s>]/g) || []).length === 1 && (notFound.match(/<h1[\s>]/g) || []).length === 1);
check('description meta present', /<meta name="description" content="[^"]{20,}"/.test(index));
check('canonical matches site.origin', index.includes(`<link rel="canonical" href="${origin}/">`), origin);
check('robots meta allows indexing on the landing page', /<meta name="robots" content="index,follow">/.test(index));
check('404 page is noindex', /<meta name="robots" content="noindex/.test(notFound));
check('og:title, og:description, og:type present', /og:title/.test(index) && /og:description/.test(index) && /og:type/.test(index));
check('og:url matches canonical', index.includes(`<meta property="og:url" content="${origin}/">`));
check('og:image is absolute and exists in dist', index.includes(`content="${origin}/assets/og/og-image.png"`) && exists('assets/og/og-image.png'));
check('twitter card present', /<meta name="twitter:card" content="summary_large_image">/.test(index));
check('favicon and apple touch icon declared', index.includes('/assets/favicon.svg') && index.includes('/assets/icons/icon-180.png'));
check('manifest declared', index.includes('/site.webmanifest'));
check('structured data is valid JSON', (() => {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(index);
  if (!match) return false;
  try { JSON.parse(match[1]); return true; } catch { return false; }
})());
check('no unresolved template tokens', !/\{\{[A-Z0-9_]+\}\}/.test(index) && !/\{\{[A-Z0-9_]+\}\}/.test(notFound));

section('robots.txt and sitemap.xml');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
check('robots allows crawling and points at the sitemap', /Allow: \//.test(robots) && robots.includes(`Sitemap: ${origin}/sitemap.xml`));
check('sitemap lists the canonical URL exactly once', sitemap.split(`<loc>${origin}/</loc>`).length - 1 === 1);
check('sitemap does not list the 404 page', !sitemap.includes('404.html'));

section('Manifest');
const manifest = JSON.parse(read('site.webmanifest'));
check('manifest has name, start_url and theme_color', !!manifest.name && manifest.start_url === '/' && !!manifest.theme_color);
check('manifest icons exist on disk', (manifest.icons || []).every((icon) => exists(icon.src.replace(/^\//, ''))));
check('manifest declares a 192 and a 512 icon', (manifest.icons || []).some((i) => i.sizes === '192x192') && (manifest.icons || []).some((i) => i.sizes === '512x512'));

section('Icons are real PNGs with the declared size');
for (const [file, size] of [['assets/icons/icon-32.png', 32], ['assets/icons/icon-180.png', 180], ['assets/icons/icon-192.png', 192], ['assets/icons/icon-512.png', 512], ['assets/og/og-image.png', 1200]]) {
  const buffer = fs.readFileSync(path.join(DIST, file));
  const signatureOk = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const expectedHeight = file.includes('og-image') ? 630 : size;
  check(`${file} is a ${size}x${expectedHeight} PNG`, signatureOk && width === size && height === expectedHeight, `${width}x${height}`);
}

section('Links and navigation');
check('no dead href="#" placeholders', !/href="#"/.test(index) && !/href="#"/.test(notFound));
check('no javascript: URLs', !/href="javascript:/i.test(index));
check('no inline event handlers', !/\son[a-z]+\s*=/i.test(index.replace(/<script[\s\S]*?<\/script>/g, '')));

const anchorTargets = new Set([...index.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const anchorLinks = [...index.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
check('every in-page anchor has a matching element id', anchorLinks.every((id) => anchorTargets.has(id)), anchorLinks.filter((id) => !anchorTargets.has(id)).join(', '));
check('every aria-labelledby target exists', [...index.matchAll(/aria-labelledby="([^"]+)"/g)].every((m) => anchorTargets.has(m[1])));
check('every aria-controls target exists', [...index.matchAll(/aria-controls="([^"]+)"/g)].every((m) => anchorTargets.has(m[1])));

const internalLinks = [...new Set([...index.matchAll(/href="(\/[^"#]*|#[^"]*)"/g)].map((m) => m[1]))];
for (const link of internalLinks) {
  if (link.startsWith('#')) continue;
  const file = link === '/' ? 'index.html' : link.replace(/^\//, '');
  check(`internal link ${link} resolves to a built file`, exists(file));
}

// Matches the whole anchor element (including its content) so attributes and the
// screen-reader hint can both be inspected.
const externalLinks = [...index.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>[\s\S]*?<\/a>/g)];
check('every external link opens safely (target + rel)', externalLinks.length === 0 || externalLinks.every((m) => /target="_blank"/.test(m[0]) && /rel="noopener noreferrer"/.test(m[0])), `${externalLinks.length} external link(s)`);
check('external links announce the new tab', externalLinks.every((m) => /opens in a new tab/.test(m[0])), `${externalLinks.length} external link(s)`);
check('external link targets match the configuration', externalLinks.length === products.filter((p) => p.href).length, `${externalLinks.length} link(s) for ${products.filter((p) => p.href).length} configured product(s)`);

section('Product cards reflect the configuration');
for (const product of products) {
  const href = product.href;
  const cardId = `id="product-${product.id}-name"`;
  check(`${product.name}: card rendered with an aria-labelledby target`, index.includes(cardId) && index.includes(`aria-labelledby="product-${product.id}-name"`));
  check(`${product.name}: name, tagline and description appear`, index.includes(product.name) && index.includes(product.tagline) && index.includes(product.description));
  if (href) {
    check(`${product.name}: card links to ${href}`, index.includes(`href="${href}"`));
  } else {
    check(`${product.name}: unconfigured link is disabled, not a dead link`, index.includes('Link unavailable') && !index.includes(`class="btn btn--primary btn--block card-link" href="#"`));
    check(`${product.name}: card explains why the link is unavailable`, index.includes(product.urlNote));
  }
}
check('card icons are inline SVG (no extra requests)', !/<img /.test(index));
check('no product URL was invented for an unconfigured product', products.filter((p) => !p.href).length === 0 || !externalLinks.some((m) => /auth\.skcore\.in|sk-assistant/i.test(m[1])));

section('Accessibility');
check('skip link points at #main', /class="skip-link" href="#main"/.test(index) && index.includes('id="main"'));
check('header, main, footer and nav landmarks present', /<header\b/.test(index) && /<main\b/.test(index) && /<footer\b/.test(index) && /<nav\b/.test(index));
check('navigation has an accessible name', /<nav[^>]*aria-label="[^"]+"/.test(index));
check('menu button exposes aria-expanded', /data-nav-toggle aria-expanded="false"/.test(index));
check('theme button exposes aria-pressed and a label', /data-theme-toggle aria-pressed="false" aria-label="[^"]+"/.test(index));
check('decorative SVGs are hidden from assistive tech', [...index.matchAll(/<svg\b[^>]*>/g)].every((m) => /aria-hidden="true"/.test(m[0])));
check('headings are ordered without skips', (() => {
  const levels = [...index.matchAll(/<h([1-4])[\s>]/g)].map((m) => Number(m[1]));
  return levels.length > 0 && levels[0] === 1 && levels.every((level, i) => i === 0 || level <= levels[i - 1] + 1);
})());
check('disabled action is marked for assistive tech', !index.includes('Link unavailable') || index.includes('aria-disabled="true"'));

section('Contrast (WCAG AA)');
const css = read('assets/css/styles.css');
for (const [themeName, selector] of [['dark', ':root'], ['light', '[data-theme="light"]']]) {
  const tokens = themeTokens(css, selector);
  const needs = (name) => parseHex(tokens[name] || '') || parseRgba(tokens[name] || '');
  const bg = needs('bg');
  const panel = needs('panel');
  const soft = needs('bg-soft');
  const pairs = [
    ['body text on background', needs('text'), bg, 4.5],
    ['body text on panel', needs('text'), panel, 4.5],
    ['muted text on panel', needs('muted'), panel, 4.5],
    ['muted text on background', needs('muted'), bg, 4.5],
    ['small dim text on background', needs('dim'), bg, 4.5],
    ['link text on background', parseHex(tokens['brand-strong'] || '') || needs('brand-strong'), bg, 4.5],
    ['button label on brand', needs('brand-contrast'), needs('brand'), 4.5],
    ['available badge text on its chip', needs('ok'), over(needs('ok-soft'), panel), 4.5],
    ['pending badge text on its chip', needs('warn'), over(needs('warn-soft'), panel), 4.5],
    ['button label on brand-hover', needs('brand-contrast'), needs('brand-strong'), 4.5],
    ['muted text on soft background', needs('muted'), soft, 4.5],
  ];
  for (const [label, foreground, background, minimum] of pairs) {
    if (!foreground || !background) {
      check(`${themeName}: ${label}`, false, 'could not resolve colours');
      continue;
    }
    const ratio = contrast(foreground, background);
    check(`${themeName}: ${label} (${ratio.toFixed(2)}:1)`, ratio >= minimum, `needs ${minimum}:1`);
  }
}

section('Client script');
const script = read('assets/js/app.js');
check('script is small (< 8 KB)', Buffer.byteLength(script, 'utf8') < 8192, `${Buffer.byteLength(script, 'utf8')} bytes`);
check('script has no eval or new Function', !/\beval\s*\(|new Function/.test(script));
check('script does not write to the console', !/console\.(log|debug|info)\(/.test(script));
check('script does not use document.write', !/document\.write/.test(script));

/* ------------------------------------------------------------------ result */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('All checks passed.');
