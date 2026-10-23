# SK CORE — production deployment plan

**Target:** publish the existing `dist/` build at **https://skcore.in**, with the SK AUTH card
linking to **https://auth.skcore.in**. SK CORE and SK AUTH stay independent deployments.

**Status: LIVE at https://skcore.in.** All three phases are complete and verified against the
live domain. No SK_AUTH file, service, branch, or DNS record was modified.

Date of inspection: 2026-10-19.

## 0. Result (executed with approval)

Everything below was approved before it ran. Evidence, not claims:

| Step | Result |
| --- | --- |
| Repository | `https://github.com/sk-developer-creator/sk-core` created — **public**, so Pages works on the free plan |
| Push | `master -> master`, no force. Remote `master` = `ac7b4d9`; local `.git/config` contains **no token** (checked) |
| Pages | enabled with `build_type: workflow` |
| CI run #1 | **completed / success** — `actions/runs/39195385098`. The workflow ran `npm run build`, `npm run check` (123/0) and `git diff --exit-code -- dist` in CI |
| Interim URL | `https://sk-developer-creator.github.io/sk-core/` → **HTTP 200**, title "SK CORE — One place for every SK product" |
| Content match | served `index.html` sha256 `3bbea5a6…aaf9fc` **=** the local `dist/index.html` — identical bytes |
| SK AUTH link | present; Railway fallback absent; SK MAIL absent; SK ASSISTANT still has no link |
| Custom 404 | unknown path → **HTTP 404** rendering our own 404 page |
| `robots.txt` / `sitemap.xml` / `site.webmanifest` | all HTTP 200 |

One expected caveat of the interim URL: the page uses **root-relative** paths (`/assets/…`, as
required), so at the interim `/sk-core/` sub-path those asset URLs 404 and the page renders
unstyled. That is a property of the sub-path, not of the build — at the apex domain the site is
served from `/` and every asset resolves. Verified separately: `/assets/css/styles.css` returns
200 once resolved from the domain root.

### Phase 2 — DNS (applied by you at DomainIndia, approved)

| Record | Applied value | Verified |
| --- | --- | --- |
| `A` `@` × 4 | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` | returned by both authoritative nameservers and by two independent public resolvers |
| `CNAME` `www` | `sk-developer-creator.github.io` | present |
| `AAAA`, `TXT` challenge | not added (you chose the required records only) | — |

The zone serial moved from `2026101807` (before) to `2026101905` (after) — that is how we know the
edit was really published rather than merely cached locally. `auth.skcore.in` was untouched
throughout and answered 200 the whole time.

### Phase 3 — production verification (live, 2026-10-19)

| Check | Result |
| --- | --- |
| `https://skcore.in/` | **HTTP 200**, 14 781 bytes |
| Content identity | served `index.html` sha256 `3bbea5a6…aaf9fc` **=** the verified local `dist/index.html` — byte-identical |
| `http://skcore.in/` | **301 →** `https://skcore.in/` |
| `https://www.skcore.in/` | **301 →** `https://skcore.in/` |
| TLS | authorised, TLSv1.3, Let's Encrypt (`YR2`), CN `skcore.in`, SAN `skcore.in` + `www.skcore.in`, valid 2026-10-19 → 2027-01-17 |
| HTTPS enforcement | enabled in Pages (`https_enforced: true`) |
| Assets | `styles.css`, `app.js`, `cosmos.js`, `favicon.svg`, icons 32/180/512, `og-image.png`, `site.webmanifest` — all HTTP 200 |
| `robots.txt` / `sitemap.xml` | HTTP 200, both cite `https://skcore.in` |
| Unknown path | **HTTP 404** rendering the custom page ("Page not found — SK CORE") |
| Console (real browser) | empty — no messages or errors, including after theme switching |
| Network | 3 requests, all same-origin `https://skcore.in`, none failed, **zero external requests** |
| Outbound links | exactly one: `https://auth.skcore.in` with `target="_blank"` and `rel="noopener noreferrer"` |
| SK AUTH click-through | <kbd>Enter</kbd> on the focused card link opened `https://auth.skcore.in/` — title and `h1` **"SK AUTH"** |
| SK ASSISTANT | still zero links, disabled action, no invented URL |
| Railway fallback / SK MAIL | absent from every served file |
| Theme switch | dark default → light → dark; `data-theme`, `aria-pressed`, accessible label, `localStorage` and `theme-color` all update, and the choice survives a reload |
| Keyboard walk | 7 <kbd>Tab</kbd> stops, each with a visible 2 px outline, including the SK AUTH card link |
| Lighthouse (live) | accessibility **1**, best practices **1**, SEO **1**, **0 failures** |
| Layout | no horizontal overflow at the browser's 800 px viewport; HTML/CSS/JS are byte-identical to the build verified at 390/800/1440 px locally |

