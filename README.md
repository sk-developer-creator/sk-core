# SK CORE — central product landing page

One page at **https://skcore.in** that lists the SK products and sends visitors to each
product's own website. SK CORE itself is only a directory: every product stays an
independent site with its own accounts, data and deployment.

**Status: live at https://skcore.in**, served by GitHub Pages from the `sk-developer-creator/sk-core`
repository. SK_AUTH source, database, Railway service and DNS record are untouched.
See `DEPLOYMENT.md` for what was executed and how it was verified.

---

## 1. What is in here

```
site.config.json          the only file you normally edit: brand, metadata, products
src/
  index.template.html     landing page template (placeholders, filled at build time)
  404.template.html       custom not-found page template
assets/
  css/styles.css          theme tokens + layout (dark default, light switch)
  js/app.js               navigation, reveals and card interactions
  js/cosmos.js            3D particle field and travelling light (canvas)
  favicon.svg             SVG favicon
  icons/*.svg             brand mark, SK AUTH icon, SK ASSISTANT icon (inlined at build)
scripts/
  build.mjs               renders dist/ from site.config.json and the templates
  check.mjs               verification: config, SEO, links, a11y, contrast, icons
  serve.mjs               local preview server (dist/ over HTTP, real 404 handling)
  lib/png.mjs             tiny PNG writer (Node's zlib only — no packages)
dist/                     generated output — this is what you deploy
```

No dependencies: `package.json` has empty `dependencies`/`devDependencies`. The build
uses Node built-ins only. The page requests no external fonts, scripts or images.

## 2. Commands

```bash
npm run build    # regenerate dist/ from site.config.json (also builds the PNG icons)
npm run check    # verify the built site (129 checks) — exits non-zero on any failure
npm run serve    # preview at http://127.0.0.1:4173 (PORT=8080 npm run serve to change)
npm test         # build, then check
```

## 3. Adding or changing a product

Everything the page shows comes from `site.config.json`. Add an object to `products`:

```json
{
  "id": "sk-mail",
  "name": "SK MAIL",
  "category": "Email infrastructure",
  "tagline": "One-line purpose shown on the card.",
  "description": "One or two factual sentences. Do not invent capabilities.",
  "highlights": ["Short", "Feature", "Chips"],
  "status": "available",
  "href": "https://example-subdomain.skcore.in",
  "verifiedNote": "How and when this exact URL was checked (required once href is set).",
  "fallbackHref": "https://optional-temporary-fallback-host",
  "fallbackNote": "Required if fallbackHref is used. Recorded for outages; not published on the page.",
  "urlNote": "Only read when href is null: explains why there is no link yet.",
  "icon": "icons/sk-example.svg"
}
```

* **Add** — append an entry and drop the icon SVG in `assets/icons/`, then `npm run build`.
* **Edit** — change the fields; the card, metadata, sitemap and structured data follow.
* **Disable the link only** — set `"href": null`; the card renders a disabled
  "Link unavailable" action plus `urlNote`, and no link is emitted.
* **Disable the product** — set `"status": "coming-soon"`; the badge changes and the card
  is styled as unavailable.
* **Remove** — delete the entry (its card disappears).

Two extra fields exist for traceability:

* `verifiedNote` — **required whenever `href` is set.** One sentence saying how and when the
  URL was actually checked (the check fails without it). This is what keeps an unverified
  guess from silently becoming a published link.
* `fallbackHref` + `fallbackNote` — an optional temporary address for the same service,
  used when the primary domain is not attached or is having an outage. It is *documented*
  (and validated) but deliberately **not rendered on the page**: the check fails if a
  fallback URL ever appears in the built HTML, because the page must only send visitors to
  the primary product URL.

Every product is listed in one catalog panel. The grid is responsive: up to three cards
per row on desktop, two on tablets and one on phones. Nothing in the markup is duplicated
by hand.

**Never put an unverified URL in `href`.** The brief for this project is explicit about
this, and `npm run check` rejects placeholder-looking URLs (`example.com`, `localhost`,
`TODO`, trailing slashes, non-HTTPS). If you do not know the address yet, leave
`href: null` — the card says so instead of sending a visitor to a dead page.

## 4. Build-time output

`npm run build` writes:

| File | Notes |
| --- | --- |
| `dist/index.html` | landing page; product cards are real HTML (works with JS disabled) |
| `dist/404.html` | custom not-found page (noindex) |
| `dist/robots.txt` | `Allow: /` + sitemap location |
| `dist/sitemap.xml` | the canonical URL only (the 404 page is excluded on purpose) |
| `dist/site.webmanifest` | name, theme colour, 192 and 512 icons |
| `dist/assets/**` | CSS, JS, SVG icons, PNG icons, Open Graph image |
| `dist/assets/og/og-image.png` | 1200×630 Open Graph card, drawn by `scripts/lib/png.mjs` |

