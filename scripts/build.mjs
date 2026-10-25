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
  strokeRoundedRect, fillCircle, strokeCircle, drawText, createCanvas,
  decodePng, drawImage,
} from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');

const PALETTE = {
  bgTop: [5, 4, 7],
  bgBottom: [25, 11, 43],
  panel: [12, 7, 21],
  line: [118, 37, 232],
  text: [248, 245, 255],
  muted: [170, 161, 185],
  brand: [168, 85, 255],
  brandLight: [209, 164, 255],
  dark: [5, 4, 7],
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

/** Reads the brand logo once; every raster asset is derived from this master. */
const BRAND_LOGO_SOURCE = path.join(ASSETS, 'icons/sk-core.png');
let brandLogo = null;
try {
  brandLogo = decodePng(fs.readFileSync(BRAND_LOGO_SOURCE));
} catch (error) {
  fail(`brand logo could not be read from assets/icons/sk-core.png (${error.message})`);
}

// The logo is generated at 2x the largest on-page size (56 px in the header).
const brandMark = '<img src="/assets/icons/sk-core.png" alt="" width="112" height="112">';
const navItemsHtml = (config.navigation || []).map((item) => {
  const external = item.external === true;
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const suffix = external ? '<span class="sr-only"> (opens in a new tab)</span>' : '';
  return `        <li><a class="nav-link" href="${escapeHtml(item.href)}"${attrs}>${escapeHtml(item.label)}${suffix}</a></li>`;
}).join('\n');
const navItems404Html = (config.navigation || []).map((item) => {
  const external = item.external === true;
  const href = !external && item.href.startsWith('#') ? `/${item.href}` : item.href;
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const suffix = external ? '<span class="sr-only"> (opens in a new tab)</span>' : '';
  return `        <li><a class="nav-link" href="${escapeHtml(href)}"${attrs}>${escapeHtml(item.label)}${suffix}</a></li>`;
}).join('\n');

function renderProductCard(product) {
  const href = typeof product.href === 'string' ? product.href.trim() : '';
  const configured = href !== '';
  const available = product.status === 'available';
  const icon = inlineIcon(product.icon || '', product.name);
  const badgeLabel = available ? 'Available' : 'Not available';
  const badgeClass = available ? 'badge--available' : 'badge--pending';

  const chips = (product.highlights || []).length
    ? `\n            <ul class="chips">\n${product.highlights.map((h) => `              <li class="chip">${escapeHtml(h)}</li>`).join('\n')}\n            </ul>`
    : '';

  const panelLink = configured
    ? `            <a class="product-card__panel-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(product.name)} website (opens in a new tab)"><span class="sr-only">Open ${escapeHtml(product.name)} website</span></a>`
    : '';
  const cta = configured
    ? `<span class="product-card__cta">Open ${escapeHtml(product.name)} <span aria-hidden="true">→</span></span>`
    : `<span class="product-card__cta product-card__cta--muted">Not available yet</span>`;
  return `          <article class="product-card reveal${configured ? ' product-card--linked' : ' product-card--unavailable'}" aria-labelledby="product-${escapeHtml(product.id)}-name">
            <span class="product-card__orbit" aria-hidden="true"></span>
            <div class="product-card__head">
              <span class="product-card__icon" aria-hidden="true">${icon}</span>
              <div class="product-card__titles">
                <h3 class="product-card__name" id="product-${escapeHtml(product.id)}-name">${escapeHtml(product.name)}</h3>
                <p class="product-card__cat">${escapeHtml(product.category || '')}</p>
              </div>
              <span class="product-card__badge badge ${badgeClass}">${badgeLabel}</span>
            </div>
            <p class="product-card__tagline">${escapeHtml(product.tagline || '')}</p>${chips}
            ${cta}
${panelLink}
          </article>`;
}

/** One panel holding every product card; the grid shows three across on desktop. */
function renderProductPanel() {
  const cards = products.map(renderProductCard).join('\n');
  return `      <div class="product-grid">
${cards}
      </div>`;
}

const footerColumnsHtml = (config.footer?.columns || []).map((column) => `      <div>
        <h2>${escapeHtml(column.heading)}</h2>
        <ul>
${(column.links || []).map((link) => {
  const href = String(link.href || '');
  const external = /^https:\/\//i.test(href);
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `          <li><a href="${escapeHtml(href)}"${attrs}>${escapeHtml(link.label)}</a></li>`;
}).join('\n')}
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

const profiles = Object.values(site.profiles || {}).filter((url) => /^https:\/\/[^\s]+$/.test(String(url)));

const organizationId = `${origin}/#organization`;
const websiteId = `${origin}/#website`;
const webpageId = `${origin}/#webpage`;

const jsonLdGraph = [
  {
    '@type': 'Organization',
    '@id': organizationId,
    name: brand,
    alternateName: site.domain || brand,
    url: `${origin}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${origin}/assets/icons/icon-512.png`,
      width: 512,
      height: 512,
    },
    image: `${origin}/assets/og/og-image.png`,
    description: site.description,
    ...(profiles.length ? { sameAs: profiles } : {}),
  },
  {
    '@type': 'WebSite',
    '@id': websiteId,
    name: brand,
    alternateName: site.domain || brand,
    url: `${origin}/`,
    description: site.description,
    inLanguage: site.locale || 'en',
    publisher: { '@id': organizationId },
  },
  {
    '@type': 'WebPage',
    '@id': webpageId,
    url: `${origin}/`,
    name: site.title || brand,
    description: site.description,
    inLanguage: site.locale || 'en',
    isPartOf: { '@id': websiteId },
    about: { '@id': organizationId },
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
  SUBTITLE: escapeHtml(site.subtitle || 'DIGITAL PRODUCT ECOSYSTEM'),
  TITLE: escapeHtml(site.title || brand),
  DESCRIPTION: escapeHtml(site.description || ''),
  CANONICAL: `${origin}/`,
  OG_LOCALE: (site.locale || 'en') === 'en' ? 'en_US' : (site.locale || 'en'),
  THEME_COLOR_DARK: site.themeColorDark || '#0b1220',
  THEME_COLOR_LIGHT: site.themeColorLight || '#f6f8fb',
  FAVICON_HREF: '/assets/favicon.svg',
  ICON_PNG_HREF: '/assets/icons/icon-32.png',
  ICON_96_PNG_HREF: '/assets/icons/icon-96.png',
  SHORTCUT_ICON_HREF: '/favicon.ico',
  APPLE_TOUCH_ICON_HREF: '/assets/icons/icon-180.png',
  MANIFEST_HREF: '/site.webmanifest',
  CSS_HREF: '/assets/css/styles.css',
  JS_HREF: '/assets/js/app.js',
  COSMOS_JS_HREF: '/assets/js/cosmos.js',
  HOME_HREF: homeHref,
  BRAND_MARK: brandMark,
  NAV_ITEMS: navItemsHtml,
  NAV_ITEMS_404: navItems404Html,
  HERO_EYEBROW: escapeHtml(hero.eyebrow || ''),
  HERO_HEADLINE: escapeHtml(hero.headline || site.tagline || ''),
  HERO_LINE_ONE: escapeHtml(String(hero.headline || site.tagline || '').split('\n')[0]),
  HERO_LINE_TWO: escapeHtml(String(hero.headline || site.tagline || '').split('\n')[1] || ''),
  HERO_SUBHEAD: escapeHtml(hero.subhead || ''),
  HERO_DESCRIPTION: escapeHtml(hero.description || ''),
  PRODUCT_COUNT: String(products.length),
  PAGE_WEIGHT_KB: '0',
  PRODUCT_PANEL: renderProductPanel(),
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

// Page weight shown on the home page: the real byte size of the shipped HTML,
// CSS and client script, rounded to the nearest kilobyte. HTML is measured
// after the first render, then the final page is rendered with the result.
const shippedPageFiles = [
  path.join(ASSETS, 'css', 'styles.css'),
  path.join(ASSETS, 'js', 'app.js'),
  path.join(ASSETS, 'js', 'cosmos.js'),
];
const shippedAssetBytes = shippedPageFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
const renderedHtmlBytes = Buffer.byteLength(render('index.template.html'), 'utf8');
tokens.PAGE_WEIGHT_KB = String(Math.round((shippedAssetBytes + renderedHtmlBytes) / 1024));

/* ----------------------------------------------------------------- images */

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
    image: (img, x, y, w, h, opacity = 1) => drawImage(canvas, img, x * factor, y * factor, w * factor, h * factor, opacity),
  };
}

function buildOgImage() {
  const width = 1200;
  const height = 630;
  const image = renderScaled(width, height, 2, (canvas) => {
    const ctx = makeContext(canvas, 2);
    ctx.gradient(0, 0, width, height, PALETTE.bgTop, PALETTE.bgBottom);

    // A quiet field of stars.
    const stars = [
      [94, 64, 2], [186, 38, 1], [304, 84, 1], [438, 48, 2], [522, 116, 1],
      [628, 36, 1], [702, 88, 2], [812, 54, 1], [932, 102, 1], [1082, 44, 2],
      [1136, 152, 1], [56, 202, 1], [382, 158, 1], [1148, 242, 1], [650, 178, 1],
      [884, 198, 1], [226, 260, 1], [1058, 322, 1], [470, 300, 1], [968, 376, 1]
    ];
    stars.forEach(([x, y, r]) => ctx.circle(x, y, r, [248, 245, 255, 0.55]));

    // Planetary horizon rising through the lower half of the card.
    ctx.circle(620, 1006, 572, [25, 11, 43, 0.92]);
    ctx.scircle(620, 1006, 572, 2, [240, 77, 255, 0.42]);
    ctx.circle(388, 520, 180, [168, 85, 255, 0.10]);

    // Restrained accent wash behind the logo.
    ctx.circle(1000, 300, 232, [168, 85, 255, 0.09]);

    if (brandLogo) ctx.image(brandLogo, 870, 170, 260, 260);

    ctx.text(hero.eyebrow || 'SK ECOSYSTEM', 80, 112, 4, [209, 164, 255, 0.95], 2);
    ctx.text(brand, 80, 158, 16, PALETTE.text, 2);
    ctx.rect(80, 306, 132, 5, PALETTE.brand);
    ctx.text(site.tagline || '', 80, 348, 3, PALETTE.muted, 2);

    const chips = products.filter((p) => p.status === 'available').map((p) => p.name);
    let x = 80;
    for (const chip of chips) {
      const label = chip.toUpperCase();
      const w = label.length * 5 * 3 + 40;
      ctx.rrect(x, 420, w, 46, 23, [168, 85, 255, 0.16]);
      ctx.hollowRrect(x, 420, w, 46, 23, 1.5, [209, 164, 255, 0.5]);
      ctx.text(label, x + 20, 432, 3, [209, 164, 255, 1], 1);
      x += w + 14;
    }

    ctx.text(site.domain || '', 80, 520, 3, [179, 169, 194, 1], 2);
  });
  return encodePng(width, height, image.data);
}

/** The source badge drawn edge to edge at an arbitrary square size. */
function renderLogoSquare(size) {
  const canvas = createCanvas(size, size);
  if (brandLogo) drawImage(canvas, brandLogo, 0, 0, size, size);
  return encodePng(size, size, canvas.data);
}

/** Header/footer logo: the source badge at 2x its largest on-page size. */
function buildBrandLogo(size = 112) {
  return renderLogoSquare(size);
}

/**
 * Root /favicon.ico: an ICO container with PNG frames. Search engines that
 * look up the implicit root favicon (and every legacy browser) get the badge
 * at a size they accept, instead of falling back to a generic globe.
 */
function buildFaviconIco(sizes = [16, 32, 48, 96]) {
  const frames = sizes.map((size) => ({ size, png: buildBrandLogo(size) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries = [];
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0); // width
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.png.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.png)]);
}

/** Self-contained favicon: the badge embedded as a data URI. */
function buildFavicon(size = 64) {
  const canvas = createCanvas(size, size);
  if (brandLogo) drawImage(canvas, brandLogo, 0, 0, size, size);
  const png = encodePng(size, size, canvas.data);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true" focusable="false"><image width="${size}" height="${size}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`;
}

function buildIcon(size) {
  return renderLogoSquare(size);
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

for (const asset of ['css/styles.css', 'js/app.js', 'js/cosmos.js', 'icons/sk-auth.svg', 'icons/sk-assistant.svg']) {
  written.push(copyAsset(asset));
}

written.push(writeFile('assets/icons/sk-core.png', buildBrandLogo()));
written.push(writeFile('assets/favicon.svg', buildFavicon()));
written.push(writeFile('favicon.ico', buildFaviconIco()));
written.push(writeFile('assets/icons/icon-32.png', buildIcon(32)));
written.push(writeFile('assets/icons/icon-96.png', buildIcon(96, { rounded: false })));
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
