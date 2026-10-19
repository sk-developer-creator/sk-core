# SK CORE — central product landing page

One page at **https://skcore.in** that lists the SK products and sends visitors to each
product's own website. SK CORE itself is only a directory: every product stays an
independent site with its own accounts, data and deployment.

**Status: built and verified locally. Not deployed.** Nothing has been pushed, no DNS
record has been touched, and no SK_AUTH file was modified.

---

## 1. What is in here

```
site.config.json          the only file you normally edit: brand, metadata, products
src/
  index.template.html     landing page template (placeholders, filled at build time)
  404.template.html       custom not-found page template
assets/
  css/styles.css          theme tokens + layout (dark default, light switch)
  js/app.js               theme switch + mobile menu (the only script; ~3 KB)
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
npm run check    # verify the built site (111 checks) — exits non-zero on any failure
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
  "href": "https://mail.skcore.in",
  "urlNote": "Only shown when href is null.",
  "icon": "icons/sk-mail.svg"
}
```

* **Add** — append an entry and drop the icon SVG in `assets/icons/`, then `npm run build`.
* **Edit** — change the fields; the card, metadata, sitemap and structured data follow.
* **Disable the link only** — set `"href": null`; the card renders a disabled
  "Link unavailable" action plus `urlNote`, and no link is emitted.
* **Disable the product** — set `"status": "coming-soon"`; the badge changes and the card
  is styled as unavailable.
* **Remove** — delete the entry (its card disappears).

Products sharing a `category` are grouped under one heading; with a single category the
grouping headings disappear automatically. Nothing in the markup is duplicated by hand.

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

Run `npm run check` to reproduce. Current result: **111 passed, 0 failed.**

* Build and check both exit 0; `dist/` is newer than `site.config.json`.
* Lighthouse (local preview, real browser): **accessibility 1.0, best practices 1.0, SEO 1.0**.
* Browser checks with the built files served over HTTP:
  * 6 network requests, all same-origin, all `200`; **zero external requests**; console clean.
  * Unknown path returns **HTTP 404** and renders the custom 404 page.
  * Theme switch verified: `data-theme`, `aria-pressed`, button label, `localStorage` and
    `theme-color` all update; light-theme contrast checked.
  * Mobile (390 px, via a sized frame): menu button appears, panel opens/closes, `aria-expanded`
    toggles, Escape closes and returns focus, **no horizontal overflow**.
  * Tab order starts at the skip link, which becomes visible on focus; visible focus ring on
    controls; exactly one `h1` per page; heading levels never skip.
  * Both product cards expose **no link** while `href` is null and show
    `aria-disabled="true"` on the action.
* Contrast: WCAG AA ratios are asserted for every themed text/background pair in both
  themes (three light-theme tokens were darkened because the first run failed this check).

Not verified, because it has not happened: **no deployment, no DNS change, no production
check on skcore.in.** The section below is a plan, not a report.

## 6. Deploying to skcore.in (needs your approval)

The artefact is a plain static directory: `dist/`. Any of these work.

**Option A — existing static host (Cloudflare Pages / Netlify / Vercel / GitHub Pages)**
1. Publish the repository; set the build command to `npm run build` and the output
   directory to `dist` (or upload `dist/` as-is — it is self-contained).
2. Add the custom domain `skcore.in` (and `www.skcore.in` if wanted) in the host's panel.
3. Point DNS at the host: an `A`/`ALIAS` record for the apex and a `CNAME` for `www`,
   using the exact values the host prints. **Do not create these records until you have
   approved them** — and check first whether `skcore.in` already serves something else.
4. Let the host issue the TLS certificate.
5. Configure the host's 404 handling to serve `dist/404.html` (some hosts need this set
   explicitly; others pick it up automatically).

**Option B — the Railway/Render project you already use for SK_AUTH**
Add a second static service in the same project, root `dist/`, and attach the domain in
that service's settings. Keep it a separate service so SK CORE deploys independently of
SK_AUTH.

**Option C — your own server (nginx)**
Copy `dist/` to `/var/www/skcore`, serve it with `root /var/www/skcore;`,
`try_files $uri $uri/ =404;` and `error_page 404 /404.html;`, then obtain a certificate
for `skcore.in` with your usual ACME client.

Nothing in this project forces a specific host: there is no server code, no database and
no build-time secret.

## 7. Open items that need your decision

1. **SK AUTH production URL** — not verifiable from the workspace. The SK_AUTH repository
   mentions `https://auth.skcore.in` in `README.md` and `.env.example`, but only on
   unmerged branches, phrased as "once the custom domain is attached". That is strong
   evidence, not confirmation, so the card currently ships with no link.
   *If it is live today, say so and I will set `href` — a one-line change.*
2. **SK ASSISTANT website URL** — no production URL exists anywhere in that project; its
   deployment doc still uses the placeholder `https://sk.example.com`. The card ships with
   no link until you provide the address.
3. **Whether `skcore.in` currently serves anything**, and which host option (A/B/C) you
   want, before any DNS record is created.
4. **Footer links** — kept to this page only ("Products", "About"). No privacy policy,
   terms, status page or social links were invented. Tell me the real ones if you want
   them in the footer.

## 8. Deliberate omissions

Per the brief, this project has **no** backend API, database, authentication, dashboard,
admin panel, email delivery, billing, support portal or documentation site. SK MAIL is
**not** part of the catalog. There are no testimonials, customer counts, prices, quotas,
uptime figures or "all systems operational" badges anywhere in the page, because none of
those facts were supplied. Product links stay disabled until a URL is confirmed.
