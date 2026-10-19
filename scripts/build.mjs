/**
 * SK CORE static site builder.
 *
 * Reads site.config.json and renders the deployable site into dist/:
 * index.html, 404.html, robots.txt, sitemap.xml, site.webmanifest, the copied
 * assets, the PNG icons and the Open Graph card.
 *
 * No third-party packages: Node built-ins only (see scripts/lib/png.mjs for the
 * PNG writer). Run with: npm run build
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  encodePng, renderScaled, fillRect, fillGradient, fillRoundedRect,
  strokeRoundedRect, fillCircle, strokeCircle, drawText,
} from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');

const PALETTE = {
  bgTop: [11, 18, 32],
  bgBottom: [13, 24, 44],
  panel: [16, 27, 46],
  line: [45, 63, 92],
  text: [233, 239, 250],
  muted: [166, 182, 206],
  brand: [91, 140, 255],
  brandLight: [143, 178, 255],
  dark: [11, 18, 32],
};

/* ------------------------------------------------------------- utilities */

const problems = [];

function fail(message) {
  problems.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writeFile(relativePath, contents) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return path.relative(ROOT, target).replace(/\\/g, '/');
}

function copyAsset(relativePath) {
  const from = path.join(ASSETS, relativePath);
  const to = path.join(DIST, 'assets', relativePath);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return path.relative(ROOT, to).replace(/\\/g, '/');
}

/** Reads an icon SVG from assets/icons and returns its inner markup, inlined. */
function inlineIcon(relativePath, label) {
  const file = path.join(ASSETS, relativePath);
  if (!fs.existsSync(file)) {
    fail(`icon not found: assets/${relativePath} (product "${label}" references it)`);
    return '';
  }
  let markup = fs.readFileSync(file, 'utf8');
  markup = markup.replace(/<\?xml[^>]*\?>/, '').trim();
  // Drop the outer width/height so CSS controls the size.
  markup = markup.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '');
  return markup;
}

/* --------------------------------------------------------- config reading */

const config = readJson(path.join(ROOT, 'site.config.json'));
const site = config.site || {};
const products = Array.isArray(config.products) ? config.products : [];

const origin = String(site.origin || '').replace(/\/+$/, '');
const brand = String(site.brand || 'SK CORE');

if (!origin) fail('site.config.json: site.origin is required');
if (!products.length) fail('site.config.json: at least one product is required');

const configuredProducts = products.filter((p) => typeof p.href === 'string' && p.href.trim() !== '');

/* ------------------------------------------------------------ page pieces */

const brandMark = inlineIcon('icons/sk-core.svg', 'brand mark');
const navItemsHtml = (config.navigation || []).map((item) => {
  const external = item.external === true;
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const suffix = external ? '<span class="sr-only"> (opens in a new tab)</span>' : '';
  return `        <li><a class="nav-link" href="${escapeHtml(item.href)}"${attrs}>${escapeHtml(item.label)}${suffix}</a></li>`;
}).join('\n');

const orbitRowsHtml = products.map((product) => {
  const target = typeof product.href === 'string' && product.href
    ? new URL(product.href).hostname
    : 'website link pending';
  const cls = typeof product.href === 'string' && product.href ? 'orbit__node' : 'orbit__node orbit__node--muted';
  return `          <div class="orbit__row">
            <span class="orbit__node">${escapeHtml(product.name)}</span>
            <span class="orbit__arrow" aria-hidden="true">&rarr;</span>
            <span class="${cls}">${escapeHtml(target)}</span>
          </div>`;
}).join('\n');

function renderProductCard(product) {
  const href = typeof product.href === 'string' ? product.href.trim() : '';
  const configured = href !== '';
  const available = product.status === 'available';
  const icon = inlineIcon(product.icon || '', product.name);
  const badgeLabel = available ? 'Available' : 'Coming soon';
  const badgeClass = available ? 'badge--available' : 'badge--pending';

  const chips = (product.highlights || []).length
    ? `\n        <ul class="chips">\n${product.highlights.map((h) => `          <li class="chip">${escapeHtml(h)}</li>`).join('\n')}\n        </ul>`
    : '';

  const action = configured
    ? `          <a class="btn btn--primary btn--block card-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open website<span class="sr-only"> — ${escapeHtml(product.name)} (opens in a new tab)</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>`
    : `          <span class="btn btn--disabled btn--block" aria-disabled="true">Link unavailable</span>
          <p class="product-card__note">${escapeHtml(product.urlNote || 'Destination not configured yet.')}</p>`;

  return `      <article class="product-card${configured ? '' : ' product-card--unavailable'}" aria-labelledby="product-${escapeHtml(product.id)}-name">
        <div class="product-card__head">
          <span class="product-card__icon" aria-hidden="true">${icon}</span>
          <div class="product-card__titles">
            <h3 class="product-card__name" id="product-${escapeHtml(product.id)}-name">${escapeHtml(product.name)}</h3>
            <p class="product-card__cat">${escapeHtml(product.category || '')}</p>
          </div>
          <span class="product-card__badge badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <p class="product-card__tagline">${escapeHtml(product.tagline || '')}</p>
        <p class="product-card__desc">${escapeHtml(product.description || '')}</p>${chips}
        <div class="product-card__foot">
${action}
        </div>
      </article>`;
}