The custom domain was set in Pages immediately before the records went live (GitHub's recommended
order, for takeover protection). One consequence was observed while the records propagated: the
interim `*.github.io` URL 301-redirected to `skcore.in` and nothing answered until the records
published. That resolved as soon as DNS went live.

---

## 1. Verified current state (before any change)

| Item | Result |
| --- | --- |
| Repository | `C:\Users\Administrator\Desktop\SK_CORE`, branch `master`, HEAD `f2f7a01`, working tree clean, **0 remotes**, nothing pushed |
| Dependencies | none — `dependencies` and `devDependencies` are both empty; build and verifier use Node built-ins only |
| Build | `npm run build` → exit 0; reports `2 products (1 with a confirmed website URL, 1 pending)` |
| Verification | `npm run check` → **123 passed, 0 failed** |
| SK AUTH card | emits `<a href="https://auth.skcore.in" target="_blank" rel="noopener noreferrer">` |
| SK ASSISTANT card | no link at all, disabled action (`aria-disabled="true"`), no URL configured |
| Railway fallback | present in `site.config.json` only; appears in **no** file under `dist/` |
| SK MAIL | not present |
| Canonical | `https://skcore.in/` |
| Repo contents | 33 tracked files, 166.6 KB; **no secrets, no `.env`, no key files** (scanned) |

DNS re-checked today against the DomainIndia authoritative nameservers (`a/b.ns.domainindia.net`)
and two independent public resolvers — findings are unchanged from the earlier reconnaissance:

* `skcore.in` (apex): **no `A`, `AAAA`, `CNAME`, `TXT`, `MX` or `CAA` records.** Nothing serves a
  website there today, so pointing it at a host replaces nothing.
* `www.skcore.in`, `assistant.skcore.in`, `mail.skcore.in`: no records.
* `auth.skcore.in`: `CNAME → p9ji6rcj.up.railway.app`, live over HTTPS — **leave untouched.**
* No wildcard record; no `CAA` record (so nothing can block a new certificate).
* The provider does **not** advertise Domain Connect (`_domainconnect.skcore.in` is empty), so
  1-click DNS provisioning is not available for this zone.

## 2. Hosting options actually available on this machine

| Resource | State |
| --- | --- |
| Railway CLI | installed, **authenticated** as the account owner (`sownder61250@gmail.com`); one project exists: `skauth` (runs SK AUTH) |
| GitHub account | `sk-developer-creator` (User). Only `sk-auth` exists. No `sk-core` repo, no `sk-developer-creator.github.io` repo |
| GitHub credential | OAuth token in the Git credential manager with scopes `gist, repo, workflow` → can create a repo, push, and configure Pages without any new credential |
| Netlify / Vercel / Cloudflare / Fly / Render / AWS / Azure / GCP CLIs | not installed, no accounts or tokens on this machine |
| Docker | not installed |

## 3. Recommendation — GitHub Pages

Use a **new, separate, public GitHub repository** (`skcore.in` served by GitHub Pages). This is a
true static host: no container, no runtime process, no database, nothing to patch.

Why this host wins here:

1. **The apex is the deciding constraint.** `skcore.in` is a bare apex domain on DomainIndia,
   whose DNS record capabilities I cannot verify without panel access. GitHub Pages needs only
   four **standard `A` records** at the apex — no ALIAS/ANAME support, no CNAME flattening, no
   nameserver change. Every registrar can do that.
2. **No new accounts or credentials.** The GitHub account already exists and the token already on
   this machine can create the repo and configure Pages.
3. **Exactly matches the required behaviour:** serves a static directory, HTTPS with a
   custom-domain certificate, `404.html` served with a real HTTP `404`, and root-relative asset
   paths (`/assets/...`) work because the site is served at the domain root.