The PNG icons (32, 180, 192, 512) and the Open Graph card are generated — there is no
binary design source to keep in sync. To restyle them, edit `buildOgImage()` /
`buildIcon()` in `scripts/build.mjs` and rebuild.

## 5. Verification performed (local, this build)

Run `npm run check` to reproduce. Current result: **123 passed, 0 failed.**

* Build and check both exit 0; `dist/` is newer than `site.config.json`.
* Lighthouse (local preview, real browser): **accessibility 1.0, best practices 1.0, SEO 1.0** (0 failures).
* Product links, checked against the live sites (read-only requests):
  * SK AUTH card renders `<a href="https://auth.skcore.in" target="_blank" rel="noopener noreferrer">`
    and the whole card is clickable (stretched link).
  * Pressing <kbd>Enter</kbd> on the focused card link opened a new tab at
    `https://auth.skcore.in/`, which loaded with `HTTP 200` and title/`h1` **"SK AUTH"**.
  * SK AUTH card holds the only outbound link on the page; the Railway fallback address
    appears in **no** built file.
  * SK ASSISTANT card contains **zero** links, shows a disabled `aria-disabled="true"` action
    and the note explaining that its address is not confirmed.
  * Structured data lists exactly one product URL (`https://auth.skcore.in`).
* Browser checks with the built files served over HTTP:
  * 6 network requests, all same-origin, all `200`; **zero external requests**; the landing
    page's console is clean.
  * Unknown path returns **HTTP 404** and renders the custom 404 page.
  * Theme switch verified: `data-theme`, `aria-pressed`, button label, `localStorage` and
    `theme-color` all update; light-theme contrast checked.
  * Mobile (390 px), tablet (800 px) and desktop (1440 px): **no horizontal overflow**;
    menu button appears only on small screens, opens/closes, `aria-expanded` toggles,
    Escape closes and returns focus.
  * Real <kbd>Tab</kbd> walk: every focus stop shows a 2 px visible outline; the skip link
    becomes visible on focus; the focused product link also highlights its card border
    (`:focus-within`). Exactly one `h1` per page; heading levels never skip.
* Contrast: WCAG AA ratios are asserted for every themed text/background pair in both
  themes (three light-theme tokens were darkened because the first run failed this check).

Deployed and verified on 2026-10-19: **https://skcore.in** returns HTTP 200 with content
byte-identical to this build, over a valid Let's Encrypt certificate, with the checks in §7's
`DEPLOYMENT.md` (§0, Phase 3) — Lighthouse accessibility/best-practices/SEO all 1.0 on the live
site, clean console, one outbound link. The sections below remain the reconnaissance record.

## 6. Hosting and DNS findings (read-only reconnaissance, 2026-10-19)

Checked with the local resolver and two public DNS-over-HTTPS resolvers (Cloudflare,
Google), plus HTTP and TLS probes. No changes were made.

| Name | State |
| --- | --- |
| `skcore.in` (apex) | **Deployed 2026-10-19**: four `A` records pointing at GitHub Pages (`185.199.108–111.153`), serving this page over HTTPS. No `AAAA`, `MX`, `TXT` or `CAA`. Before that date the apex published no address record at all, so nothing was replaced. |
| `www.skcore.in` | `CNAME → sk-developer-creator.github.io`; redirects to `https://skcore.in/`. |
| `auth.skcore.in` | `CNAME → p9ji6rcj.up.railway.app`, `A 69.46.46.82`; live, serving the SK AUTH panel over HTTPS (`HTTP 200`, title "SK AUTH"). |
| `*.skcore.in` wildcard | None (a random subdomain returns `NXDOMAIN`). |
| `mail.skcore.in` | No records (consistent with no mail product). |

* **Authoritative DNS / registrar: DomainIndia** — `NS a.ns.domainindia.net`, `b.ns.domainindia.net`,
  `SOA ... hostmaster.domainindia.net` (zone serial `2026101807`, i.e. last touched 2026-10-18,
  the same day the `auth` certificate was issued). Any new record for SK CORE has to be added
  in that panel, or the zone delegated to another DNS provider first.
* **Hosting for SK AUTH: Railway** (`server: railway-hikari`, `x-railway-edge: sin1` =
  Singapore), matching the repository's `railway.json`. The temporary fallback hostname and
  the custom domain answer from the same service: identical page size (14 962 bytes) and an
  identical `/api/health` payload, so `auth.skcore.in` is definitely that deployment.