function renderProductGroups() {
  const groups = [];
  for (const product of products) {
    const key = product.category || 'Products';
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, items: [] };
      groups.push(group);
    }
    group.items.push(product);
  }

  const showHeadings = groups.length > 1;

  return groups.map((group, index) => {
    const cards = group.items.map(renderProductCard).join('\n');
    if (!showHeadings) {
      return `      <div class="product-grid">\n${cards}\n      </div>`;
    }
    const slug = `group-${index + 1}`;
    return `      <section class="product-group" aria-labelledby="${slug}">
        <h3 class="product-group__heading" id="${slug}">${escapeHtml(group.key)}</h3>
        <div class="product-grid">
${cards}
        </div>
      </section>`;
  }).join('\n');
}

const footerColumnsHtml = (config.footer?.columns || []).map((column) => `      <div>
        <h2>${escapeHtml(column.heading)}</h2>
        <ul>
${(column.links || []).map((link) => `          <li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join('\n')}
        </ul>
      </div>`).join('\n');

const aboutPointsHtml = (config.about?.points || [])
  .map((point) => `        <li>${escapeHtml(point)}</li>`)
  .join('\n');

const year = new Date().getFullYear();
const startYear = Number(site.copyrightStartYear) || year;
const copyright = `\u00a9 ${startYear === year ? year : `${startYear}\u2013${year}`} ${brand}. All rights reserved.`;

const hero = config.hero || {};
const navigation = config.navigation || [];
const homeHref = '/';

const jsonLdGraph = [
  {
    '@type': 'WebSite',
    name: brand,
    url: `${origin}/`,
    description: site.description,
    inLanguage: site.locale || 'en',
  },
];
if (configuredProducts.length) {
  jsonLdGraph.push({
    '@type': 'ItemList',
    name: `${brand} product catalog`,
    numberOfItems: configuredProducts.length,
    itemListElement: configuredProducts.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.name,
      url: product.href,
    })),
  });
}

const tokens = {
  LANG: site.locale || 'en',
  BRAND: escapeHtml(brand),
  TITLE: escapeHtml(site.title || brand),
  DESCRIPTION: escapeHtml(site.description || ''),
  CANONICAL: `${origin}/`,
  OG_LOCALE: (site.locale || 'en') === 'en' ? 'en_US' : (site.locale || 'en'),
  THEME_COLOR_DARK: site.themeColorDark || '#0b1220',
  THEME_COLOR_LIGHT: site.themeColorLight || '#f6f8fb',
  FAVICON_HREF: '/assets/favicon.svg',
  ICON_PNG_HREF: '/assets/icons/icon-32.png',
  APPLE_TOUCH_ICON_HREF: '/assets/icons/icon-180.png',
  MANIFEST_HREF: '/site.webmanifest',
  CSS_HREF: '/assets/css/styles.css',
  JS_HREF: '/assets/js/app.js',
  HOME_HREF: homeHref,
  BRAND_MARK: brandMark,
  BRAND_MARK_SMALL: `<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:-4px"><g fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="16" cy="16" r="3.2" fill="currentColor" stroke="none"/><path d="M16 12.8V7M16 19.2V25M12.8 16H7M19.2 16h6" stroke-width="1.7"/></g></svg>`,
  NAV_ITEMS: navItemsHtml,
  HERO_EYEBROW: escapeHtml(hero.eyebrow || ''),
  HERO_HEADLINE: escapeHtml(hero.headline || site.tagline || ''),
  HERO_SUBHEAD: escapeHtml(hero.subhead || ''),
  HERO_PRIMARY_LABEL: escapeHtml(hero.primaryCta?.label || 'Products'),
  HERO_PRIMARY_HREF: escapeHtml(hero.primaryCta?.href || '#products'),
  HERO_SECONDARY_LABEL: escapeHtml(hero.secondaryCta?.label || 'About'),
  HERO_SECONDARY_HREF: escapeHtml(hero.secondaryCta?.href || '#about'),
  HERO_HINT: escapeHtml(hero.hint || 'Browse the catalog below. Each product opens on its own independent website.'),
  ORBIT_ROWS: orbitRowsHtml,
  PRODUCTS_INTRO: escapeHtml(`Every SK product that is published, in one list. Products with a confirmed website are linked directly; anything still waiting for its address says so instead of sending you to a dead page.`),
  PRODUCT_GROUPS: renderProductGroups(),
  ABOUT_HEADING: escapeHtml(config.about?.heading || 'About'),
  ABOUT_BODY: escapeHtml(config.about?.body || ''),
  ABOUT_POINTS: aboutPointsHtml,
  FOOTER_NOTE: escapeHtml(config.footer?.note || ''),
  FOOTER_COLUMNS: footerColumnsHtml,
  COPYRIGHT: copyright,
  DOMAIN: escapeHtml(site.domain || ''),
  JSONLD: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': jsonLdGraph }, null, 2)}</script>`,
  OG_IMAGE_URL: `${origin}/assets/og/og-image.png`,
  OG_IMAGE_ALT: `${brand} — ${site.tagline || 'SK product catalog'}`,
};

