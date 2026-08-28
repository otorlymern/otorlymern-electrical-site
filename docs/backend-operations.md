# OES Backend Operations

This is the small operational record for the static OES website and its supporting services. It records boundaries and decisions that would otherwise be easy to forget; it is not a dashboard or application.

## Service boundaries

- Neocities hosts the intentionally public `_deploy` artifact only.
- Cloudflare provides authoritative DNS, CDN/cache behavior, security controls, redirects, Web Analytics, and Zaraz.
- Wasabi stores public media and PDFs. The media bucket is public-read-only by exact object URL; listing and anonymous writes are denied. Confidential material belongs in a separate private bucket.
- PeerTube hosts video.
- Formspree handles forms.
- Namecheap remains the registrar and Private Email provider.
- GitHub stores source and deploys `_deploy` through Actions.

## Wasabi incident status

- The unexpected `/graphql`, `/api/graphql`, and `/v1/graphql` objects were treated as suspicious unauthorized objects, not proof of a confirmed account compromise.
- Root and superseded application keys were removed, a dedicated media-management identity is in use, and root MFA is enabled.
- `oes-media-access-logs` is the separate private access-log bucket.
- Exact-object public GET is expected. Anonymous LIST, PUT, DELETE, overwrite, and ACL changes are expected to return 403.
- P0 remains open only until the first passive access-log object is confirmed in the logging bucket.

## Publishing and cache policy

- Production is built from source into untracked `_deploy`; repository contents are not deployed directly.
- HTML bypasses Cloudflare cache so visitors and crawlers receive current Neocities content.
- Static CSS, JavaScript, fonts, and images use one-hour browser caching and seven-day edge caching.
- Public Wasabi media uses one-hour browser caching and 30-day edge caching.
- Error responses are not stored long-term.
- Each successful GitHub deployment performs a full purge using a token limited to `otorlymern-electrical.com` Cache Purge access.

## Search Console baseline — 2026-08-25

Three-month Web Search report, last updated approximately 2026-08-25:

- Property: 1,194 impressions, 10 clicks, 0.8% CTR, average position 10.
- `/services/experience`: 974 impressions, 2 clicks, 0.2% CTR, average position 5.7.
- Query `augie calabro` on that page: 948 impressions, 0 clicks, average position 5.7.
- Query `swan356` on that page: 5 impressions, 0 clicks, average position 12.8.
- Devices for the Experience page: mobile 849 impressions, desktop 79, tablet 25; the table attributed no clicks to those visible device rows.
- Highest visible country totals included United States 349, France 115, and Germany 114 impressions.

Diagnosis: this is primarily a personal-name search-result/snippet mismatch, not broad generic service traffic. The first response is to align the title, description, visible H1, and Person/Organization structured data with the demonstrated `Augie Calabro` intent. Compare the same page/query report after four to six weeks; do not infer success from property-wide traffic alone.

## Content-object pilots

- Five manual records establish the `/manuals/library/<archive-id>/` pattern, including the ARP 2600, Buchla 100, Roland TR-606, EMS VCS 3, and Digisound Modular records.
- `/systems/home-recording` is the editorial/technical-guide pilot. Its canonical page connects computerless recording history, practical tape workflows, curated recording resources, the deeper archive, and OES tape services.
- `/oes-patch-builder/` is the interactive-tool pilot. Its dedicated canonical page explains the tool and links into related OES material; `/solutions/resources/` may still embed the builder with `?embedded=1` without replacing the dedicated page.
- Review usefulness, indexing, query relevance, and visitor paths before adding more pilots or scaling any page pattern.

## Analytics event contract

Cloudflare Web Analytics remains the consent-light traffic and field-performance baseline. GA4 is the optional deeper layer through Zaraz and is assigned to the opt-in `Analytics` purpose.

Current privacy and accuracy controls:

- GA4 web stream: `OES Website` (`G-WS5PGCZC4S`).
- Zaraz Consent Management is enabled and displays its modal to visitors who have not made a choice.
- Google Consent Mode v2 defaults all four Google consent signals to denied.
- Zaraz removes URL query parameters and trims IP addresses before forwarding analytics data. External referrers remain available for useful traffic attribution.
- GA4's originating-IP option is disabled, Audiences are off, and Enhanced Measurement is off. OES sends only the explicit events below plus normal pageviews.
- Zaraz data-layer compatibility and SPA history tracking are off. Archive/viewer `replaceState` calls therefore do not create false pageviews.
- Every generated page includes a small `Privacy choices` control that reopens Zaraz's consent modal.
- `service_form_submit` is the only OES-defined GA4 key event. GA4's built-in `purchase` key-event marker cannot be disabled, but OES does not emit `purchase`.