* **TLS**: `auth.skcore.in` presents a valid Let's Encrypt certificate
  (SAN `auth.skcore.in`, valid 2026-10-18 → 2027-01-16, verified `authorized: true`).
  No `CAA` record exists on the domain, so nothing blocks a future certificate — including
  one for the apex.
* **Separate finding, on SK AUTH itself (not SK CORE):** loading `https://auth.skcore.in/`
  logged `[GSI_LOGGER]: The given origin is not allowed for the given client ID`, plus a
  `404` for `/api/branding/logo`. The Google OAuth client that SK AUTH uses does not list
  `https://auth.skcore.in` as an allowed JavaScript origin, so "Continue with Google" will
  not work on the custom domain until that origin is added in the Google Cloud console.
  The `401` on `/api/auth/me` is normal for a signed-out visitor. **I changed nothing in
  SK AUTH** — this is a report only.

## 7. How SK CORE is deployed (done)

The artefact is a plain static directory: `dist/` (17 files, ~73 KB of HTML/CSS/JS plus
icons and the social preview image). No server code, no database, no build-time secret.

**Deployed 2026-10-19 on GitHub Pages**, from the public repository
`https://github.com/sk-developer-creator/sk-core`, with `.github/workflows/deploy-pages.yml`
building `dist/`, running `npm run check`, and publishing it. **`DEPLOYMENT.md` holds the full
record**: the host evaluation, the exact commands, the DNS records that were added, the TLS
result, the rollback procedure, and the live verification evidence.

**Option A — a static host (Cloudflare Pages / Netlify / Vercel / GitHub Pages)**
1. Point the host at this repository; build command `npm run build`, output directory `dist`
   (or upload `dist/` as-is — it is self-contained and committed).
2. Add `skcore.in` as a custom domain in the host's panel (add `www.skcore.in` too if you want
   it; note it does not exist yet).
3. Create the DNS records the host prints, in the **DomainIndia** panel:
   apex `A`/`ALIAS`/`ANAME` → host value, and `CNAME www` → host value.
   *(Cloudflare/Netlify/Vercel cannot be managed from here; the values must come from the
   host's own screen.)*
4. Let the host issue the TLS certificate, then confirm `https://skcore.in/` returns the page.
5. Serve `dist/404.html` for unknown paths (some hosts need this set explicitly).

**Option B — a second service in the Railway project that runs SK AUTH**
1. Create a **new static service** in the same project (do not reuse the SK AUTH service).
2. Deploy `dist/` (root `dist`), then attach the custom domain `skcore.in` in that service's
   settings and create the `CNAME`/`A` records Railway prints at DomainIndia.
   This keeps SK CORE independently deployable while reusing infrastructure you already run.

**Option C — your own server (nginx)**
Copy `dist/` to `/var/www/skcore`, serve it with `root /var/www/skcore;`,
`try_files $uri $uri/ =404;`, `error_page 404 /404.html;`, add an apex `A` record for the
server's public IP at DomainIndia, then issue a certificate with your usual ACME client.

**Park the apex until then.** Because `skcore.in` currently publishes no address record, its
absence of a website is expected — leave it that way rather than pointing it somewhere
temporarily.

## 8. Open items that need your decision

1. **SK AUTH URL — done.** `href` is now `https://auth.skcore.in`, verified live
   (§6). The temporary Railway address `sk-auth-production-cda9.up.railway.app` is recorded in
   `site.config.json` as `fallbackHref` and is **not** published on the page. Say the word if
   you would rather show it publicly as a "if the main site is unreachable, try this" link.
2. **SK ASSISTANT website URL** — still unconfigured, deliberately. No production URL exists
   in that project (its deployment doc still uses `https://sk.example.com`), and DNS shows no
   `assistant.skcore.in`. Give me the real address and it becomes a one-line change plus
   `verifiedNote`.
3. **Host choice and DNS — done.** GitHub Pages (public repo, standard apex `A` records, no
   DNS-provider change); records added at DomainIndia and verified live. See `DEPLOYMENT.md` §0.
4. **Footer links** — kept to this page only ("Products", "About"). No privacy policy, terms,
   status page or social links were invented.
5. **Google Sign-In origin on SK AUTH** — see the note at the end of §6; it needs a change in
   your Google Cloud console (not in any repo).

## 9. Deliberate omissions

Per the brief, this project has **no** backend API, database, authentication, dashboard,
admin panel, email delivery, billing, support portal or documentation site. SK MAIL is
**not** part of the catalog. There are no testimonials, customer counts, prices, quotas,
uptime figures or "all systems operational" badges anywhere in the page, because none of
those facts were supplied. A product link is only published once its URL has been verified,
and it must carry a `verifiedNote` saying how.