function render(templateFile) {
  let html = fs.readFileSync(path.join(SRC, templateFile), 'utf8');
  html = html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in tokens)) {
      fail(`template ${templateFile} uses {{${key}}} but no value is provided`);
      return match;
    }
    return tokens[key];
  });
  return html;
}

/* ----------------------------------------------------------------- images */

/** Draws the SK CORE mark: rounded frame, spokes, hub and four nodes. */
function drawMark(ctx, cx, cy, size, { line, accent }) {
  const half = size / 2;
  const scale = size / 32;

  // Frame: outline only (never a filled block).
  ctx.hollowRrect(cx - half, cy - half, size, size, 7.5 * scale, 1.7 * scale, [line[0], line[1], line[2], 0.5]);

  const spoke = 1.7 * scale;
  const inner = 3.4 * scale;
  const outer = 9.4 * scale;
  for (const [dx, dy, w, h] of [
    [0, -1, spoke, outer - inner],
    [0, 1, spoke, outer - inner],
    [-1, 0, outer - inner, spoke],
    [1, 0, outer - inner, spoke],
  ]) {
    const x = dx === 0 ? cx - w / 2 : cx + (dx > 0 ? inner : -outer);
    const y = dy === 0 ? cy - h / 2 : cy + (dy > 0 ? inner : -outer);
    ctx.rect(x, y, w, h, [line[0], line[1], line[2], 0.7]);
  }

  ctx.scircle(cx, cy, 6.4 * scale, 1.4 * scale, [line[0], line[1], line[2], 0.35]);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const nx = cx + dx * 10.6 * scale;
    const ny = cy + dy * 10.6 * scale;
    ctx.circle(nx, ny, 2.05 * scale, line);
  }
  ctx.circle(cx, cy, 3.2 * scale, accent);
}

function makeContext(canvas, factor) {
  return {
    rect: (x, y, w, h, color) => fillRect(canvas, x * factor, y * factor, w * factor, h * factor, color),
    rrect: (x, y, w, h, r, color) => fillRoundedRect(canvas, x * factor, y * factor, w * factor, h * factor, r * factor, color),
    hollowRrect: (x, y, w, h, r, t, color) => strokeRoundedRect(canvas, x * factor, y * factor, w * factor, h * factor, r * factor, t * factor, color),
    circle: (cx, cy, r, color) => fillCircle(canvas, cx * factor, cy * factor, r * factor, color),
    scircle: (cx, cy, r, t, color) => strokeCircle(canvas, cx * factor, cy * factor, r * factor, t * factor, color),
    gradient: (x, y, w, h, top, bottom) => fillGradient(canvas, x * factor, y * factor, w * factor, h * factor, top, bottom),
    text: (text, x, y, scale, color, tracking = 1) => drawText(canvas, text, x * factor, y * factor, scale * factor, color, tracking),
    textWidth: (text, scale, tracking = 1) => (text.length * 5 * scale + (text.length - 1) * tracking * scale),
  };
}