- `archive_search`: submitted archive searches; records query length, result count, and match type, never the search text.
- `manual_open`: direct PDF/manual opens; records an archive ID when the page provides one and the asset type.
- `service_form_start`: first meaningful interaction with one of the seven service forms.
- `service_form_submit`: emitted only after Formspree confirms a successful submission; this is the only initial GA4 key event.
- `outbound_click`: limited to PeerTube and Reverb destinations.
- `contact_click`: mail or telephone contact intent without recording the address or number.

Do not add events unless they answer a documented operational or editorial question. Form field contents and exact archive queries are not analytics data.

## Service-form protection

- All seven service forms submit through the shared dependency-free `/services/service-forms.js` controller to Formspree form `mwpnybrw`.
- Formspree CAPTCHA protection is enabled with the managed `OES Service Forms` Turnstile widget. Formspree stores the private widget secret and performs server-side verification; only the public site key is present in the repository.
- The widget is restricted to the apex domain, `www`, `localhost`, and `127.0.0.1`, and uses the `service_request` action.
- Client behavior covers required-field validation, pending/success/error announcements, duplicate-submit prevention, and Turnstile reset after each completed request.
- Analytics reports success only after Formspree returns a successful response.

Live verification on 2026-08-28:

- One labeled synthetic submission with a fresh managed Turnstile token reached the Formspree Inbox and produced the expected accessible success state.
- Reusing that token and sending a fabricated non-empty token both received Formspree HTTP 200 responses, but Formspree quarantined both labeled diagnostics in Spam rather than the operational Inbox. A missing token returned HTTP 400.
- With Analytics consent accepted, `service_form_start` and the server-confirmed `service_form_submit` were delivered to Zaraz with the documented `page_path` and `form_type` parameters. The payload contained no form contents.
- Treat Inbox-versus-Spam placement as Formspree's managed verification boundary; its endpoint does not use a non-2xx response for every invalid-token case.

## DNS, email, and response-security status — 2026-08-28

- Namecheap remains the registrar. Public RDAP shows transfer lock, Cloudflare nameservers, and expiration on 2027-04-20.
- Cloudflare DNSSEC signing is enabled. The generated DS record is published at Namecheap, resolves through both Cloudflare and Google public resolvers, and validated with the authenticated-data (`ad`) flag on 2026-08-28.
- `mail`, `autoconfig`, and `autodiscover` now point to Private Email as DNS-only records. MX records remain DNS-only.
- The active DKIM selector is the legacy `default._domainkey`; `privateemail._domainkey` is not published.
- SPF remains `v=spf1 include:spf.privateemail.com ~all` until monitoring proves the sender inventory complete.
- `postmaster@otorlymern-electrical.com` is a Private Email alias of `contact@otorlymern-electrical.com`; it does not consume another mailbox slot.
- DMARC is published in monitoring-only mode (`p=none`) with relaxed SPF/DKIM alignment and aggregate reports sent to the `postmaster` alias. Review reports for at least 30 days before considering enforcement.
- The obsolete apex NS records for `dns1.registrar-servers.com` and `dns2.registrar-servers.com` were removed from the Cloudflare zone. Authoritative responses now contain only `nola.ns.cloudflare.com` and `watson.ns.cloudflare.com`; registrar delegation remains on Cloudflare.
- The Cloudflare response-header rule `OES baseline security headers` applies only to the apex and `www`. It sets six-month HSTS without subdomains or preload, `nosniff`, `strict-origin-when-cross-origin`, `SAMEORIGIN`, and a limited Permissions Policy denying unused sensitive capabilities.
- The origin's permissive enforced CSP is removed at the edge. CSP remains deliberately unenforced until the documented iframe, Zaraz, Formspree, Turnstile, Wasabi, PDF.js, PeerTube, YouTube, Bandcamp, and interactive-experiment dependencies can support a tested policy.

## Routine checks

- After deployment: confirm current HTML, sitemap, robots, redirects, Googlebot responses, external-referrer media access, and protected Wasabi listing/write behavior.
- Monthly: inspect Search Console indexing and queries, Cloudflare Web Analytics/Core Web Vitals, Wasabi access logs, account alerts, renewals, and email authentication reports.
- Record incidents and rollback notes here until a real need justifies another file.