4. **Uses the project's existing build script** — `npm run build` produces the artefact, and
   `npm run check` can run in the same pipeline, so a broken build cannot be published.

## 4. Options considered and why they are not the recommendation

| Option | Assessment |
| --- | --- |
| **Railway, new project `skcore`** | Uses the already-authenticated account, but Railway attaches an apex domain only through a **`CNAME` at the apex**, which requires the DNS provider to implement CNAME flattening or dynamic `ALIAS`/`ANAME`. Railway publishes **no stable public `A` addresses** for apex domains. Railway also requires an additional `TXT` ownership record. If DomainIndia does not support ALIAS/flattening, the apex cannot be attached without **delegating DNS to another provider** (e.g. Cloudflare), which is a separate change I will not make without explicit approval. It also means running a container to serve static files. |
| **Netlify / Vercel / Cloudflare Pages** | Arguably the simplest static hosts, but **no account, CLI, or credential exists on this machine** — they would need a new account and a token from you. Cloudflare Pages additionally needs the zone's nameservers, i.e. an explicit DNS-provider change. |
| **Own server (nginx)** | No server or credential is available or recorded for this project, and the brief asks for a static host. |
| **Subdomain-only hosting (e.g. `www`)** | Does not satisfy the requirement that `https://skcore.in` itself returns HTTP 200; a redirect to `www` would return 301 instead. |

I am not guessing any hosting value: the records in §6 are GitHub's **documented, fixed** GitHub
Pages addresses, quoted from `docs.github.com`. If you prefer Railway, nothing in that path can be
proposed until DomainIndia's ALIAS/flattening support is confirmed in its panel.

## 5. Plan

### 5.1 Already prepared locally (no remote effect)

* `.github/workflows/deploy-pages.yml` — builds `dist/`, runs `npm run check`, asserts `dist/` is
  unchanged after a rebuild (`git diff --exit-code -- dist`), then publishes it to Pages.
  Inactive until the repo exists and Pages source is set to "GitHub Actions".
* This document.

### 5.2 Phase 1 — publish the site to the host *(executed, approved — see §0)*

```powershell
cd C:\Users\Administrator\Desktop\SK_CORE
npm run build          # regenerate dist/ from site.config.json
npm run check          # 123 passed, 0 failed (update the count if the config changes)
```

Then, once you approve:

1. Create the repository `sk-developer-creator/sk-core` (public) — via the GitHub API using the
   token already on this machine, or create it yourself in the web UI if you prefer.
2. `git remote add origin https://github.com/sk-developer-creator/sk-core.git`
   and `git push -u origin master` (ordinary push — no force, no rewrite).
3. Set **Settings → Pages → Source: GitHub Actions** (or `POST /repos/.../pages` with
   `build_type: workflow`).
4. The workflow deploys `dist/` and Pages serves it at
   `https://sk-developer-creator.github.io/sk-core/` — this is an interim URL only, used to prove
   the deployment works before DNS changes anything.
5. Set the custom domain `skcore.in` in **Settings → Pages → Custom domain** *before* the DNS
   records are added (GitHub recommends this order — it prevents anyone else claiming the domain).

### 5.3 Phase 2 — DNS *(applied by you at DomainIndia, approved — see §0)*

The records were added in the DomainIndia panel by you. I hold no DomainIndia credentials and did
not request any.

### 5.4 Phase 3 — verification *(executed — see §0)*

See §9.

## 6. DNS changes applied at DomainIndia (approved and verified)

The records below are now live. Hostname `skcore.in` is the zone apex; most panels accept `@` or a
blank name for it.

| # | Type | Name | Value | Purpose |
| --- | --- | --- | --- | --- |
| 1 | `A` | `@` | `185.199.108.153` | GitHub Pages apex |
| 2 | `A` | `@` | `185.199.109.153` | GitHub Pages apex |
| 3 | `A` | `@` | `185.199.110.153` | GitHub Pages apex |
| 4 | `A` | `@` | `185.199.111.153` | GitHub Pages apex |
| 5 | `AAAA` *(optional, IPv6)* | `@` | `2606:50c0:8000::153` … `2606:50c0:8003::153` | GitHub Pages apex, IPv6 |
| 6 | `CNAME` | `www` | `sk-developer-creator.github.io` | `www.skcore.in` → Pages (GitHub then redirects `www` → apex) |
| 7 | `TXT` | `_github-pages-challenge-sk-developer-creator` | **value shown on your Pages settings page** | Proves domain ownership; prevents domain takeover |