function buildOgImage() {
  const width = 1200;
  const height = 630;
  const image = renderScaled(width, height, 2, (canvas) => {
    const ctx = makeContext(canvas, 2);
    ctx.gradient(0, 0, width, height, PALETTE.bgTop, PALETTE.bgBottom);

    // Restrained accent wash behind the mark.
    ctx.circle(1000, 300, 232, [91, 140, 255, 0.07]);

    drawMark(ctx, 1000, 300, 250, { line: PALETTE.brandLight, accent: PALETTE.brandLight });

    ctx.text(hero.eyebrow || 'SK ECOSYSTEM', 80, 112, 4, [166, 182, 206, 1], 2);
    ctx.text(brand, 80, 158, 16, PALETTE.text, 2);
    ctx.rect(80, 306, 132, 5, PALETTE.brand);
    ctx.text(site.tagline || '', 80, 348, 3, [166, 182, 206, 1], 2);

    const chips = products.filter((p) => p.status === 'available').map((p) => p.name);
    let x = 80;
    for (const chip of chips) {
      const label = chip.toUpperCase();
      const w = label.length * 5 * 3 + 40;
      ctx.rrect(x, 420, w, 46, 23, [91, 140, 255, 0.14]);
      ctx.hollowRrect(x, 420, w, 46, 23, 1.5, [91, 140, 255, 0.5]);
      ctx.text(label, x + 20, 432, 3, [143, 178, 255, 1], 1);
      x += w + 14;
    }

    ctx.text(site.domain || '', 80, 520, 3, [127, 144, 169, 1], 2);
  });
  return encodePng(width, height, image.data);
}

function buildIcon(size, options = {}) {
  const { rounded = true } = options;
  const factor = Math.max(2, Math.round(1024 / size));
  const image = renderScaled(size, size, factor, (canvas) => {
    const ctx = makeContext(canvas, factor);
    if (rounded) {
      ctx.rrect(0, 0, size, size, size * 0.22, PALETTE.dark);
    } else {
      ctx.rect(0, 0, size, size, PALETTE.dark);
    }
    const inset = size * (rounded ? 0.17 : 0.15);
    drawMark(ctx, size / 2, size / 2, size - inset * 2, { line: PALETTE.brandLight, accent: PALETTE.brandLight });
  });
  return encodePng(size, size, image.data);
}

/* ------------------------------------------------------------------ build */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const written = [];

written.push(writeFile('index.html', render('index.template.html')));
written.push(writeFile('404.html', render('404.template.html')));

written.push(writeFile('robots.txt', [
  '# SK CORE',
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${origin}/sitemap.xml`,
  '',
].join('\n')));

written.push(writeFile('sitemap.xml', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url>',
  `    <loc>${origin}/</loc>`,
  '    <changefreq>weekly</changefreq>',
  '    <priority>1.0</priority>',
  '  </url>',
  '</urlset>',
  '',
].join('\n')));

written.push(writeFile('site.webmanifest', `${JSON.stringify({
  name: brand,
  short_name: brand,
  description: site.description,
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: site.themeColorDark || '#0b1220',
  theme_color: site.themeColorDark || '#0b1220',
  icons: [
    { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}, null, 2)}\n`));

for (const asset of ['css/styles.css', 'js/app.js', 'favicon.svg', 'icons/sk-core.svg', 'icons/sk-auth.svg', 'icons/sk-assistant.svg']) {
  written.push(copyAsset(asset));
}

written.push(writeFile('assets/icons/icon-32.png', buildIcon(32)));
written.push(writeFile('assets/icons/icon-180.png', buildIcon(180, { rounded: false })));
written.push(writeFile('assets/icons/icon-192.png', buildIcon(192, { rounded: false })));
written.push(writeFile('assets/icons/icon-512.png', buildIcon(512, { rounded: false })));
written.push(writeFile('assets/og/og-image.png', buildOgImage()));

/* ----------------------------------------------------------------- report */

console.log('SK CORE build');
console.log(`  brand        : ${brand}`);
console.log(`  origin       : ${origin}`);
console.log(`  products     : ${products.length} (${configuredProducts.length} with a confirmed website URL, ${products.length - configuredProducts.length} pending)`);
for (const product of products) {
  const state = typeof product.href === 'string' && product.href ? `link -> ${product.href}` : 'link pending (no URL configured)';
  console.log(`    - ${product.name.padEnd(14)} ${state}`);
}
console.log(`  files written: ${written.length}`);
for (const file of written) console.log(`    ${file}`);

if (problems.length) {
  console.error('\nBuild FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('\nBuild complete.');