Notes, stated precisely:

* Records 1–4 and the `www` target are GitHub's **documented fixed values** — I did not invent
  them, and they cannot be derived from a host dashboard because they are constants.
* Record 7 was **not added** (you chose the required records only). It is optional: it proves
  ownership of the domain to GitHub and guards against domain takeover. Its value is generated by
  GitHub per account and shown in repo → Settings → Pages → *Verify your custom domain*; it is not
  exposed by the API, so it can only be read from that page.
* Record 5 is optional. Add it only together with the `A` records; IPv6-only resolution is not
  recommended by GitHub.
* **Nothing existing is replaced or removed.** The apex has no records today, `www` does not
  exist, and `auth.skcore.in → p9ji6rcj.up.railway.app` is **not** touched. The `NS` and `SOA`
  records of the zone stay as they are. No nameserver change, no provider delegation.
* Adding `A` records at the apex does not conflict with a future `MX`/`TXT`/`CAA` record, and
  there is no `CAA` record today, so nothing can block the new certificate.
* Do not add a wildcard (`*.skcore.in`) record — GitHub explicitly warns against it (takeover risk).

## 7. HTTPS

1. Once records 1–4 resolve and the custom domain matches, GitHub Pages requests a
   Let's Encrypt certificate for `skcore.in` automatically and serves HTTPS.
2. When the certificate is issued (usually minutes after DNS propagates; GitHub allows up to
   24 h before the setting becomes available), enable **Settings → Pages → Enforce HTTPS** so
   plain HTTP redirects to HTTPS.
3. Current state makes this low-risk: there is no `CAA` record restricting certificate
   authorities, and `auth.skcore.in` already proves Let's Encrypt issuance works on this zone.

## 8. Rollback

The rollback is small, and it returns the zone to exactly today's state:

1. **DNS:** delete records 1–4 (`A`), 5 (`AAAA`) if added, 6 (the `www` `CNAME`) and 7 (the `TXT`).
   The apex then publishes no address records again — as it does right now — and nothing answers
   at `https://skcore.in`.
2. **Host:** remove the custom domain in Settings → Pages and disable Pages (or delete the
   `sk-core` repository). Nothing else in your account is affected.
3. **Untouched throughout:** the SK AUTH repository, its Railway service, its database, its
   environment variables, and `auth.skcore.in`.

## 9. Post-deployment verification performed

Results are in §0 (Phase 3). The checklist below is what was checked, and it can be repeated at any
time:

* `https://skcore.in` returns **HTTP 200** and serves byte-identical content to the verified local
  `dist/index.html`.
* Certificate chain valid, issued for `skcore.in`, not expired, and HTTP redirects to HTTPS.
* SK AUTH card opens `https://auth.skcore.in`; SK ASSISTANT still has no link.
* All local assets (`/assets/css/styles.css`, `/assets/js/app.js`, `/assets/js/cosmos.js`, icons, `og-image.png`) return 200.
* An unknown path (e.g. `/no-such-page`) returns **HTTP 404** with the custom 404 page.
* Mobile (390 px) and desktop (1440 px) layouts, nav, theme switch, keyboard focus.
* Console clean; no unexpected external requests.
* `robots.txt` and `sitemap.xml` answer 200 and cite `https://skcore.in`.

## 10. What has deliberately not been done

* DNS was changed only as listed in §6, by you, at DomainIndia. This repository never wrote DNS,
  and `skcore.in` was not delegated to another DNS provider — the nameservers are unchanged.
* The custom domain was set in Pages only at the point the records were about to go live (§0).
* SK AUTH source, database, environment variables, Railway configuration, branches and
  deployment: **untouched**. Its Railway fallback hostname stays documented in `site.config.json`
  and is **not** published on the page.
* The Google Sign-In origin issue for `auth.skcore.in` (§6 of the README) is a separate task and
  is not part of this deployment.
